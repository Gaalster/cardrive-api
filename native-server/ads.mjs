import { randomUUID, verify } from 'node:crypto';
import { fail } from './store.mjs';
let keysCache;
async function googleKey(id) {
  if (!keysCache || keysCache.until < Date.now()) {
    const r = await fetch('https://www.gstatic.com/admob/reward/verifier-keys.json', {signal: AbortSignal.timeout(10000)});
    if (!r.ok) throw fail(503, 'Vérification publicitaire indisponible');
    keysCache = {keys: (await r.json()).keys, until: Date.now() + 3600000};
  }
  return keysCache.keys.find(k => String(k.keyId) === id)?.pem;
}
export function createAds(store, {keyFor = googleKey, unit = process.env.ADMOB_REWARDED_UNIT_ID} = {}) {
  if (!store.createAdTicket) store.db.exec(`CREATE TABLE IF NOT EXISTS ad_tickets(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL, transaction_id TEXT UNIQUE);`);
  return {
    ticket(id) {
      if (!unit) throw fail(503, 'Les scans publicitaires seront disponibles après configuration AdMob.');
      if (store.createAdTicket) return store.createAdTicket(id).then(ticket => ({ticket, userId:id, unit}));
      if (store.entitlements(id).isPremium) throw fail(409, 'Ton Pass inclut déjà les scans.');
      const ticket = randomUUID();
      store.db.prepare('DELETE FROM ad_tickets WHERE expires<? AND transaction_id IS NULL').run(Date.now()-86400000);
      store.db.prepare('INSERT INTO ad_tickets(id,account_id,expires) VALUES(?,?,?)').run(ticket,id,Date.now()+3600000);
      return {ticket, userId:id, unit};
    },
    async callback(url) {
      if (!unit) throw fail(503, 'Publicités non configurées');
      const query = url.slice(url.indexOf('?')+1);
      const match = query.match(/^(.*)&signature=([^&]+)&key_id=(\d+)$/);
      if (!match || query.length > 10000) throw fail(400, 'Signature publicitaire manquante');
      const params = new URLSearchParams(match[1]);
      if (new Set(params.keys()).size !== [...params.keys()].length) throw fail(400,'Paramètres dupliqués');
      const key = await keyFor(match[3]);
      if (!key || !verify('sha256', Buffer.from(match[1]), key, Buffer.from(decodeURIComponent(match[2]),'base64url'))) throw fail(400,'Signature publicitaire invalide');
      // Signed AdMob console probe: connectivity only, never awards a scan.
      if (params.get('user_id') === 'cardrive-validation' &&
          params.get('custom_data') === 'configuration-admob') {
        return {ok:true, validationOnly:true};
      }
      const unitNumber = unit.split('/').pop();
      if (![unit,unitNumber].includes(params.get('ad_unit')) || params.get('reward_amount') !== '1' || params.get('reward_item') !== 'scan') throw fail(400,'Récompense incorrecte');
      const tx = params.get('transaction_id');
      const time = Number(params.get('timestamp'));
      if (!tx || tx.length>256 || !Number.isFinite(time) || Math.abs(Date.now()-time)>86400000) throw fail(400,'Événement expiré');
      if (store.awardAd) return store.awardAd({ticket:params.get('custom_data'),id:params.get('user_id'),transaction:tx,timestamp:time});
      return store.transaction(() => {
        const ticket = store.db.prepare('SELECT * FROM ad_tickets WHERE id=?').get(params.get('custom_data'));
        if (!ticket || ticket.account_id !== params.get('user_id')) throw fail(400,'Compte incorrect');
        if (ticket.transaction_id === tx) return {ok:true};
        if (ticket.transaction_id || ticket.expires < time) throw fail(400,'Récompense déjà utilisée ou expirée');
        if (store.db.prepare('SELECT id FROM ad_tickets WHERE transaction_id=?').get(tx)) throw fail(400,'Transaction déjà utilisée');
        store.db.prepare('UPDATE ad_tickets SET transaction_id=? WHERE id=?').run(tx,ticket.id);
        store.db.prepare('UPDATE accounts SET credits=credits+1 WHERE id=?').run(ticket.account_id);
        return {ok:true};
      });
    }
  };
}
