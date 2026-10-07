// Cầu nối an toàn giữa giao diện và tiến trình chính
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lablogDesktop', {
  onOpenFiles: cb => ipcRenderer.on('open-files', (_e, list) => cb(list)),
  onCommand: cb => ipcRenderer.on('cmd', (_e, c) => cb(c)),
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  platform: process.platform
});
