const {contextBridge,ipcRenderer}=require('electron');
const allowed=['netflix','youtube','prime','disney','hbo','paramount','globo'];
contextBridge.exposeInMainWorld('robertHome',{
 remote:command=>['info','start','stop','revoke'].includes(command)?ipcRenderer.invoke('home:remote',command):Promise.reject(new Error('Comando inválido')),
 onRemoteStatus:callback=>ipcRenderer.on('remote:status',(_,status)=>callback(status)),
 openAboutLink:key=>['author','source'].includes(key)?ipcRenderer.invoke('home:about-link',key):Promise.reject(new Error('Link inválido')),
 openService:(id,url)=>allowed.includes(id)?ipcRenderer.invoke('home:service',id,url):Promise.reject(new Error('Serviço inválido'))
});
