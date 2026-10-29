import test from 'node:test';import assert from 'node:assert/strict';
import {Accounts} from '../accounts.mjs';import {handler,snapshot} from '../worker.mjs';
class Storage {
 constructor(){this.rows=new Map();this.alarm=null;}
 async get(k){return structuredClone(this.rows.get(k));}
 async put(k,v){this.rows.set(k,structuredClone(v));}
 async delete(k){return this.rows.delete(k);}
 async list({prefix}){return new Map([...this.rows].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));}
 async transaction(f){return f(this);}
 async getAlarm(){return this.alarm;}async setAlarm(n){this.alarm=n;}
}
function service(){const store=new Storage();const env={SETUP_KEY:'test-setup-key-at-least-24-characters'};const a=new Accounts({storage:store},env);return {a,store,env};}
async function setup(a){let r=await a.handle({op:'setup',email:'jjkwan118@gmail.com',password:'administrator-password-123',setupKey:'test-setup-key-at-least-24-characters',ip:'test'});assert.equal(r.status,200);const {token}=await r.json();return {token,...await a.session(token)};}
test('bootstrap is key protected, one time, and stores salted hashes only',async()=>{
 const {a,store}=service();assert.equal((await a.handle({op:'setup',email:'jjkwan118@gmail.com',password:'administrator-password-123',setupKey:'wrong'})).status,403);
 await setup(a);assert.equal((await a.handle({op:'setup',email:'jjkwan118@gmail.com',password:'administrator-password-123',setupKey:'test-setup-key-at-least-24-characters'})).status,409);
 const user=await store.get('user:jjkwan118@gmail.com');assert.ok(user.hash);assert.ok(!JSON.stringify(user).includes('administrator-password-123'));
});
test('individual login, admin restriction, disable and password reset revoke sessions',async()=>{
 const {a}=service(),admin=await setup(a);
 assert.equal((await a.handle({op:'create',...admin,email:'visitor@example.com',password:'visitor-password-123'})).status,200);
 const login=async password=>a.handle({op:'login',email:'visitor@example.com',password,ip:'test'});
 assert.equal((await login('incorrect-password')).status,401);
 const {token}=await(await login('visitor-password-123')).json();const visitor=await a.session(token);assert.ok(visitor);assert.equal(visitor.admin,false);
 assert.equal((await a.handle({op:'list',token})).status,403);
 await a.handle({op:'disable',...admin,email:'visitor@example.com'});assert.equal(await a.session(token),null);
 await a.handle({op:'enable',...admin,email:'visitor@example.com'});assert.equal(await a.session(token),null);
 const fresh=(await(await login('visitor-password-123')).json()).token;
 await a.handle({op:'reset',...admin,email:'visitor@example.com',password:'changed-password-123'});assert.equal(await a.session(fresh),null);assert.equal((await login('visitor-password-123')).status,401);assert.equal((await login('changed-password-123')).status,200);
});
test('expired and fabricated sessions fail; mutations need CSRF and logout revokes',async()=>{
 const {a,store}=service(),admin=await setup(a);assert.equal(await a.session('a'.repeat(64)),null);
 assert.equal((await a.handle({op:'create',token:admin.token,email:'a@example.com',password:'valid-password-123',csrf:'forged'})).status,403);
 for(const [k,row]of await store.list({prefix:'session:'})){row.expires=Date.now()-1;await store.put(k,row);}
 assert.equal(await a.session(admin.token),null);
 const {token}=await(await a.handle({op:'login',email:'jjkwan118@gmail.com',password:'administrator-password-123'})).json();const u=await a.session(token);
 assert.equal((await a.handle({op:'logout',token,csrf:u.csrf})).status,200);assert.equal(await a.session(token),null);
});
test('rate limits unsuccessful logins',async()=>{
 const {a}=service();let response;for(let i=0;i<11;i++)response=await a.handle({op:'login',email:'a@example.com',password:'invalid-password-123',ip:'same'});assert.equal(response.status,429);
});
test('protected pages/assets redirect, data denies access, and cross-origin login fails',async()=>{
 const {a}=service(),env={ACCOUNTS:{idFromName:()=>1,get:()=>({fetch:(url,opts)=>a.fetch(new Request(url,opts))})},ASSETS:{fetch:()=>{throw Error('Asset leaked');}}};const h=handler();
 for(const path of ['/myweb-klz.html','/tools-klz.html','/scripts/xlsx-writer.js']){const r=await h.fetch(new Request('https://example.com'+path),env);assert.equal(r.status,303);assert.ok(r.headers.get('location').startsWith('/login'));}
 assert.equal((await h.fetch(new Request('https://example.com/api/snapshot'),env)).status,401);
 assert.equal((await h.fetch(new Request('https://example.com/login',{method:'POST',headers:{Origin:'https://evil.example'},body:'email=x'}),env)).status,403);
 const login=await h.fetch(new Request('https://example.com/login'),env);assert.equal(login.status,200);assert.equal(login.headers.get('referrer-policy'),'same-origin');assert.ok((await login.text()).includes('Client accounts sign in'));
});
test('valid session opens assets; secure cookie and next URL cannot redirect externally',async()=>{
 const {a,env:secrets}=service();const env={...secrets,ACCOUNTS:{idFromName:()=>1,get:()=>({fetch:(url,opts)=>a.fetch(new Request(url,opts))})},ASSETS:{fetch:()=>new Response('protected asset')}};await setup(a);
 const body=new URLSearchParams({email:'jjkwan118@gmail.com',password:'administrator-password-123',next:'https://evil.example'});
 const h=handler();const login=await h.fetch(new Request('https://example.com/login',{method:'POST',headers:{Origin:'https://example.com'},body}),env);
 assert.equal(login.status,303);assert.equal(login.headers.get('location'),'/myweb-klz.html');const c=login.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Strict','Max-Age=28800'])assert.ok(c.includes(flag));
 const response=await h.fetch(new Request('https://example.com/tools-klz.html',{headers:{Cookie:c.split(';')[0]}}),env);assert.equal(await response.text(),'protected asset');assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('snapshot exposes KLZ settings only and reports upstream failures',async()=>{
 const fetcher=async url=>Response.json(url.includes('display-defaults')?{version:1,pages:{'tools/klz.html':{visibleTickers:['A']},'tools/kwc.html':{}}}:{instruments:[]});const r=await snapshot(fetcher);assert.deepEqual(Object.keys(r.defaults.pages),['tools/klz.html']);await assert.rejects(()=>snapshot(async()=>new Response('',{status:500})));
});
