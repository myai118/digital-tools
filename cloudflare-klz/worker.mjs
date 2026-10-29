import {createRemoteJWKSet, jwtVerify} from 'jose';
const keySets = new Map();
export async function authorised(request, env, resolver) {
  const domain = env.ACCESS_TEAM_DOMAIN || '';
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !env.ACCESS_AUD) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;
  try {
    if (!resolver) {
      if (!keySets.has(domain)) keySets.set(domain, createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`)));
      resolver = keySets.get(domain);
    }
    const {payload} = await jwtVerify(token, resolver, {
      issuer: `https://${domain}`, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp','iat','email']
    });
    const allowed = (env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return typeof payload.email === 'string' && allowed.includes(payload.email.toLowerCase());
  } catch { return false; }
}
function secure(response) {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control','private, no-store');
  result.headers.set('X-Content-Type-Options','nosniff');
  result.headers.set('Referrer-Policy','no-referrer');
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
export function handler(auth=authorised, getSnapshot=snapshot) {
 return {async fetch(request,env) {
  if (!await auth(request,env)) return secure(new Response('Sign-in required. Open the protected KLZ address and sign in with your approved email.',{status:401}));
  if (!['GET','HEAD'].includes(request.method)) return secure(new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}}));
  const url = new URL(request.url);
  if (url.pathname === '/') return secure(Response.redirect(new URL('/myweb-klz.html',url),302));
  if (url.pathname === '/api/snapshot') {
    if(request.method === 'HEAD')return secure(new Response(null));
    try {return secure(Response.json(await getSnapshot()));}
    catch {return secure(Response.json({error:'Unable to retrieve the latest GitHub data. Previously displayed prices remain unchanged; try again later.'},{status:502}));}
  }
  if (url.pathname.startsWith('/api/')) return secure(new Response('Not found',{status:404}));
  return secure(await env.ASSETS.fetch(request));
 }};
}
export default handler();
