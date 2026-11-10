// video.mjs: read a video as small grey frames through ffmpeg, and measure frame-to-frame change.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

export function probe(file) {
  if (!fs.existsSync(file)) throw new Error('video not found: ' + file);
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' });
  if (r.error) throw new Error('ffprobe not found: install ffmpeg and make sure "ffmpeg -version" works in a new terminal');
  if (r.status) throw new Error('ffprobe could not read ' + file + '\n' + r.stderr);
  const s = JSON.parse(r.stdout).streams[0], [a, b] = s.r_frame_rate.split('/').map(Number);
  return { w: s.width, h: s.height, fps: a / (b || 1) };
}

// Decode every frame, scaled so the long side is `long` px, 8-bit grey. Resolves to { W, H, fps, frames: [Uint8Array] }.
export function greyFrames(file, long = 320) {
  const { w, h, fps } = probe(file), k = long / Math.max(w, h);
  const W = Math.max(2, Math.round(w * k / 2) * 2), H = Math.max(2, Math.round(h * k / 2) * 2), N = W * H;
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-an', '-sn', '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const frames = []; let cur = Buffer.alloc(0), err = '';
    p.stdout.on('data', d => { cur = cur.length ? Buffer.concat([cur, d]) : d; while (cur.length >= N) { frames.push(new Uint8Array(cur.subarray(0, N))); cur = cur.subarray(N); } });
    p.stderr.on('data', d => { err += d; });
    p.on('error', () => rej(new Error('ffmpeg not found: install ffmpeg and make sure "ffmpeg -version" works in a new terminal')));
    p.on('close', c => c ? rej(new Error('ffmpeg failed on ' + file + '\n' + err.slice(-600))) : res({ W, H, fps, frames }));
  });
}

// Change between two grey frames, 0..255: g = mean over the whole frame, blk = the worst 16x16 block (catches small pops).
export function change(a, b, W, H, B = 16) {
  let tot = 0, blk = 0;
  for (let by = 0; by < H; by += B) for (let bx = 0; bx < W; bx += B) {
    let s = 0, n = 0;
    for (let y = by; y < Math.min(by + B, H); y++) { const o = y * W; for (let x = bx; x < Math.min(bx + B, W); x++) { s += Math.abs(a[o + x] - b[o + x]); n++; } }
    tot += s; if (s / n > blk) blk = s / n;
  }
  return { g: tot / (W * H), blk };
}

export const arialOpt = () => fs.existsSync('C:/Windows/Fonts/arial.ttf') ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : '';
