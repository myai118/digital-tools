import {readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
const repo = path.resolve(process.env.KLZ_SOURCE_ROOT || 'source');
const out = path.resolve('public');
await mkdir(path.join(out,'scripts'),{recursive:true});
const read = p => readFile(path.join(repo,p),'utf8');
const save = (p,s) => writeFile(path.join(out,p),s);
let landing = await read('myweb/klz.html');
landing=landing.replaceAll('../assets/','/assets/').replaceAll('https://myai118.github.io/digital-tools/stock-monitor/tools/klz.html','/tools-klz.html');
await save('myweb-klz.html',landing);
let monitor=await read('stock-monitor/tools/kwc.html');
monitor=monitor.replaceAll('../../assets/','/assets/').replaceAll('../../','/').replaceAll('../display-defaults.css','/scripts/display-defaults.css').replaceAll('../display-defaults.js','/scripts/display-defaults.js').replaceAll('../previous-page-button.js','/scripts/previous-page-button.js');
for(const file of ['xlsx-writer.js','monitor-page-defaults.js','desktop-excel-save.js']) monitor=monitor.replaceAll(`src="${file}`,`src="/scripts/${file}`);
monitor=monitor.replace('data-fallback-url="/"','data-fallback-url="/myweb-klz.html"').replace('<script src="/scripts/display-defaults.js','<script src="/scripts/snapshot-client.js"></script><script src="/scripts/display-defaults.js');
monitor=monitor.replaceAll('The price checker runs every 5 minutes on weekdays; quote updates depend on market hours and data availability.','Prices are checked every 6 minutes on weekdays. This page checks for published data every 15 minutes; quote updates depend on market hours and data availability.');
await save('tools-klz.html',monitor);
let defaults=await read('stock-monitor/display-defaults.js');
const start=defaults.indexOf(' const scriptURL');const end=defaults.indexOf(' let loading');
defaults=defaults.slice(0,start)+" const configURL = new URL('/api/defaults', location.origin);\n const key = 'tools/klz.html';\n"+defaults.slice(end);
defaults=defaults.replaceAll("const response = await fetch(url, {cache:'no-store'});","const response = await window.KLZSnapshot.defaults();");
await save('scripts/display-defaults.js',defaults);
let renderer=await read('stock-monitor/tools/monitor-page-defaults.js');
const a=renderer.indexOf('async function load(){');const b=renderer.indexOf('await StockMonitorDisplay.initialise',a);
renderer=renderer.slice(0,a)+"async function load(){const snapshot=await window.KLZSnapshot.load();const {cfg,data,dividends:dividendData}=snapshot;if(dividendData&&Array.isArray(dividendData.instruments)){const byTicker=new Map(dividendData.instruments.map(x=>[x.ticker,x]));for(const row of (data.instruments||[])){const dividend=byTicker.get(row.ticker);if(dividend)Object.assign(row,dividend);}}"+renderer.slice(b);
renderer=renderer.replace('60*1000','15*60*1000').replace("window.addEventListener('focus',()=>refresh(false));","window.addEventListener('focus',()=>{if(window.KLZSnapshot.due())refresh(false);});");
await save('scripts/monitor-page-defaults.js',renderer);
await save('scripts/previous-page-button.js',"'use strict';document.getElementById('previousPageButton')?.addEventListener('click',()=>{location.href='/myweb-klz.html';});\n");
for(const p of ['stock-monitor/display-defaults.css','stock-monitor/tools/xlsx-writer.js','stock-monitor/tools/desktop-excel-save.js'])await save('scripts/'+path.basename(p),await read(p));
// Only these two images belong in the deployment, not the rest of the repository.
for(const name of ['four-tools-overview-hires.webp','stock-etf-market.webp']){
 await mkdir(path.join(out,'assets'),{recursive:true});
 if(process.env.KLZ_SOURCE_ROOT)await copyFile(path.join(repo,'assets',name),path.join(out,'assets',name));
}
await copyFile('scripts/snapshot-client.js',path.join(out,'scripts/snapshot-client.js'));
console.log('Prepared two KLZ pages and their supporting assets.');
