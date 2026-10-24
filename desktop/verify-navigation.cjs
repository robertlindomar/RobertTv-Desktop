const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){const end=Date.now()+45000;while(Date.now()<end){if(await check())return;await pause(150);}throw Error('Tempo excedido ao carregar');}
module.exports=async({win,homeView,controls,getView,getPage,failures,responses,services,all,reveal})=>{
 const home=homeView.webContents,report=[];
 const targets=all?Object.keys(services):['netflix'];
 for(const id of targets){
  const row={service:id,playbackTested:false};
  try{
   await home.executeJavaScript(`document.querySelector('.app.${id}').click()`);
   await until(()=>getPage()===id&&getView(id)?.webContents.getURL()&&!getView(id).webContents.isLoadingMainFrame());
   if(failures.has(id))throw Error(JSON.stringify(failures.get(id)));
   const view=getView(id),wc=view.webContents;
   assert.equal(await home.executeJavaScript('document.querySelector("#modal").open'),false);
   const b=view.getBounds(),w=win.getContentBounds();assert.deepEqual(b,{x:0,y:0,width:w.width,height:w.height});
   row.host=new URL(wc.getURL()).hostname;row.title=wc.getTitle();row.httpStatus=responses.get(id);
   await until(async()=>await wc.executeJavaScript('document.body?.innerText.length||0')>25);
   row.bodyLength=await wc.executeJavaScript('document.body?.innerText.length||0');
   await wc.capturePage().then(image=>fs.writeFileSync('/tmp/roberttv-servico-'+id+'.png',image.toPNG()));
   assert.ok(row.bodyLength>25,'Página vazia');assert.ok(!row.httpStatus||row.httpStatus<400,'Serviço recusou HTTP '+row.httpStatus);
   assert.ok(!/access denied|forbidden|just a moment|robot check|captcha/i.test(row.title),'Página de bloqueio: '+row.title);
   reveal(true);await controls.webContents.executeJavaScript('document.querySelector("[data-command=home]").click()');
   await until(()=>getPage()==='home');
   assert.equal(controls.getVisible(),false);
   const previous=wc.id;
   await home.executeJavaScript(`document.querySelector('.app.${id}').click()`);
   await until(()=>getPage()===id);
   assert.equal(getView(id).webContents.id,previous);
   wc.sendInputEvent({type:'keyDown',keyCode:'Home',modifiers:['alt']});wc.sendInputEvent({type:'keyUp',keyCode:'Home',modifiers:['alt']});
   await until(()=>getPage()==='home');
   row.passed=true;
  }catch(error){row.passed=false;row.error=error.message;reveal(true);await controls.webContents.executeJavaScript('document.querySelector("[data-command=home]").click()').catch(()=>{});await until(()=>getPage()==='home').catch(()=>{});}
  report.push(row);console.log('[Serviço]',JSON.stringify(row));
 }
 fs.mkdirSync(path.join(__dirname,'../diagnostics'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../diagnostics',all?'services.json':'navigation.json'),JSON.stringify({testedAt:new Date().toISOString(),report},null,2)+'\n');
 await home.capturePage().then(image=>fs.writeFileSync('/tmp/roberttv-sem-barra.png',image.toPNG()));
 assert.ok(report.every(row=>row.passed),'Um ou mais serviços precisam de revisão; consulte diagnostics/services.json');
 console.log('[Verificação] Todos os ícones, conteúdo sem barra, retorno e reutilização de sessão passaram.');
};
