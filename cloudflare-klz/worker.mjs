import {Accounts,loginPage,accountsPage,page,htmlEscape} from './accounts.mjs';
export {Accounts};
function secure(response) {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control','private, no-store');
  result.headers.set('X-Content-Type-Options','nosniff');
  result.headers.set('Referrer-Policy','same-origin');
  result.headers.set('X-Frame-Options','DENY');
  result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  return result;
}
const sources = {
  cfg:'https://raw.githubusercontent.com/myai118/digital-tools/main/data/stock-tickers.json',
  defaults:'https://raw.githubusercontent.com/myai118/digital-tools/main/data/stock-monitor-display-defaults.json',
  data:'https://raw.githubusercontent.com/myai118/EverydayCompass/main/market-data.json',
  dividends:'https://raw.githubusercontent.com/myai118/EverydayCompass/main/dividend-data.json'
};
export async function snapshot(fetcher=fetch) {
  const entries = await Promise.all(Object.entries(sources).map(async ([key,url]) => {
    const response = await fetcher(url, {headers:{Accept:'application/json'}, cache:'no-store', signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('Upstream unavailable');
    return [key,await response.json()];
  }));
  const result = Object.fromEntries(entries);
  if (!Array.isArray(result.cfg?.instruments) || !Array.isArray(result.data?.instruments) || !Array.isArray(result.dividends?.instruments) || !result.defaults?.pages?.['tools/klz.html']) throw Error('Invalid upstream data');
  // Publish only KLZ display defaults; do not send other pages' settings passwords.
  const entry = result.defaults.pages['tools/klz.html'];
  result.defaults = {version:1,pages:{'tools/klz.html':{visibleTickers:entry.visibleTickers,settingsPassword:entry.settingsPassword}}};
  return result;
}

const cookieName='__Host-klz-session';
function cookie(request){return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';}
function nextPath(value){return ['/myweb-klz.html','/tools-klz.html','/accounts','/account'].includes(value)?value:'/myweb-klz.html';}
const html=(body,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8'}});
function redirect(path,extra={}){return new Response(null,{status:303,headers:{Location:path,...extra}});}
function sessionCookie(token){return cookieName+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800';}
export function handler(getSnapshot=snapshot){return {async fetch(request,env){
 try{return secure(await route(request,env,getSnapshot));}
 catch{return secure(html(page('Unavailable','<h1>Temporarily unavailable</h1><p>Please try again shortly.</p>'),503));}
}};}
async function route(request,env,getSnapshot){
 const url=new URL(request.url),path=url.pathname;
 if(!env.ACCOUNTS)return html(page('Setup required','<h1>Account storage setup required</h1>'),503);
 const stub=env.ACCOUNTS.get(env.ACCOUNTS.idFromName('klz-accounts-v1'));
 async function call(body){return stub.fetch('https://accounts.internal/',{method:'POST',body:JSON.stringify(body)});}
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin)return new Response('Invalid request origin',{status:403});
  if(Number(request.headers.get('Content-Length')||0)>8192)return new Response('Request too large',{status:413});
  const raw=await request.text();if(raw.length>8192)return new Response('Request too large',{status:413});
  const values=Object.fromEntries(new URLSearchParams(raw));
  if(path==='/login'||path==='/setup'){
   const response=await call({...values,op:path==='/setup'?'setup':'login',ip:request.headers.get('CF-Connecting-IP')||'unknown'});
   const result=await response.json();
   if(!response.ok)return html(loginPage(nextPath(values.next),result.error,path==='/setup'),response.status);
   return redirect(nextPath(values.next),{'Set-Cookie':sessionCookie(result.token)});
  }
  const token=cookie(request);
  if(path==='/logout'){
   const response=await call({op:'logout',token,csrf:values.csrf});
   if(!response.ok)return new Response('Invalid or expired session',{status:403});
   return redirect('/login',{'Set-Cookie':cookieName+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  }
  if(path==='/accounts'){
   if(!['create','reset','disable','enable'].includes(values.op))return new Response('Invalid action',{status:400});
   const response=await call({...values,token});
   if(response.ok)return redirect('/accounts');
   const {user}=await(await call({op:'session',token})).json();
   if(!user?.admin)return new Response('Administrator access required',{status:403});
   const {users=[]}=await(await call({op:'list',token})).json();
   return html(accountsPage(user,users,(await response.json()).error),response.status);
  }
  return new Response('Not found',{status:404});
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(path==='/login'||path==='/setup')return html(loginPage(nextPath(url.searchParams.get('next')),'',path==='/setup'));
 const token=cookie(request);
 const {user}=await(await call({op:'session',token})).json();
 if(!user){
  if(path.startsWith('/api/'))return Response.json({error:'Sign in required'},{status:401});
  return redirect('/login?next='+encodeURIComponent(nextPath(path)));
 }
 if(path==='/')return redirect('/myweb-klz.html');
 if(path==='/account')return html(page('Your account',`<h1>Your KLZ account</h1><p>${htmlEscape(user.email)}</p><a href="/myweb-klz.html">Back to KLZ</a>${user.admin?'<p><a href="/accounts">Manage accounts</a></p>':''}<form method="post" action="/logout"><input type="hidden" name="csrf" value="${htmlEscape(user.csrf)}"><button>Sign out</button></form>`));
 if(path==='/accounts'){
  if(!user.admin)return new Response('Administrator access required',{status:403});
  const {users=[]}=await(await call({op:'list',token})).json();return html(accountsPage(user,users));
 }
 if(path==='/api/snapshot'){
  if(request.method==='HEAD')return new Response(null);
  try{return Response.json(await getSnapshot());}
  catch{return Response.json({error:'Unable to retrieve latest GitHub data. Previous prices and timestamps are retained.'},{status:502});}
 }
 if(path.startsWith('/api/'))return new Response('Not found',{status:404});
 return env.ASSETS.fetch(request);
}
export default handler();
