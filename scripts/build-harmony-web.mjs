import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'biu-harmony-'))

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

fs.rmSync(temp, { recursive: true, force: true })

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
