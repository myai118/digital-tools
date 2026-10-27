'use strict';
// Credentials remain inside this closure and are never written to browser storage.
window.ECGitHub=(()=>{
 const repo='myai118/digital-tools',branch='main',base='https://api.github.com/repos/'+repo;
 let credential='';const catalogs=new Map();
 const headers=(extra={})=>({...extra,'X-GitHub-Api-Version':'2022-11-28',...(credential?{Authorization:'Bearer '+credential}:{})});
 async function request(path,options={}){
  const r=await fetch(base+path,{...options,cache:'no-store',headers:headers({Accept:'application/vnd.github+json',...(options.headers||{})})});
  if(!r.ok){let detail;try{detail=(await r.json()).message;}catch(e){}throw Error('GitHub '+r.status+': '+(detail||'Request failed.')+(r.status===401?' Connect with a valid token.':r.status===403?' Check token permissions or API rate limits.':''));}
  return r.status===204?null:r.json();
 }
 const decode=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
 const encode=s=>{let binary='';for(const byte of new TextEncoder().encode(s))binary+=String.fromCharCode(byte);return btoa(binary);};
 async function file(path){const raw=await request('/contents/'+path+'?ref='+branch+'&ts='+Date.now());return {data:JSON.parse(decode(raw.content)),sha:raw.sha};}
 async function raw(path){return request('/contents/'+path+'?ref='+branch+'&ts='+Date.now(),{headers:{Accept:'application/vnd.github.raw+json'}});}
 function normalise(t){if(typeof t!=='string')throw Error('Ticker must be text.');t=t.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(t)||/[.\-]{2}/.test(t)||/[.\-]$/.test(t))throw Error('Invalid ticker format.');return t;}
 async function lookup(t){t=normalise(t);const prefix=t[0];if(!catalogs.has(prefix))catalogs.set(prefix,raw('data/symbol-directory/'+prefix+'.json').catch(e=>{catalogs.delete(prefix);if(e.message.startsWith('GitHub 404:'))return {};throw e;}));const catalog=await catalogs.get(prefix);if(Object.hasOwn(catalog,t)){const x=catalog[t];return {ticker:t,name:x.name,region:x.market,type:x.type,metadata_source:x.source};}throw Error('This ticker is not in the built-in directory. Add and verify new tickers in stkref before using them here.');}
  async function save(input,items){
  if(!credential)throw Error('Connect GitHub to save a shared configuration. Nothing was saved.');
  const seen=new Set();
  const instruments=items.map(x=>{const ticker=normalise(x.ticker);if(seen.has(ticker))throw Error('Duplicate ticker: '+ticker);seen.add(ticker);if(typeof x.enabled!=='boolean'||!['ETF','Stock','Fund'].includes(x.type)||!x.name||!x.market)throw Error('Verify every ticker before saving.');return {ticker,enabled:x.enabled,show:x.type==='Fund'?x.show!==false:true,name:x.name,region:x.market,type:x.type,metadata_source:x.source||x.metadata_source};}).sort((a,b)=>({ETF:0,Stock:1,Fund:2}[a.type]??3)-({ETF:0,Stock:1,Fund:2}[b.type]??3)||a.ticker.localeCompare(b.ticker));
  const latest=await file('data/stock-tickers.json');if((latest.data.revision||0)!==input.revision)throw Error('Another save changed the configuration. Reload before saving your draft.');
  const cfg={version:1,revision:input.revision+1,refreshIntervalMinutes:latest.data.refreshIntervalMinutes||10,saved_at:new Date().toISOString(),instruments};
  const result=await request('/contents/data/stock-tickers.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Update Stock ETF Monitor ticker configuration',branch,sha:latest.sha,content:encode(JSON.stringify(cfg,null,2)+'\n')})});
  return {...cfg,commit_sha:result.commit?.sha};
 }
 function mount(container){
  container.innerHTML='<details><summary>Owner access — connect GitHub</summary><p>For shared ticker configuration saves, use a fine-grained token restricted to <b>myai118/digital-tools</b>, with <b>Contents: read and write</b>. The token stays in this tab’s memory until you disconnect or reload. Never paste it into chat.</p><label>GitHub token <input type="password" autocomplete="off" spellcheck="false" aria-label="GitHub token"></label><button type="button" class="connect">Connect GitHub</button> <button type="button" class="disconnect">Disconnect</button><p class="auth-status" role="status">Not connected. Public viewing is available.</p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Create a restricted token</a></details>';
  const input=container.querySelector('input'),status=container.querySelector('.auth-status'),button=container.querySelector('.connect');
  button.onclick=async()=>{const value=input.value.trim();input.value='';if(!value){status.textContent='Enter your restricted GitHub token.';return;}credential=value;button.disabled=true;try{await request('');status.textContent='Connected for this tab. Save writes the shared GitHub ticker configuration.';}catch(e){credential='';status.textContent=e.message;}finally{button.disabled=false;}};
  container.querySelector('.disconnect').onclick=()=>{credential='';input.value='';status.textContent='Disconnected. The token has been cleared from this tab.';};
 }
 async function savePageDefaults(page,visibleTickers,previousVisibleTickers){
  if(!credential)throw Error('Connect GitHub under Owner access before saving default tickers.');
  const path='data/stock-monitor-display-defaults.json',latest=await file(path),data=latest.data;
  if(data.version!==1||!data.pages||!Object.hasOwn(data.pages,page)||!Array.isArray(data.pages[page]?.visibleTickers))throw Error('This monitor page is not configured. Reload the default ticker settings.');
  const normaliseList=value=>{if(!Array.isArray(value)||value.some(t=>typeof t!=='string'))throw Error('Invalid ticker default list.');return [...new Set(value.map(t=>t.trim().toUpperCase()))].sort();};
  if(JSON.stringify(normaliseList(data.pages[page].visibleTickers))!==JSON.stringify(normaliseList(previousVisibleTickers)))throw Error('This page’s defaults changed elsewhere. Reload before saving.');
  const next={...data.pages[page],visibleTickers:normaliseList(visibleTickers),savedAt:new Date().toISOString()};
  data.pages[page]=next;
  const result=await request('/contents/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Set default tickers for stock-monitor/'+page,branch,sha:latest.sha,content:encode(JSON.stringify(data,null,2)+'\n')})});
  if(!result?.commit?.sha)throw Error('GitHub did not confirm the default ticker save.');
  return {data,commit_sha:result.commit.sha};
 }
 async function savePagePassword(page,password,previousPassword){
  if(!credential)throw Error('Connect GitHub under Owner access before saving a password.');
  if(typeof password!=='string'||!password.trim())throw Error('Enter a new password.');
  const path='data/stock-monitor-display-defaults.json',latest=await file(path),data=latest.data;
  if(data.version!==1||!data.pages||!Object.hasOwn(data.pages,page)||!Array.isArray(data.pages[page]?.visibleTickers))throw Error('This monitor page is not configured. Reload the password settings.');
  if(data.pages[page].settingsPassword!==previousPassword)throw Error('This password changed elsewhere. Reload password settings before saving.');
  data.pages[page]={...data.pages[page],settingsPassword:password};
  const result=await request('/contents/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Update monitor settings password for '+page,branch,sha:latest.sha,content:encode(JSON.stringify(data,null,2)+'\n')})});
  if(!result?.commit?.sha)throw Error('GitHub did not confirm the password save. Reload password settings to check before retrying.');
  return {data,commit_sha:result.commit.sha};
 }
 return {file,raw,lookup,save,savePageDefaults,savePagePassword,mount,connected:()=>Boolean(credential)};
})();

