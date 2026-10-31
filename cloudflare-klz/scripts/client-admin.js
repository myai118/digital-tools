'use strict';
(()=> {
 const byId=id=>document.getElementById(id),profile=byId('clientProfileSelect'),reload=byId('reloadClientProfiles'),search=byId('clientTickerSearch'),list=byId('clientTickerList'),save=byId('saveClientTickers'),toggle=byId('toggleClientAccount'),status=byId('clientTickerStatus'),profileState=byId('clientProfileState'),accountState=byId('clientAccountStatus'),createForm=byId('createClientForm'),resetForm=byId('resetClientPasswordForm');
 let users=[],tickers=[],csrf='',selected=new Set(),busy=false;
 function say(message,error=false){status.textContent=message;status.classList.toggle('error',error);}
 function current(){return users.find(u=>u.email===profile.value)||null;}
 function render(){
  const u=current(),query=search.value.trim().toLowerCase();list.replaceChildren();
  if(!u){search.disabled=save.disabled=toggle.disabled=true;resetForm.hidden=true;accountState.textContent='';return;}
  search.disabled=save.disabled=toggle.disabled=busy;resetForm.hidden=false;
  toggle.textContent=u.disabled?'Enable account':'Disable account';accountState.textContent=u.disabled?'Disabled':'Enabled';
  for(const item of tickers.filter(x=>!query||[x.ticker,x.name,x.type,x.region].some(v=>String(v||'').toLowerCase().includes(query)))){
   const label=document.createElement('label');label.className='default-ticker-option';
   const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(item.ticker);input.disabled=busy;
   input.addEventListener('change',()=>{if(input.checked)selected.add(item.ticker);else selected.delete(item.ticker);});
   const copy=document.createElement('span');copy.textContent=item.ticker+' · '+item.name+(item.type?' · '+item.type:'')+(item.region?' · '+item.region:'');
   label.append(input,copy);list.append(label);
  }
 }
 async function request(method='GET',body){
  const response=await fetch('/api/admin/clients',{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  let data={};try{data=await response.json();}catch{}if(!response.ok)throw Error(data.error||'Request failed.');return data;
 }
 async function load(preferred,force=false){
  if(busy&&!force)return;busy=true;reload.disabled=true;profile.disabled=true;save.disabled=toggle.disabled=true;say('Loading profiles and active tickers…');
  const keep=preferred||profile.value;
  try{
   const data=await request();users=(data.users||[]).filter(u=>!u.admin);tickers=data.tickers||[];csrf=data.csrf||'';
   profile.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent=users.length?'Choose a client profile':'No client accounts yet';profile.append(prompt);
   for(const u of users){const option=document.createElement('option');option.value=u.email;option.textContent=u.email+(u.disabled?' · Disabled':'');profile.append(option);}
   profile.value=users.some(u=>u.email===keep)?keep:'';
   profileState.textContent=users.length+' client account'+(users.length===1?'':'s');
   const u=current();selected=new Set(u?.tickers||[]);
   say(u?'Loaded '+tickers.length+' enabled tickers. Review the list and save changes.':'Choose a client profile to maintain its ticker list.');
  }catch(error){say(error.message,true);}
  finally{busy=false;reload.disabled=false;profile.disabled=false;render();}
 }
 profile.addEventListener('change',()=>{const u=current();selected=new Set(u?.tickers||[]);say(u?'Loaded '+selected.size+' assigned tickers for '+u.email+'.':'Choose a client profile.');render();});
 search.addEventListener('input',render);reload.addEventListener('click',()=>load());
 save.addEventListener('click',async()=>{
  const u=current();if(!u||busy)return;busy=true;render();say('Saving ticker list…');
  try{await request('POST',{op:'tickers',email:u.email,tickers:[...selected],csrf});say('Saved '+selected.size+' tickers for '+u.email+'.');await load(u.email,true);}
  catch(error){say(error.message,true);}
  finally{busy=false;render();}
 });
 toggle.addEventListener('click',async()=>{
  const u=current();if(!u||busy)return;busy=true;render();say(u.disabled?'Enabling account…':'Disabling account…');
  try{await request('POST',{op:u.disabled?'enable':'disable',email:u.email,csrf});await load(u.email,true);say((u.disabled?'Enabled ':'Disabled ')+u.email+'.');}
  catch(error){say(error.message,true);}
  finally{busy=false;render();}
 });
 createForm.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const email=byId('newClientEmail').value.trim(),password=byId('newClientPassword').value;
  busy=true;reload.disabled=profile.disabled=true;const button=createForm.querySelector('button[type=submit]');button.disabled=true;say('Adding client account…');
  try{await request('POST',{op:'create',email,password,tickers:[],csrf});createForm.reset();await load(email);say('Added '+email+'. Select the profile above to assign tickers.');}
  catch(error){say(error.message,true);}
  finally{busy=false;button.disabled=false;reload.disabled=profile.disabled=false;render();}
 });
 resetForm.addEventListener('submit',async event=>{
  event.preventDefault();const u=current(),password=byId('resetClientPassword').value;if(!u||busy)return;
  busy=true;render();byId('resetClientPasswordStatus').textContent='Resetting…';
  try{await request('POST',{op:'reset',email:u.email,password,csrf});resetForm.reset();byId('resetClientPasswordStatus').textContent='Password reset; active sessions ended.';say('Password reset for '+u.email+'.');}
  catch(error){byId('resetClientPasswordStatus').textContent=error.message;say(error.message,true);}
  finally{busy=false;render();}
 });
 load();
})();