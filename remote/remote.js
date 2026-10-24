const $=s=>document.querySelector(s);let connected=false,sending=false,moves={dx:0,dy:0},scrollDelta=0,lastGesture=null,volumeTimer,polling=false;
async function request(url,data){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),url==='/api/pair'?50000:20000);try{const r=await fetch(url,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-RobertTV':'1'}:{},body:data?JSON.stringify(data):undefined,signal:controller.signal});const result=await r.json();if(!r.ok){if(r.status===401&&url!=='/api/pair')setConnected(false);throw Error(result.error||'Não foi possível conectar');}return result;}finally{clearTimeout(timeout);}}
function setConnected(value){connected=value;$('#pair-screen').hidden=value;$('#control-screen').hidden=!value;$('#connection').classList.toggle('connected',value);$('#connection').textContent=value?'Conectado':'Wi-Fi local';}
function apply(state){if(state.service)$('#current-service').textContent=state.service;if(Number.isFinite(state.volume)&&document.activeElement!==$('#volume')){$('#volume').value=state.volume;$('#volume-value').textContent=state.volume+'%';}if(typeof state.muted==='boolean')$('#mute').textContent=state.muted?'⊘':'♪';}
async function command(data,quiet=false){if(!connected)return;try{const result=await request('/api/command',data);document.body.classList.remove('offline');apply(result);if(!quiet)$('#command-state').textContent=result.message||'Comando recebido';}catch(error){if(!quiet)$('#command-state').textContent=error.name==='AbortError'?'O computador está demorando. Tente novamente.':error.message;}}
$('#pair-form').addEventListener('submit',async e=>{e.preventDefault();$('#pair-submit').disabled=true;$('#pair-message').textContent='Confirme a conexão na janela do computador…';try{await request('/api/pair',{code:$('#pair-code').value,name:$('#device-name').value});$('#pair-code').value='';$('#pair-message').textContent='';setConnected(true);apply(await request('/api/state'));}catch(error){$('#pair-message').textContent=error.name==='AbortError'?'A confirmação demorou. Gere outro código no computador.':error.message;}finally{$('#pair-submit').disabled=false;}});
document.addEventListener('click',e=>{const button=e.target.closest('[data-command],[data-service],[data-key],[data-seek]');if(!button)return;const d=button.dataset;if(d.command)command({type:d.command});if(d.service){$('#command-state').textContent='Abrindo o serviço…';command({type:'service',id:d.service});}if(d.key)command({type:'key',key:d.key});if(d.seek)command({type:'seek',seconds:Number(d.seek)});});
$('#volume').addEventListener('input',e=>{$('#volume-value').textContent=e.target.value+'%';clearTimeout(volumeTimer);volumeTimer=setTimeout(()=>command({type:'volume',value:Number(e.target.value)}),100);});
$('#text-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#text-input');if(input.value){await command({type:'text',text:input.value});input.value='';}});
$('#disconnect').addEventListener('click',async()=>{try{await request('/api/disconnect',{});}finally{setConnected(false);}});
for(const [id,touch] of [['#tab-keys',false],['#tab-touch',true]])$(id).addEventListener('click',()=>{$('#keys-panel').hidden=touch;$('#touch-panel').hidden=!touch;$('#tab-keys').setAttribute('aria-selected',String(!touch));$('#tab-touch').setAttribute('aria-selected',String(touch));});
const pad=$('#touchpad');
function center(touches){return {x:[...touches].reduce((n,t)=>n+t.clientX,0)/touches.length,y:[...touches].reduce((n,t)=>n+t.clientY,0)/touches.length};}
pad.addEventListener('touchstart',e=>{e.preventDefault();const p=center(e.touches);const rail=!!e.target.closest('.scroll-strip');lastGesture={...p,start:Date.now(),distance:0,count:e.touches.length,rail};pad.querySelector('.scroll-strip').classList.toggle('active',rail);if(rail)moves={dx:0,dy:0};},{passive:false});
pad.addEventListener('touchmove',e=>{e.preventDefault();if(!lastGesture)return;const p=center(e.touches),dx=p.x-lastGesture.x,dy=p.y-lastGesture.y;lastGesture.distance+=Math.abs(dx)+Math.abs(dy);lastGesture.x=p.x;lastGesture.y=p.y;if(lastGesture.rail||e.touches.length>1){scrollDelta=Math.max(-1000,Math.min(1000,scrollDelta+dy*(lastGesture.rail?4:-4)));}else{moves.dx=Math.max(-300,Math.min(300,moves.dx+dx));moves.dy=Math.max(-300,Math.min(300,moves.dy+dy));}},{passive:false});
pad.addEventListener('touchend',e=>{e.preventDefault();if(lastGesture&&!lastGesture.rail&&lastGesture.count===1&&lastGesture.distance<9&&Date.now()-lastGesture.start<400)command({type:'click'});lastGesture=null;pad.querySelector('.scroll-strip').classList.remove('active');},{passive:false});
pad.addEventListener('touchcancel',()=>{lastGesture=null;scrollDelta=0;moves={dx:0,dy:0};pad.querySelector('.scroll-strip').classList.remove('active');});
setInterval(async()=>{if(sending||!connected||(!moves.dx&&!moves.dy&&!scrollDelta))return;const data=scrollDelta?{type:'scroll',dy:Math.round(scrollDelta)}:{type:'pointer',...moves};if(scrollDelta)scrollDelta=0;else moves={dx:0,dy:0};sending=true;try{await command(data,true);}finally{sending=false;}},40);
async function poll(){if(polling)return;polling=true;try{const state=await request('/api/state');setConnected(true);document.body.classList.remove('offline');apply(state);}catch(error){if(connected){document.body.classList.add('offline');$('#connection').textContent='Reconectando…';}else setConnected(false);}finally{polling=false;}}
setInterval(()=>{if(!document.hidden)poll();},2500);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});poll();

