
'use strict';
const CATALOG={};
const KEY='market-watch-admin.local.v1';
const SHOW_TYPES=['Fund'];
const $=id=>document.getElementById(id);
let items=[],busy=false,editing=null,savedItems=[],revision=0,connected=false,marketRows=new Map();
let displaySortKey=null,displaySortDirection='asc';
function setDisplaySort(key){
 displaySortDirection=displaySortKey===key&&displaySortDirection==='asc'?'desc':'asc';
 displaySortKey=key;render();
}
function compareDisplay(a,b){
 if(!displaySortKey)return ({ETF:0,Stock:1}[a.type]??2)-({ETF:0,Stock:1}[b.type]??2)||a.ticker.localeCompare(b.ticker,'en');
 const first=displaySortKey==='ticker'?a.ticker:(a.market||'');
 const second=displaySortKey==='ticker'?b.ticker:(b.market||'');
 const primary=first.localeCompare(second,'en',{numeric:true,sensitivity:'base'});
 return (displaySortDirection==='asc'?primary:-primary)||a.ticker.localeCompare(b.ticker,'en');
}
function refreshSortHeaders(){
 $('listNote').textContent=displaySortKey?('Sorted by '+(displaySortKey==='ticker'?'Ticker':'Region / Market')+' '+(displaySortDirection==='asc'?'A–Z':'Z–A')+' · display only'):'ETF first, then Stock · Ticker A–Z';
 for(const th of document.querySelectorAll('th[data-sort-key]')){
  const selected=th.dataset.sortKey===displaySortKey;
  th.setAttribute('aria-sort',selected?(displaySortDirection==='asc'?'ascending':'descending'):'none');
  const button=th.querySelector('button');
  button.querySelector('.sort-arrow').textContent=selected?(displaySortDirection==='asc'?'▲':'▼'):'↕';
  button.setAttribute('aria-label','Sort '+(th.dataset.sortKey==='ticker'?'ticker':'region or market')+(selected?' '+displaySortDirection:''));
 }
}
const normalize=s=>{if(typeof s!=='string')throw Error('Ticker must be text.');const t=s.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(t)||t.endsWith('.')||t.endsWith('-')||/[.\-]{2}/.test(t))throw Error('Invalid ticker format. Use a symbol such as SPY, AAPL or D05.SI.');return t;};
const sort=list=>list.sort((a,b)=>({ETF:0,Stock:1}[a.type]??2)-({ETF:0,Stock:1}[b.type]??2)||a.ticker.localeCompare(b.ticker,'en'));
const showValue=r=>r.type==='Fund'?r.show!==false:true;
function tell(text,kind=''){ $('message').textContent=text;$('message').className=kind; }
function tellNode(node,kind=''){ $('message').replaceChildren(node);$('message').className=kind; }
function lock(value){busy=value;for(const id of ['addButton','ticker','addEnabled','importButton','exportButton','viewExcelButton','exportExcelButton','importFile','saveEdit','editTicker','editEnabled','editShow','cancelEdit','saveMain','cancelMain'])if($(id))$(id).disabled=value;render();}
async function api(path){if(path==='/api/config')return (await ECGitHub.file('data/stock-tickers.json')).data;if(path.startsWith('/api/lookup'))return ECGitHub.lookup(new URLSearchParams(path.split('?')[1]).get('ticker'));throw Error('Unknown operation.');}
async function persist(){return ECGitHub.save({...backup(),revision},items);}
function commit(next){items=sort(next);render();}
function updateDirty(){const dirty=JSON.stringify(items)!==JSON.stringify(savedItems);$('dirtyNote').textContent=dirty?'Unsaved changes':'All changes saved';return dirty;}
$('saveMain').onclick=async()=>{if(busy)return;lock(true);try{const cfg=await persist();revision=cfg.revision;savedItems=structuredClone(items);updateDirty();tell('Saved to shared GitHub configuration. The Monitor reads the latest shared data files when it reloads.');}catch(e){tell(e.message,'error');}finally{lock(false);}};
$('cancelMain').onclick=async()=>{if(!updateDirty())return;if(await confirmAction('Discard unsaved changes?','Restore the ticker list from your last saved configuration?','Discard Changes')){items=structuredClone(savedItems);render();tell('Unsaved changes discarded.');}};
window.addEventListener('beforeunload',e=>{if(updateDirty()){e.preventDefault();e.returnValue='';}});
function validateConfig(data){if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.tickers))throw Error('Configuration must contain a tickers array.');if(data.version!==undefined&&data.version!==1)throw Error('Unsupported configuration version.');const seen=new Set();return {tickers:data.tickers.map((r,i)=>{if(!r||typeof r!=='object'||typeof r.enabled!=='boolean')throw Error('Entry '+(i+1)+' must contain ticker and a true/false enabled status.');const ticker=normalize(r.ticker);if(seen.has(ticker))throw Error('Duplicate ticker in file: '+ticker);seen.add(ticker);return {ticker,enabled:r.enabled,show:r.type==='Fund'?r.show!==false:true};})};}
function backup(){return {version:1,exportedAt:new Date().toISOString(),tickers:sort([...items]).map(r=>({ticker:r.ticker,enabled:r.enabled,show:r.type==='Fund'?r.show!==false:true}))};}
function download(name,content,type){
 const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.rel='noopener';a.target='_blank';document.body.append(a);a.click();a.remove();
 return {url,name,revoke:()=>URL.revokeObjectURL(url)};
}
function showDownloadFallback(file,text){
 const box=document.createElement('span');
 const label=document.createElement('span');
 label.textContent=text+' ';
 const link=document.createElement('a');
 link.href=file.url;link.download=file.name;link.target='_blank';link.rel='noopener';link.textContent='Tap here to open/save '+file.name;
 box.append(label,link);
 tellNode(box);
 setTimeout(file.revoke,120000);
}
function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function excelDate(){return new Date().toISOString().slice(0,10).replaceAll('-','');}
async function loadMarketRows(){
 try{const result=await ECGitHub.file('market-data.json');const data=result.data;marketRows=new Map((data.instruments||[]).map(x=>[x.ticker,x]));}
 catch(e){marketRows=new Map();}
}
function dividendValue(row,key,decimals){return row&&Number.isFinite(Number(row[key]))?Number(row[key]).toFixed(decimals):'—';}
function excelRows(){
 return sort([...items]).map((r,i)=>{const q=marketRows.get(r.ticker)||{};return '<tr><td>'+(i+1)+'</td><td>'+htmlEscape(r.type||'')+'</td><td>'+htmlEscape(r.ticker)+'</td><td>'+htmlEscape(r.name||'')+'</td><td>'+htmlEscape(r.market||'')+'</td><td>'+(r.enabled?'Yes':'No')+'</td><td>'+htmlEscape(r.source||'')+'</td><td>'+dividendValue(q,'dividend_per_share',4)+'</td><td>'+(Number.isFinite(Number(q.dividend_yield_pct))?Number(q.dividend_yield_pct).toFixed(2)+'%':'—')+'</td></tr>';}).join('');
}
function excelHtml(){
 return '<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:6px;text-align:left;white-space:nowrap}th{background:#dceef8;font-weight:bold}</style></head><body><h2>Market Watch Ticker List</h2><p>Sorted by Category, then Ticker. Exported: '+htmlEscape(new Date().toLocaleString())+'</p><table><thead><tr><th>#</th><th>Category</th><th>Ticker</th><th>Name</th><th>Region / Market</th><th>Enabled</th><th>Metadata Source</th><th>Dividend / Share</th><th>Dividend Yield %</th></tr></thead><tbody>'+excelRows()+'</tbody></table></body></html>';
}
async function excelExport(){
 await loadMarketRows();
 const file=download('market-watch-tickers-'+excelDate()+'.xls',excelHtml(),'application/vnd.ms-excel;charset=utf-8');
 showDownloadFallback(file,'Excel export requested. If your phone did not download automatically,');
}
async function viewExcel(){
 await loadMarketRows();
 const preview=$('excelPreviewRows');
 preview.innerHTML=excelRows();
 $('excelDialog').showModal();
}
async function lookup(ticker){const x=await api('/api/lookup?ticker='+encodeURIComponent(ticker));return {name:x.name,market:x.region,type:x.type,source:x.metadata_source};}
function cell(text){const td=document.createElement('td');td.textContent=text;return td;}
function action(text,fn,cls=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.disabled=busy;b.addEventListener('click',fn);return b;}
function render(){
 $('total').textContent=items.length;$('enabled').textContent=items.filter(x=>x.enabled).length;$('etfs').textContent=items.filter(x=>x.type==='ETF').length;$('stocks').textContent=items.filter(x=>x.type==='Stock').length;
 const query=$('search').value.trim().toUpperCase(),filtered=items.filter(x=>(x.ticker+' '+x.name).toUpperCase().includes(query)).sort(compareDisplay);$('rows').replaceChildren();refreshSortHeaders();
 updateDirty();for(const r of filtered){const tr=document.createElement('tr');tr.dataset.ticker=r.ticker;tr.append(cell(String(filtered.indexOf(r)+1)),cell(r.ticker));const name=cell(r.name||'Metadata pending');const small=document.createElement('small');small.textContent=r.source||'Awaiting verification';name.append(small);tr.append(name,cell(r.market||'Unverified'));const type=cell('');const badge=document.createElement('span');badge.className='badge '+(r.type==='Stock'||r.type==='Fund'?'stock':r.type==='ETF'?'':'pending');badge.textContent=r.type||'Pending';type.append(badge);tr.append(type);const status=cell('');const toggle=document.createElement('input');toggle.type='checkbox';toggle.className='enabled-check';toggle.checked=r.enabled;toggle.disabled=busy;toggle.setAttribute('aria-label','Enabled '+r.ticker);toggle.onchange=()=>{commit(items.map(x=>x.ticker===r.ticker?{...x,enabled:toggle.checked}:x));tell(r.ticker+' '+(toggle.checked?'enabled.':'disabled.'));};status.append(toggle);tr.append(status);const showCell=cell('');if(r.type==='Fund'){const show=document.createElement('input');show.type='checkbox';show.className='show-check';show.checked=showValue(r);show.disabled=busy;show.setAttribute('aria-label','Show '+r.ticker);show.onchange=()=>{commit(items.map(x=>x.ticker===r.ticker?{...x,show:show.checked}:x));tell(r.ticker+' '+(show.checked?'will be shown on the Monitor.':'hidden from the Monitor.'));};showCell.append(show);}else showCell.textContent='—';tr.append(showCell);const actions=cell('');actions.className='actions';actions.append(action('Edit',()=>openEdit(r)),action('Delete',()=>remove(r),'danger'));tr.append(actions);$('rows').append(tr);}
 if(!filtered.length){const tr=document.createElement('tr'),td=cell(items.length?'No matching tickers.':'Your watchlist is empty. Enter a ticker above to start.');td.colSpan=8;td.className='empty';tr.append(td);$('rows').append(tr);}
}
for(const th of document.querySelectorAll('th[data-sort-key]')){
 const button=th.querySelector('button');if(button)button.addEventListener('click',()=>setDisplaySort(th.dataset.sortKey));
}
function confirmAction(title,text,label){return new Promise(resolve=>{const d=$('confirmDialog');$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmYes').textContent=label;let completed=false;function finish(answer){if(completed)return;completed=true;d.close();d.oncancel=null;$('confirmYes').onclick=null;$('confirmCancel').onclick=null;resolve(answer);}$('confirmYes').onclick=()=>finish(true);$('confirmCancel').onclick=()=>finish(false);d.oncancel=e=>{e.preventDefault();finish(false);};d.showModal();$('confirmCancel').focus();});}
async function remove(r){if(busy)return;if(await confirmAction('Delete '+r.ticker+'?','This removes '+r.ticker+' after Save Changes. Optional Export keeps a backup.','Delete Ticker')){commit(items.filter(x=>x.ticker!==r.ticker));tell(r.ticker+' deleted.');}}
$('addForm').onsubmit=async e=>{e.preventDefault();if(busy)return;try{const ticker=normalize($('ticker').value);if(items.some(x=>x.ticker===ticker))throw Error(ticker+' is already in the list.');lock(true);tell('Looking up '+ticker+'…');const meta=await lookup(ticker);commit([...items,{ticker,enabled:$('addEnabled').checked,...meta}]);$('ticker').value='';tell(ticker+' added to your draft. Click Save Changes to save it to the shared Monitor list.');}catch(e){tell(e.message,'error');}finally{lock(false);$('ticker').focus();}};
function openEdit(r){editing=r.ticker;$('editTicker').value=r.ticker;$('editEnabled').checked=r.enabled;$('editShow').checked=showValue(r);$('editShow').disabled=r.type!=='Fund';$('editError').textContent='';$('editDialog').showModal();$('editTicker').focus();}
$('cancelEdit').onclick=()=>$('editDialog').close();$('editDialog').oncancel=e=>{if(busy)e.preventDefault();};
$('editForm').onsubmit=async e=>{e.preventDefault();if(busy)return;try{const ticker=normalize($('editTicker').value);if(items.some(x=>x.ticker===ticker&&x.ticker!==editing))throw Error(ticker+' is already in the list.');const current=items.find(x=>x.ticker===editing);lock(true);$('editError').textContent='Checking ticker…';const meta=ticker===editing&&current.type?current:await lookup(ticker);commit(items.map(x=>x.ticker===editing?{...meta,ticker,enabled:$('editEnabled').checked,show:meta.type==='Fund'?$('editShow').checked:true}:x));$('editDialog').close();tell(ticker+' updated in your draft. Click Save Changes to save it to the shared Monitor list.');}catch(e){$('editError').textContent=e.message;}finally{lock(false);}};
$('search').oninput=render;
$('exportButton').onclick=()=>{const file=download('market-watch-config.json',JSON.stringify(backup(),null,2)+'\n','application/json');showDownloadFallback(file,'Backup export requested. If your phone did not download automatically,');};
$('viewExcelButton').onclick=viewExcel;
$('exportExcelButton').onclick=excelExport;
$('closeExcelPreview').onclick=()=>$('excelDialog').close();
$('exportExcelFromPreview').onclick=excelExport;
$('importButton').onclick=()=>{if(!busy)$('importFile').click();};
$('importFile').onchange=async()=>{const file=$('importFile').files[0];$('importFile').value='';if(!file||busy)return;try{const config=JSON.parse(await file.text());const imported=validateConfig(config),entries=imported.tickers;if(!await confirmAction('Import Configuration?','Replace the current '+items.length+' tickers with '+entries.length+' tickers from '+file.name+'? Export first if you need a backup.','Replace Draft List'))return;lock(true);tell('Restoring ticker list…');const result=new Array(entries.length);let cursor=0,pending=0;await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(cursor<entries.length){const i=cursor++,entry=entries[i];try{result[i]={...entry,...await lookup(entry.ticker),show:entry.show!==false};}catch(e){pending++;result[i]={...entry,name:'Metadata pending',market:'Unverified',type:null,source:'Lookup unavailable; ticker and status preserved'};}}}));commit(result);tell('Imported '+result.length+' tickers.'+(pending?' '+pending+' could not be verified; their ticker and status are preserved. Edit and Save to retry lookup.':''),pending?'warn':'');}catch(e){tell('Import stopped. Your list is unchanged. '+(e instanceof SyntaxError?'The file is not valid JSON.':e.message),'error');}finally{lock(false);}};
async function initialise(){lock(true);try{const cfg=await api('/api/config');revision=cfg.revision||0;items=sort(cfg.instruments.map(x=>({...x,market:x.region,source:x.metadata_source,show:x.type==='Fund'?x.show!==false:true})));savedItems=structuredClone(items);connected=true;tell('Shared GitHub configuration loaded. Connect GitHub below before saving.');}catch(e){tell('Shared GitHub configuration could not be loaded. Check your connection or GitHub API limit, then reload.','error');}finally{lock(false);if(!connected){for(const id of ['addButton','saveMain','importButton'])$(id).disabled=true;}render();}}
ECGitHub.mount($('githubConnection'));initialise();
