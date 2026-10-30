import fs from 'node:fs'
import path from 'node:path'

/**
 * 零依赖静态门禁：补 tsc 覆盖不到、又容易回归的约束。
 *
 *   1. preload 暴露的 IPC 通道必须都有主进程 handler，反之亦然
 *   2. 敏感 IPC 文件里每个 handle 都必须有发送方校验
 *   3. 不允许再出现 nodeIntegration: true / contextIsolation: false
 *   4. 渲染层不允许 console.log（避免调试输出进生产包）
 *
 * 只用 Node 内置模块，保证 CI 与本地都能直接跑。
 */

const root = process.cwd()
const failures = []

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

function fail(message) {
  failures.push(message)
}

function collectChannels(source, pattern) {
  const channels = new Set()
  for (const match of source.matchAll(pattern)) channels.add(match[1])
  return channels
}

// 1. preload ↔ handler 对齐
const preloadSource = read('electron/preload.cjs') + read('electron/tray-preload.cjs')
const handlerSource = ['electron/main.ts', 'electron/biliApi.ts', 'electron/lyricsApi.ts', 'electron/coverApi.ts']
  .map(read)
  .join('\n')

const exposed = collectChannels(preloadSource, /ipcRenderer\.(?:invoke|send|sendSync)\(\s*'([^']+)'/g)
const handled = collectChannels(handlerSource, /ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)

for (const channel of exposed) {
  if (!handled.has(channel)) fail(`preload 暴露了不存在的通道：${channel}`)
}
for (const channel of handled) {
  if (!exposed.has(channel)) fail(`handler 没有任何 preload 调用方：${channel}`)
}

// 2. 敏感 IPC 的发送方校验
const guardedFiles = ['electron/biliApi.ts', 'electron/lyricsApi.ts', 'electron/coverApi.ts']
for (const file of guardedFiles) {
  const source = read(file)
  const handles = (source.match(/ipcMain\.handle\(/g) || []).length
  const guards = (source.match(/assertTrustedSender\(event\)/g) || []).length
  if (handles !== guards) fail(`${file}: ${handles} 个 handle，但只有 ${guards} 处 assertTrustedSender`)
}

const mainSource = read('electron/main.ts')
for (const channel of ['persistent-storage:get', 'persistent-storage:set', 'persistent-storage:remove']) {
  const block = mainSource.split(`ipcMain.on('${channel}'`)[1]?.slice(0, 260) ?? ''
  if (!block.includes('isTrustedSender(event)')) fail(`main.ts: ${channel} 缺少发送方校验`)
}

// 3. 禁止再引入 Node 全开的窗口；主窗口必须显式 sandbox
for (const file of ['electron/main.ts']) {
  const source = read(file)
  if (/nodeIntegration:\s*true/.test(source)) fail(`${file}: 仍存在 nodeIntegration: true`)
  if (/contextIsolation:\s*false/.test(source)) fail(`${file}: 仍存在 contextIsolation: false`)
  if (!/sandbox:\s*true/.test(source)) fail(`${file}: 主窗口未显式开启 sandbox`)
  if (!source.includes('setPermissionRequestHandler')) fail(`${file}: 缺少 setPermissionRequestHandler`)
  if (!source.includes('setPermissionCheckHandler')) fail(`${file}: 缺少 setPermissionCheckHandler`)
  if (!source.includes('will-attach-webview')) fail(`${file}: 缺少 webview 挂载拦截`)
}

// 4. 登录态 IPC 不允许回传 Cookie 值
const biliSource = read('electron/biliApi.ts')
const cookieStart = biliSource.indexOf("ipcMain.handle('bili:getCookies'")
const cookieEnd = biliSource.indexOf('ipcMain.handle(', cookieStart + 10)
const cookieBlock = cookieStart >= 0 ? biliSource.slice(cookieStart, cookieEnd > cookieStart ? cookieEnd : undefined) : ''
if (!cookieBlock) fail('biliApi.ts: 找不到 bili:getCookies handler')
else if (/\b(biliJct|dedeUserId|sessdata)\s*:/.test(cookieBlock)) {
  fail('biliApi.ts: bili:getCookies 仍在回传 Cookie 值')
}

// 5. 渲染层调试输出
const rendererFiles = []
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) rendererFiles.push(full)
  }
}
walk(path.join(root, 'src'))
for (const file of rendererFiles) {
  if (fs.readFileSync(file, 'utf8').includes('console.log(')) {
    fail(`${path.relative(root, file)}: 渲染层不应保留 console.log`)
  }
}

// 6. 合规：许可证与 NOTICE 必须存在；签名材料不得入库
for (const required of ['LICENSE', 'NOTICE']) {
  if (!fs.existsSync(path.join(root, required))) fail(`缺少 ${required}`)
}
const packageJson = JSON.parse(read('package.json'))
if (!packageJson.license) fail('package.json: 缺少 license 字段')
const harmonyProfile = read('platform/HarmonyOS/build-profile.json5')
if (/certpath|storePassword|keyPassword/i.test(harmonyProfile)) {
  fail('platform/HarmonyOS/build-profile.json5: 不得提交证书路径或口令')
}
if (!/"license"\s*:\s*"[^"]+"/.test(read('platform/HarmonyOS/oh-package.json5'))) {
  fail('platform/HarmonyOS/oh-package.json5: license 不能为空')
}

if (failures.length > 0) {
  console.error('verify 失败：')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}

console.log(`verify 通过：${exposed.size} 个 IPC 通道对齐，敏感 handler 均有校验，窗口/权限/Cookie/日志/许可证检查通过`)
