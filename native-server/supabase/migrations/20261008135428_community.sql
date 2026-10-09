BEGIN;
CREATE TABLE IF NOT EXISTS cardrive_private.community_profiles (
 account_id text PRIMARY KEY REFERENCES cardrive_private.accounts(id) ON DELETE CASCADE,
 public_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 name text NOT NULL CHECK(char_length(name) BETWEEN 3 AND 24), joined_at timestamptz NOT NULL DEFAULT now(), scans integer NOT NULL DEFAULT 0 CHECK(scans>=0));
CREATE TABLE IF NOT EXISTS cardrive_private.community_edges (
 source text REFERENCES cardrive_private.community_profiles(account_id) ON DELETE CASCADE,
 target text REFERENCES cardrive_private.community_profiles(account_id) ON DELETE CASCADE,
 state text NOT NULL CHECK(state IN ('pending','friend','blocked')), PRIMARY KEY(source,target), CHECK(source<>target));
CREATE TABLE IF NOT EXISTS cardrive_private.community_reports (
 reporter text REFERENCES cardrive_private.accounts(id) ON DELETE CASCADE,
 target text REFERENCES cardrive_private.community_profiles(account_id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(reporter,target));
ALTER TABLE cardrive_private.community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardrive_private.community_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardrive_private.community_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cardrive_private.community_profiles,cardrive_private.community_edges,cardrive_private.community_reports FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA cardrive_private TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON cardrive_private.community_profiles,cardrive_private.community_edges,cardrive_private.community_reports TO service_role;
CREATE OR REPLACE FUNCTION public.cardrive_community(operation text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE uid text:=payload->>'id'; other text; mine jsonb; leaders jsonb; friends jsonb; requests jsonb; blocked jsonb;
BEGIN
 IF operation='join' THEN
  IF payload->>'consent' IS DISTINCT FROM 'true' OR NOT coalesce(payload->>'name' ~ '^[[:alnum:] _-]{3,24}$',false) THEN RAISE EXCEPTION USING ERRCODE='PT400'; END IF;
  INSERT INTO cardrive_private.community_profiles(account_id,name) VALUES(uid,payload->>'name') ON CONFLICT(account_id) DO UPDATE SET name=EXCLUDED.name;
 ELSIF operation='leave' THEN DELETE FROM cardrive_private.community_profiles WHERE account_id=uid;
 ELSIF operation<>'state' THEN
  IF NOT EXISTS(SELECT 1 FROM cardrive_private.community_profiles WHERE account_id=uid) THEN RAISE EXCEPTION USING ERRCODE='PT403'; END IF;
  SELECT account_id INTO other FROM cardrive_private.community_profiles WHERE public_id::text=payload->>'target';
  IF other IS NULL OR other=uid THEN RAISE EXCEPTION USING ERRCODE='PT404'; END IF;
  PERFORM account_id FROM cardrive_private.community_profiles WHERE account_id IN (uid,other) ORDER BY account_id FOR UPDATE;
  IF operation='block' THEN
   DELETE FROM cardrive_private.community_edges WHERE (source=uid AND target=other) OR (source=other AND target=uid AND state<>'blocked');
   INSERT INTO cardrive_private.community_edges VALUES(uid,other,'blocked');
  ELSIF operation='unblock' THEN DELETE FROM cardrive_private.community_edges WHERE source=uid AND target=other AND state='blocked';
  ELSIF operation='report' THEN INSERT INTO cardrive_private.community_reports VALUES(uid,other,now()) ON CONFLICT DO NOTHING;
  ELSE
   IF EXISTS(SELECT 1 FROM cardrive_private.community_edges WHERE state='blocked' AND ((source=uid AND target=other) OR (source=other AND target=uid))) THEN RAISE EXCEPTION USING ERRCODE='PT403'; END IF;
   IF operation='request' THEN
    IF (SELECT count(*) FROM cardrive_private.community_edges WHERE source=uid AND state='pending')>=30 THEN RAISE EXCEPTION USING ERRCODE='PT400'; END IF;
    INSERT INTO cardrive_private.community_edges VALUES(uid,other,'pending') ON CONFLICT DO NOTHING;
   ELSIF operation='accept' THEN
    UPDATE cardrive_private.community_edges SET state='friend' WHERE source=other AND target=uid AND state='pending';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404'; END IF;
    INSERT INTO cardrive_private.community_edges VALUES(uid,other,'friend') ON CONFLICT(source,target) DO UPDATE SET state='friend';
   ELSIF operation='decline' THEN DELETE FROM cardrive_private.community_edges WHERE source=other AND target=uid AND state='pending';
   ELSIF operation='remove' THEN DELETE FROM cardrive_private.community_edges WHERE ((source=uid AND target=other) OR (source=other AND target=uid)) AND state<>'blocked';
   ELSE RAISE EXCEPTION USING ERRCODE='PT400'; END IF;
  END IF;
 END IF;
 SELECT jsonb_build_object('id',public_id,'name',name,'scans',scans) INTO mine FROM cardrive_private.community_profiles WHERE account_id=uid;
 IF mine IS NULL THEN RETURN jsonb_build_object('me',null,'leaders','[]'::jsonb,'friends','[]'::jsonb,'requests','[]'::jsonb,'blocked','[]'::jsonb); END IF;
 SELECT coalesce(jsonb_agg(row),'[]') INTO leaders FROM (
  SELECT p.public_id AS id,p.name,p.scans,coalesce(e.state,'none') AS relationship FROM cardrive_private.community_profiles p
  LEFT JOIN cardrive_private.community_edges e ON e.source=uid AND e.target=p.account_id
  WHERE NOT EXISTS(SELECT 1 FROM cardrive_private.community_edges b WHERE b.state='blocked' AND ((b.source=uid AND b.target=p.account_id) OR (b.source=p.account_id AND b.target=uid)))
  ORDER BY p.scans DESC,p.joined_at,p.public_id LIMIT 50) row;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.public_id,'name',p.name,'scans',p.scans)),'[]') INTO friends FROM cardrive_private.community_edges e JOIN cardrive_private.community_profiles p ON p.account_id=e.target WHERE e.source=uid AND e.state='friend';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.public_id,'name',p.name,'scans',p.scans)),'[]') INTO requests FROM cardrive_private.community_edges e JOIN cardrive_private.community_profiles p ON p.account_id=e.source WHERE e.target=uid AND e.state='pending';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.public_id,'name',p.name)),'[]') INTO blocked FROM cardrive_private.community_edges e JOIN cardrive_private.community_profiles p ON p.account_id=e.target WHERE e.source=uid AND e.state='blocked';
 RETURN jsonb_build_object('me',mine,'leaders',leaders,'friends',friends,'requests',requests,'blocked',blocked);
