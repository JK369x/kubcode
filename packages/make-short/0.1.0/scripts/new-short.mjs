// new-short.mjs: start a new Short. Copies the engine and the template into a new project folder.
//   node new-short.mjs "Why the sky is blue" --style flat
//   node new-short.mjs "How a zipper works" --style blueprint --seconds 20 --dir D:\shorts
// --style    one engine style (run without --style to list them)
// --seconds  length, 8-25 (default 20)
// --dir      parent folder (default: the current folder); the project goes in <dir>\<slug>
// Never overwrites: refuses if the project folder already has files.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = path.resolve(opt('engine', path.join(SKILL, 'engine'))), TPL = path.join(SKILL, 'template');
const fail = m => { console.error('ERROR: ' + m); process.exit(2); };

if (!fs.existsSync(path.join(ENGINE, 'render.mjs'))) fail(`no engine in ${ENGINE}. The skill folder is incomplete: copy the whole make-short folder again.`);
const styles = fs.readdirSync(path.join(ENGINE, 'styles')).map(f => /^(\d\d)-([a-z0-9]+)\.js$/.exec(f)).filter(Boolean).map(m => ({ id: m[2], file: `styles/${m[0]}` }));
const title = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));
const style = styles.find(s => s.id === opt('style', ''));
if (!title || !style) { console.log('usage: node new-short.mjs "<title>" --style <style> [--seconds 20] [--dir <parent folder>]\nstyles: ' + styles.map(s => s.id).join(', ')); process.exit(2); }
const seconds = Math.round(+opt('seconds', 20));
if (!(seconds >= 8 && seconds <= 25)) fail('--seconds must be 8 to 25 (the story rules cap a Short at 25 s)');

const slug = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'short';
const dir = path.resolve(opt('dir', '.'), slug);
if (fs.existsSync(dir) && fs.readdirSync(dir).length) fail(`${dir} already has files. Pick another title or folder; nothing was changed.`);

const skip = new Set(['out', 'stills', 'node_modules']);
fs.cpSync(ENGINE, dir, { recursive: true, filter: s => !skip.has(path.basename(s)) || path.dirname(s) !== ENGINE });
// the story starts as a copy of the template example (core/scene.js + kit-defaults.js); step 4 rewrites it for the new idea
const EX = path.join(TPL, 'example'), sceneSrc = path.join(EX, 'scenes', 'example', `${style.id}.js`);
for (const f of fs.readdirSync(path.join(EX, 'core'))) fs.copyFileSync(path.join(EX, 'core', f), path.join(dir, 'core', f));
fs.mkdirSync(path.join(dir, 'scenes', slug), { recursive: true });
const hasScene = fs.existsSync(sceneSrc);
if (hasScene) fs.copyFileSync(sceneSrc, path.join(dir, 'scenes', slug, `${style.id}.js`));
for (const f of ['story.md', 'upload-checklist.md']) fs.writeFileSync(path.join(dir, f), fs.readFileSync(path.join(TPL, f), 'utf8').replaceAll('{{TITLE}}', title).replaceAll('{{STYLE}}', style.id).replaceAll('{{SECONDS}}', String(seconds)));
const frames = seconds * 30;
fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ name: title, story: slug, fps: 30, frames, W: 1920, H: 1920, handle: 8,
  styles: [{ id: style.id, file: style.file, start: 0, end: frames }], transitions: [] }, null, 2));
fs.writeFileSync(path.join(dir, 'short.json'), JSON.stringify({ title, slug, style: style.id, seconds, created: new Date().toISOString(), skill: 'make-short 1' }, null, 2));
fs.mkdirSync(path.join(dir, 'review'), { recursive: true }); fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
fs.writeFileSync(path.join(dir, 'receipt.json'), '[]');

console.log(`NEW SHORT  ${dir}`);
console.log(`  title "${title}", style ${style.id}, ${seconds} s (${frames} frames)`);
console.log(`  story code: core\\scene.js and scenes\\${slug}\\${style.id}.js` + (hasScene ? '' : `  <- not written yet: see references/style-catalogue.md (${style.id}) and scenes\\door\\${style.id}.js`));
console.log('  next: write story.md (the beat sheet) and show it to the user');
