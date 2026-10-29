import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {authorised,handler,snapshot} from '../worker.mjs';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const env={ACCESS_TEAM_DOMAIN:'klz-test.cloudflareaccess.com',ACCESS_AUD:'test-audience',ALLOWED_EMAILS:'jjkwan118@gmail.com'};
async function token(email='jjkwan118@gmail.com',aud='test-audience',expiry='1h'){
 return new SignJWT({email}).setProtectedHeader({alg:'RS256'}).setIssuer('https://klz-test.cloudflareaccess.com').setAudience(aud).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
}
const request=t=>new Request('https://klz.example/tools-klz.html',{headers:t?{'Cf-Access-Jwt-Assertion':t}:{}});
test('fails closed with missing Access configuration or token',async()=>{
 assert.equal(await authorised(request(),env,publicKey),false);
 assert.equal(await authorised(request(await token()),{},publicKey),false);
});
test('accepts correctly signed approved user only',async()=>{
 assert.equal(await authorised(request(await token()),env,publicKey),true);
 assert.equal(await authorised(request(await token('other@example.com')),env,publicKey),false);
});
test('rejects wrong audience, expired or tampered token',async()=>{
 assert.equal(await authorised(request(await token(undefined,'wrong')),env,publicKey),false);
 assert.equal(await authorised(request(await token(undefined,undefined,'-1h')),env,publicKey),false);
 const parts=(await token()).split('.');parts[1]=Buffer.from(JSON.stringify({email:'jjkwan118@gmail.com'})).toString('base64url');
 assert.equal(await authorised(request(parts.join('.')),env,publicKey),false);
});
test('unauthenticated direct page, API and assets never reach protected resources',async()=>{
 for(const path of ['/myweb-klz.html','/tools-klz.html','/api/snapshot','/scripts/display-defaults.js']){
 let reached=false;const h=handler(async()=>false,async()=>{reached=true;});
 const response=await h.fetch(new Request('https://example.com'+path),{ASSETS:{fetch(){reached=true;}}});
 assert.equal(response.status,401);assert.equal(reached,false);assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
});
test('authorised snapshot is single response and upstream failure is explicit',async()=>{
 const good=handler(async()=>true,async()=>({data:{instruments:[]}}));
 assert.equal((await good.fetch(new Request('https://example.com/api/snapshot'),{})).status,200);
 const bad=handler(async()=>true,async()=>{throw Error('internal detail');});
 const response=await bad.fetch(new Request('https://example.com/api/snapshot'),{});
 assert.equal(response.status,502);assert.ok(!(await response.text()).includes('internal detail'));
});
test('snapshot exposes KLZ defaults only and validates upstream documents',async()=>{
 const fetcher=async url=>Response.json(url.includes('display-defaults')?{version:1,pages:{'tools/klz.html':{visibleTickers:['A'],settingsPassword:'klz'},'tools/kwc.html':{settingsPassword:'other'}}}:{instruments:[]});
 const result=await snapshot(fetcher);assert.deepEqual(Object.keys(result.defaults.pages),['tools/klz.html']);
 await assert.rejects(()=>snapshot(async()=>new Response('unavailable',{status:500})));
});
