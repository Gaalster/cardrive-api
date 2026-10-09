import {randomBytes, randomUUID} from 'node:crypto';
import {fail, tokenHash} from './store.mjs';

export function createPrivacy(store) {
  if (store.privacy) return store.privacy;
  store.db.exec(`CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, subject TEXT NOT NULL,
    message TEXT NOT NULL, reply TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
  `);
  const purge = () => store.db.prepare('DELETE FROM support_tickets WHERE created<?').run(Date.now()-90*86400000);
  purge();
  return {
    async removeAccount(id, password, confirmation) {
      if (confirmation !== 'SUPPRIMER' || typeof password !== 'string' || password.length > 128) throw fail(400,'Confirme la suppression et saisis ton mot de passe.');
      const a = store.account(id);
      if (!a) throw fail(401,'Compte introuvable.');
      try { await store.login(a.email,password); } catch (e) { if(e.status===401) throw fail(403,'Mot de passe incorrect.'); throw e; }
      // Billing deletion requires cancellation + lawful financial retention; never silently discard it.
      if (a.customer || a.premium_until > Date.now() || store.db.prepare('SELECT id FROM orders WHERE account_id=? LIMIT 1').get(id)) throw fail(409,'Ce compte possède un historique de paiement. Demande sa suppression depuis le support pour traiter cet historique.');
      store.transaction(() => {
        for (const table of ['sessions','checkout_attempts','ad_tickets']) store.db.prepare(`DELETE FROM ${table} WHERE account_id=?`).run(id);
        store.db.prepare('DELETE FROM accounts WHERE id=?').run(id);
      });
      return {ok:true};
    },
    createTicket(body) {
      purge();
      if (body.website) throw fail(400,'Demande invalide.');
      const subject=String(body.subject||'').trim(), message=String(body.message||'').trim();
      if (!subject || subject.length>120 || message.length<10 || message.length>4000) throw fail(400,'Sujet requis (120 caractères maximum) et message de 10 à 4 000 caractères.');
      const id=randomUUID(), secret=randomBytes(32).toString('hex');
      store.db.prepare('INSERT INTO support_tickets(id,secret_hash,subject,message,created) VALUES(?,?,?,?,?)').run(id,tokenHash(secret),subject,message,Date.now());
      return {id,secret};
    },
    readTicket(body) {
      purge();
      if(typeof body.secret!=='string'||body.secret.length!==64) throw fail(404,'Demande introuvable.');
      const t=store.db.prepare('SELECT id,subject,message,reply,created FROM support_tickets WHERE id=? AND secret_hash=?').get(String(body.id||''),tokenHash(body.secret));
      if(!t) throw fail(404,'Demande introuvable ou expirée.');
      return t;
    },
    admin(id,body) {
      if(!process.env.SUPPORT_ADMIN_ACCOUNT_ID || id!==process.env.SUPPORT_ADMIN_ACCOUNT_ID) throw fail(403,'Accès réservé à l’éditeur.');
      purge();
      if(body.id) {
        if(typeof body.reply!=='string'||!body.reply.trim()||body.reply.length>4000) throw fail(400,'Réponse invalide.');
        store.db.prepare('UPDATE support_tickets SET reply=? WHERE id=?').run(body.reply.trim(),String(body.id));
      }
      return {tickets:store.db.prepare('SELECT id,subject,message,reply,created FROM support_tickets ORDER BY created DESC LIMIT 100').all()};
    }
  };
}

