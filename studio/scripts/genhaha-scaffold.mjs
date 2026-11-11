import { access, mkdir, realpath } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const root = fileURLToPath(new URL('../', import.meta.url))
// The Genhaha kits are installed separately (not redistributed). Default: ~/Downloads/genhaha-<kind>-story;
// override with GENHAHA_HORROR_DIR / GENHAHA_MAP_DIR.
const kitDir = (kind, env) => process.env[env] || path.join(os.homedir(), 'Downloads', `genhaha-${kind}-story`)
const sources = {
  horror: path.join(kitDir('horror', 'GENHAHA_HORROR_DIR'), 'scripts/horror.mjs'),
  map: path.join(kitDir('map', 'GENHAHA_MAP_DIR'), 'scripts/map.mjs'),
}
const [kind, slug] = process.argv.slice(2)
if (!Object.hasOwn(sources, kind) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) {
  console.error('Usage: node scripts/genhaha-scaffold.mjs <horror|map> <lowercase-slug>')
  process.exit(2)
}
const source = sources[kind]
try { await access(source) } catch { console.error(`Source unavailable: ${source}`); process.exit(1) }
const base = path.join(root, 'outputs', 'genhaha-projects')
await mkdir(base, { recursive: true })
const actualBase = await realpath(base)
const actualRoot = await realpath(root)
if (!actualBase.startsWith(actualRoot + path.sep)) { console.error('Output directory is outside studio'); process.exit(1) }
const args = kind === 'horror' ? [source, 'new', slug, '--dir', actualBase] : [source, 'new', slug]
const child = spawn(process.execPath, args, { cwd: actualBase, stdio: 'inherit' })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
