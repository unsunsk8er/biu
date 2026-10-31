import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const androidRoot = path.join(root, 'android')
const assetsDir = path.join(androidRoot, 'app', 'src', 'main', 'assets', 'www')

// Build the renderer bundle without touching the Electron package.
execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
  cwd: root,
  stdio: 'inherit',
})

fs.rmSync(assetsDir, { recursive: true, force: true })
fs.mkdirSync(assetsDir, { recursive: true })
fs.cpSync(path.join(root, 'dist'), assetsDir, { recursive: true })
fs.copyFileSync(
  path.join(root, 'electron', 'icon.png'),
  path.join(androidRoot, 'app', 'src', 'main', 'res', 'drawable', 'ic_launcher.png'),
)
console.log(`Android web assets prepared: ${path.relative(root, assetsDir)}`)
