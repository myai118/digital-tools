'use strict';
const $=id=>document.getElementById(id), valid=n=>typeof n==='number'&&Number.isFinite(n), fmt=n=>valid(n)?n.toFixed(2):'—', pct=n=>valid(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'—', cls=n=>valid(n)&&n>0?'pos':valid(n)&&n<0?'neg':'';
const sg=t=>t&&!Number.isNaN(Date.parse(t))?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(t))+' SGT':'Not yet retrieved';
let interval, running=false, exportRows=[], latestCfg=null, latestData=null, hiddenTickers=loadHiddenTickers();
const IDS={ETF:['etfRows','etfSection'],Stock:['stockRows','stockSection'],Fund:['fundRows','fundSection']};
const tableSort={ETF:{key:null,dir:'asc'},Stock:{key:null,dir:'asc'},Fund:{key:null,dir:'asc'}};
function loadHiddenTickers(){return new Set();}
function saveHiddenTickers(){/* Visitor choices last only until the next page load. */}
function rerender(){if(latestCfg&&latestData)render(latestCfg,latestData);}
function setTickerVisible(ticker,visible){if(visible)hiddenTickers.delete(ticker);else hiddenTickers.add(ticker);saveHiddenTickers();rerender();}
function setTypeVisible(type,visible){
 if(!latestCfg)return;
 for(const x of latestCfg.instruments.filter(x=>x.enabled&&x.type===type)){if(visible)hiddenTickers.delete(x.ticker);else hiddenTickers.add(x.ticker);}
 saveHiddenTickers();rerender();
}
let settingsPasswordPending=false;
const settingsFailures=new Map();
function settingsAttemptKey(){return 'stock-monitor:settings-failures:'+location.pathname.replace(/\/$/,'/index.html');}
function settingsFailureCount(){
 const key=settingsAttemptKey();let count=settingsFailures.get(key)||0;
 try{const stored=Number(localStorage.getItem(key));if(Number.isInteger(stored)&&stored>count)count=stored;}catch{}
 return count;
}
function setSettingsFailures(count){const key=settingsAttemptKey();settingsFailures.set(key,count);try{localStorage.setItem(key,String(count));}catch{}}
function settingsLocked(){const locked=settingsFailureCount()>=2;if(locked)$('status').textContent='Settings locked after two incorrect password attempts.';return locked;}
function requestSettingsPassword(expected){
 return new Promise(resolve=>{
  const box=document.createElement('dialog');box.id='settingsPasswordDialog';box.setAttribute('aria-label','Settings password');
  box.style.cssText='border:1px solid #bbd7ff;border-radius:10px;padding:24px;max-width:90vw;color:#080873';
  const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),message=document.createElement('p'),actions=document.createElement('div'),ok=document.createElement('button'),cancel=document.createElement('button');
  label.textContent='Enter the settings password';input.id='settingsPasswordInput';input.type='password';input.autocomplete='off';input.setAttribute('aria-label','Settings password');input.style.cssText='display:block;width:100%;margin:14px 0;padding:10px;font:inherit';
  message.id='settingsPasswordError';message.setAttribute('role','alert');actions.style.cssText='display:flex;gap:10px';ok.type='submit';ok.textContent='Open Settings';cancel.type='button';cancel.textContent='Cancel';
  const finish=accepted=>{input.value='';box.close();box.remove();resolve(accepted);};
  form.onsubmit=e=>{e.preventDefault();if(settingsLocked()){finish(false);return;}if(input.value===expected){setSettingsFailures(0);finish(true);}else{setSettingsFailures(settingsFailureCount()+1);if(settingsLocked()){finish(false);return;}message.textContent='Incorrect password. One retry remaining.';input.value='';input.focus();}};
  cancel.onclick=()=>finish(false);box.oncancel=e=>{e.preventDefault();finish(false);};
  label.append(input);actions.append(ok,cancel);form.append(label,message,actions);box.append(form);document.body.append(box);box.showModal();input.focus();
 });
}
async function toggleSettings(open){
 const panel=$('settingsPanel'),button=$('settingsButton'),next=open??!panel.classList.contains('open');
 if(next){
  if(settingsLocked())return;
  if(settingsPasswordPending)return;
  settingsPasswordPending=true;
  try{const expected=await StockMonitorDisplay.settingsPassword();if(!await requestSettingsPassword(expected))return;}catch(error){$('status').textContent=error.message;return;}finally{settingsPasswordPending=false;}
 }
 panel.classList.toggle('open',next);button.setAttribute('aria-expanded',String(next));
 if(next)panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderSettings(allActive){
 const list=$('settingsList');
 if(!list)return;
 list.replaceChildren();
 for(const x of allActive){
  const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('span');
  label.className='settings-option';input.type='checkbox';input.checked=!hiddenTickers.has(x.ticker);input.onchange=()=>setTickerVisible(x.ticker,input.checked);
  title.textContent=x.ticker+' · '+x.type;meta.textContent=[x.name,x.region].filter(Boolean).join(' · ');text.append(title,meta);label.append(input,text);list.append(label);
 }
 if(!allActive.length){const empty=document.createElement('p');empty.textContent='No enabled tickers found.';list.append(empty);}
}
function sortTable(type){
 if(type==='Fund'&&!$('fundSection'))return;
 const tbody=tableBody(...(IDS[type]||IDS.Stock)),state=tableSort[type];
 if(state.key){
  const rows=[...tbody.querySelectorAll('tr[data-ticker]')];
  rows.sort((a,b)=>{
   const numeric=state.key!=='ticker'&&state.key!=='region';
   const aValue=state.key==='ticker'?a.dataset.ticker:state.key==='region'?a.dataset.region||'':Number(a.dataset[state.key]);
   const bValue=state.key==='ticker'?b.dataset.ticker:state.key==='region'?b.dataset.region||'':Number(b.dataset[state.key]);
   const aMissing=numeric&&!Number.isFinite(aValue),bMissing=numeric&&!Number.isFinite(bValue);
   if(aMissing||bMissing)return aMissing===bMissing?0:(aMissing?1:-1);
   const primary=numeric?aValue-bValue:aValue.localeCompare(bValue,'en',{numeric:true,sensitivity:'base'});
   return (state.dir==='asc'?primary:-primary)||a.dataset.ticker.localeCompare(b.dataset.ticker,'en');
  });
  tbody.append(...rows);
 }
 const section=$((IDS[type]||IDS.Stock)[1]);
 for(const th of section.querySelectorAll('th[data-sort-key]')){
  const selected=th.dataset.sortKey===state.key;
  th.setAttribute('aria-sort',selected?(state.dir==='asc'?'ascending':'descending'):'none');
  const button=th.querySelector('button');
  button.querySelector('.sort-arrow').textContent=selected?(state.dir==='asc'?'▲':'▼'):'↕';
  button.setAttribute('aria-label','Sort '+({ticker:'ticker',region:'region or market',currentPct:'current percent change',drawdown:'drawdown percent',dividendYield:'dividend yield percent'}[th.dataset.sortKey]||th.dataset.sortKey)+(selected?' '+(state.dir==='asc'?'ascending':'descending'):''));
 }
}
function chooseSort(type,key){
 const state=tableSort[type];state.dir=state.key===key&&state.dir==='asc'?'desc':'asc';state.key=key;sortTable(type);
}
async function get(path){const response=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('Saved data unavailable: '+response.status);return response.json();}
function cell(tr,text,className=''){const td=document.createElement('td');td.textContent=text;td.className=className;tr.append(td);return td;}
function tableBody(id,sectionId){let body=$(id);if(body)return body;body=document.createElement('tbody');body.id=id;$(sectionId).querySelector('table').append(body);return body;}
function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function excelNum(value){return valid(value)?String(value):'';}
function formulaCell(value){return '<td style="mso-number-format:\'0.00%\'">'+htmlEscape(value)+'</td>';}
function excelDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function mobileBrowser(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Macintosh/i.test(navigator.userAgent);}
function showExportPanel(name,html,tableHtml){
 const link=$('exportDownloadLink'),panel=$('exportPanel');
 $('exportPreview').innerHTML=tableHtml;
 link.href='data:application/vnd.ms-excel;charset=utf-8,'+encodeURIComponent(html);
 link.download=name;
 panel.classList.add('open');
 panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function exportExcel(){
 if(!exportRows.length){$('status').textContent=latestCfg?'No tickers are configured for display. Set the default list in Market Watch Admin before exporting.':'No monitor data loaded yet. Please wait for the page to finish loading.';return;}
 if(!window.XlsxWriter){$('status').textContent='Excel export is unavailable because xlsx-writer.js did not load. Reload the page and try again.';return;}
 const columns=[['#',6],['Category',10],['Ticker',15],['Name',44],['Region / Market',16],['Currency',10],['Previous Close',14],['Previous Day % Change',15],['Current Price',13],['Current % Change',13],['All-Time High',14],['Drawdown %',12],['Market Time',26],['Retrieved Time',26],['Refresh Status',16],['Dividend / Share',16],['Dividend Yield %',16],['Ex-Dividend Date',20]];
 const text=v=>({value:String(v??''),style:'text'}),num=v=>valid(v)?{value:v,style:'num'}:{style:'num'};
 const rows=exportRows.map((r,i)=>{
  const n=i+2,prevDayBase=valid(r.prev_close)&&valid(r.prev_day_pct_change)?r.prev_close/(1+r.prev_day_pct_change/100):null;
  const prevDay=valid(prevDayBase)&&prevDayBase!==0?{style:'pct',formula:'IFERROR(G'+n+'/'+prevDayBase+'-1,"")',value:r.prev_close/prevDayBase-1}:{style:'pct'};
  const current=valid(r.current_price)&&valid(r.prev_close)&&r.prev_close!==0?{style:'pct',formula:'IFERROR(I'+n+'/G'+n+'-1,"")',value:r.current_price/r.prev_close-1}:{style:'pct'};
  const drawdown=valid(r.current_price)&&valid(r.ath)&&r.ath!==0?{style:'pct',formula:'IFERROR(I'+n+'/K'+n+'-1,"")',value:r.current_price/r.ath-1}:{style:'pct'};
  return [{value:i+1,style:'int'},text(r.type),text(r.ticker),text(r.name),text(r.region),text(r.currency),num(r.prev_close),prevDay,num(r.current_price),current,num(r.ath),drawdown,text(sg(r.price_as_of)),text(sg(r.price_retrieved_at)),text(r.refresh_error?'Refresh failed':'OK'),num(r.dividend_per_share),valid(r.dividend_yield_pct)?{value:r.dividend_yield_pct/100,style:'pct'}:{style:'pct'},text(r.ex_dividend_date||'')];
 });
 const blob=XlsxWriter.build({sheetName:'Stock Monitor',columns:columns.map(([header,width])=>({header,width})),rows}),name='stock-monitor-'+excelDate()+'.xlsx';
 download(name,blob,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 $('status').textContent='Excel (.xlsx) export requested: '+exportRows.length+' instruments sorted by category and ticker. Check your browser downloads for the .xlsx file.';
}
function render(cfg,data){
 latestCfg=cfg;latestData=data;
 const prices=new Map((data.instruments||[]).map(x=>[x.ticker,x]));
 const allActive=cfg.instruments.filter(x=>x.enabled).sort((a,b)=>({ETF:0,Stock:1,Fund:2}[a.type]??3)-({ETF:0,Stock:1,Fund:2}[b.type]??3)||a.ticker.localeCompare(b.ticker));
 renderSettings(allActive);
 const active=allActive.filter(x=>!hiddenTickers.has(x.ticker));
 StockMonitorDisplay.updateVisibility(active.length);
 exportRows=active.map(x=>({...x,...(prices.get(x.ticker)||{})}));
 const etfBody=tableBody('etfRows','etfSection'),stockBody=tableBody('stockRows','stockSection');
 etfBody.replaceChildren();stockBody.replaceChildren();const fundBody=$('fundSection')?tableBody('fundRows','fundSection'):null;if(fundBody)fundBody.replaceChildren();let successful=[];
 for(const x of active){const q=prices.get(x.ticker)||{},tr=document.createElement('tr');tr.dataset.ticker=x.ticker;tr.dataset.region=x.region||'';tr.dataset.currentPct=valid(q.current_pct_change)?q.current_pct_change:'';tr.dataset.drawdown=valid(q.drawdown_pct)?q.drawdown_pct:'';tr.dataset.dividendYield=valid(q.dividend_yield_pct)?q.dividend_yield_pct:'';const tickerCell=cell(tr,'');const tickerLink=document.createElement('a');tickerLink.textContent=x.ticker;tickerLink.href='https://finance.yahoo.com/quote/'+encodeURIComponent(x.ticker)+'/';tickerLink.target='_blank';tickerLink.rel='noopener noreferrer';tickerLink.setAttribute('aria-label',x.ticker+' on Yahoo Finance (opens in a new tab)');tickerCell.append(tickerLink);cell(tr,x.region);const name=cell(tr,x.name+(q.currency?' ('+q.currency+')':''));const note=document.createElement('small');note.className='row-note';note.textContent=q.refresh_error?'Refresh failed · '+sg(q.price_as_of):q.price_as_of?'Market time: '+sg(q.price_as_of):'Price pending';if(q.ath_error)note.textContent+=valid(q.ath)?' · Using saved ATH — latest update failed.':' · ATH unavailable — historical coverage could not be verified.';if(q.prev_day_change_error)note.textContent+=valid(q.prev_day_pct_change)?' · Saved previous-day change (as of '+(q.prev_day_change_as_of||'unknown date')+').':' · Previous-day change unavailable.';name.append(note);if(q.price_retrieved_at&&!q.refresh_error)successful.push(q.price_retrieved_at);cell(tr,fmt(q.prev_close));cell(tr,pct(q.prev_day_pct_change),cls(q.prev_day_pct_change));cell(tr,fmt(q.current_price));cell(tr,pct(q.current_pct_change),cls(q.current_pct_change));const ath=cell(tr,fmt(q.ath));if(q.ath_error){ath.title=q.ath_error;ath.className='warning';}cell(tr,pct(q.drawdown_pct),cls(q.drawdown_pct));cell(tr,valid(q.dividend_per_share)?Number(q.dividend_per_share).toFixed(4):'—');cell(tr,valid(q.dividend_yield_pct)?Number(q.dividend_yield_pct).toFixed(2)+'%':'—');(x.type==='ETF'?etfBody:x.type==='Fund'&&fundBody?fundBody:stockBody).append(tr);}
 for(const [type,id] of [['ETF','etf'],['Stock','stock'],['Fund','fund']]){const allCount=allActive.filter(x=>x.type===type).length,count=active.filter(x=>x.type===type).length,hidden=allCount-count,section=$(id+'Section');if(!section)continue;section.style.display=count?'':'none';$(id+'Count').textContent='Total '+(type==='ETF'?'ETFs':type==='Fund'?'Funds':'Stocks')+': '+count;}
 sortTable('ETF');sortTable('Stock');sortTable('Fund');
 const latestPriceTime=successful.sort().at(-1)||allActive.map(x=>prices.get(x.ticker)?.price_retrieved_at).filter(Boolean).sort().at(-1),hiddenCount=allActive.length-active.length;
 $('reference-time').textContent=sg(data.last_check_completed_at||data.generated_at||latestPriceTime);$('tracked').textContent=active.length+' shown'+($('tracked').dataset.hideTotal==='true'?'':' · '+allActive.length+' total instruments');
 clearInterval(interval);interval=setInterval(()=>refresh(false),Math.max(5,Math.min(10,cfg.refreshIntervalMinutes||10))*60000);
 return active.map(x=>prices.get(x.ticker)||{});
}
async function load(){const [cfg,data,dividendData]=await Promise.all([get('../data/stock-tickers.json'),get('https://raw.githubusercontent.com/myai118/EverydayCompass/main/market-data.json'),get('https://raw.githubusercontent.com/myai118/EverydayCompass/main/dividend-data.json').catch(()=>null)]);if(dividendData&&Array.isArray(dividendData.instruments)){const byTicker=new Map(dividendData.instruments.map(x=>[x.ticker,x]));for(const row of (data.instruments||[])){const dividend=byTicker.get(row.ticker);if(dividend)Object.assign(row,dividend);}}await StockMonitorDisplay.initialise(cfg,hiddenTickers,rerender);return render(cfg,data);}
async function refresh(){if(running)return;running=true;try{const rows=await load();const failed=rows.filter(x=>x.refresh_error).length;$('status').textContent=failed?failed+' ticker(s) could not be updated; their saved prices and timestamps are retained.':'Latest saved data loaded. Last refresh & check completed: '+$('reference-time').textContent+'.';}catch(e){$('status').textContent=e.message;}finally{running=false;}}
for(const head of document.querySelectorAll('thead')){
 const type=head.closest('#etfSection')?'ETF':head.closest('#fundSection')?'Fund':'Stock',tr=document.createElement('tr');
 const headerLines={'Prev Day Close':'Prev Day<br>Close','Prev Day % Chg':'Prev Day %<br>Chg','Current Price':'Current<br>Price','Current % Chg':'Current %<br>Chg','All-Time High':'All-Time<br>High','Drawdown %':'Drawdown<br>%','Dividend / Share':'Dividend /<br>Share','Dividend Yield %':'Dividend<br>Yield %'};
 const sortKeys={'Ticker':'ticker','Region / Market':'region','Current % Chg':'currentPct','Drawdown %':'drawdown','Dividend Yield %':'dividendYield'};
for(const text of ['Ticker','Region / Market','ETF / Stock / Trust Name','Prev Day Close','Prev Day % Chg','Current Price','Current % Chg','All-Time High','Drawdown %','Dividend / Share','Dividend Yield %']){
  const th=document.createElement('th');
  if(sortKeys[text]){
   const key=sortKeys[text],button=document.createElement('button'),arrow=document.createElement('span');
   th.dataset.sortKey=key;th.setAttribute('aria-sort','none');button.type='button';button.className='sort-heading';
   button.innerHTML=(headerLines[text]||text)+' ';arrow.className='sort-arrow';arrow.textContent='↕';button.append(arrow);
   button.setAttribute('aria-label','Sort '+({ticker:'ticker',region:'region or market',currentPct:'current percent change',drawdown:'drawdown percent',dividendYield:'dividend yield percent'}[key]||key));button.onclick=()=>chooseSort(type,key);th.append(button);
  }else if(headerLines[text]) th.innerHTML=headerLines[text];
  else th.textContent=text;
  tr.append(th);
 }
 head.append(tr);
}
$('jumpETF').onclick=()=>($('etfSection').style.display==='none'?$('stockSection'):$('etfSection')).scrollIntoView({behavior:'smooth'});$('jumpStock').onclick=()=>$('stockSection').scrollIntoView({behavior:'smooth'});
const TAB_SECTIONS={jumpFund:'fundSection',jumpETF:'etfSection',jumpStock:'stockSection'};
function setActiveTab(id){for(const t of Object.keys(TAB_SECTIONS)){const b=$(t);if(b)b.classList.toggle('secondary',t!==id);}}
for(const t of Object.keys(TAB_SECTIONS)){const b=$(t);if(b)b.addEventListener('click',()=>{const s=$(TAB_SECTIONS[t]);if(t==='jumpFund'&&(!s||s.style.display==='none'))return;setActiveTab(t);});}
if($('jumpFund'))$('jumpFund').onclick=()=>{const section=$('fundSection');if(!section||section.style.display==='none'){$('status').textContent='No funds are included in this page’s saved defaults. Change the list in Market Watch Admin.';return;}section.scrollIntoView({behavior:'smooth'});};window.addEventListener('focus',()=>refresh(false));refresh(false);
$('exportExcelButton').onclick=exportExcel;
if($('settingsButton'))$('settingsButton').onclick=()=>toggleSettings();if($('settingsLink'))$('settingsLink').onclick=e=>{e.preventDefault();toggleSettings();};if($('settingsPanel')&&location.hash==='#settingsPanel')toggleSettings(true);
if($('settingsCloseButton'))$('settingsCloseButton').onclick=()=>toggleSettings(false);
if($('showAllTickersButton'))$('showAllTickersButton').onclick=()=>{hiddenTickers.clear();saveHiddenTickers();rerender();};
if($('hideAllEtfButton'))$('hideAllEtfButton').onclick=()=>setTypeVisible('ETF',false);
if($('hideAllStockButton'))$('hideAllStockButton').onclick=()=>setTypeVisible('Stock',false);
if($('hideAllFundButton'))$('hideAllFundButton').onclick=()=>setTypeVisible('Fund',false);



