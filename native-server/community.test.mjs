import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('Community: consent, private data, requests, block, counter, deletion, restricted RPC',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 await db.exec(await readFile(new URL('./supabase/001_cardrive.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('./supabase/migrations/20261008135428_community.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query("SELECT public.cardrive_community('state','{}')"),/permission denied/);await db.exec('RESET ROLE');}
 await db.exec("INSERT INTO cardrive_private.accounts(id,email,password) VALUES ('a','secret@example.com','hash'),('b','private@example.com','hash'),('c','hidden@example.com','hash')");
 await db.exec('SET ROLE service_role');
 const rpc=async(op,p)=> (await db.query('SELECT public.cardrive_community($1,$2) result',[op,JSON.stringify(p)])).rows[0].result;
 assert.equal((await rpc('state',{id:'a'})).me,null);
 await assert.rejects(rpc('join',{id:'a',name:'PlayerA',consent:false}));
 let a=await rpc('join',{id:'a',name:'PlayerA',consent:true});let b=await rpc('join',{id:'b',name:'PlayerB',consent:true});
 assert.equal(b.leaders.length,2);assert.doesNotMatch(JSON.stringify(b),/email|secret|account_id|password/);
 await rpc('request',{id:'a',target:b.me.id});b=await rpc('state',{id:'b'});assert.equal(b.requests.length,1);
 await assert.rejects(rpc('accept',{id:'a',target:b.me.id}));
 b=await rpc('accept',{id:'b',target:a.me.id});assert.equal(b.friends.length,1);
 a=await rpc('block',{id:'a',target:b.me.id});assert.equal(a.friends.length,0);assert.equal(a.blocked.length,1);assert.equal(a.leaders.length,1);
 await assert.rejects(rpc('request',{id:'b',target:a.me.id}));await rpc('report',{id:'b',target:a.me.id});
 await db.exec('RESET ROLE');await db.query("SELECT public.cardrive_rpc('consume',$1)",[JSON.stringify({id:'a'})]);
 a=await rpc('state',{id:'a'});assert.equal(a.me.scans,1);
 await db.query("SELECT public.cardrive_rpc('entitlements',$1)",[JSON.stringify({id:'a'})]);assert.equal((await rpc('state',{id:'a'})).me.scans,1);
 await db.exec("UPDATE cardrive_private.accounts SET day='2000-01-01',used=5,credits=4 WHERE id='a'");
 await db.query("SELECT public.cardrive_rpc('consume',$1)",[JSON.stringify({id:'a'})]);assert.equal((await rpc('state',{id:'a'})).me.scans,2);
 await db.exec("UPDATE cardrive_private.accounts SET credits=2 WHERE id='a'");assert.equal((await rpc('state',{id:'a'})).me.scans,2);
 await db.exec("UPDATE cardrive_private.accounts SET premium_until=9999999999999 WHERE id='a'");
 await db.query("SELECT public.cardrive_rpc('consume',$1)",[JSON.stringify({id:'a'})]);assert.equal((await rpc('state',{id:'a'})).me.scans,3);
 await rpc('leave',{id:'a'});assert.equal((await rpc('state',{id:'b'})).leaders.length,1);
 await db.exec("DELETE FROM cardrive_private.accounts WHERE id='b'");assert.equal((await db.query('SELECT count(*)::int n FROM cardrive_private.community_profiles')).rows[0].n,0);
 }finally{await db.close();}
});
import {createApplication} from './index.mjs';
test('Community HTTP derives identity from bearer session and rejects arbitrary RPC actions',async()=>{
 let called;
 const store={kind:'supabase',privacy:{},createAdTicket:async()=>{},authenticate:async(token)=>{if(token!=='valid'){let e=new Error('Unauthorized');e.status=401;throw e;}return 'real-user';},community:async(id,action,payload)=>{called={id,action,payload};return {me:null};}};
 const server=createApplication({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
 assert.equal((await fetch(base+'/community')).status,401);
 let response=await fetch(base+'/community',{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify({action:'join',name:'Tester',consent:true,id:'victim',scans:999})});assert.equal(response.status,200);assert.equal(called.id,'real-user');assert.equal(called.payload.scans,undefined);assert.equal(called.payload.id,undefined);
 response=await fetch(base+'/community',{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify({action:'count',id:'victim'})});assert.equal(response.status,400);
 }finally{await new Promise(r=>server.close(r));}
});
