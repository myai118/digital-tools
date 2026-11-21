'use strict';
(()=>{
 const byId=id=>document.getElementById(id),page=byId('defaultTickerPage'),search=byId('defaultTickerSearch'),list=byId('defaultTickerList'),save=byId('saveDefaultTickers'),reload=byId('reloadDefaultTickers'),status=byId('defaultTickerStatus'),count=byId('defaultTickerCount'),selectFiltered=byId('selectFilteredDefaultTickers'),clearFiltered=byId('clearFilteredDefaultTickers'),categoryButtons={ETF:byId('toggleDefaultETF'),Stock:byId('toggleDefaultStock'),Fund:byId('toggleDefaultFund')};
 let pages={},original={},selected={},instruments=[],activePage='',checkboxes=[],busy=false;
 function say(message){status.textContent=message;}
 function capture(){if(!activePage)return;const chosen=new Set(selected[activePage]||[]);for(const x of checkboxes){if(x.input.checked)chosen.add(x.ticker);else chosen.delete(x.ticker);}selected[activePage]=[...chosen].sort();}
 function render(){
  activePage=page.value;checkboxes=[];list.replaceChildren();
  const chosen=new Set(selected[activePage]||[]),query=search.value.trim().toLowerCase();
  for(const [type,button] of Object.entries(categoryButtons)){const tickers=instruments.filter(x=>x.type.toLowerCase()===type.toLowerCase()).map(x=>x.ticker),all=tickers.length>0&&tickers.every(t=>chosen.has(t));button.textContent=(all?'Hide all ':'Show all ')+(type==='ETF'?'ETFs':type==='Stock'?'stocks':'funds');button.setAttribute('aria-pressed',String(all));button.disabled=busy||!tickers.length;}
  const shown=instruments.filter(x=>!query||[x.ticker,x.name,x.region,x.type].some(v=>String(v||'').toLowerCase().includes(query)));
  for(const item of shown){
   const label=document.createElement('label');label.className='default-ticker-option';
   const input=document.createElement('input');input.type='checkbox';input.value=item.ticker;input.checked=chosen.has(item.ticker);
   const text=document.createElement('span');text.textContent=item.ticker+' · '+item.name+(item.region?' · '+item.region:'');
   label.append(input,text);list.append(label);checkboxes.push({ticker:item.ticker,input});
  }
  count.textContent=(selected[activePage]||[]).length+' selected · '+shown.length+' of '+instruments.length+' active tickers shown';
 }
 async function load(){
  if(busy)return;busy=true;save.disabled=reload.disabled=page.disabled=search.disabled=selectFiltered.disabled=clearFiltered.disabled=true;for(const button of Object.values(categoryButtons))button.disabled=true;say('Loading monitor defaults and active tickers…');
  try{
   const [defaults,tickerConfig]=await Promise.all([ECGitHub.file('data/stock-monitor-display-defaults.json'),ECGitHub.file('data/stock-tickers.json')]);
   if(defaults.data.version!==1||!defaults.data.pages||typeof defaults.data.pages!=='object')throw Error('Invalid display defaults file.');
   pages=defaults.data.pages;original={};selected={};
   for(const [key,value] of Object.entries(pages)){if(!Array.isArray(value.visibleTickers))throw Error('Invalid ticker list for '+key+'.');original[key]=[...value.visibleTickers].sort();selected[key]=[...value.visibleTickers].sort();}
   instruments=(tickerConfig.data.instruments||[]).filter(x=>x.enabled&&typeof x.ticker==='string').map(x=>({ticker:x.ticker,name:x.name||x.ticker,region:x.region||'',type:x.type||''})).sort((a,b)=>a.ticker.localeCompare(b.ticker));
   const keep=page.value;page.replaceChildren();for(const key of Object.keys(pages).sort()){const option=document.createElement('option');option.value=key;option.textContent=key;page.append(option);}page.value=Object.hasOwn(pages,keep)?keep:(page.options[0]?.value||'');
   activePage=page.value;render();save.disabled=!page.options.length;
   say('Choose the tickers visitors should see on each monitor page. Connect the myai118/digital-tools token under Owner access before saving (Contents: Read and write).');
  }catch(error){pages={};page.replaceChildren();list.replaceChildren();count.textContent='';save.disabled=true;say('Could not load monitor defaults. '+error.message);}
  finally{busy=false;reload.disabled=false;page.disabled=!page.options.length;search.disabled=selectFiltered.disabled=clearFiltered.disabled=!page.options.length;render();}
 }
 page.onchange=()=>{capture();activePage=page.value;render();};
 search.oninput=()=>{capture();render();};
 list.onchange=()=>{capture();count.textContent=(selected[activePage]||[]).length+' selected · '+checkboxes.length+' active tickers shown';};
 selectFiltered.onclick=()=>{for(const x of checkboxes)x.input.checked=true;capture();render();};
 clearFiltered.onclick=()=>{for(const x of checkboxes)x.input.checked=false;capture();render();};
 for(const [type,button] of Object.entries(categoryButtons))button.onclick=()=>{capture();const tickers=instruments.filter(x=>x.type.toLowerCase()===type.toLowerCase()).map(x=>x.ticker),chosen=new Set(selected[activePage]||[]),hide=tickers.length>0&&tickers.every(t=>chosen.has(t));for(const ticker of tickers){if(hide)chosen.delete(ticker);else chosen.add(ticker);}selected[activePage]=[...chosen].sort();render();say((hide?'Hidden all ':'Selected all ')+(type==='ETF'?'ETFs':type==='Stock'?'stocks':'funds')+' for '+activePage+'. Save defaults to keep this list.');};
 reload.onclick=load;
 save.onclick=async()=>{
  if(busy||!activePage||!Object.hasOwn(pages,activePage))return;capture();busy=true;save.disabled=reload.disabled=page.disabled=search.disabled=selectFiltered.disabled=clearFiltered.disabled=true;say('Saving defaults for '+activePage+'…');
  try{const result=await ECGitHub.savePageDefaults(activePage,selected[activePage],original[activePage]);pages=result.data.pages;original[activePage]=[...pages[activePage].visibleTickers].sort();selected[activePage]=[...original[activePage]];render();say('Saved '+original[activePage].length+' default tickers for '+activePage+'. New page visits use this list after publication finishes.');}
  catch(error){say('Defaults were not saved. '+error.message);}
  finally{busy=false;save.disabled=!page.options.length;reload.disabled=false;page.disabled=!page.options.length;search.disabled=selectFiltered.disabled=clearFiltered.disabled=!page.options.length;render();}
 };
 load();
})();
