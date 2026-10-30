import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

/**
 * HarmonyOS device smoke test. Verifies the installed package can launch,
 * stays alive and renders the mobile shell. It intentionally avoids brittle
 * coordinate-based playback; playback is covered by unit tests for now.
 *
 * Usage:
 *   node scripts/smoke-harmony-device.mjs
 *   node scripts/smoke-harmony-device.mjs --skip-install
 *   node scripts/smoke-harmony-device.mjs --hap=release/xxx.hap
 */
const root = process.cwd()
const hdc = process.env.HDC || 'C:\\Program Files\\Huawei\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe'
const bundle = 'com.unsunsk8er.biu'
const hap = process.argv.find((arg) => arg.startsWith('--hap='))?.slice(6)
  || path.join(root, 'release', 'biu-2.0.0-harmony-phone-release.hap')
const skipInstall = process.argv.includes('--skip-install')
const target = process.env.BIU_HDC_TARGET
const work = path.join(root, '.archive', 'smoke')
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function collectText(node, out = []) {
  if (!node || typeof node !== 'object') return out
  const attrs = node.attributes || {}
  for (const value of [attrs.text, attrs.originalText, attrs.description]) {
    if (typeof value === 'string' && value.trim()) out.push(value)
  }
  for (const child of node.children || []) collectText(child, out)
  return out
}

if (!fs.existsSync(hdc)) throw new Error(`hdc not found: ${hdc}`)
if (!skipInstall && !fs.existsSync(hap)) throw new Error(`HAP not found: ${hap}`)

const targets = run(['list', 'targets']).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
if (targets.length === 0) throw new Error('no HarmonyOS device/emulator connected')
if (!skipInstall) {
  console.log(`[smoke] install ${path.relative(root, hap)}`)
  run(['install', '-r', hap], { capture: false })
}

console.log('[smoke] launch')
run(['shell', 'aa', 'start', '-a', 'EntryAbility', '-b', bundle], { capture: false })
await sleep(6000)

const processes = run(['shell', `ps -ef | grep ${bundle} | grep -v grep | head -2`])
if (!processes.includes(bundle)) throw new Error('app process not found after launch')

const remoteDump = '/data/local/tmp/biu-smoke-layout.json'
run(['shell', 'uitest', 'dumpLayout', '-p', remoteDump])
const localDump = path.join(work, 'layout.json')
run(['file', 'recv', remoteDump, localDump])
const layout = JSON.parse(fs.readFileSync(localDump, 'utf8'))
const text = collectText(layout)
const expected = ['搜索', '歌单', '设置', '正在播放']
if (!expected.some((word) => text.includes(word))) {
  throw new Error(`mobile shell not visible; texts=${text.slice(0, 20).join(' | ')}`)
}

const summary = {
  ok: true,
  bundle,
  hap: skipInstall ? null : path.relative(root, hap),
  process: processes.split(/\r?\n/)[0] || '',
  matchedText: expected.find((word) => text.includes(word)),
  dump: path.relative(root, localDump),
}
console.log(JSON.stringify(summary, null, 2))
