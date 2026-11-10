// qa-loop.mjs: loop check. When the Short replays, does the last frame flow into the first like a normal frame step?
//   node qa-loop.mjs out\short-9x16.mp4
// --k 2.5      pass when the jump last->first is at most k times a normal drawing step near the two ends (80th percentile of 20 steps)
// --png FILE   picture: last | first | difference x4 (default: <video>-loop.png next to the video)
// Exit code: 0 pass, 1 fail, 2 error.
import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
import { greyFrames, change, arialOpt } from './lib/video.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const video = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));
if (!video) { console.log('usage: node qa-loop.mjs <video.mp4> [--k 2.5] [--png loop.png]'); process.exit(2); }

try {
  const K = +opt('k', 2.5), { W, H, frames } = await greyFrames(video), n = frames.length;
  if (n < 24) throw new Error(`only ${n} frames: too short for a loop check`);
  const near = [];
  for (let i = 1; i <= 10; i++) near.push(change(frames[i - 1], frames[i], W, H), change(frames[n - 1 - i], frames[n - i], W, H));
  // a typical DRAWING step: on twos (and with line boil) half the steps are near zero, so take the 80th percentile, not the median
  const med = k => near.map(x => x[k]).sort((a, b) => a - b)[15];
  const base = { g: Math.max(med('g'), 0.5), blk: Math.max(med('blk'), 4) }, seam = change(frames[n - 1], frames[0], W, H);
  const rg = seam.g / base.g, rb = seam.blk / base.blk, ok = rg <= K && rb <= K;

  const png = opt('png', video.replace(/\.[^.]+$/, '') + '-loop.png'), F = arialOpt();
  const lab = t => `drawtext=${F}text='${t}':x=10:y=8:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.6`;
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', video, '-filter_complex',
    `[0:v]select='eq(n\\,${n - 1})',setpts=PTS-STARTPTS,scale=-2:480,format=rgb24,split[l1][l2];[1:v]select='eq(n\\,0)',setpts=PTS-STARTPTS,scale=-2:480,format=rgb24,split[f1][f2];` +
    `[l2]format=gray[lg];[f2]format=gray[fg];[lg][fg]blend=all_mode=difference,lut=c0='min(val*4\\,255)',format=rgb24,${lab('DIFF x4')}[d];` +
    `[l1]format=rgb24,${lab('LAST f' + (n - 1))}[a];[f1]format=rgb24,${lab('FIRST f0')}[b];[a][b][d]hstack=3`, '-frames:v', '1', png]);

  console.log(`LOOP  ${video}  ${n} frames`);
  console.log(`  last -> first change ${seam.g.toFixed(1)} (worst block ${seam.blk.toFixed(0)})`);
  console.log(`  normal step near the ends ${base.g.toFixed(1)} (worst block ${base.blk.toFixed(0)})  ->  ${rg.toFixed(1)}x / ${rb.toFixed(1)}x  (limit ${K}x)`);
  if (fs.existsSync(png)) console.log(`  picture (last | first | difference): ${png}`);
  console.log(ok ? 'PASS: the loop joins like a normal frame step' : 'FAIL: visible jump when the Short loops. Make the last frames move into frame 0 (same pose, same camera).');
  process.exit(ok ? 0 : 1);
} catch (e) { console.error('ERROR: ' + e.message); process.exit(2); }