export const privacyPortal = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>CarDrive — Support et suppression de compte</title><style>body{background:#0b0d12;color:#eef0f5;font:17px/1.6 system-ui;margin:0}main{max-width:720px;margin:auto;padding:24px}h1{color:#fbbf24}section{background:#171923;border-radius:16px;padding:22px;margin:24px 0}label{display:block;margin-top:16px}input,textarea,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:8px;border:1px solid #666}button{background:#fbbf24;color:#171717;font-weight:bold;margin-top:18px;cursor:pointer}button:disabled{opacity:.5}a{color:#fbbf24;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}#message{white-space:pre-wrap}.trap{display:none}</style></head><body><main><h1>CarDrive TCG</h1><p>Support et gestion du compte Android · PRAE Conseils</p><p><a href="https://cardrive.kiki2823.chatgpt.site/confidentialite.html">Confidentialité</a></p><p id="message" role="status"></p>
<section><h2>Supprimer mon compte</h2><p>La suppression efface le compte Android, ses sessions et ses crédits gratuits ou publicitaires. Elle est définitive. Le garage enregistré sur votre téléphone doit être effacé depuis l’application ou les réglages Android. Un historique de paiement nécessite un traitement par le support.</p><form id="delete"><label>Adresse e-mail du compte<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Mot de passe<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><label>Écrivez SUPPRIMER pour confirmer<input name="confirmation" required pattern="SUPPRIMER"></label><button>Supprimer définitivement mon compte</button></form><p>Mot de passe oublié ou compte inaccessible ? Utilisez le formulaire ci-dessous pour demander une suppression. Une vérification d’identité sera nécessaire.</p></section>
<section><h2>Contacter le support</h2><p>Aucun compte ChatGPT requis. Conservez le lien privé affiché après l’envoi pour consulter la réponse : aucun e-mail ne sera envoyé. Ne transmettez jamais de mot de passe, de clé API ou de données bancaires.</p><form id="support"><label>Sujet<input name="subject" required maxlength="120"></label><label>Message<textarea name="message" required minlength="10" maxlength="4000" rows="5"></textarea></label><label class="trap">Site<input name="website" tabindex="-1" autocomplete="off"></label><button>Envoyer ma demande</button></form><div id="ticket"></div><p>Les demandes et réponses sont conservées au maximum 90 jours pour traiter le support, sur la base de notre intérêt légitime à vous assister. Le lien privé donne accès à votre demande : ne le partagez pas.</p></section></main><script src="/account-tools.js" defer></script></body></html>`;
export const portalScript = `const status=document.querySelector('#message');
async function call(path,body,token){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Erreur serveur');return d;}
async function submit(form,fn){const b=form.querySelector('button');b.disabled=true;status.textContent='Traitement en cours…';try{await fn(Object.fromEntries(new FormData(form)));}catch(e){status.textContent=e.message;}finally{b.disabled=false;}}
document.querySelector('#delete').onsubmit=e=>{e.preventDefault();submit(e.target,async body=>{const {token}=await call('/auth/login',body);await call('/account/delete',body,token);e.target.reset();status.textContent='Compte supprimé. Effacez aussi les données locales de CarDrive sur votre téléphone.';});};
document.querySelector('#support').onsubmit=e=>{e.preventDefault();submit(e.target,async body=>{const t=await call('/support/tickets',body);location.hash=new URLSearchParams(t).toString();e.target.reset();await show();status.textContent='Demande enregistrée. Conservez le lien privé ci-dessous.';});};
async function show(){const p=new URLSearchParams(location.hash.slice(1));if(!p.get('secret'))return;try{const t=await call('/support/read',Object.fromEntries(p));const box=document.querySelector('#ticket');box.replaceChildren();const a=document.createElement('a');a.href=location.href;a.textContent='Lien privé à conserver : '+location.href;box.append(a);const pre=document.createElement('pre');pre.textContent=t.subject+'\\n'+t.message+'\\n\\nRéponse : '+(t.reply||'En attente. Revenez consulter ce lien.');box.append(pre);}catch(e){status.textContent=e.message;}}show();`;

export const adminPortal = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Support CarDrive — Éditeur</title><style>body{max-width:800px;margin:30px auto;padding:20px;font:17px system-ui;background:#111;color:#eee}input,textarea,button{display:block;padding:12px;margin:12px 0;box-sizing:border-box;width:100%;font:inherit}article{padding:20px;border:1px solid #888;margin:20px 0}p{white-space:pre-wrap}</style><h1>Support CarDrive — Éditeur</h1><p>Connectez-vous avec le compte Android autorisé à gérer le support.</p><form id="login"><label>E-mail<input name="email" type="email" required autocomplete="username"></label><label>Mot de passe<input name="password" type="password" required autocomplete="current-password"></label><button>Ouvrir les demandes</button></form><p id="status" role="status"></p><div id="tickets"></div><script src="/support-admin.js" defer></script></html>`;
export const adminScript = `let token='';const status=document.querySelector('#status');async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Erreur');return d;}
async function refresh(){const d=await call('/support/admin',{});const box=document.querySelector('#tickets');box.replaceChildren();for(const t of d.tickets){const el=document.createElement('article');const title=document.createElement('h2');title.textContent=t.subject;const msg=document.createElement('p');msg.textContent=t.message;const reply=document.createElement('textarea');reply.value=t.reply;reply.maxLength=4000;reply.setAttribute('aria-label','Réponse');const b=document.createElement('button');b.textContent='Enregistrer la réponse';b.onclick=async()=>{b.disabled=true;try{await call('/support/admin',{id:t.id,reply:reply.value});status.textContent='Réponse enregistrée.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};el.append(title,msg,reply,b);box.append(el);}status.textContent=d.tickets.length+' demande(s).';}
document.querySelector('#login').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{token=(await call('/auth/login',Object.fromEntries(new FormData(e.target)))).token;await refresh();e.target.reset();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};`;
