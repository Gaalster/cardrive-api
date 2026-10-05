import {randomUUID,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {fail,tokenHash} from './store.mjs';
const scrypt=promisify(scryptCallback);

export function createSupabaseStore({url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY,fetcher=fetch}={}) {
 if(!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || !secret?.startsWith('sb_secret_')) throw Error('Configurer SUPABASE_URL et SUPABASE_SECRET_KEY (clé secrète serveur sb_secret_).');
 async function rpc(operation,payload={}) {
  let r;
  try { r=await fetcher(url.replace(/\/$/,'')+'/rest/v1/rpc/cardrive_rpc',{method:'POST',headers:{apikey:secret,'Content-Type':'application/json'},body:JSON.stringify({operation,payload}),signal:AbortSignal.timeout(20000)}); }
  catch {throw fail(503,'Base de données indisponible. Réessaie plus tard.');}
  let data;try{data=await r.json();}catch{throw fail(503,'Réponse de la base illisible.');}
  if(!r.ok){
   if(operation==='register'&&data.code==='23505') throw fail(409,'Adresse déjà utilisée. Connecte-toi.');
   if(operation==='award_ad'&&data.code==='23505') throw fail(400,'Transaction déjà utilisée.');
   // Never expose database internals, hashes, SQL or credentials in API errors.
   const safe={PT400:'Demande invalide ou récompense expirée.',PT401:'Connecte-toi dans CarDrive.',PT402:'Plus de scans disponibles.',PT403:'Confirmation du compte refusée.',PT404:'Demande introuvable ou expirée.',PT409:'Opération incompatible avec ce compte. Contacte le support.'};
   if(safe[data.code]) throw fail(Number(data.code.slice(2)),safe[data.code]);
   throw fail(503,'Base de données indisponible ou non configurée.');
  }
  return data;
 }
 async function login(email,password) {
  const a=await rpc('login_record',{email});
  const [salt,hash]=(a?.password||`${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const candidate=await scrypt(password,salt,64), expected=Buffer.from(hash,'hex');
  if(!a || expected.length!==candidate.length || !timingSafeEqual(candidate,expected)) throw fail(401,'Identifiants incorrects');
  return a.id;
 }
 const store={
  kind:'supabase',rpc,
  health:()=>rpc('health'),close:async()=>{},
  async register(email,password){const salt=randomBytes(16).toString('hex');const hash=(await scrypt(password,salt,64)).toString('hex');return rpc('register',{id:randomUUID(),email,password:`${salt}:${hash}`});},
  login,account:id=>rpc('account',{id}),
  async session(id){const token=randomBytes(32).toString('hex');await rpc('session',{id,hash:tokenHash(token)});return token;},
  authenticate:token=>rpc('authenticate',{hash:tokenHash(token||'')}),
  logout:token=>rpc('logout',{hash:tokenHash(token)}),
  entitlements:id=>rpc('entitlements',{id}),consume:id=>rpc('consume',{id}),
  async createAdTicket(id){const ticket=randomUUID();await rpc('ad_ticket',{id,ticket});return ticket;},
  awardAd:payload=>rpc('award_ad',payload),
 };
 store.privacy={
  async removeAccount(id,password,confirmation){
   if(confirmation!=='SUPPRIMER'||typeof password!=='string'||password.length>128)throw fail(400,'Confirme la suppression et saisis ton mot de passe.');
   const a=await store.account(id);if(!a)throw fail(401,'Compte introuvable.');
   try{await login(a.email,password);}catch(e){if(e.status===401)throw fail(403,'Mot de passe incorrect.');throw e;}
   return rpc('delete_account',{id,passwordHash:a.password});
  },
  async createTicket(body){
   if(body.website)throw fail(400,'Demande invalide.');
   const subject=String(body.subject||'').trim(),message=String(body.message||'').trim();
   if(!subject||subject.length>120||message.length<10||message.length>4000)throw fail(400,'Sujet requis et message de 10 à 4 000 caractères.');
   const id=randomUUID(),secret=randomBytes(32).toString('hex');await rpc('support_create',{id,hash:tokenHash(secret),subject,message});return {id,secret};
  },
  readTicket(body){if(typeof body.secret!=='string'||body.secret.length!==64)throw fail(404,'Demande introuvable.');return rpc('support_read',{id:String(body.id||''),hash:tokenHash(body.secret)});},
  admin(id,body){
   if(!process.env.SUPPORT_ADMIN_ACCOUNT_ID||id!==process.env.SUPPORT_ADMIN_ACCOUNT_ID)throw fail(403,'Accès réservé à l’éditeur.');
   if(body.id&&(typeof body.reply!=='string'||!body.reply.trim()||body.reply.length>4000))throw fail(400,'Réponse invalide.');
   return rpc('support_admin',body.id?{id:String(body.id),reply:body.reply.trim()}:{});
  }
 };
 return store;
}
