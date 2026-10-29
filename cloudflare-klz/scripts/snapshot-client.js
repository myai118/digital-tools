'use strict';
window.KLZSnapshot=(()=>{
 let cached=null,lastSuccess=0,pending=null;
 async function load(){
  if(cached&&Date.now()-lastSuccess<10000)return structuredClone(cached);
  if(!pending)pending=(async()=>{
   const response=await fetch('/api/snapshot',{cache:'no-store',credentials:'same-origin',redirect:'manual'});
   if(response.status===401||response.status===403||response.type==='opaqueredirect')throw Error('Your login session has expired. Reload this page to sign in again.');
   if(!response.ok)throw Error('Latest data unavailable. Previously displayed prices and timestamps are retained.');
   const value=await response.json();cached=value;lastSuccess=Date.now();return value;
  })().finally(()=>{pending=null;});
  return structuredClone(await pending);
 }
 return {load,due:()=>Date.now()-lastSuccess>=15*60*1000,defaults:async()=>({ok:true,json:async()=>(await load()).defaults})};
})();
