const http=require('node:http');
const storage=require('node:fs');
const os=require('node:os');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {services}=require('./services.cjs');
const root=path.resolve(__dirname,'..');
const cookieName='roberttv_remote';
const sessionTTL=24*60*60*1000;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function isLAN(ip){return /^192\.168\./.test(ip)||/^10\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip);}
function addresses(){return Object.entries(os.networkInterfaces()).flatMap(([name,list])=>list.filter(n=>n.family==='IPv4'&&!n.internal&&isLAN(n.address)).map(n=>({name,address:n.address}))).sort((a,b)=>Number(/^192\.168/.test(b.address))-Number(/^192\.168/.test(a.address)));}
function validateCommand(c){
 if(!c||typeof c!=='object'||Array.isArray(c))return false;
 const num=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
 switch(c.type){
 case 'home':case 'back':case 'fullscreen':case 'play':case 'mute':case 'click':return Object.keys(c).length===1;
 case 'service':return Object.keys(c).length===2&&Object.hasOwn(services,c.id);
 case 'key':return Object.keys(c).length===2&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','Tab','Backspace','Space'].includes(c.key);
 case 'text':return Object.keys(c).length===2&&typeof c.text==='string'&&c.text.length>0&&c.text.length<=512&&!/[\x00-\x08\x0b-\x1f]/.test(c.text);
 case 'pointer':return Object.keys(c).length===3&&num(c.dx,-300,300)&&num(c.dy,-300,300);
 case 'scroll':return Object.keys(c).length===2&&num(c.dy,-1000,1000);
 case 'seek':return Object.keys(c).length===2&&[-10,10].includes(c.seconds);
 case 'volume':return Object.keys(c).length===2&&num(c.value,0,100);
 default:return false;
 }
}
function createRemoteServer({onCommand,getState=()=>({}),confirmPairing=async()=>false,onChange=()=>{},host,port=8788,now=Date.now,pairTTL=300000,stateFile}={}){
 if(typeof onCommand!=='function')throw Error('Executor de comandos obrigatório');
 let server,listenHost='',listenPort=0,code='',expiresAt=0,token='',sessionExpires=0,device='',pending=false,busy=false;
 let saved=null;
 if(stateFile){try{const value=JSON.parse(storage.readFileSync(stateFile,'utf8'));if(value.version===1&&typeof value.enabled==='boolean')saved=value;}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}}
 if(saved?.enabled&&typeof saved.tokenHash==='string'&&/^[a-f0-9]{64}$/.test(saved.tokenHash)&&Number.isFinite(saved.sessionExpires)&&saved.sessionExpires>now()&&saved.sessionExpires<=now()+sessionTTL){token=saved.tokenHash;sessionExpires=saved.sessionExpires;device=typeof saved.device==='string'?saved.device.slice(0,40):'Celular';}
 function persist(enabled=!!server?.listening){if(!stateFile)return;const data={version:1,enabled,address:listenHost,port:listenPort,tokenHash:token,sessionExpires,device};const temp=stateFile+'.tmp';storage.writeFileSync(temp,JSON.stringify(data),{mode:0o600});storage.chmodSync(temp,0o600);storage.renameSync(temp,stateFile);}
 const attempts=new Map(),rates=new Map();let queue=Promise.resolve();
 function info(){if(token&&now()>=sessionExpires){token='';sessionExpires=0;device='';renew();persist();}return {enabled:!!server?.listening,address:listenHost,port:listenPort,url:listenHost?`http://${listenHost}:${listenPort}`:'',code:token?'':code,expiresAt,connected:!!token&&now()<sessionExpires,device};}
 function changed(){onChange(info());}
 function renew(){code=String(crypto.randomInt(100000,1000000));expiresAt=now()+pairTTL;attempts.clear();}
 function revoke(){token='';sessionExpires=0;device='';renew();persist();changed();}
 function reply(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
 async function body(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Object.assign(Error('Envie JSON'),{status:415});let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw Object.assign(Error('Mensagem muito grande'),{status:413});}try{return JSON.parse(text);}catch{throw Object.assign(Error('JSON inválido'),{status:400});}}
 function authenticated(req){const raw=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));return !!raw&&!!token&&now()<sessionExpires&&same(digest(raw.slice(cookieName.length+1)),token);}
 async function handle(req,res){
  try{
   const authority=`${listenHost}:${listenPort}`;
   if(req.headers.host!==authority)return reply(res,403,{error:'Endereço não permitido'});
   if(req.headers.origin&&req.headers.origin!==`http://${authority}`)return reply(res,403,{error:'Origem não permitida'});
   const ip=req.socket.remoteAddress||'';if(ip!=='127.0.0.1'&&ip!=='::1'&&!isLAN(ip.replace(/^::ffff:/,'')))return reply(res,403,{error:'Somente rede local'});
   const url=new URL(req.url,`http://${authority}`);
   if(req.method==='GET'&&!url.pathname.startsWith('/api/')){
    const files={'/':['remote/index.html','text/html; charset=utf-8'],'/remote.css':['remote/remote.css','text/css'],'/remote.js':['remote/remote.js','text/javascript'],'/logo.svg':['assets/logo.svg','image/svg+xml'],'/manifest.webmanifest':['remote/manifest.webmanifest','application/manifest+json'],'/icon-192.png':['remote/icon-192.png','image/png'],'/icon-512.png':['remote/icon-512.png','image/png'],'/apple-touch-icon.png':['remote/apple-touch-icon.png','image/png']};
    const icon=/^\/icons\/(netflix|youtube|prime|disney|hbo|paramount|globo)$/.exec(url.pathname);
    if(icon){const icons={netflix:'netflix.svg',youtube:'youtube.png',prime:'prime.png',disney:'disneyplus.svg',hbo:'hbomax.svg',paramount:'paramountplus.svg',globo:'globoplay.svg'};const f=icons[icon[1]];files[url.pathname]=['assets/'+f,f.endsWith('png')?'image/png':'image/svg+xml'];}
    const entry=files[url.pathname];if(!entry)return reply(res,404,{error:'Não encontrado'});
    const data=await fs.readFile(path.join(root,entry[0]));res.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(data);return;
   }
   if(req.method==='POST'&&url.pathname==='/api/pair'){
    if(req.headers['x-roberttv']!=='1')return reply(res,403,{error:'Solicitação inválida'});
    const data=await body(req);const count=attempts.get(ip)||{count:0,until:now()+300000};if(now()>count.until){count.count=0;count.until=now()+300000;}attempts.set(ip,count);
    if(count.count>=5)return reply(res,429,{error:'Muitas tentativas. Aguarde cinco minutos ou gere outro código no computador.'});
    if(token&&now()<sessionExpires)return reply(res,409,{error:'Já existe um controle pareado. Desconecte-o no computador.'});
    if(pending)return reply(res,409,{error:'Aguarde a confirmação no computador.'});
    if(now()>expiresAt||!same(String(data.code||''),code)){count.count++;return reply(res,401,{error:'Código inválido ou expirado. Confira o computador.'});}
    pending=true;const pairingCode=code;const name=typeof data.name==='string'?data.name.replace(/[\x00-\x1f]/g,'').slice(0,40):'Celular';
    let accepted=false;let timer;
    try{accepted=await Promise.race([confirmPairing(name||'Celular'),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),45000);})]);}finally{clearTimeout(timer);pending=false;}
    if(!server?.listening||!same(code,pairingCode))return reply(res,409,{error:'Pareamento cancelado. Tente novamente.'});
    if(!accepted){renew();changed();return reply(res,403,{error:'Conexão não autorizada no computador. Use o novo código.'});}
    const sessionToken=crypto.randomBytes(32).toString('hex');token=digest(sessionToken);device=name||'Celular';sessionExpires=now()+sessionTTL;code='';attempts.clear();try{persist();}catch(error){token='';sessionExpires=0;device='';renew();throw error;}changed();
    return reply(res,200,{ok:true},{'Set-Cookie':`${cookieName}=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`});
   }
   if(!authenticated(req))return reply(res,401,{error:'Pareie este celular no computador.'});
   if(req.method==='GET'&&url.pathname==='/api/state')return reply(res,200,{connected:true,device,...await getState()});
   if(req.method==='POST'&&url.pathname==='/api/command'){
    if(req.headers['x-roberttv']!=='1')return reply(res,403,{error:'Solicitação inválida'});
    const data=await body(req);if(!validateCommand(data))return reply(res,400,{error:'Comando inválido'});
    const rate=rates.get(ip)||{at:now(),count:0};if(now()-rate.at>1000){rate.at=now();rate.count=0;}rate.count++;rates.set(ip,rate);if(rate.count>80)return reply(res,429,{error:'Comandos muito rápidos'});
    if(busy&&['service','home','back'].includes(data.type))return reply(res,409,{error:'Aguarde o aplicativo carregar.'});
    let resolveCommand;const previous=queue;queue=new Promise(resolve=>{resolveCommand=resolve;});await previous;
    try{if(!authenticated(req))return reply(res,401,{error:'Conexão revogada'});busy=true;const result=await onCommand(data);reply(res,200,{ok:true,...result});}finally{busy=false;resolveCommand();}
    return;
   }
   if(req.method==='POST'&&url.pathname==='/api/disconnect'){if(req.headers['x-roberttv']!=='1')return reply(res,403,{error:'Solicitação inválida'});revoke();return reply(res,200,{ok:true},{'Set-Cookie':`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`});}
   reply(res,404,{error:'Não encontrado'});
  }catch(error){if(!res.headersSent)reply(res,error.status||500,{error:error.status?error.message:'Não foi possível executar o comando.'});else res.end();}
 }
 return{
  info,revoke,
  async resume(){if(saved?.enabled)return this.start();return info();},
  async start(){if(server?.listening)return info();const available=addresses();listenHost=host||(available.some(n=>n.address===saved?.address)?saved.address:available[0]?.address);if(!listenHost)throw Error('Conecte o computador ao Wi-Fi ou à rede local antes de ativar.');if(listenHost!=='127.0.0.1'&&!isLAN(listenHost))throw Error('Interface local inválida');renew();server=http.createServer(handle);server.requestTimeout=60000;server.headersTimeout=10000;server.maxConnections=12;
   const firstPort=Number.isInteger(saved?.port)&&saved.port>0&&saved.port<65526?saved.port:port;
   for(let candidate=firstPort;candidate<firstPort+10;candidate++){try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(candidate,listenHost,()=>{server.removeListener('error',reject);resolve();});});listenPort=server.address().port;persist();changed();return info();}catch(error){if(error.code!=='EADDRINUSE'||candidate===firstPort+9){if(server?.listening){server.closeAllConnections();server.close();}server=null;throw error;}}}
  },
  async stop({preserveSession=false}={}){if(preserveSession)persist(!!server?.listening);else{token='';code='';device='';expiresAt=0;sessionExpires=0;persist(false);}if(server){const old=server;server=null;old.closeAllConnections();await new Promise(resolve=>old.close(resolve));}changed();}
 };
}
module.exports={createRemoteServer,validateCommand,addresses,isLAN};
