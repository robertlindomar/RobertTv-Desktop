const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('robertDesktop',{
 command:command=>{if(['home','back','reload','full','reveal','hide'].includes(command))return ipcRenderer.invoke('control',command);},
 onStatus:callback=>ipcRenderer.on('status',(_,status)=>callback(status)),
 onReveal:callback=>ipcRenderer.on('reveal',(_,show)=>callback(show))
});
