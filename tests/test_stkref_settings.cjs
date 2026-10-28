const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../stock-monitor/stkref-settings.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../stock-monitor/stkref-settings.html'),'utf8');
function app(){
 const els=new Map();
 const context=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,
  atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),
  document:{getElementById(id){assert.ok(html.includes('id="'+id+'"'),'Missing HTML control: '+id);if(!els.has(id))els.set(id,{value:'',checked:false,disabled:true,textContent:'',classList:{toggle(){}},addEventListener(){},focus(){}});return els.get(id);}},
  window:{addEventListener(){}},fetch:()=>{throw Error('Unexpected network');}});
 vm.runInContext(source.replace(/\nload\(\);\s*$/,''),context);
 return {context,els,run:code=>vm.runInContext(code,context)};
}
test('separate defaults for job batch, threshold, and cycles',()=>{
 const a=app(),s=a.run('normalise({})');
 assert.equal(s.topUpJobs,10);assert.equal(s.refillThreshold,5);assert.equal(s.cycles,10);
});
test('settings fields round-trip and explain inclusive batch rule',()=>{
 const a=app();a.run('writeSettings(normalise({priceChecker:{cycles:7,intervalMinutes:6,refillThreshold:5,topUpJobs:10}}))');
 const s=a.run('readSettings()');assert.equal(s.cycles,7);assert.equal(s.refillThreshold,5);assert.equal(s.topUpJobs,10);
 assert.match(a.els.get('currentState').textContent,/add 10 jobs when 5 or fewer remain/);
});
test('custom batch is not capped to ten and threshold can be zero',()=>{
 const a=app(),s=a.run('normalise({priceChecker:{refillThreshold:0,topUpJobs:12,cycles:3}})');
 assert.equal(s.topUpJobs,12);assert.equal(s.refillThreshold,0);assert.equal(s.cycles,3);
});
test('busy state locks both new job controls',()=>{
 const a=app();a.run('loadedConfig={};lock(true)');
 assert.ok(a.els.get('topUpJobs').disabled);assert.ok(a.els.get('refillThreshold').disabled);
 a.run('lock(false)');assert.equal(a.els.get('topUpJobs').disabled,false);
});
test('save preserves unrelated configuration and writes independent queue fields',async()=>{
 const a=app(),config={version:1,revision:43,instruments:[{ticker:'AAPL'}],priceChecker:{enabled:true,intervalMinutes:6,cycles:7,refillThreshold:5,topUpJobs:10,categories:{ETF:true,Stock:true,Fund:false}}};
 a.context.config=config;
 a.run("loadedConfig=config;loadedSha='old';writeSettings(normalise(config));$('topUpJobs').value='12';$('token').value='test-token'");
 let body;
 a.context.fetch=async(url,options)=>{if(options.method==='PUT'){body=JSON.parse(options.body);return {ok:true,json:async()=>({content:{sha:'new'}})};}return {ok:true,json:async()=>({sha:'old',encoding:'base64',content:Buffer.from(JSON.stringify(config)).toString('base64')})};};
 await a.run('save()');
 const saved=JSON.parse(Buffer.from(body.content,'base64').toString());
 assert.equal(saved.priceChecker.topUpJobs,12);assert.equal(saved.priceChecker.refillThreshold,5);assert.equal(saved.priceChecker.cycles,7);assert.equal(saved.priceChecker.maxActiveCheckers,17);
 assert.equal(saved.revision,44);assert.equal(saved.instruments[0].ticker,'AAPL');assert.equal(a.els.get('token').value,'');
});
test('invalid batch is rejected without a write',async()=>{
 const a=app();a.run("loadedConfig={};loadedSha='old';writeSettings(normalise({}));$('topUpJobs').value='0';$('token').value='test-token'");
 await a.run('save()');assert.match(a.els.get('status').textContent,/at least 1 job/);
});
test('settings labels distinguish jobs from cycles',()=>{
 assert.match(html,/Cycles per job/);assert.match(html,/New jobs to add each time/);assert.match(html,/5 remaining becomes 15; 0 remaining becomes 10/);
 assert.ok(!html.includes('Maximum active checker jobs'));
});
