// render-short.mjs: the full render of a Short, both formats in one pass, timed and logged for the receipt.
//   node render-short.mjs D:\shorts\why-the-sky-is-blue
// Runs the project's render.mjs, then names the videos out\<slug>-9x16.mp4 and out\<slug>-16x9.mp4, moves the
// engine's contact sheets to review\, and appends the render time to receipt.json.
// Exit code: 0 done, 1 the render reported errors (videos may still exist), 2 could not render.
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';

const dir = path.resolve(process.argv[2] || '.');
if (!fs.existsSync(path.join(dir, 'render.mjs'))) { console.error(`ERROR: ${dir} is not a Short project (no render.mjs). Use the folder new-short.mjs made.`); process.exit(2); }
const meta = fs.existsSync(path.join(dir, 'short.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'short.json'), 'utf8')) : { slug: path.basename(dir) };
const frames = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8')).frames;
const out = path.join(dir, 'out'), review = path.join(dir, 'review'); fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(review, { recursive: true });

console.log(`RENDER  ${meta.slug}: ${frames} frames, 9:16 + 16:9 (about ${Math.ceil(frames / 200)}-${Math.ceil(frames / 60)} min on a laptop)`);
const t0 = Date.now(); let errors = null, tail = '';
const code = await new Promise(res => {
  // --no-panels / --no-chip: the door film's storyboard-panel pass and chip version; a new story has neither (older engines ignore the flags)
  const p = spawn(process.execPath, ['render.mjs', '--no-panels', '--no-chip'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  const echo = d => { const s = String(d); tail = (tail + s).slice(-3000); process.stdout.write(s); const m = /errors (\d+)/.exec(s); if (m) errors = +m[1]; };
  p.stdout.on('data', echo); p.stderr.on('data', echo); p.on('close', res); p.on('error', e => { console.error(e.message); res(2); });
});
const secs = (Date.now() - t0) / 1000;
const fresh = f => fs.statSync(path.join(out, f)).mtimeMs >= t0 - 1000;
const made = fs.readdirSync(out).filter(f => fresh(f) && !f.startsWith(meta.slug + '-'));
const files = [];
for (const [tag, name] of [['9x16', `${meta.slug}-9x16.mp4`], ['16x9', `${meta.slug}-16x9.mp4`]]) {
  const src = made.find(f => f.endsWith(`${tag}.mp4`)); if (!src) continue;
  fs.renameSync(path.join(out, src), path.join(out, name)); files.push('out/' + name);
  const cs = made.find(f => f.endsWith(`contact-${tag}.png`)); if (cs) fs.renameSync(path.join(out, cs), path.join(review, `contact-${tag}.png`));   // the engine names it <film>-contact-<crop>.png
}
const log = path.join(dir, 'receipt.json'), list = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : [];
list.push({ at: new Date().toISOString(), kind: code || files.length < 2 ? 'failed render' : 'full render', seconds: +secs.toFixed(1), frames, errors, files });
fs.writeFileSync(log, JSON.stringify(list, null, 2));

console.log(`\nRENDERED in ${(secs / 60).toFixed(1)} min: ${files.join(', ') || 'no videos'}${files.length ? '  (contact sheets in review\\)' : ''}`);
if (code || files.length < 2) { console.error(`ERROR: the render stopped (exit ${code}). Last lines:\n${tail.slice(-800)}`); process.exit(2); }
if (errors) { console.log(`WARNING: ${errors} drawing error(s) during the render: a red FAILED panel is in the video. Fix the scene file, then render again.`); process.exit(1); }
