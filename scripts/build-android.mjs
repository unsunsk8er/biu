import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Android 构建入口：解析 Gradle 位置后执行 assembleDebug / assembleRelease。
 *
 * 仓库不携带 Gradle Wrapper，也没有把 Android SDK 路径写死，因此这里按以下顺序查找：
 *   1. BIU_GRADLE 环境变量（任意自定义路径）
 *   2. 仓库内 .android-tools/gradle/<version>/bin/gradle
 *   3. PATH 中的 gradle
 */
const root = process.cwd()
const androidRoot = path.join(root, 'android')
const task = process.argv[2] || 'assembleDebug'

function gradleCandidates() {
  const exe = process.platform === 'win32' ? 'gradle.bat' : 'gradle'
  const local = path.join(root, '.android-tools', 'gradle', 'gradle-8.7', 'bin', exe)
  return [
    process.env.BIU_GRADLE,
    local,
    exe,
  ].filter(Boolean)
}

function resolveGradle() {
  for (const candidate of gradleCandidates()) {
    if (candidate === 'gradle' || candidate === 'gradle.bat') return candidate
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

if (!fs.existsSync(path.join(androidRoot, 'app', 'build.gradle.kts'))) {
  console.error('未找到 android/app/build.gradle.kts，请在仓库根目录运行。')
  process.exit(1)
}

// 本地工具链自动发现：JDK/SDK/Gradle 放在 .android-tools 时无需手动导出环境变量。
const localTools = path.join(root, '.android-tools')
const localJdk = path.join(localTools, 'jdk17')
const localSdk = path.join(localTools, 'sdk')
const localAndroidHome = path.join(localTools, 'android-home')
const localGradleHome = path.join(localTools, 'gradle-home')
const localTmp = path.join(localTools, 'tmp')
const buildEnv = { ...process.env }

if (!buildEnv.JAVA_HOME && fs.existsSync(path.join(localJdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) {
  buildEnv.JAVA_HOME = localJdk
}
if (!buildEnv.ANDROID_HOME && fs.existsSync(path.join(localSdk, 'platforms', 'android-34'))) {
  buildEnv.ANDROID_HOME = localSdk
  buildEnv.ANDROID_SDK_ROOT = localSdk
}
if (!buildEnv.ANDROID_USER_HOME && fs.existsSync(localSdk)) {
  fs.mkdirSync(localAndroidHome, { recursive: true })
  buildEnv.ANDROID_USER_HOME = localAndroidHome
}
if (!buildEnv.GRADLE_USER_HOME && fs.existsSync(localTools)) {
  fs.mkdirSync(localGradleHome, { recursive: true })
  buildEnv.GRADLE_USER_HOME = localGradleHome
}
// 受限环境（如 DSH 沙箱）里系统临时目录可能不可写；本地工具链存在时统一用工作区临时目录。
if (fs.existsSync(localTools)) {
  fs.mkdirSync(localTmp, { recursive: true })
  buildEnv.TEMP = localTmp
  buildEnv.TMP = localTmp
}
if (buildEnv.ANDROID_HOME) {
  const localProperties = path.join(androidRoot, 'local.properties')
  let currentSdk = ''
  try {
    const match = fs.readFileSync(localProperties, 'utf8').match(/^sdk\.dir=(.*)$/m)
    currentSdk = match ? match[1].trim() : ''
  } catch {
    // 文件不存在时按空处理
  }
  const resolvedSdk = currentSdk
    ? (path.isAbsolute(currentSdk) ? currentSdk : path.resolve(androidRoot, currentSdk))
    : ''
  if (!resolvedSdk || !fs.existsSync(resolvedSdk)) {
    fs.writeFileSync(localProperties, `sdk.dir=${buildEnv.ANDROID_HOME.replace(/\\/g, '/')}\n`)
  }
}

if (!fs.existsSync(path.join(androidRoot, 'local.properties')) && !buildEnv.ANDROID_HOME && !buildEnv.ANDROID_SDK_ROOT) {
  console.warn('提示：android/local.properties 不存在且未设置 ANDROID_HOME，Gradle 可能找不到 Android SDK。')
}

const gradle = resolveGradle()
if (!gradle) {
  console.error(
    '未找到 Gradle。请安装 Gradle 8.7 并加入 PATH，或设置 BIU_GRADLE，\n' +
    '或把 Gradle 解压到 .android-tools/gradle/gradle-8.7/ 后重试。',
  )
  process.exit(1)
}

console.log(`[android] gradle=${gradle} task=:app:${task}`)
console.log(`[android] java=${buildEnv.JAVA_HOME || 'system'} sdk=${buildEnv.ANDROID_HOME || 'local.properties'}`)
const result = spawnSync(gradle, ['-p', 'android', `:app:${task}`], {
  stdio: 'inherit',
  cwd: root,
  env: buildEnv,
  // Node 20+ 在 Windows 上禁止直接 spawn .bat/.cmd（EINVAL），必须交给 cmd.exe。
  shell: process.platform === 'win32',
  windowsHide: true,
})
if (result.error) {
  console.error(`[android] 启动 Gradle 失败：${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
