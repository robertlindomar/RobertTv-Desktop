const {test}=require('node:test');
const assert=require('node:assert/strict');
// Restart tests reuse the same port; do not reuse sockets from a closed server.
const fetch=(url,options={})=>globalThis.fetch(url,{...options,headers:{...options.headers,Connection:'close'}});
const {createRemoteServer,validateCommand}=require('./remote-server.cjs');
async function fixture(t,options={}){const commands=[];const server=createRemoteServer({host:'127.0.0.1',port:0,onCommand:async c=>{commands.push(c);return{service:'Teste'};},getState:()=>({service:'Teste'}),confirmPairing:async()=>true,...options});await server.start();t.after(()=>server.stop());return{server,commands,url:server.info().url};}
async function post(url,route,data,headers={}){return fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','X-RobertTV':'1',...headers},body:JSON.stringify(data)});}
async function pair(f){const response=await post(f.url,'/api/pair',{code:f.server.info().code,name:'Celular teste'});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);return cookie.split(';')[0];}
test('sem pareamento não há estado nem comandos; somente arquivos públicos',async t=>{const f=await fixture(t);assert.equal((await fetch(f.url+'/')).status,200);assert.equal((await fetch(f.url+'/remote.js')).status,200);assert.equal((await fetch(f.url+'/api/state')).status,401);assert.equal((await post(f.url,'/api/command',{type:'home'})).status,401);assert.equal((await fetch(f.url+'/.runtime/ecs/Cookies')).status,404);assert.equal(f.commands.length,0);});
test('código válido exige confirmação; comando é validado e revogação invalida cookie',async t=>{const f=await fixture(t);assert.equal((await post(f.url,'/api/pair',{code:'000000'})).status,401);const cookie=await pair(f);assert.equal((await fetch(f.url+'/api/state',{headers:{Cookie:cookie}})).status,200);assert.equal((await post(f.url,'/api/command',{type:'service',id:'netflix'},{Cookie:cookie})).status,200);assert.deepEqual(f.commands,[{type:'service',id:'netflix'}]);for(const data of [{type:'shell',cmd:'echo unsafe'},{type:'service',id:'__proto__'},{type:'pointer',dx:Infinity,dy:0},{type:'text',text:'x'.repeat(513)},{type:'home',extra:'code'}])assert.equal((await post(f.url,'/api/command',data,{Cookie:cookie})).status,400);f.server.revoke();assert.equal((await post(f.url,'/api/command',{type:'home'},{Cookie:cookie})).status,401);assert.equal(f.commands.length,1);});
test('pareamento negado ou expirado nunca cria sessão',async t=>{let clock=1000;const f=await fixture(t,{confirmPairing:async()=>false,now:()=>clock,pairTTL:100});const code=f.server.info().code;assert.equal((await post(f.url,'/api/pair',{code})).status,403);assert.equal((await fetch(f.url+'/api/state')).status,401);clock+=101;assert.equal((await post(f.url,'/api/pair',{code:f.server.info().code})).status,401);});
test('limite de cinco tentativas bloqueia novas tentativas até regenerar código',async t=>{const f=await fixture(t);for(let i=0;i<5;i++)assert.equal((await post(f.url,'/api/pair',{code:'000000'})).status,401);assert.equal((await post(f.url,'/api/pair',{code:f.server.info().code})).status,429);f.server.revoke();await pair(f);});
test('origens externas e Host de DNS rebinding são recusados',async t=>{const f=await fixture(t);const cookie=await pair(f);assert.equal((await post(f.url,'/api/command',{type:'home'},{Cookie:cookie,Origin:'https://site-externo.example'})).status,403);const http=require('node:http');const status=await new Promise((resolve,reject)=>{const req=http.get(f.url+'/api/state',{headers:{Host:'outro.example',Cookie:cookie}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(status,403);assert.equal(f.commands.length,0);});
test('somente um celular por vez e desconectar encerra a sessão',async t=>{const f=await fixture(t);const code=f.server.info().code;const cookie=await pair(f);assert.equal((await post(f.url,'/api/pair',{code,name:'Outro'})).status,409);assert.equal((await post(f.url,'/api/disconnect',{}, {Cookie:cookie})).status,200);assert.equal((await fetch(f.url+'/api/state',{headers:{Cookie:cookie}})).status,401);});
test('validador permite apenas o protocolo fixo de controle',()=>{for(const c of [{type:'pointer',dx:10,dy:-2},{type:'key',key:'Enter'},{type:'volume',value:65},{type:'seek',seconds:-10},{type:'text',text:'pesquisa'}])assert.equal(validateCommand(c),true);for(const c of [null,[],{type:'key',key:'F12'},{type:'volume',value:-1},{type:'service',id:'file:///tmp/private'},{type:'text',text:'\u0000'}])assert.equal(validateCommand(c),false);});

test('atalho móvel oferece manifesto e ícones públicos sem conceder controle',async t=>{const f=await fixture(t);const response=await fetch(f.url+'/manifest.webmanifest');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/manifest\+json/);const manifest=await response.json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');for(const icon of ['/icon-192.png','/icon-512.png','/apple-touch-icon.png']){const r=await fetch(f.url+icon);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(1,4).toString(),'PNG');}assert.equal((await fetch(f.url+'/api/state')).status,401);});

test('pareamento dura 24 horas, sobrevive ao reinício e persiste somente hash privado',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roberttv-session-'));const stateFile=path.join(dir,'remote-control.json');
 let clock=Date.now(),current;
 t.after(async()=>{await current?.stop();await fs.rm(dir,{recursive:true,force:true});});
 const make=()=>createRemoteServer({host:'127.0.0.1',port:0,stateFile,now:()=>clock,onCommand:async()=>({}),confirmPairing:async()=>true});
 current=make();await current.start();const url=current.info().url;
 const response=await post(url,'/api/pair',{code:current.info().code,name:'Celular'});assert.equal(response.status,200);
 const header=response.headers.get('set-cookie');assert.match(header,/Max-Age=86400/);const cookie=header.split(';')[0];
 const saved=await fs.readFile(stateFile,'utf8');assert.ok(!saved.includes(cookie.split('=')[1]));assert.match(JSON.parse(saved).tokenHash,/^[a-f0-9]{64}$/);
 if(process.platform!=='win32')assert.equal((await fs.stat(stateFile)).mode&0o777,0o600);
 await current.stop({preserveSession:true});clock+=23*60*60*1000;
 current=make();await current.resume();assert.equal(current.info().url,url);assert.equal(current.info().connected,true);
 assert.equal((await fetch(url+'/api/state',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await post(url,'/api/pair',{code:current.info().code,name:'Outro'})).status,409);
 clock+=60*60*1000+1;assert.equal((await fetch(url+'/api/state',{headers:{Cookie:cookie}})).status,401);assert.equal(current.info().connected,false);assert.match(current.info().code,/^\d{6}$/);
});

test('revogar ou desativar impede reutilizar pareamento salvo após reinício',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roberttv-revoke-'));const stateFile=path.join(dir,'remote-control.json');let current;
 t.after(async()=>{await current?.stop();await fs.rm(dir,{recursive:true,force:true});});
 const make=()=>createRemoteServer({host:'127.0.0.1',port:0,stateFile,onCommand:async()=>({}),confirmPairing:async()=>true});
 current=make();await current.start();let url=current.info().url;const cookie=await pair({server:current,url});
 current.revoke();await current.stop({preserveSession:true});current=make();await current.resume();url=current.info().url;
 assert.equal((await fetch(url+'/api/state',{headers:{Cookie:cookie}})).status,401);
 const nextCookie=await pair({server:current,url});await current.stop();current=make();await current.resume();assert.equal(current.info().enabled,false);
 await current.start();assert.equal((await fetch(current.info().url+'/api/state',{headers:{Cookie:nextCookie}})).status,401);
});
