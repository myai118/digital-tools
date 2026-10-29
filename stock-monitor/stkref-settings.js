'use strict';
const OWNER='sgkjeajk',REPO='stkref',BRANCH='main',FILE='data/stock-tickers.json';
const API='https://api.github.com/repos/'+OWNER+'/'+REPO+'/contents/'+FILE;
const DISPATCH='https://api.github.com/repos/'+OWNER+'/'+REPO+'/actions/workflows/task.yml/dispatches';
const INTERVALS=[5,6,8,9,10,15,30];
const DEFAULT_CHECKER={enabled:true,intervalMinutes:15,cycles:1,refillThreshold:5,topUpJobs:10,categories:{ETF:true,Stock:true,Fund:true}};
const $=id=>document.getElementById(id);
let loadedConfig=null,loadedSha=null,busy=false;
function setStatus(text,error=false){const el=$('status');el.textContent=text;el.classList.toggle('error',error);}
function decodeBase64Utf8(value){const binary=atob(value.replace(/\s/g,'')),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
function encodeBase64Utf8(value){const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
function normalise(config){
 const raw=config?.priceChecker||{},categories={...DEFAULT_CHECKER.categories,...(raw.categories||{})};
 return {enabled:typeof raw.enabled==='boolean'?raw.enabled:DEFAULT_CHECKER.enabled,
  intervalMinutes:INTERVALS.includes(Number(raw.intervalMinutes))?Number(raw.intervalMinutes):DEFAULT_CHECKER.intervalMinutes,
  cycles:1,
  refillThreshold:Number.isInteger(Number(raw.refillThreshold))?Math.max(0,Number(raw.refillThreshold)):DEFAULT_CHECKER.refillThreshold,
  topUpJobs:Number.isInteger(Number(raw.topUpJobs))?Math.max(1,Number(raw.topUpJobs)):DEFAULT_CHECKER.topUpJobs,
  categories:{ETF:Boolean(categories.ETF),Stock:Boolean(categories.Stock),Fund:Boolean(categories.Fund)}};
}
function readSettings(){return {enabled:$('checkerEnabled').checked,intervalMinutes:Number($('checkerInterval').value),cycles:1,refillThreshold:Number($('refillThreshold').value),topUpJobs:Number($('topUpJobs').value),categories:{ETF:$('categoryETF').checked,Stock:$('categoryStock').checked,Fund:$('categoryFund').checked}};}
function writeSettings(s){
 $('checkerEnabled').checked=s.enabled;$('checkerInterval').value=String(s.intervalMinutes);
 $('refillThreshold').value=String(s.refillThreshold);$('topUpJobs').value=String(s.topUpJobs);
 $('categoryETF').checked=s.categories.ETF;$('categoryStock').checked=s.categories.Stock;$('categoryFund').checked=s.categories.Fund;
 for(const id of ['checkerEnabled','checkerInterval','refillThreshold','topUpJobs','categoryETF','categoryStock','categoryFund'])$(id).disabled=false;
 $('save').disabled=false;$('startPrice').disabled=false;$('startAth').disabled=false;
 $('currentState').textContent='Price checker '+(s.enabled?'ON':'OFF')+' · '+s.intervalMinutes+' min interval · one check per program · add '+s.topUpJobs+' price checker programs when '+s.refillThreshold+' or fewer remain.';
}
function lock(value){busy=value;for(const id of ['reload','save','startPrice','startAth','checkerEnabled','checkerInterval','refillThreshold','topUpJobs','categoryETF','categoryStock','categoryFund'])$(id).disabled=value||!loadedConfig;}
async function githubFile(token=''){
 const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};if(token)headers.Authorization='Bearer '+token;
 const response=await fetch(API+'?ref='+BRANCH,{headers,cache:'no-store'}),body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.message||'GitHub could not read the STKREF settings.');
 if(body.encoding!=='base64'||!body.content||!body.sha)throw new Error('GitHub returned an unexpected settings file.');
 return {sha:body.sha,config:JSON.parse(decodeBase64Utf8(body.content))};
}
async function load(){
 if(busy)return;lock(true);setStatus('Loading current settings from STKREF…');
 try{const file=await githubFile();loadedConfig=file.config;loadedSha=file.sha;writeSettings(normalise(loadedConfig));setStatus('Loaded current price checker settings from sgkjeajk/stkref.');}
 catch(error){loadedConfig=null;loadedSha=null;$('currentState').textContent='Could not load settings.';setStatus(error.message,true);}
 finally{busy=false;$('reload').disabled=false;if(!loadedConfig)for(const id of ['save','startPrice','startAth','checkerEnabled','checkerInterval','refillThreshold','topUpJobs','categoryETF','categoryStock','categoryFund'])$(id).disabled=true;}
}
async function save(){
 if(busy||!loadedConfig||!loadedSha)return;
 const token=$('token').value.trim();
 if(!token){setStatus('Enter a fine-grained token created under sgkjeajk with Contents read/write access to stkref.',true);$('token').focus();return;}
 const settings=readSettings();
 if(!INTERVALS.includes(settings.intervalMinutes)||!Number.isInteger(settings.cycles)||settings.cycles<1||!Number.isInteger(settings.refillThreshold)||settings.refillThreshold<0||!Number.isInteger(settings.topUpJobs)||settings.topUpJobs<1){setStatus('Choose a supported interval, a refill threshold of 0 or more, and at least 1 price checker program per top-up.',true);return;}
 lock(true);setStatus('Checking the latest STKREF settings…');
 try{
  const latest=await githubFile(token);
  if(latest.sha!==loadedSha){loadedConfig=latest.config;loadedSha=latest.sha;writeSettings(normalise(latest.config));throw new Error('The STKREF settings changed since they were loaded. The latest values are shown; review them and save again.');}
  const previous=normalise(latest.config);
  if(JSON.stringify(previous)===JSON.stringify(settings)){setStatus('No changes to save.');return;}
  const next=latest.config;next.priceChecker={...(next.priceChecker||{}),...settings,maxActiveCheckers:settings.refillThreshold+settings.topUpJobs};next.revision=(Number.isInteger(next.revision)?next.revision:0)+1;next.saved_at=new Date().toISOString();
  const response=await fetch(API,{method:'PUT',headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token},body:JSON.stringify({message:'Update STKREF price checker settings',content:encodeBase64Utf8(JSON.stringify(next,null,2)+'\n'),sha:latest.sha,branch:BRANCH})});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||'GitHub could not save the STKREF settings.');
  loadedConfig=next;loadedSha=result.content?.sha||loadedSha;writeSettings(normalise(next));$('token').value='';
  setStatus('Saved. The scheduled checker uses these values on its next run.');
 }catch(error){setStatus(error.message,true);}
 finally{busy=false;lock(false);$('token').value=$('token').value;}
}
async function startJob(refreshAth){
 if(busy||!loadedConfig)return;
 const token=$('token').value.trim();
 if(!token){setStatus('Enter a fine-grained token created under sgkjeajk with Actions write access to stkref.',true);$('token').focus();return;}
 if(JSON.stringify(readSettings())!==JSON.stringify(normalise(loadedConfig))){setStatus('Save your settings before starting a price checker program.',true);return;}
 lock(true);setStatus(refreshAth?'Starting price and ATH refresh…':'Starting the price checker program…');
 try{
  const cycles=1;
  const response=await fetch(DISPATCH,{method:'POST',headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token},body:JSON.stringify({ref:BRANCH,inputs:{refresh_ath:refreshAth,checker_cycles:String(cycles),force_price_check:!refreshAth}})});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||'GitHub could not start the STKREF workflow. Confirm the token has Actions write permission.');
  $('token').value='';setStatus((refreshAth?'Price and ATH refresh':'Price checker program')+' started. Track progress in STKREF Actions.');
 }catch(error){setStatus(error.message,true);}
 finally{lock(false);}
}
$('reload').addEventListener('click',load);$('save').addEventListener('click',save);
$('startPrice').addEventListener('click',()=>startJob(false));$('startAth').addEventListener('click',()=>startJob(true));
for(const id of ['checkerEnabled','checkerInterval','refillThreshold','topUpJobs','categoryETF','categoryStock','categoryFund'])$(id).addEventListener('change',()=>{if(loadedConfig)$('currentState').textContent='Unsaved price checker changes';});
window.addEventListener('pagehide',()=>{$('token').value='';});
load();
