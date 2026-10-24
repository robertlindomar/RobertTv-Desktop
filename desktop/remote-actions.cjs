function createRemoteActions({getView,getPage,openService,home,fullscreen,services,focusWindow=()=>{}}){
 let point={x:120,y:120},volume=100,muted=false;
 const state=()=>({page:getPage(),service:services[getPage()]?.name||'Início',volume,muted});
 const active=()=>{const view=getView();if(!view||view.webContents.isDestroyed())throw Error('Aplicativo indisponível');return view;};
 function key(name){name=({ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right'})[name]||name;const wc=active().webContents;wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:name});wc.sendInputEvent({type:'keyUp',keyCode:name});}
 async function media(type,value){
  if(getPage()==='home')return{message:'Abra um serviço e um vídeo primeiro.'};
  return active().webContents.executeJavaScript(`(async()=>{
   const items=[...document.querySelectorAll('video,audio')];const m=items.find(v=>!v.paused)||items.find(v=>v.readyState>0)||items[0];
   if(!m)return{message:'Use o touchpad para selecionar um vídeo neste serviço.'};
   const type=${JSON.stringify(type)},value=${JSON.stringify(value??null)};
   if(type==='play'){if(m.paused)await m.play();else m.pause();}
   if(type==='seek'){const end=Number.isFinite(m.duration)?Math.max(0,m.duration-.1):Infinity;m.currentTime=Math.max(0,Math.min(end,m.currentTime+value));}
   if(type==='volume'){m.volume=value/100;m.muted=false;}
   return{message:type==='play'?(m.paused?'Pausado':'Reproduzindo'):type==='seek'?'Posição ajustada': 'Volume ajustado'};
  })()`,true).catch(()=>({message:'Este player não aceitou o comando. Use o touchpad ou o teclado.'}));
 }
 return{
  state,
  async readState(){
   const wc=active().webContents;
   if(getPage()!=='home'){
    const value=await wc.executeJavaScript('(()=>{const all=[...document.querySelectorAll("video,audio")];const m=all.find(v=>!v.paused)||all[0];return m?{volume:Math.round(m.volume*100),muted:m.muted}:null;})()').catch(()=>null);
    if(value)volume=value.volume;
    muted=wc.isAudioMuted()||!!value?.muted;
   }else muted=wc.isAudioMuted();
   return state();
  },
  async command(c){
   await focusWindow();
   const view=active(),wc=view.webContents;
   switch(c.type){
   case 'home':await home();break;
   case 'service':await home();await openService(c.id);point={x:120,y:120};break;
   case 'back':if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();else await home();break;
   case 'fullscreen':await fullscreen();break;
   case 'key':key(c.key);break;
   case 'text':wc.focus();await wc.insertText(c.text);break;
   case 'pointer':{
    const b=view.getBounds();point.x=Math.max(1,Math.min(b.width-2,point.x+c.dx*1.7));point.y=Math.max(1,Math.min(b.height-2,point.y+c.dy*1.7));point.x=Math.round(point.x);point.y=Math.round(point.y);
    wc.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});
    await wc.executeJavaScript(`(()=>{
     let p=document.getElementById('__robertRemotePointer');
     if(!p){p=document.createElement('div');p.id='__robertRemotePointer';p.setAttribute('aria-hidden','true');p.setAttribute('popover','manual');p.style.cssText='position:fixed;inset:auto;margin:0;padding:0;width:15px;height:15px;border:2px solid white;border-radius:50%;background:#9d8be0;box-shadow:0 1px 5px #0009;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%)';}
     const layer=document.querySelector('dialog[open]')||(document.fullscreenElement?.tagName!=='VIDEO'&&document.fullscreenElement)||document.documentElement;
     if(p.parentElement!==layer){if(p.matches(':popover-open'))p.hidePopover();layer.appendChild(p);}
     p.style.left='${point.x}px';p.style.top='${point.y}px';if(!p.matches(':popover-open'))p.showPopover();
    })()`).catch(()=>{});break;
   }
   case 'click':wc.focus();wc.sendInputEvent({type:'mouseDown',x:point.x,y:point.y,button:'left',clickCount:1});wc.sendInputEvent({type:'mouseUp',x:point.x,y:point.y,button:'left',clickCount:1});break;
   case 'scroll':wc.sendInputEvent({type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:-Math.round(c.dy),canScroll:true});break;
   case 'play':case 'seek':return{...state(),...await media(c.type,c.seconds)};
   case 'volume':volume=Math.round(c.value);muted=false;wc.setAudioMuted(false);return{...state(),...await media('volume',volume)};
   case 'mute':muted=!muted;wc.setAudioMuted(muted);break;
   default:throw Error('Comando não reconhecido');
   }
   return state();
  }
 };
}
module.exports={createRemoteActions};
