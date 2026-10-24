const {app,BrowserWindow,WebContentsView,ipcMain,session,components,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {services,allowed,serviceForURL}=require('./services.cjs');
const root=path.resolve(__dirname,'..');
const smoke=process.argv.includes('--smoke-test');
const distributed=app.isPackaged||fs.existsSync(path.join(root,'BUILD-INFO.json'));
const verify=process.argv.includes('--verify-navigation')||process.argv.includes('--verify-services');
const diagnose=process.argv.includes('--diagnose-netflix');
app.setName('RobertTV PC');
app.commandLine.appendSwitch('lang','pt-BR');
const profilePath=(verify||smoke) ? path.join(app.getPath('temp'),'RobertTV-Desktop-QA') : distributed ? path.join(app.getPath('appData'),'RobertTV-Desktop') : path.join(root,components?'.runtime/ecs':'.runtime');
fs.mkdirSync(profilePath,{recursive:true});app.setPath('userData',profilePath);
let win,homeView,controls,content,page='home',revealTimer,htmlFullscreen=false;
if (!verify && !diagnose && !smoke) {
 if (!app.requestSingleInstanceLock()) { app.quit(); return; }
 app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}});
}
const views=new Map(),failures=new Map(),responses=new Map();
const homeURL=pathToFileURL(path.join(root,'index.html')).href;
const controlsURL=pathToFileURL(path.join(__dirname,'toolbar.html')).href;
function update(message=''){if(controls&&!controls.webContents.isDestroyed())controls.webContents.send('status',{page,name:services[page]?.name||'RobertTV',message});}
function layout(){if(!win||!content)return;const {width,height}=win.getContentBounds();content.setBounds({x:0,y:0,width,height});}
function reveal(show=true){if(!controls||page==='home')return;clearTimeout(revealTimer);controls.setBounds(show?{x:12,y:12,width:224,height:54}:{x:12,y:0,width:224,height:8});controls.webContents.send('reveal',show);}
async function stopMedia(view){if(view&&view!==homeView&&!view.webContents.isDestroyed()){view.webContents.setAudioMuted(true);await view.webContents.executeJavaScript('document.querySelectorAll("video,audio").forEach(media=>media.pause())').catch(()=>{});}}
async function show(view,id){if(content&&content!==view){const old=content;win.contentView.removeChildView(old);await stopMedia(old);}content=view;page=id;win.contentView.addChildView(view);view.webContents.setAudioMuted(false);layout();controls.setVisible(id!=='home');if(id!=='home'){win.contentView.addChildView(controls);reveal();revealTimer=setTimeout(()=>reveal(false),2500);}view.webContents.focus();update();}
async function home(){await show(homeView,'home');}
function shortcuts(wc){wc.on('enter-html-full-screen',()=>{htmlFullscreen=true;controls.setVisible(false);});wc.on('leave-html-full-screen',()=>{htmlFullscreen=false;controls.setVisible(page!=='home');});wc.on('before-input-event',(event,input)=>{if(input.type!=='keyDown')return;if(input.key==='F11'){event.preventDefault();win.setFullScreen(!win.isFullScreen());}else if(input.alt&&input.key==='Home'){event.preventDefault();home();}else if(input.alt&&input.key==='ArrowLeft'){event.preventDefault();if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();else home();}else if(input.key==='Escape'&&page!=='home'&&!htmlFullscreen){event.preventDefault();home();}});}
async function probe(wc){return wc.executeJavaScript(`(async()=>{const checks={};for(const [name,type] of Object.entries({'widevine-h264':'video/mp4; codecs="avc1.42E01E"','widevine-vp9':'video/webm; codecs="vp09.00.10.08"'})){try{await navigator.requestMediaKeySystemAccess('com.widevine.alpha',[{initDataTypes:['cenc'],videoCapabilities:[{contentType:type}]}]);checks[name]={available:true};}catch(e){checks[name]={available:false,error:e.name};}}return{eme:!!navigator.requestMediaKeySystemAccess,checks,actualPlaybackTested:false};})()`);}
function createService(id){
 const policy=session.fromPartition('persist:'+id);
 policy.setUserAgent(policy.getUserAgent(),'pt-BR,pt,en-US,en');
 policy.setPermissionRequestHandler((_,permission,cb)=>cb(['mediaKeySystem','fullscreen'].includes(permission)));
 policy.setPermissionCheckHandler((_,permission)=>['mediaKeySystem','fullscreen'].includes(permission));
 const view=new WebContentsView({webPreferences:{partition:'persist:'+id,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 const wc=view.webContents;shortcuts(wc);
 function navigate(value){if(allowed(id,value))wc.loadURL(value).catch(()=>update('Não foi possível carregar. Use Recarregar para tentar novamente.'));}
 wc.setWindowOpenHandler(({url})=>{navigate(url);return{action:'deny'};});
 for(const eventName of ['will-navigate','will-redirect'])wc.on(eventName,(event,url)=>{if(!allowed(id,url)){event.preventDefault();console.log('[Navegação bloqueada]',id,new URL(url).hostname);}});
 wc.on('did-fail-load',(_,code,description,url,isMain)=>{if(isMain&&code!==-3){failures.set(id,{code,description});update('Falha de conexão. Use Recarregar para tentar novamente.');}});
 wc.on('did-navigate',(_,url,status)=>{responses.set(id,status);failures.delete(id);});
 wc.on('did-finish-load',async()=>{update();if(diagnose&&id==='netflix'){try{const report={engine:components?'castlabs-ecs':'electron',testedAt:new Date().toISOString(),electron:process.versions.electron,...await probe(wc)};fs.mkdirSync(path.join(app.getPath('userData'),'diagnostics'),{recursive:true});fs.writeFileSync(path.join(app.getPath('userData'),'diagnostics','netflix-diagnostic.json'),JSON.stringify(report,null,2));console.log('[Netflix diagnóstico]',JSON.stringify(report));app.quit();}catch(e){console.error(e);app.exit(1);}}});
 views.set(id,view);return view;
}
async function openService(id,url){if(!Object.hasOwn(services,id))throw Error('Serviço inválido');if(url&&!allowed(id,url))throw Error('Destino inválido');const view=views.get(id)||createService(id);await show(view,id);if(!view.webContents.getURL()||url){failures.delete(id);await view.webContents.loadURL(url||services[id].url).catch(error=>{failures.set(id,{description:error.message});update('Falha de conexão. Use Recarregar para tentar novamente.');});}}
app.whenReady().then(async()=>{
 try{
  if(components){await components.whenReady();console.log('[DRM]',JSON.stringify(components.status()));}
  win=new BrowserWindow({width:1440,height:900,minWidth:850,minHeight:560,title:'RobertTV Desktop',icon:path.join(root,'assets/app-icon.png'),frame:process.platform==='win32',autoHideMenuBar:true,backgroundColor:'#eeedf1',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});win.setMenu(null);
  homeView=new WebContentsView({webPreferences:{preload:path.join(__dirname,'home-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});shortcuts(homeView.webContents);
  controls=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});controls.setBackgroundColor('#00000000');shortcuts(controls.webContents);
  await controls.webContents.loadFile(path.join(__dirname,'toolbar.html'));
  controls.setVisible(false);win.contentView.addChildView(controls);
  ipcMain.handle('home:service',async(event,id,url)=>{if(event.sender!==homeView.webContents||event.senderFrame?.url!==homeURL)throw Error('Origem inválida');return openService(id,url);});
  ipcMain.handle('control',async(event,command)=>{if(event.sender!==controls.webContents||event.senderFrame?.url!==controlsURL)return;if(command==='home')return home();if(command==='back'){if(content.webContents.navigationHistory.canGoBack())content.webContents.navigationHistory.goBack();else return home();}if(command==='reload')content.webContents.reload();if(command==='full')win.setFullScreen(!win.isFullScreen());if(command==='reveal')reveal(true);if(command==='hide')revealTimer=setTimeout(()=>reveal(false),700);});
  homeView.webContents.setWindowOpenHandler(({url})=>{const id=serviceForURL(url);if(id)openService(id,url).catch(console.error);return{action:'deny'};});
  homeView.webContents.on('will-navigate',(event,url)=>{if(url!==homeURL){event.preventDefault();const id=serviceForURL(url);if(id)openService(id,url).catch(console.error);}});
  await homeView.webContents.loadFile(path.join(root,'index.html'));await home();
  win.on('resize',layout);win.on('enter-full-screen',layout);win.on('leave-full-screen',layout);
  win.on('closed',()=>{clearTimeout(revealTimer);for(const view of [homeView,controls,...views.values()])if(!view.webContents.isDestroyed())view.webContents.close();});
  if(smoke){const result=await homeView.webContents.executeJavaScript('({apps:document.querySelectorAll(".app").length,clock:!!document.querySelector("#clock-time"),themeSwitch:typeof actions.theme==="function"})');if(result.apps!==7||!result.clock||!components||!distributed||app.getPath('userData').startsWith(root+path.sep))throw Error('Pacote incompleto');console.log('[SMOKE OK]',JSON.stringify({packaged:distributed,dataOutsideBundle:!app.getPath('userData').startsWith(root+path.sep),...result}));app.quit();}
  else if(verify){try{await require('./verify-navigation.cjs')({win,homeView,controls,getView:id=>views.get(id),getPage:()=>page,failures,responses,services,all:process.argv.includes('--verify-services'),probe,reveal});app.quit();}catch(error){console.error('[Verificação]',error);app.exit(1);}}
  else if(process.argv.includes('--netflix')||diagnose)await openService('netflix');
 }catch(error){console.error(error);if(!verify&&!smoke)dialog.showErrorBox('RobertTV Desktop','Não foi possível iniciar. Verifique sua conexão e tente novamente.\n\n'+error.message);app.exit(1);}
});
app.on('window-all-closed',()=>app.quit());
