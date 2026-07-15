const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startAnonymization: (params) =>
    ipcRenderer.invoke('start-anonymization', params),
  cancelAnonymization: () => ipcRenderer.invoke('cancel-anonymization'),
  openFolder: (path) =>
    ipcRenderer.invoke('open-folder', path),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Local AI engine (Ollama) lifecycle
  checkEngine: () => ipcRenderer.invoke('check-engine'),
  pullEngineModel: () => ipcRenderer.invoke('pull-engine-model'),
  onEnginePullProgress: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('engine-pull-progress', handler);
    return handler;
  },
  offEnginePullProgress: (handler) =>
    ipcRenderer.removeListener('engine-pull-progress', handler),

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
