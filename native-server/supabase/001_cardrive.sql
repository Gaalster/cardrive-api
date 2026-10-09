-- Run once in the Supabase SQL editor. Idempotent: does not erase existing data.
-- Only the server secret role can call the RPC; no tables are exposed to clients.
BEGIN;
CREATE SCHEMA IF NOT EXISTS cardrive_private;
REVOKE ALL ON SCHEMA cardrive_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS cardrive_private.accounts (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, password text NOT NULL,
 customer text UNIQUE, credits integer NOT NULL DEFAULT 0, premium_until bigint NOT NULL DEFAULT 0,
 day text NOT NULL DEFAULT '', used integer NOT NULL DEFAULT 0 CHECK(used>=0));
CREATE TABLE IF NOT EXISTS cardrive_private.sessions (
 hash text PRIMARY KEY, account_id text NOT NULL REFERENCES cardrive_private.accounts(id) ON DELETE CASCADE, expires bigint NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON cardrive_private.sessions(expires);
CREATE TABLE IF NOT EXISTS cardrive_private.ad_tickets (
 id text PRIMARY KEY, account_id text NOT NULL REFERENCES cardrive_private.accounts(id) ON DELETE CASCADE,
 expires bigint NOT NULL, transaction_id text UNIQUE);
CREATE TABLE IF NOT EXISTS cardrive_private.support_tickets (
 id text PRIMARY KEY, secret_hash text NOT NULL, subject text NOT NULL,
 message text NOT NULL, reply text NOT NULL DEFAULT '', created bigint NOT NULL);
CREATE INDEX IF NOT EXISTS support_created ON cardrive_private.support_tickets(created);
ALTER TABLE cardrive_private.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardrive_private.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardrive_private.ad_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardrive_private.support_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA cardrive_private FROM PUBLIC, anon, authenticated;

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
