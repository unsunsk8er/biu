import fs from 'node:fs'
import path from 'node:path'

/**
 * HarmonyOS phone-only static gate.
 *
 * The desktop (Electron), Android and HarmonyOS PC builds are archived under
 * archive/legacy/. This check keeps the active build surface focused on the
 * HarmonyOS phone app and catches accidental references to archived paths.
 */

const root = process.cwd()
const failures = []

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

function fail(message) {
  failures.push(message)
}

// 1. Required files
for (const required of ['LICENSE', 'NOTICE', 'package.json', 'platform/HarmonyOSPhone/AppScope/app.json5']) {
  if (!fs.existsSync(path.join(root, required))) fail(`缺少 ${required}`)
}

// 2. Package metadata and scripts must not reference archived platforms
const packageJson = JSON.parse(read('package.json'))
if (!packageJson.license) fail('package.json: 缺少 license 字段')
if (packageJson.main) fail('package.json: 仍保留 Electron main 字段')
if (packageJson.build) fail('package.json: 仍保留 electron-builder build 配置')
for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  if (/electron|(^|\s)android:|prepare-android|build-harmony\.mjs|smoke-android/.test(command)) {
    fail(`package.json: 脚本 ${name} 仍引用已归档平台：${command}`)
  }
}

// 3. Vite entry must not import Electron plugins
const viteConfig = read('vite.config.ts')
if (/vite-plugin-electron|electron\/main\.ts|electron-builder/.test(viteConfig)) {
  fail('vite.config.ts: 仍引用 Electron 构建插件或入口')
}

// 4. Active platform files
const harmonyPhone = path.join(root, 'platform/HarmonyOSPhone')
for (const required of [
  'entry/src/main/ets/pages/Index.ets',
  'entry/src/main/ets/common/BiuBridge.ets',
  'entry/src/main/module.json5',
  'entry/src/main/cpp/native_audio.cpp',
]) {
  if (!fs.existsSync(path.join(harmonyPhone, required))) fail(`HarmonyOSPhone 缺少 ${required}`)
}

// 5. No debug console.log in renderer source
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

// 6. Archived platforms must stay outside the active source tree
for (const legacy of ['android', 'electron', 'platform/HarmonyOS']) {
  if (fs.existsSync(path.join(root, legacy))) fail(`${legacy} 仍在活动目录，应归档到 archive/legacy/`)
}

if (failures.length > 0) {
  console.error('verify 失败：')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}

console.log('verify 通过：当前仅保留 HarmonyOS 手机端与共享 Web 代码，已归档平台未被构建引用。')
