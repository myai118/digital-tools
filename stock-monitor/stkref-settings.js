'use strict';
const OWNER='sgkjeajk',REPO='stkref',BRANCH='main',FILE='data/stock-tickers.json';
const API='https://api.github.com/repos/'+OWNER+'/'+REPO+'/contents/'+FILE;
const $=id=>document.getElementById(id);
let loadedConfig=null,loadedSha=null,busy=false;
function setStatus(text,error=false){const el=$('status');el.textContent=text;el.classList.toggle('error',error);}
function decodeBase64Utf8(value){const binary=atob(value.replace(/\s/g,'')),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
function encodeBase64Utf8(value){const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
function fundEnabled(config){return config?.priceChecker?.categories?.Fund===true;}
function showCurrent(){if(!loadedConfig)return;$('fundEnabled').checked=fundEnabled(loadedConfig);$('fundEnabled').disabled=false;$('save').disabled=false;$('currentState').textContent='Fund price refresh is '+(fundEnabled(loadedConfig)?'ON':'OFF')+'.';}
async function githubFile(token=''){
 const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetch(API+'?ref='+BRANCH,{headers,cache:'no-store'});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.message||'GitHub could not read the STKREF settings.');
 if(body.encoding!=='base64'||!body.content||!body.sha)throw new Error('GitHub returned an unexpected settings file.');
 return {sha:body.sha,config:JSON.parse(decodeBase64Utf8(body.content))};
}
async function load(){
 if(busy)return;busy=true;$('reload').disabled=true;$('save').disabled=true;$('fundEnabled').disabled=true;setStatus('Loading current setting from STKREF…');
 try{const file=await githubFile();loadedConfig=file.config;loadedSha=file.sha;showCurrent();setStatus('Loaded the current setting from sgkjeajk/stkref.');}
 catch(error){loadedConfig=null;loadedSha=null;$('currentState').textContent='Could not load the setting.';setStatus(error.message,true);}
 finally{busy=false;$('reload').disabled=false;}
}
async function save(){
 if(busy||!loadedConfig||!loadedSha)return;
 const token=$('token').value.trim();
 if(!token){setStatus('Enter a fine-grained GitHub token with Contents read/write access to sgkjeajk/stkref.',true);$('token').focus();return;}
 busy=true;$('reload').disabled=true;$('save').disabled=true;$('fundEnabled').disabled=true;setStatus('Checking the latest STKREF setting…');
 try{
  const latest=await githubFile(token);
  if(latest.sha!==loadedSha){loadedConfig=latest.config;loadedSha=latest.sha;showCurrent();throw new Error('The STKREF file changed since it was loaded. The latest setting is shown; review it and save again.');}
  const enabled=$('fundEnabled').checked;
  if(fundEnabled(latest.config)===enabled){setStatus('No change needed; Fund price refresh is already '+(enabled?'ON':'OFF')+'.');return;}
  const next=latest.config;
  next.priceChecker=next.priceChecker||{};
  next.priceChecker.categories=next.priceChecker.categories||{};
  next.priceChecker.categories.Fund=enabled;
  next.revision=(Number.isInteger(next.revision)?next.revision:0)+1;
  next.saved_at=new Date().toISOString();
  const response=await fetch(API,{method:'PUT',headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token},body:JSON.stringify({message:'Set Fund price checking '+(enabled?'on':'off'),content:encodeBase64Utf8(JSON.stringify(next,null,2)+'\n'),sha:latest.sha,branch:BRANCH})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.message||'GitHub could not save the STKREF setting.');
  loadedConfig=next;loadedSha=result.content?.sha||loadedSha;showCurrent();
  setStatus('Saved. The STKREF workflow will apply this setting on its next run.');
  $('token').value='';
 }catch(error){setStatus(error.message,true);}
 finally{busy=false;$('reload').disabled=false;$('fundEnabled').disabled=false;$('save').disabled=!loadedConfig;}
}
$('reload').addEventListener('click',load);
$('save').addEventListener('click',save);
$('fundEnabled').addEventListener('change',()=>{if(loadedConfig)$('currentState').textContent='New Fund price refresh setting: '+($('fundEnabled').checked?'ON':'OFF')+'.';});
window.addEventListener('pagehide',()=>{$('token').value='';});
load();
