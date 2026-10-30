import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const project = path.join(root, 'platform', 'HarmonyOSPhone')
const deveco = process.env.DEVECO_HOME || 'C:\\Program Files\\Huawei\\DevEco Studio'
const hvigor = path.join(deveco, 'tools', 'hvigor', 'bin', 'hvigorw.bat')

if (!fs.existsSync(hvigor)) {
  throw new Error(`hvigorw not found: ${hvigor}; set DEVECO_HOME`)
}

const env = {
  ...process.env,
  DEVECO_SDK_HOME: path.join(deveco, 'sdk'),
  JAVA_HOME: path.join(deveco, 'jbr'),
  PATH: [
    path.join(deveco, 'jbr', 'bin'),
    path.join(deveco, 'tools', 'node'),
    path.join(deveco, 'tools', 'hvigor', 'bin'),
    path.join(deveco, 'tools', 'ohpm', 'bin'),
    process.env.PATH || '',
  ].join(path.delimiter),
}

const result = spawnSync(
  hvigor,
  [
    '--mode',
    'module',
    '-p',
    'product=default',
    '-p',
    'module=entry@default',
    '-p',
    'buildMode=debug',
    'assembleHap',
    '--no-daemon',
  ],
  {
    cwd: project,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const output = path.join(project, 'entry', 'build', 'default', 'outputs', 'default')
const release = path.join(root, 'release')
fs.mkdirSync(release, { recursive: true })

for (const name of ['entry-default-signed.hap', 'entry-default-unsigned.hap']) {
  const source = path.join(output, name)
  if (!fs.existsSync(source)) continue
  const suffix = name.includes('signed') ? 'signed' : 'unsigned'
  const target = path.join(release, `biu-2.0.0-harmony-phone-${suffix}.hap`)
  fs.copyFileSync(source, target)
  console.log(`artifact: ${target}`)
}
