const {contextBridge,ipcRenderer}=require('electron');
const allowed=['netflix','youtube','prime','disney','hbo','paramount','globo'];
contextBridge.exposeInMainWorld('robertHome',{
 openService:(id,url)=>allowed.includes(id)?ipcRenderer.invoke('home:service',id,url):Promise.reject(new Error('Serviço inválido'))
});
