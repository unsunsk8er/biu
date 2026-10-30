import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'dist-harmony')
const target = path.join(
  root,
  'platform',
  'HarmonyOSPhone',
  'entry',
  'src',
  'main',
  'resources',
  'rawfile',
  'www',
)

if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error('dist/index.html not found; run npm run build first')
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })
console.log(`copied ${source} -> ${target}`)
