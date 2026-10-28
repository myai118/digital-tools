const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..'),read=p=>fs.readFileSync(root+'/'+p,'utf8');
const defaults=()=>({version:1,pages:{'index.html':{visibleTickers:['SPY'],settingsPassword:'index',savedAt:'unchanged'},'tools/kwc.html':{visibleTickers:['AAPL'],settingsPassword:'kwc'}}});
function client(options={}){
 const calls=[],data=defaults(),controls={input:{value:''},'.auth-status':{},'.connect':{},'.disconnect':{}};
 const ctx={window:{},TextEncoder,TextDecoder,Uint8Array,atob,btoa,Date,Map,Set,JSON,URL,console,async fetch(url,opts={}){calls.push({url,opts});if(opts.method==='PUT'){if(options.conflict)return {ok:false,status:409,json:async()=>({message:'Conflict'})};return {ok:true,status:200,json:async()=>options.unconfirmed?{}:{commit:{sha:'saved'}}};}return {ok:true,status:200,json:async()=>url.includes('/contents/')?{sha:'latest-sha',content:btoa(JSON.stringify(data))}:{}};}};
 vm.createContext(ctx);vm.runInContext(read('stock-monitor/github-client.js'),ctx);ctx.window.ECGitHub.mount({set innerHTML(v){},querySelector:s=>controls[s]});
 return {api:ctx.window.ECGitHub,calls,data,connect:async()=>{controls.input.value='test-token';await controls['.connect'].onclick();}};
}
test('password saving needs GitHub connection and preserves ticker defaults and other pages',async()=>{
 const h=client();await assert.rejects(h.api.savePagePassword('index.html','new','index'),/myai118\/digital-tools.*Contents: Read and write/);assert.equal(h.calls.length,0);
 await h.connect();h.data.pages['index.html'].visibleTickers.push('MSFT');const result=await h.api.savePagePassword('index.html','新 password','index');assert.equal(result.commit_sha,'saved');
 const put=h.calls.find(x=>x.opts.method==='PUT'),body=JSON.parse(put.opts.body),saved=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
 assert.equal(body.sha,'latest-sha');assert.equal(saved.pages['index.html'].settingsPassword,'新 password');assert.deepEqual(saved.pages['index.html'].visibleTickers,['SPY','MSFT']);assert.equal(typeof saved.pages['index.html'].savedAt,'string');assert.deepEqual(saved.pages['tools/kwc.html'],defaults().pages['tools/kwc.html']);assert.equal(put.opts.headers.Authorization,'Bearer test-token');
});
test('password saves reject changed passwords, empty passwords and unknown pages without writing',async()=>{
 const h=client();await h.connect();await assert.rejects(h.api.savePagePassword('index.html','new','stale'),/changed elsewhere/);await assert.rejects(h.api.savePagePassword('index.html','   ','index'),/Enter a new/);await assert.rejects(h.api.savePagePassword('unknown.html','new',undefined),/not configured/);assert.equal(h.calls.filter(x=>x.opts.method==='PUT').length,0);
});
test('conflicts and unconfirmed GitHub responses cannot report a successful password save',async()=>{
 for(const options of [{conflict:true},{unconfirmed:true}]){const h=client(options);await h.connect();await assert.rejects(h.api.savePagePassword('index.html','new','index'),/Conflict|did not confirm/);}
});
test('default ticker saving uses the existing Admin GitHub connection and preserves page passwords',async()=>{
 const h=client();await assert.rejects(h.api.savePageDefaults('index.html',['MSFT','SPY'],['SPY']),/myai118\/digital-tools.*Contents: Read and write/);assert.equal(h.calls.length,0);
 await h.connect();const result=await h.api.savePageDefaults('index.html',['MSFT','SPY'],['SPY']);assert.equal(result.commit_sha,'saved');
 const put=h.calls.find(x=>x.opts.method==='PUT'),body=JSON.parse(put.opts.body),saved=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
 assert.deepEqual(saved.pages['index.html'].visibleTickers,['MSFT','SPY']);assert.equal(saved.pages['index.html'].settingsPassword,'index');assert.equal(typeof saved.pages['index.html'].savedAt,'string');assert.deepEqual(saved.pages['tools/kwc.html'],defaults().pages['tools/kwc.html']);assert.equal(body.sha,'latest-sha');assert.equal(put.opts.headers.Authorization,'Bearer test-token');
});
test('default ticker saves reject stale page lists and unconfirmed writes',async()=>{
 const stale=client();await stale.connect();stale.data.pages['index.html'].visibleTickers=['AAPL'];await assert.rejects(stale.api.savePageDefaults('index.html',['MSFT'],['SPY']),/changed elsewhere/);assert.equal(stale.calls.filter(x=>x.opts.method==='PUT').length,0);
 const unconfirmed=client({unconfirmed:true});await unconfirmed.connect();await assert.rejects(unconfirmed.api.savePageDefaults('index.html',['MSFT'],['SPY']),/did not confirm/);
});
class Node{constructor(){this.value='';this.children=[];this.disabled=false;this.textContent='';}append(n){this.children.push(n);if(!this.value)this.value=n.value;}replaceChildren(){this.children=[];this.value='';}get options(){return this.children;}}
async function panel(options={}){
 const ids=['passwordPage','pagePassword','pagePasswordConfirm','savePagePassword','reloadPagePasswords','pagePasswordStatus','pagePasswordForm'],nodes=Object.fromEntries(ids.map(id=>[id,new Node()])),calls=[],data=defaults();
 const ctx={document:{getElementById:id=>nodes[id],createElement:()=>new Node()},ECGitHub:{file:async()=>({data:structuredClone(data)}),savePagePassword:async(...args)=>{calls.push(args);if(options.fail)throw Error('Connect GitHub first.');data.pages[args[0]].settingsPassword=args[1];return {data:structuredClone(data)};}}};vm.createContext(ctx);vm.runInContext(read('stock-monitor/admin-page-passwords.js'),ctx);await new Promise(resolve=>setImmediate(resolve));return {nodes,calls,data,submit:()=>nodes.pagePasswordForm.onsubmit({preventDefault(){}})};
}
test('Admin loads page options, checks confirmation and saves only the selected password',async()=>{
 const h=await panel(),n=h.nodes;assert.equal(n.passwordPage.value,'index.html');assert.equal(n.savePagePassword.disabled,false);await h.submit();assert.equal(h.calls.length,0);n.pagePassword.value='new';n.pagePasswordConfirm.value='different';await h.submit();assert.match(n.pagePasswordStatus.textContent,/do not match/);assert.equal(h.calls.length,0);
 n.pagePasswordConfirm.value='new';await h.submit();assert.deepEqual(h.calls[0],['index.html','new','index']);assert.equal(n.pagePassword.value,'');assert.equal(n.pagePasswordConfirm.value,'');assert.match(n.pagePasswordStatus.textContent,/Password saved/);
 n.passwordPage.value='tools/kwc.html';n.passwordPage.onchange();n.pagePassword.value=n.pagePasswordConfirm.value='changed';await h.submit();assert.deepEqual(h.calls[1],['tools/kwc.html','changed','kwc']);
});
test('Admin save failures remain visible without success or losing the entered draft',async()=>{
 const h=await panel({fail:true}),n=h.nodes;n.pagePassword.value=n.pagePasswordConfirm.value='new';await h.submit();assert.match(n.pagePasswordStatus.textContent,/not confirmed saved.*Connect GitHub/);assert.equal(n.pagePassword.value,'new');assert.equal(n.savePagePassword.disabled,false);
});
