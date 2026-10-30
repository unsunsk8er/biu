import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

/**
 * Android real-device smoke test. Run only when an Android phone/emulator is
 * connected. The APK is signed by the local release key, so an older
 * verification/debug-signed install must be uninstalled first.
 *
 * Usage:
 *   npm run smoke:android
 *   npm run smoke:android -- --skip-install
 */
const root = process.cwd()
const adb = process.env.ADB || path.join(root, '.android-tools', 'sdk', 'platform-tools', 'adb.exe')
const apk = process.env.BIU_ANDROID_APK || path.join(root, 'release', 'biu-2.0.0-android.apk')
const bundle = 'com.unsunsk8er.biu'
const work = path.join(root, '.archive', 'android-smoke')
const skipInstall = process.argv.includes('--skip-install')
fs.mkdirSync(work, { recursive: true })
const adbHome = path.join(root, '.android-tools', 'android-home')
const adbTmp = path.join(root, '.android-tools', 'tmp')
fs.mkdirSync(adbHome, { recursive: true })
fs.mkdirSync(adbTmp, { recursive: true })
const env = {
  ...process.env,
  HOME: adbHome,
  USERPROFILE: adbHome,
  ANDROID_USER_HOME: adbHome,
  TEMP: adbTmp,
  TMP: adbTmp,
}

function run(args, { capture = true } = {}) {
  const result = spawnSync(adb, args, {
    encoding: capture ? 'utf8' : undefined,
    windowsHide: true,
    env,
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`adb ${args.join(' ')} failed (${result.status}): ${result.stderr || ''}`)
  }
  return capture ? `${result.stdout || ''}${result.stderr || ''}`.trim() : ''
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!fs.existsSync(adb)) throw new Error(`adb not found: ${adb}`)
const devices = run(['devices'])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => /^\S+\s+device(\s|$)/.test(line))
if (!devices.length) throw new Error('no Android device/emulator connected')
if (!skipInstall) {
  if (!fs.existsSync(apk)) throw new Error(`APK not found: ${apk}`)
  run(['install', '-r', apk], { capture: false })
}

run(['shell', 'monkey', '-p', bundle, '-c', 'android.intent.category.LAUNCHER', '1'], { capture: false })
await sleep(5000)
const pid = run(['shell', 'pidof', bundle]).trim()
if (!pid) throw new Error('Android app process not found')

const logcat = run(['logcat', '-d', '-t', '300'])
const fatal = logcat.split(/\r?\n/).filter((line) => /FATAL EXCEPTION|AndroidRuntime.*FATAL/.test(line))
if (fatal.length) throw new Error(`Android fatal log: ${fatal.slice(0, 3).join(' | ')}`)

const screenshot = path.join(work, 'screen.png')
const shot = spawnSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024, windowsHide: true, env })
if (shot.status === 0 && shot.stdout?.length) fs.writeFileSync(screenshot, shot.stdout)

const summary = { ok: true, bundle, apk: skipInstall ? null : path.relative(root, apk), pid, screenshot: path.relative(root, screenshot) }
fs.writeFileSync(path.join(work, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
