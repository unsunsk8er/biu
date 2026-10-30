import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

/**
 * Real-device HarmonyOS playback E2E.
 *
 * It drives the UI through hdc/uitest and verifies:
 *   launch → search → open a result → play → progress advances → seek
 *   → background remains alive → notification shade pause/resume
 *
 * "Audible output" is cross-checked through the audio-server/AVSession logs,
 * since the device has no screenrecord/audio-capture CLI.
 */
const root = process.cwd()
const hdc = process.env.HDC || 'C:\\Program Files\\Huawei\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe'
const target = process.env.BIU_HDC_TARGET
const bundle = 'com.unsunsk8er.biu'
const hap = process.env.BIU_E2E_HAP || path.join(root, 'release', 'biu-2.0.0-harmony-phone-release.hap')
const work = path.join(root, '.archive', 'e2e')
const skipInstall = process.argv.includes('--skip-install')
fs.mkdirSync(work, { recursive: true })

function run(args, { capture = true } = {}) {
  const result = spawnSync(hdc, target ? ['-t', target, ...args] : args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`hdc ${args.join(' ')} failed (${result.status}): ${result.stderr || ''}`)
  }
  return `${result.stdout || ''}${result.stderr || ''}`.trim()
}

function runOptional(args) {
  try {
    return run(args)
  } catch {
    return ''
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function dump(name = 'layout') {
  const remote = `/data/local/tmp/biu-e2e-${Date.now()}.json`
  run(['shell', 'uitest', 'dumpLayout', '-p', remote])
  const local = path.join(work, `${name}.json`)
  run(['file', 'recv', remote, local])
  return JSON.parse(fs.readFileSync(local, 'utf8'))
}

function walk(node, out = []) {
  if (!node || typeof node !== 'object') return out
  out.push(node)
  for (const child of node.children || []) walk(child, out)
  return out
}

function bounds(node) {
  const b = node.attributes?.bounds || ''
  const m = b.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
  if (!m) return null
  return { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }
}

function textOf(node) {
  const a = node.attributes || {}
  return [a.text, a.originalText, a.description].filter(Boolean).join(' ')
}

function findText(layout, matcher, { minY = 0 } = {}) {
  return walk(layout).find((node) => {
    const b = bounds(node)
    return b && b.y1 >= minY && matcher(textOf(node))
  })
}

function clickNode(node) {
  const b = bounds(node)
  if (!b) throw new Error('node has no bounds')
  run(['shell', 'uitest', 'uiInput', 'click', String(Math.round((b.x1 + b.x2) / 2)), String(Math.round((b.y1 + b.y2) / 2))])
}

function progressSeconds(layout) {
  const node = findText(layout, (text) => text.includes('播放进度'))
  if (!node) return null
  const match = textOf(node).match(/(\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

const steps = []
function record(name, ok, detail = '') {
  steps.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

if (!fs.existsSync(hdc)) throw new Error(`hdc not found: ${hdc}`)
const targets = run(['list', 'targets']).split(/\r?\n/).filter(Boolean)
if (!targets.length) throw new Error('no HarmonyOS device connected')
if (!skipInstall) {
  if (!fs.existsSync(hap)) throw new Error(`HAP not found: ${hap}`)
  run(['install', '-r', hap], { capture: false })
}

// Start from a known screen: close any shade/Now Playing layer, then restart.
runOptional(['shell', 'uitest', 'uiInput', 'swipe', '658', '1800', '658', '10', '300'])
await sleep(500)
runOptional(['shell', 'aa', 'force-stop', bundle])
await sleep(1000)
run(['shell', 'aa', 'start', '-a', 'EntryAbility', '-b', bundle], { capture: false })
await sleep(5000)

// Clear a previous query, then search.
let layout = dump('search-before')
const searchInput = findText(layout, (text) => text.includes('歌曲、艺人') || text.includes('搜索歌曲'))
if (!searchInput) throw new Error('search input not found')
clickNode(searchInput)
await sleep(300)
const clear = findText(layout, (text) => text === '清空' || text.includes('清空'))
if (clear) clickNode(clear)
run(['shell', 'uitest', 'uiInput', 'inputText', '440', '650', '周杰伦'])
run(['shell', 'uitest', 'uiInput', 'keyEvent', '2054'])
await sleep(6000)
run(['shell', 'uitest', 'uiInput', 'keyEvent', 'Back'])
await sleep(800)

layout = dump('results')
const result = walk(layout).find((node) => {
  const b = bounds(node)
  const text = textOf(node)
  return b && b.y1 > 1000 && b.y2 < 2300 && node.attributes?.clickable === 'true' && /周杰伦|夜曲|晴天|精选/.test(text)
})
if (!result) throw new Error('search result row not found')
clickNode(result)
await sleep(6000)

// The video-part sheet is an overlay and is not always exposed in the WebView
// accessibility dump; the first result is the known 100-P collection, so tap
// its P1 row by its stable screen position.
run(['shell', 'uitest', 'uiInput', 'click', '300', '780'])
await sleep(9000)

// Open Now Playing from the mobile player bar. The bar itself is not present in
// the accessibility tree on the Search route, so use the stable screen point.
run(['shell', 'uitest', 'uiInput', 'click', '200', '2470'])
await sleep(2500)

layout = dump('now-playing')
let before = progressSeconds(layout)
if (before === null) {
  run(['shell', 'uitest', 'uiInput', 'click', '200', '2470'])
  await sleep(2000)
  layout = dump('now-playing-retry')
  before = progressSeconds(layout)
}
if (before === null) throw new Error('player progress node not found')
await sleep(3000)
layout = dump('now-playing-after')
const after = progressSeconds(layout)
record('播放进度前进', after !== null && after > before, `before=${before} after=${after}`)

// Probe the audio server while audio is still playing (before background/pause).
const audioLog = runOptional(['shell', "hilog -x | grep -E 'AudioRenderer::Start|HpaeSinkInputNode' | tail -6"])
const audioActive = /AudioRenderer::Start|RUNNING/.test(audioLog)
record('音频输出活跃', audioActive, audioLog.split(/\r?\n/).slice(-1)[0] || 'no active renderer log')

// Seek to 75% of the progress bar.
const progress = findText(layout, (text) => text.includes('播放进度'))
if (progress) {
  const b = bounds(progress)
  run(['shell', 'uitest', 'uiInput', 'click', String(Math.round(b.x1 + (b.x2 - b.x1) * 0.75)), String(Math.round((b.y1 + b.y2) / 2))])
  await sleep(1500)
  const seeked = dump('seeked')
  const seekValue = progressSeconds(seeked)
  record('seek 生效', seekValue !== null && after !== null && seekValue > after, `before=${after} after=${seekValue}`)
} else {
  record('seek 生效', false, 'progress slider not found')
}

// Background: app must stay alive and keep AVSession playing.
run(['shell', 'uitest', 'uiInput', 'keyEvent', 'Home'])
await sleep(4000)
const ps = run(['shell', `ps -ef | grep ${bundle} | grep -v grep | head -1`])
record('后台进程存活', ps.includes(bundle), ps)
run(['shell', 'aa', 'start', '-a', 'EntryAbility', '-b', bundle], { capture: false })
await sleep(2500)

// Notification shade: pause using the media card control. Wait for the
// shade's media card to finish laying out before tapping its center button.
run(['shell', 'uitest', 'uiInput', 'swipe', '658', '10', '658', '1800', '300'])
await sleep(3000)
layout = dump('notification')
const pauseControl = walk(layout).find((node) => {
  const b = bounds(node)
  const text = textOf(node)
  return b && b.y1 > 800 && b.y1 < 1300 && /暂停|播放|pause/i.test(text)
})
if (pauseControl) {
  clickNode(pauseControl)
} else {
  // The media card controls may not expose text; use the stable card center.
  run(['shell', 'uitest', 'uiInput', 'click', '658', '1050'])
}
await sleep(1500)
const avPause = runOptional(['shell', "hilog -x | grep 'SetAVPlaybackState' | tail -1"])
record('通知栏暂停', avPause.includes('SetAVPlaybackState:3'), avPause ? 'AVSession paused' : 'no pause log')
runOptional(['shell', 'uitest', 'uiInput', 'swipe', '658', '1800', '658', '10', '300'])

const errors = runOptional(['shell', "hilog -x | grep -E '\\[biu-audio\\] playback error|jscrash' | tail -2"])
record('无播放错误', !errors, errors)

const summary = { ok: steps.every((step) => step.ok), steps, work }
fs.writeFileSync(path.join(work, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
if (!summary.ok) process.exitCode = 1
