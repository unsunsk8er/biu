import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temp = path.join(root, '.android-tools', 'tmp')
fs.mkdirSync(temp, { recursive: true })

const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const result = spawnSync(process.execPath, [vite, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    BIU_HARMONY: '1',
    TEMP: temp,
    TMP: temp,
  },
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
