import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from './store.mjs';
import {createAds} from './ads.mjs';
import {createPrivacy} from './privacy.mjs';
import {createApplication} from './index.mjs';

test('deletion authenticates, rolls back failures, removes dependent rows and invalidates all sessions',async()=>{
 const s=createStore(':memory:');createAds(s);const p=createPrivacy(s);
 const id=await s.register('a@example.com','long-password-123');const other=await s.register('b@example.com','long-password-123');const token=s.session(id);const token2=s.session(id);
 s.db.prepare('INSERT INTO ad_tickets(id,account_id,expires) VALUES(?,?,?)').run('ticket',id,Date.now()+1000);
 await assert.rejects(p.removeAccount(id,'wrong','SUPPRIMER'),{status:403});assert.equal(s.authenticate(token),id);
 await assert.rejects(p.removeAccount(id,'long-password-123',''),{status:400});
 await p.removeAccount(id,'long-password-123','SUPPRIMER');assert.equal(s.account(id),undefined);assert.ok(s.account(other));
 for(const t of [token,token2]) assert.throws(()=>s.authenticate(t),{status:401});
 assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM ad_tickets').get().n,0);s.db.close();
});
test('financial history prevents silent destruction and support tokens enforce isolation',async()=>{
 const s=createStore(':memory:');createAds(s);const p=createPrivacy(s);const id=await s.register('a@example.com','long-password-123');s.setCustomer(id,'cus_example');
 await assert.rejects(p.removeAccount(id,'long-password-123','SUPPRIMER'),{status:409});assert.ok(s.account(id));
 const a=p.createTicket({subject:'Suppression',message:'Je souhaite effacer mon compte.'});const b=p.createTicket({subject:'Question',message:'Une autre demande de support.'});
 assert.equal(p.readTicket(a).subject,'Suppression');assert.throws(()=>p.readTicket({...a,secret:b.secret}),{status:404});assert.throws(()=>p.admin(id,{}),{status:403});
 s.db.prepare('UPDATE support_tickets SET created=0 WHERE id=?').run(a.id);assert.throws(()=>p.readTicket(a),{status:404});s.db.close();
});
test('public deletion page works without ChatGPT; deletion API requires authentication',async()=>{
 const s=createStore(':memory:');const server=createApplication({store:s,stripe:null});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try {const page=await fetch(base+'/delete-account');assert.equal(page.status,200);assert.match(await page.text(),/Supprimer mon compte/);
 const denied=await fetch(base+'/account/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,401);
 const id=await s.register('delete@example.com','long-password-123');const token=s.session(id);
 const result=await fetch(base+'/account/delete',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({password:'long-password-123',confirmation:'SUPPRIMER'})});assert.equal(result.status,200);
 } finally {await new Promise(r=>server.close(r));s.db.close();}
});

test('authorized support operator can answer; web scripts parse',async()=>{
 const {portalScript,adminScript}=await import('./privacy.mjs');new Function(portalScript);new Function(adminScript);
 const s=createStore(':memory:');createAds(s);const p=createPrivacy(s);const old=process.env.SUPPORT_ADMIN_ACCOUNT_ID;process.env.SUPPORT_ADMIN_ACCOUNT_ID='operator';
 try {const t=p.createTicket({subject:'Test',message:'Demande de test du support.'});assert.throws(()=>p.admin('someone',{}),{status:403});p.admin('operator',{id:t.id,reply:'Réponse de test'});assert.equal(p.readTicket(t).reply,'Réponse de test');}
 finally {if(old===undefined) delete process.env.SUPPORT_ADMIN_ACCOUNT_ID;else process.env.SUPPORT_ADMIN_ACCOUNT_ID=old;s.db.close();}
});
