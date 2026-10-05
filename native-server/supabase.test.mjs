import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createSupabaseStore} from './supabase-store.mjs';
import {createApplication} from './index.mjs';
import {createAds} from './ads.mjs';
import {generateKeyPairSync,sign} from 'node:crypto';
const config={url:'https://test-project.supabase.co',secret:'sb_secret_test_only'};
async function database() {
 const db=new PGlite();await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 const sql=await readFile(new URL('./supabase/001_cardrive.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const fetcher=async(url,options)=>{
  assert.match(url,/\/rest\/v1\/rpc\/cardrive_rpc$/);assert.equal(options.headers.apikey,config.secret);assert.equal(options.headers.Authorization,undefined);
  const {operation,payload}=JSON.parse(options.body);
  try {const r=await db.query('SELECT public.cardrive_rpc($1,$2::jsonb) AS result',[operation,JSON.stringify(payload)]);return Response.json(r.rows[0].result);}
  catch(e){return Response.json({code:e.code,message:e.message},{status:e.code?.startsWith('PT')?Number(e.code.slice(2)):400});}
 };
 return {db,make:()=>createSupabaseStore({...config,fetcher})};
}
test('Supabase: client access denied, restart preserves sessions, quotas and deletion',async()=>{
 const {db,make}=await database();try {
  for(const role of ['anon','authenticated']) {await db.exec('SET ROLE '+role);await assert.rejects(db.query("SELECT public.cardrive_rpc('health','{}')"),/permission denied/);await assert.rejects(db.query('SELECT * FROM cardrive_private.accounts'),/permission denied/);await db.exec('RESET ROLE');}
  await db.exec('SET ROLE service_role');assert.equal((await db.query("SELECT public.cardrive_rpc('health','{}') AS value")).rows[0].value.schema,1);await db.exec('RESET ROLE');
  const s=make();await s.health();const id=await s.register('tester@example.com','long-password-123');const token=await s.session(id);const restarted=make();assert.equal(await restarted.authenticate(token),id);
  await assert.rejects(s.login('tester@example.com','bad'),{status:401});await assert.rejects(s.login('missing@example.com','bad'),{status:401});await assert.rejects(s.register('tester@example.com','long-password-123'),{status:409});
  for(let i=0;i<5;i++)await s.consume(id);await assert.rejects(s.consume(id),{status:402});
  const ticket=await s.createAdTicket(id);await s.awardAd({id,ticket,transaction:'tx1',timestamp:Date.now()});await s.awardAd({id,ticket,transaction:'tx1',timestamp:Date.now()});assert.equal((await restarted.entitlements(id)).credits,1);
  await s.consume(id);assert.equal((await s.entitlements(id)).remaining,0);await db.query("UPDATE cardrive_private.accounts SET day='2000-01-01' WHERE id=$1",[id]);assert.equal((await s.entitlements(id)).freeRemaining,5);
  await assert.rejects(s.privacy.removeAccount(id,'bad','SUPPRIMER'),{status:403});assert.equal(await s.authenticate(token),id);await s.privacy.removeAccount(id,'long-password-123','SUPPRIMER');await assert.rejects(restarted.authenticate(token),{status:401});assert.equal(await s.account(id),null);
 }finally{await db.close();}
});
test('Supabase support: secret link isolation, restricted operator and retention',async()=>{
 const {db,make}=await database();const old=process.env.SUPPORT_ADMIN_ACCOUNT_ID;process.env.SUPPORT_ADMIN_ACCOUNT_ID='owner';
 try {const s=make();const t=await s.privacy.createTicket({subject:'Aide',message:'Je souhaite de l’aide sur le compte.'});await assert.rejects(s.privacy.readTicket({...t,secret:'a'.repeat(64)}),{status:404});assert.throws(()=>s.privacy.admin('other',{}),{status:403});await s.privacy.admin('owner',{id:t.id,reply:'Bonjour !'});assert.equal((await s.privacy.readTicket(t)).reply,'Bonjour !');await db.query('UPDATE cardrive_private.support_tickets SET created=0 WHERE id=$1',[t.id]);await assert.rejects(s.privacy.readTicket(t),{status:404});}
 finally{if(old===undefined)delete process.env.SUPPORT_ADMIN_ACCOUNT_ID;else process.env.SUPPORT_ADMIN_ACCOUNT_ID=old;await db.close();}
});
test('Supabase HTTP: register, scan, server restart, deletion; checkout disabled',async()=>{
 const {db,make}=await database();let server;async function start(){server=createApplication({store:make(),stripe:null,recognizeCar:async()=>({make:'Peugeot',model:'208'})});await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;}
 try {let base=await start();async function request(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 const credentials={email:'http@example.com',password:'long-password-123'};const reg=await request('/auth/register',credentials);assert.equal(reg.status,200);assert.equal(typeof reg.data.token,'string');const token=reg.data.token;assert.equal((await request('/recognize',{base64:'test'},token)).data.entitlements.remaining,4);
 await new Promise(r=>server.close(r));base=await start();const me=(await request('/me',null,token)).data;assert.equal(me.remaining,4);assert.equal(me.accountId,await make().authenticate(token));assert.equal((await request('/checkout',{},token)).status,503);assert.equal((await request('/account/delete',{password:credentials.password,confirmation:'SUPPRIMER'},token)).status,200);assert.equal((await request('/me',null,token)).status,401);
 }finally{if(server?.listening)await new Promise(r=>server.close(r));await db.close();}
});
test('Supabase signed ads: reject wrong owner/tampering, credit each reward only once',async()=>{
 const {db,make}=await database();const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 try {const s=make();const id=await s.register('ads@example.com','long-password-123');const ads=createAds(s,{unit:'ca-app-pub-123/456',keyFor:async()=>publicKey});const {ticket}=await ads.ticket(id);
 const callback=(owner,tx)=>{const query=new URLSearchParams({ad_unit:'456',reward_amount:'1',reward_item:'scan',transaction_id:tx,timestamp:String(Date.now()),custom_data:ticket,user_id:owner}).toString();return '/ads/ssv?'+query+'&signature='+sign('sha256',Buffer.from(query),privateKey).toString('base64url')+'&key_id=1';};
 await assert.rejects(ads.callback(callback('wrong','bad')),{status:400});const good=callback(id,'unique');await ads.callback(good);await ads.callback(good);assert.equal((await s.entitlements(id)).credits,1);await assert.rejects(ads.callback(good.replace('reward_amount=1','reward_amount=9')),{status:400});assert.equal((await s.entitlements(id)).credits,1);
 }finally{await db.close();}
});
test('Supabase config and failures: reject public keys and unsafe URLs, hide SQL errors',async()=>{
 assert.throws(()=>createSupabaseStore({...config,url:'http://example.com'}));assert.throws(()=>createSupabaseStore({...config,secret:'public-key'}));const s=createSupabaseStore({...config,fetcher:async()=>Response.json({code:'42501',message:'private password hash sql'},{status:403})});await assert.rejects(s.health(),e=>e.status===503&&!e.message.includes('password'));
});