let installPrompt=null;
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function updateInstallCard(){const standalone=isStandalone();$('#install-card').hidden=standalone;if(standalone&&$('#install-help').open)$('#install-help').close();}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateInstallCard();});
window.addEventListener('appinstalled',()=>{installPrompt=null;$('#install-card').hidden=true;$('#install-help').close();});
window.matchMedia('(display-mode: standalone)').addEventListener('change',updateInstallCard);
$('#install-button').addEventListener('click',async()=>{
 if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;return;}
 const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const android=/Android/i.test(navigator.userAgent);
 const iosOther=ios&&/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);
 const steps=ios?[
  iosOther?'Abra esta página no Safari para adicionar o controle.':'No Safari, abra o menu e toque em Compartilhar (quadrado com seta para cima).',
  'Escolha “Adicionar à Tela de Início”.',
  'Se aparecer, ative “Abrir como App da Web”. Mantenha o nome RobertTV e toque em “Adicionar”.'
 ]:android?[
  'Abra o menu do navegador (⋮), no canto superior.',
  'Toque em “Adicionar à tela inicial” ou “Instalar app”, conforme a opção disponível.',
  'Confirme o nome RobertTV e toque em “Adicionar” ou “Instalar”.'
 ]:[
  'Abra este mesmo endereço no navegador do celular.',
  'No menu do navegador, escolha “Adicionar à tela inicial”.',
  'Confirme para criar o ícone RobertTV.'
 ];
 $('#install-intro').textContent='Abra o controle como um app, direto pelo ícone do RobertTV.';
 $('#install-steps').replaceChildren(...steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('#install-help').showModal();
});
$('#install-close').addEventListener('click',()=>$('#install-help').close());$('#install-done').addEventListener('click',()=>$('#install-help').close());
$('#install-help').addEventListener('click',event=>{if(event.target!==$('#install-help'))return;const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();});
updateInstallCard();
