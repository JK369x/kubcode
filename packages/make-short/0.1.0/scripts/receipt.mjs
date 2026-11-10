// receipt.mjs: the honest receipt for a Short: render minutes, how many renders, and the output files.
//   node receipt.mjs D:\shorts\why-the-sky-is-blue        prints it and writes receipt.md
// Reads receipt.json (render-short.mjs and sheet.mjs append to it). Claude's own usage is not measured here.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';

const dir = path.resolve(process.argv[2] || '.');
try {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'short.json'), 'utf8'));
  const list = fs.existsSync(path.join(dir, 'receipt.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json'), 'utf8')) : [];
  const by = {}; for (const e of list) { const k = by[e.kind] || (by[e.kind] = { n: 0, s: 0 }); k.n++; k.s += e.seconds; }
  const total = list.reduce((a, e) => a + e.seconds, 0), mins = s => (s / 60).toFixed(1);
  const story = fs.existsSync(path.join(dir, 'story.md')) ? fs.readFileSync(path.join(dir, 'story.md'), 'utf8') : '';
  const said = k => (new RegExp(k + '[^:\\n]*:[ \\t]*(\\S[^\\n]*)').exec(story) || [])[1] || 'not recorded';   // only what story.md records
  const files = [];
  for (const sub of ['out', 'review']) {
    const d = path.join(dir, sub); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter(f => /\.(mp4|png|md)$/.test(f)).sort()) {
      const p = path.join(d, f), mb = (fs.statSync(p).size / 1048576).toFixed(1);
      const dur = f.endsWith('.mp4') ? +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' }).stdout : 0;
      files.push(`| ${sub}/${f} | ${mb} MB | ${dur ? dur.toFixed(1) + ' s' : ''} |`);
    }
  }
  const md = [`# Receipt: ${meta.title}`, '', `Style: ${meta.style}. Started ${new Date(meta.created).toLocaleString()}.`, '',
    `- Render time on this PC: **${mins(total)} min** in **${list.length} renders**`,
    ...Object.entries(by).map(([k, v]) => `  - ${k}: ${v.n} x, ${mins(v.s)} min`),
    `- Full renders (both formats each): ${by['full render']?.n || 0}`,
    '- Paid services called by the scripts: none (no API keys). Uploaded: nothing.',
    `- Story approved by the user: ${said('Story approved')}`, `- Storyboard approved ("approve"): ${said('Storyboard approved')}`, '',
    '| file | size | length |', '|---|---|---|', ...files, ''].join('\n');
  fs.writeFileSync(path.join(dir, 'receipt.md'), md);
  console.log(md);
} catch (e) { console.error('ERROR: ' + e.message); process.exit(2); }
