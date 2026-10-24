const {contextBridge,ipcRenderer}=require('electron');
const allowed=['netflix','youtube','prime','disney','hbo','paramount','globo'];
contextBridge.exposeInMainWorld('robertHome',{
 openAboutLink:key=>['author','source'].includes(key)?ipcRenderer.invoke('home:about-link',key):Promise.reject(new Error('Link inválido')),
 openService:(id,url)=>allowed.includes(id)?ipcRenderer.invoke('home:service',id,url):Promise.reject(new Error('Serviço inválido'))
});
