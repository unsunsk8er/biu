const { contextBridge, ipcRenderer } = require('electron')

// 渲染层可用的原生能力白名单。
//
// 只暴露 UI 真正会调用的通道：B 站搜索/详情/播放地址由渲染层直连 API
// （主进程 net.fetch 无 WBI 签名会被 -352 风控），这里不再保留第二套代理。

const biliApi = {
  favoriteFolders: () =>
    ipcRenderer.invoke('bili:favoriteFolders'),

  favoriteResources: (mediaId, pn, ps) =>
    ipcRenderer.invoke('bili:favoriteResources', mediaId, pn, ps),

  favoriteCreate: (title) =>
    ipcRenderer.invoke('bili:favoriteCreate', title),

  favoriteAdd: (folderId, track) =>
    ipcRenderer.invoke('bili:favoriteAdd', folderId, track),

  // 扫码登录
  qrGenerate: () =>
    ipcRenderer.invoke('bili:qrGenerate'),

  qrPoll: (qrcodeKey) =>
    ipcRenderer.invoke('bili:qrPoll', qrcodeKey),

  getCookies: () =>
    ipcRenderer.invoke('bili:getCookies'),

  logout: () =>
    ipcRenderer.invoke('bili:logout'),
}

const lyricsApi = {
  // 搜索 QQ 音乐歌词候选
  search: (keyword, page, limit) =>
    ipcRenderer.invoke('lyrics:search', keyword, page, limit),

  // 获取指定歌曲的 LRC 歌词
  get: (id, format) =>
    ipcRenderer.invoke('lyrics:get', id, format),
}

const persistentStorage = {
  getItem: (key) => ipcRenderer.sendSync('persistent-storage:get', key),
  setItem: (key, value) => ipcRenderer.send('persistent-storage:set', key, value),
  removeItem: (key) => ipcRenderer.send('persistent-storage:remove', key),
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  startResize: (edge, screenX, screenY) => ipcRenderer.send('window:resize-start', { edge, screenX, screenY }),
  resizeMove: (screenX, screenY) => ipcRenderer.send('window:resize-move', { screenX, screenY }),
  endResize: () => ipcRenderer.send('window:resize-end'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
  setWindowButtonVisibility: (visible) => ipcRenderer.send('window:set-button-visibility', Boolean(visible)),
  onMaximizedChange: (callback) => {
    const listener = (_event, value) => callback(Boolean(value))
    ipcRenderer.on('window:maximized-change', listener)
    return () => ipcRenderer.removeListener('window:maximized-change', listener)
  },
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(Boolean(value))
    ipcRenderer.on('window:fullscreen-change', listener)
    return () => ipcRenderer.removeListener('window:fullscreen-change', listener)
  },
  updateTrayPlayerState: (state) => ipcRenderer.send('tray:player-state', state),
  onTrayPlayerCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('tray:player-command', listener)
    return () => ipcRenderer.removeListener('tray:player-command', listener)
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getSystemAccent: () => ipcRenderer.sendSync('app:get-system-accent'),
  searchCovers: (query) => ipcRenderer.invoke('cover:search', query),
  platform: process.platform,
  persistentStorage,
  biliApi,
  lyricsApi,
})
