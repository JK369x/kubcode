// qa-pops.mjs: frame-difference pop detector. A "pop" is a frame that changes much more than the frames around it.
// It flags every pop that is NOT on an allowed frame (bonks, seams, cuts you planned) and saves a picture of each one.
//
//   node qa-pops.mjs out\marathon-9x16.mp4 --allow 35,95,155 --timeline timeline.json
//   node qa-pops.mjs out\part-100-200-16x9.mp4            (frame numbers are read from the "part-FROM-TO" name)
//
// --allow 35,95,50-58   allowed master frames or ranges; each gets +-tol frames (default --tol 3)
// --timeline FILE       also allows every seam in that timeline (boundary-handle .. boundary+handle-1)
// --offset N            master frame number of the video's first frame (default: from the file name, else 0)
// --min-blk 30          the worst 16x16 block must change at least this much (0-255); boil and grain stay below it
// --k 3                 how many times above the local average counts as a pop (lower = stricter)
// --unique 1.5          and how many times bigger than any other spike within 12 frames (boil cycles, blinks and fast moves repeat; pops don't)
// --sheet FILE          picture of each unexpected pop, before | after (default: <video>-pops.png next to the video)
// --cut 40              a change this big (0-255) in ONE frame is a hard cut: warned even on allowed frames
// Exit code: 0 pass, 1 unexpected pops, 2 error.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawnSync } from 'node:child_process';
import { greyFrames, change, arialOpt } from './lib/video.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const video = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));
if (!video) { console.log('usage: node qa-pops.mjs <video.mp4> [--allow 35,95,50-58] [--timeline timeline.json] [--tol 2] [--offset N] [--k 3]'); process.exit(2); }

try {
  const m = /part-(\d+)-\d+-/.exec(path.basename(video));
  const off = +opt('offset', m ? m[1] : 0), tol = +opt('tol', 3), K = +opt('k', 3);   // tol 3: the hero's eyes lead each beat by 3 frames
  // a pop needs a strong LOCAL change (worst block >= min-blk): an even shimmer over the whole frame (line boil, grain) is not a pop
  const MIN = { g: +opt('min-g', 2.5), blk: +opt('min-blk', 30) }, FLOOR = { g: 0.5, blk: 3 }, WIN = 6, CUT = +opt('cut', 40), UNIQ = +opt('unique', 1.5);
  const allowed = [];                                                     // [from, to, why] in master frames
  for (const tok of String(opt('allow', '')).split(',').map(s => s.trim()).filter(Boolean)) {
    const [a, b] = tok.split('-').map(Number);
    if (Number.isNaN(a) || (b !== undefined && Number.isNaN(b))) throw new Error('bad --allow item: ' + tok);
    allowed.push([a - tol, (b ?? a) + tol, 'allow ' + tok]);
  }
  const tlFile = opt('timeline', null);
  if (tlFile) {
    const tl = JSON.parse(fs.readFileSync(tlFile, 'utf8')), h = tl.handle || 8;
    for (const t of tl.transitions || []) allowed.push([t.boundary - h - tol, t.boundary + h - 1 + tol, `seam ${t.id || ''}@${t.boundary}`.replace(' @', '@')]);
  }
  const why = f => (allowed.find(([a, b]) => f >= a && f <= b) || [])[2];

  const { W, H, fps, frames } = await greyFrames(video);
  const n = frames.length, d = [null];
  for (let i = 1; i < n; i++) d.push(change(frames[i - 1], frames[i], W, H));
  const spikes = [];
  for (let i = 1; i < n; i++) {
    let best = null;
    for (const key of ['g', 'blk']) {
      let s = 0, c = 0, m2 = 0;
      for (let j = i - WIN; j <= i + WIN; j++) if (j >= 1 && j < n && j !== i) { s += d[j][key]; c++; }
      // a pop is a UNIQUE jump: clearly bigger than every other spike within 12 frames (skipping i+-1, so pop-and-back still counts).
      // Repeating spikes are not pops: line boil cycles, blinks (close then open), the steps of a fast move on twos.
      for (let j = i - 12; j <= i + 12; j++) if (j >= 1 && j < n && Math.abs(j - i) > 1) m2 = Math.max(m2, d[j][key]);
      const ratio = d[i][key] / Math.max(c ? s / c : 0, FLOOR[key]);
      if (d[i].blk >= MIN.blk && d[i][key] >= MIN[key] && ratio >= K && d[i][key] >= UNIQ * m2 && (!best || ratio > best.ratio)) best = { key, ratio };
    }
    if (best) spikes.push({ f: i + off, i, ...d[i], ...best, why: why(i + off) });
  }
  // merge runs of neighbouring spike frames into one event
  const ev = [];
  for (const s of spikes) { const l = ev[ev.length - 1]; if (l && s.i - l.last.i <= 1) { l.last = s; if (s.ratio > l.top.ratio) l.top = s; l.why = l.why || s.why; } else ev.push({ first: s, last: s, top: s, why: s.why }); }
  const bad = ev.filter(e => !e.why);

  console.log(`POPS  ${video}  ${n} frames @ ${fps} fps, master frames ${off}-${off + n - 1}, ${allowed.length} allowed windows, k=${K}`);
  if (!ev.length) console.log('  no pops at all');
  for (const e of ev) {
    const r = e.first.f === e.last.f ? `f${e.first.f}` : `f${e.first.f}-${e.last.f}`;
    const cut = e.why && e.top.g >= CUT ? '  WARNING: hard cut (whole frame changed in one step)' : '';
    console.log(`  ${(e.why ? 'ok  ' : 'POP ').padEnd(5)}${r.padEnd(11)} change ${e.top.g.toFixed(1).padStart(5)} (worst block ${e.top.blk.toFixed(0).padStart(3)})  ${e.top.ratio.toFixed(1)}x local  ${e.why || '<- not allowed'}${cut}`);
  }

  if (bad.length) {
    const sheet = opt('sheet', video.replace(/\.[^.]+$/, '') + '-pops.png'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pops-')), parts = [];
    for (const e of bad.slice(0, 8)) {
      const i = e.top.i, out = path.join(tmp, `${parts.length}.png`);
      const lab = `drawtext=${arialOpt()}text='f%{eif\\:t*${fps}+${off}+0.5\\:d}':x=10:y=8:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.6`;
      const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vf', `select='eq(n\\,${i - 1})+eq(n\\,${i})',scale=-2:420,${lab},tile=2x1`, '-frames:v', '1', out]);
      if (!r.status && fs.existsSync(out)) parts.push(out);
    }
    if (parts.length === 1) fs.copyFileSync(parts[0], sheet);
    else if (parts.length > 1) spawnSync('ffmpeg', ['-y', '-v', 'error', ...parts.flatMap(p => ['-i', p]), '-filter_complex', parts.map((_, k) => `[${k}]`).join('') + `vstack=inputs=${parts.length}`, sheet]);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (fs.existsSync(sheet)) console.log(`  picture (before | after for each pop): ${sheet}`);
    console.log(`FAIL: ${bad.length} unexpected pop(s). Look at the picture; if a pop is planned (a bonk, a cut), add its frame to --allow.`);
    process.exit(1);
  }
  console.log(`PASS: no unexpected pops (${ev.length} on allowed frames)`);
} catch (e) { console.error('ERROR: ' + e.message); process.exit(2); }
