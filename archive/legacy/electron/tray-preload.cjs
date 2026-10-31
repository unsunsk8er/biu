const { contextBridge, ipcRenderer } = require('electron')

/**
 * 托盘面板专用 preload。
 *
 * 托盘面板是一个 data: URL 的轻量窗口，只负责显示播放状态和转发四个命令。
 * 它不需要 Node，也不需要主 preload 的完整 API；这里用最小桥接 + contextIsolation
 * 替代过去的 nodeIntegration: true。
 */
contextBridge.exposeInMainWorld('trayAPI', {
  onState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('tray:state', listener)
    return () => ipcRenderer.removeListener('tray:state', listener)
  },
  getState: () => ipcRenderer.invoke('tray:get-state'),
  command: (command) => ipcRenderer.send('tray:command', command),
})
