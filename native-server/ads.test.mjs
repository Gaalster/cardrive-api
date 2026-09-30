import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createAds} from './ads.mjs';
import {createStore} from './store.mjs';
test('AdMob: signature, propriétaire, unité et récompense uniques',async()=>{
 const store=createStore(':memory:');
 try {
 const id=await store.register('ad@example.com','password-long-enough');
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const ads=createAds(store,{unit:'ca-app-pub-123/456',keyFor:async()=>publicKey});
 const ticket=ads.ticket(id);
 const fields={ad_unit:'456',custom_data:ticket.ticket,reward_amount:'1',reward_item:'scan',timestamp:String(Date.now()),transaction_id:'tx1',user_id:id};
 const signed=(values)=>{const raw=new URLSearchParams(values).toString();return '/ads/ssv?'+raw+'&signature='+sign('sha256',Buffer.from(raw),privateKey).toString('base64url')+'&key_id=1';};
 await assert.rejects(()=>ads.callback(signed({...fields,user_id:'other'})),/Compte/);
 await assert.rejects(()=>ads.callback(signed({...fields,ad_unit:'wrong'})),/incorrecte/);
 await assert.rejects(()=>ads.callback(signed(fields).replace('reward_amount=1','reward_amount=9')),/Signature/);
 assert.equal(store.entitlements(id).credits,0);
 await ads.callback(signed(fields));await ads.callback(signed(fields));
 assert.equal(store.entitlements(id).credits,1);
 await assert.rejects(()=>ads.callback(signed({...fields,transaction_id:'tx2'})),/utilisée/);
 assert.equal(store.entitlements(id).credits,1);
 } finally {store.db.close();}
});
