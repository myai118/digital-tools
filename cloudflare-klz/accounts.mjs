const encoder=new TextEncoder();
const hours8=8*60*60*1000;
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
export async function passwordHash(password,salt){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256));
}
export async function sameSecret(a,b){return await digest(String(a))===await digest(String(b));}
const email=s=>String(s||'').trim().toLowerCase();
const validEmail=s=>s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const strong=p=>typeof p==='string'&&p.length>=12&&p.length<=256;
const json=(v,status=200)=>Response.json(v,{status});
export class Accounts {
 constructor(ctx,env){this.ctx=ctx;this.store=ctx.storage;this.env=env;}
 async limited(key,max){
  const now=Date.now(),k='limit:'+await digest(key);
  if(!await this.store.getAlarm())await this.store.setAlarm(now+hours8);
  return this.store.transaction(async tx=>{
   let row=await tx.get(k);if(!row||row.until<now)row={n:0,until:now+15*60*1000};
   if(row.n>=max)return true;
   row.n++;await tx.put(k,row);return false;
  });
 }
 async session(token){
  if(!/^[a-f0-9]{64}$/.test(token||''))return null;
  const key='session:'+await digest(token),row=await this.store.get(key);
  if(!row)return null;
  if(row.expires<=Date.now()){await this.store.delete(key);return null;}
  const user=await this.store.get('user:'+row.email);
  if(!user||user.disabled||row.version!==user.version)return null;
  return {email:user.email,admin:user.admin,csrf:row.csrf};
 }
 async fetch(request){
  try{return await this.handle(await request.json());}catch{return json({error:'Account service unavailable. Please try again.'},503);}
 }
 async handle(b){
  const op=b.op;
  if(op==='session')return json({user:await this.session(b.token)});
  if(op==='logout'){
   const user=await this.session(b.token);
   if(!user||!await sameSecret(b.csrf||'',user.csrf))return json({error:'Session expired. Sign in again.'},403);
   await this.store.delete('session:'+await digest(b.token));return json({ok:true});
  }
  if(op==='login'||op==='setup'){
   const who=email(b.email),ip=String(b.ip||'unknown');
   if(await this.limited('ip:'+ip,20)||await this.limited('email:'+who,10))return json({error:'Too many attempts. Try again in 15 minutes.'},429);
   if(!validEmail(who)||!strong(b.password))return json({error:'Email or password is incorrect.'},401);
   if(op==='setup'){
    if(who!=='jjkwan118@gmail.com')return json({error:'Use the administrator email shown on this page.'},403);
    if(!this.env.SETUP_KEY)return json({error:'SETUP_KEY is missing from the active account service. Add it in the klz-monitor Production settings and deploy.'},503);
    if(String(this.env.SETUP_KEY).length<24)return json({error:'The saved SETUP_KEY is shorter than 24 characters. Replace it in Cloudflare and deploy.'},503);
    if(!await sameSecret(b.setupKey||'',this.env.SETUP_KEY))return json({error:'The entered setup key does not match the value saved in Cloudflare. Enter that exact value, including capital letters and symbols.'},403);
    const salt=random(),hash=await passwordHash(b.password,salt);
    const created=await this.store.transaction(async tx=>{
     if(await tx.get('initialised'))return false;
     await tx.put('user:'+who,{email:who,salt,hash,admin:true,disabled:false,version:1});
     await tx.put('initialised',true);return true;
    });
    if(!created)return json({error:'The administrator account already exists. Sign in instead.'},409);
   }
   const user=await this.store.get('user:'+who);
   // Perform equivalent password work for unknown users.
   const hash=await passwordHash(b.password,user?.salt||'unknown-account-dummy-salt');
   if(!user||user.disabled||!await sameSecret(hash,user.hash))return json({error:'Email or password is incorrect.'},401);
   const token=random(),csrf=random();
   await this.store.put('session:'+await digest(token),{email:who,expires:Date.now()+hours8,csrf,version:user.version});
   await this.ctx.storage.setAlarm(Date.now()+hours8);
   return json({ok:true,token});
  }
  const actor=await this.session(b.token);
  if(!actor)return json({error:'Session expired. Sign in again.'},401);
  if(!actor.admin)return json({error:'Administrator access required.'},403);
  if(op==='list'){
   const users=await this.store.list({prefix:'user:'});
   return json({users:[...users.values()].map(({email,disabled,admin})=>({email,disabled,admin}))});
  }
  if(!await sameSecret(b.csrf||'',actor.csrf))return json({error:'Invalid request. Reload the page.'},403);
  const who=email(b.email),key='user:'+who;
  if(!validEmail(who))return json({error:'Enter a valid email address.'},400);
  if(op==='create'){
   if(!strong(b.password))return json({error:'Use a password with 12–256 characters.'},400);
   const salt=random(),hash=await passwordHash(b.password,salt);
   const result=await this.store.transaction(async tx=>{
    if(await tx.get(key))return {error:'That account already exists.',status:409};
    if((await tx.list({prefix:'user:'})).size>=50)return {error:'Maximum 50 accounts, including the administrator.',status:400};
    await tx.put(key,{email:who,salt,hash,admin:false,disabled:false,version:1});return {ok:true};
   });return json(result,result.status||200);
  }
  const target=await this.store.get(key);
  if(!target)return json({error:'Account not found.'},404);
  if(op==='disable'||op==='enable'){
   if(target.admin)return json({error:'The administrator account cannot be disabled.'},400);
   await this.store.transaction(async tx=>{const u=await tx.get(key);u.disabled=op==='disable';u.version++;await tx.put(key,u);});return json({ok:true});
  }
  if(op==='reset'){
   if(!strong(b.password))return json({error:'Use a password with 12–256 characters.'},400);
   const salt=random(),hash=await passwordHash(b.password,salt);
   await this.store.transaction(async tx=>{const u=await tx.get(key);u.salt=salt;u.hash=hash;u.version++;await tx.put(key,u);});return json({ok:true});
  }
  return json({error:'Unknown account action.'},400);
 }
 async alarm(){
  const now=Date.now();let remaining=false;
  for(const prefix of ['session:','limit:']){
   const rows=await this.store.list({prefix});
   for(const [key,value]of rows){if((value.expires||value.until)<=now)await this.store.delete(key);else remaining=true;}
  }
  if(remaining)await this.ctx.storage.setAlarm(now+hours8);
 }
}
export const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function page(title,content){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)} — KLZ</title><style>body{font:17px Arial,sans-serif;background:#f4fafc;color:#080873;margin:0}main{max-width:640px;margin:40px auto;padding:24px;background:white;border:1px solid #cce0f5;border-radius:12px}h1{font-size:28px}label{display:block;margin:18px 0}input{display:block;box-sizing:border-box;width:100%;padding:12px;font:inherit;margin-top:6px}button,.button{display:inline-block;background:#0072ff;color:white;border:0;border-radius:6px;padding:12px 18px;font:inherit;text-decoration:none;cursor:pointer}a{color:#0072ff}.error{color:#a32717}small{line-height:1.5}li{padding:12px 0}form{margin:16px 0}hr{border:0;border-top:1px solid #ddd}</style></head><body><main>${content}</main></body></html>`;}
export function loginPage(next='/myweb-klz.html',error='',setup=false){
 return page(setup?'Create administrator account':'Sign in',`<h1>${setup?'Create your KLZ administrator account':'KLZ sign in'}</h1><p>${setup?'Set your own password. This setup can be completed once only.':'Enter your individual email and password.'}</p>${error?`<p class="error" role="alert">${htmlEscape(error)}</p>`:''}<form method="post" action="${setup?'/setup':'/login'}"><input type="hidden" name="next" value="${htmlEscape(next)}"><label>Email<input name="email" type="email" autocomplete="username" required ${setup?'value="jjkwan118@gmail.com" readonly':''}></label>${setup?'<label>Setup key<input name="setupKey" type="password" autocomplete="off" required minlength="24"></label>':''}<label>Password<input name="password" type="password" autocomplete="${setup?'new-password':'current-password'}" minlength="12" maxlength="256" required></label>${setup?'<p><small>Use at least 12 characters. Keep this password separate from your Cloudflare and GitHub passwords.</small></p>':''}<button type="submit">${setup?'Create account':'Sign in'}</button></form>${setup?'<a href="/login">Back to sign in</a>':'<p><small>Need an account or a password reset? Contact the KLZ administrator.</small></p>'}`);
}
export function accountsPage(user,users,error=''){
 const csrf=`<input type="hidden" name="csrf" value="${htmlEscape(user.csrf)}">`;
 return page('Manage accounts',`<h1>Manage KLZ accounts</h1><p>${users.length} of 50 accounts</p><a href="/myweb-klz.html">Back to KLZ</a>${error?`<p role="alert" class="error">${htmlEscape(error)}</p>`:''}<h2>Add an account</h2><form method="post" action="/accounts">${csrf}<input type="hidden" name="op" value="create"><label>Email<input name="email" type="email" required></label><label>Initial password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label><button>Add account</button></form><p><small>Give the account details to the user privately. Passwords are stored as salted hashes and cannot be viewed here.</small></p><hr><h2>Existing accounts</h2><ul>${users.map(u=>`<li><strong>${htmlEscape(u.email)}</strong> · ${u.admin?'Administrator':u.disabled?'Disabled':'Enabled'}${!u.admin?`<form method="post" action="/accounts">${csrf}<input type="hidden" name="email" value="${htmlEscape(u.email)}"><button name="op" value="${u.disabled?'enable':'disable'}">${u.disabled?'Enable':'Disable'}</button></form>`:''}<form method="post" action="/accounts">${csrf}<input type="hidden" name="email" value="${htmlEscape(u.email)}"><input type="hidden" name="op" value="reset"><label>New password<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="256" required></label><button>Reset password and end sessions</button></form></li>`).join('')}</ul>`);
}
