// qa.mjs: every automatic pass/fail check for a rendered Short, in one go. Writes review\qa.md.
//   node qa.mjs D:\shorts\why-the-sky-is-blue
// Checks: format (size, 30 fps, <= 25 s) of both videos, pops in both crops (planned pops come from beats(tl).pops in
// core/scene.js, seams from timeline.json), the loop (9:16), and text in the safe area. The eye checks from
// references/qa-checklist.md are copied into qa.md for Claude to answer yes/no after looking at the sheets.
// Exit code: 0 all automatic checks pass, 1 something failed, 2 error.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { openEngine } from './lib/page.mjs';
import { probe } from './lib/video.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), dir = path.resolve(process.argv[2] || '.');
try {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'short.json'), 'utf8')), tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const vid = { '9x16': path.join(dir, 'out', `${meta.slug}-9x16.mp4`), '16x9': path.join(dir, 'out', `${meta.slug}-16x9.mp4`) };
  for (const v of Object.values(vid)) if (!fs.existsSync(v)) throw new Error(`${v} not found: render first (render-short.mjs)`);
  const rows = [], log = [], add = (check, ok, detail) => rows.push({ check, ok, detail });
  for (const f of ['pops-9x16.png', 'pops-16x9.png', 'loop.png']) fs.rmSync(path.join(dir, 'review', f), { force: true });   // no stale pictures from an earlier run

  // planned pops: the same story file that drives the picture says where the bonks and cuts are
  let allow = [...(meta.allowPops || [])];
  const P = await openEngine(dir);
  try { allow.push(...(await P.pg.evaluate(async () => { const tl = await (await fetch('timeline.json')).json(), m = await import('./core/scene.js'), B = m.beats ? m.beats(tl) : {}; return [...(B.pops || []), ...(B.bonks || [])]; }))); }
  catch (e) { console.log('WARNING: could not read the planned pops from core/scene.js (' + e.message.split(/\r?\n/)[0].slice(0, 160) + '); every pop will count'); }
  finally { await P.close(); }

  for (const [tag, v] of Object.entries(vid)) {
    const { w, h, fps } = probe(v), dur = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v], { encoding: 'utf8' }).stdout;
    const want = tag === '9x16' ? [1080, 1920] : [1920, 1080];
    add(`format ${tag}`, w === want[0] && h === want[1] && Math.round(fps) === 30 && dur <= 25.1, `${w}x${h}, ${fps.toFixed(2)} fps, ${dur.toFixed(1)} s (want ${want.join('x')}, 30 fps, 25 s or less)`);
  }
  const run = (name, args) => {
    const r = spawnSync(process.execPath, [path.join(HERE, name), ...args], { encoding: 'utf8', cwd: dir });
    const text = (r.stdout || '') + (r.stderr || ''); log.push(text.trim()); console.log(text.trim());
    return { code: r.status, last: text.trim().split('\n').pop() };
  };
  const al = allow.length ? ['--allow', [...new Set(allow.map(Math.round))].sort((a, b) => a - b).join(',')] : [];
  for (const tag of ['9x16', '16x9']) {
    const r = run('qa-pops.mjs', [vid[tag], '--timeline', path.join(dir, 'timeline.json'), '--sheet', path.join(dir, 'review', `pops-${tag}.png`), ...al]);
    add(`pops ${tag}`, r.code === 0, r.last + (r.code === 1 ? ` (picture: review/pops-${tag}.png)` : ''));
  }
  const lp = run('qa-loop.mjs', [vid['9x16'], '--png', path.join(dir, 'review', 'loop.png')]);
  add('loop 9x16', lp.code === 0, lp.last + ' (picture: review/loop.png)');
  const tx = run('qa-text.mjs', ['--root', dir]);
  add('text in safe area', tx.code === 0, tx.last);

  const checklist = fs.readFileSync(path.join(HERE, '..', 'references', 'qa-checklist.md'), 'utf8');
  const eyes = (checklist.split('## Eye checks')[1] || '').split('\n## ')[0].split('\n').filter(l => l.startsWith('- [ ]'));
  const failed = rows.filter(r => !r.ok).length;
  const md = [`# QA: ${meta.title}`, '', `Run ${new Date().toLocaleString()}. Automatic checks: ${failed ? `**${failed} FAILED**` : 'all PASS'}.`, '',
    '| check | result | detail |', '|---|---|---|', ...rows.map(r => `| ${r.check} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '/')} |`), '',
    '## Eye checks (answer yes/no after looking at review/contact-9x16.png, review/storyboard.png and any pop pictures)', '', ...eyes, '',
    '## Tool output', '', '```', ...log, '```', ''].join('\n');
  fs.writeFileSync(path.join(dir, 'review', 'qa.md'), md);
  console.log(`\nQA ${failed ? `FAIL: ${failed} automatic check(s) failed` : 'PASS: all automatic checks pass'}  ->  ${path.join(dir, 'review', 'qa.md')}`);
  process.exit(failed ? 1 : 0);
} catch (e) { console.error('ERROR: ' + e.message); process.exit(2); }
