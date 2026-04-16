const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startAnonymization: (params) => 
    ipcRenderer.invoke('start-anonymization', params),
  openFolder: (path) => 
    ipcRenderer.invoke('open-folder', path),
  onProgress: (callback) => 
    ipcRenderer.on('progress-update', (event, value) => callback(value)),
});
