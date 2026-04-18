const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startAnonymization: (params) => 
    ipcRenderer.invoke('start-anonymization', params),
  openFolder: (path) => 
    ipcRenderer.invoke('open-folder', path),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onProgress: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('progress-update', handler);
    return handler;
  },
  offProgress: (handler) => ipcRenderer.removeListener('progress-update', handler),
  onWarning: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('warning-update', handler);
    return handler;
  },
  offWarning: (handler) => ipcRenderer.removeListener('warning-update', handler),
});