END $$;
REVOKE ALL ON FUNCTION public.cardrive_community(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cardrive_community(text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.cardrive_rpc(operation text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 a cardrive_private.accounts%ROWTYPE;
 t cardrive_private.ad_tickets%ROWTYPE;
 result jsonb;
 now_ms bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint;
 today text := to_char(clock_timestamp() AT TIME ZONE 'Europe/Paris','YYYY-MM-DD');
 uid text := payload->>'id';
BEGIN
 -- Opportunistic bounded retention; no scheduler or paid worker required.
 DELETE FROM cardrive_private.sessions WHERE expires < now_ms;
 DELETE FROM cardrive_private.support_tickets WHERE created < now_ms-90::bigint*86400000;
 IF operation='health' THEN RETURN jsonb_build_object('schema',1);
 ELSIF operation='register' THEN
  INSERT INTO cardrive_private.accounts(id,email,password) VALUES(uid,payload->>'email',payload->>'password');
  RETURN to_jsonb(uid);
 ELSIF operation='login_record' THEN
  SELECT * INTO a FROM cardrive_private.accounts WHERE email=payload->>'email'; IF NOT FOUND THEN RETURN 'null'::jsonb; END IF; RETURN to_jsonb(a);
 ELSIF operation='account' THEN
  SELECT * INTO a FROM cardrive_private.accounts WHERE id=uid; IF NOT FOUND THEN RETURN 'null'::jsonb; END IF; RETURN to_jsonb(a);
 ELSIF operation='session' THEN
  INSERT INTO cardrive_private.sessions(hash,account_id,expires) VALUES(payload->>'hash',uid,now_ms+30::bigint*86400000); RETURN 'true';
 ELSIF operation='authenticate' THEN
  SELECT to_jsonb(account_id) INTO result FROM cardrive_private.sessions WHERE hash=payload->>'hash' AND expires>now_ms;
  IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT401', MESSAGE='Connecte-toi dans CarDrive.'; END IF; RETURN result;
 ELSIF operation='logout' THEN
  DELETE FROM cardrive_private.sessions WHERE hash=payload->>'hash'; RETURN 'true';
 ELSIF operation IN ('entitlements','consume') THEN
  SELECT * INTO a FROM cardrive_private.accounts WHERE id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT401', MESSAGE='Compte introuvable.'; END IF;
  IF a.day<>today THEN UPDATE cardrive_private.accounts SET day=today,used=0 WHERE id=uid; a.used:=0; END IF;
  IF operation='consume' AND a.premium_until<=now_ms THEN
   IF a.used<5 THEN UPDATE cardrive_private.accounts SET used=used+1 WHERE id=uid; a.used:=a.used+1;
   ELSIF a.credits>0 THEN UPDATE cardrive_private.accounts SET credits=credits-1 WHERE id=uid; a.credits:=a.credits-1;
   ELSE RAISE EXCEPTION USING ERRCODE='PT402', MESSAGE='Plus de scans disponibles.'; END IF;
  END IF;
  IF operation='consume' THEN UPDATE cardrive_private.community_profiles SET scans=scans+1 WHERE account_id=uid; END IF;
  RETURN jsonb_build_object('email',a.email,'isPremium',a.premium_until>now_ms,'credits',greatest(0,a.credits),'freeRemaining',greatest(0,5-a.used),'remaining',greatest(0,5-a.used)+greatest(0,a.credits));
 ELSIF operation='delete_account' THEN
  SELECT * INTO a FROM cardrive_private.accounts WHERE id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT401', MESSAGE='Compte introuvable.'; END IF;
  -- Compare the password hash reauthenticated by the server, to prevent a stale check.
  IF a.password IS DISTINCT FROM payload->>'passwordHash' THEN RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='Reconnecte-toi pour confirmer.'; END IF;
  IF a.customer IS NOT NULL OR a.premium_until>now_ms THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Contacte le support pour traiter ton historique de paiement.'; END IF;
  DELETE FROM cardrive_private.accounts WHERE id=uid;
  RETURN '{"ok":true}';
 ELSIF operation='ad_ticket' THEN
  SELECT * INTO a FROM cardrive_private.accounts WHERE id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT401', MESSAGE='Compte introuvable.'; END IF;
  IF a.premium_until>now_ms THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Ton Pass inclut déjà les scans.'; END IF;
  DELETE FROM cardrive_private.ad_tickets WHERE expires<now_ms-86400000 AND transaction_id IS NULL;
  INSERT INTO cardrive_private.ad_tickets(id,account_id,expires) VALUES(payload->>'ticket',uid,now_ms+3600000);
  RETURN '{"ok":true}';
 ELSIF operation='award_ad' THEN
  SELECT * INTO t FROM cardrive_private.ad_tickets WHERE id=payload->>'ticket' FOR UPDATE;
  IF NOT FOUND OR t.account_id IS DISTINCT FROM uid THEN RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='Compte incorrect.'; END IF;
  IF t.transaction_id=payload->>'transaction' THEN RETURN '{"ok":true}'; END IF;
  IF t.transaction_id IS NOT NULL OR t.expires<(payload->>'timestamp')::bigint THEN RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='Récompense déjà utilisée ou expirée.'; END IF;
  UPDATE cardrive_private.ad_tickets SET transaction_id=payload->>'transaction' WHERE id=t.id;
  UPDATE cardrive_private.accounts SET credits=credits+1 WHERE id=uid;
  RETURN '{"ok":true}';
 ELSIF operation='support_create' THEN
  INSERT INTO cardrive_private.support_tickets(id,secret_hash,subject,message,created) VALUES(uid,payload->>'hash',payload->>'subject',payload->>'message',now_ms); RETURN '{"ok":true}';
 ELSIF operation='support_read' THEN
  SELECT jsonb_build_object('id',id,'subject',subject,'message',message,'reply',reply,'created',created) INTO result FROM cardrive_private.support_tickets WHERE id=uid AND secret_hash=payload->>'hash';
  IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='Demande introuvable ou expirée.'; END IF; RETURN result;
 ELSIF operation='support_admin' THEN
  IF payload ? 'reply' THEN UPDATE cardrive_private.support_tickets SET reply=payload->>'reply' WHERE id=uid; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO result FROM (SELECT id,subject,message,reply,created FROM cardrive_private.support_tickets ORDER BY created DESC LIMIT 100) q;
  RETURN jsonb_build_object('tickets',result);
 ELSE RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='Opération inconnue.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.cardrive_rpc(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cardrive_rpc(text,jsonb) TO service_role;

COMMIT;
