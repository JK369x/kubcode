// sheet.mjs: contact sheets for review.
//   node sheet.mjs model D:\shorts\sky                 the hero: front, 3/4 and six expressions -> review\model.png
//   node sheet.mjs storyboard D:\shorts\sky            key frames as 9:16 panels with captions -> review\storyboard.png
//   node sheet.mjs storyboard D:\shorts\sky --frames 0,45,90,200
//   node sheet.mjs video D:\shorts\sky\out\sky-9x16.mp4   one frame per second -> <video>-sheet.png
// Storyboard key frames come from keyframes(tl) in the project's core/scene.js ([{f, label}]), else --frames,
// else 8 evenly spaced frames. Renders are logged in receipt.json.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawnSync } from 'node:child_process';
import { openEngine } from './lib/page.mjs';
import { probe, arialOpt } from './lib/video.mjs';

const [mode, target, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i < 0 ? d : rest[i + 1]; };
const ff = args => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); if (r.error) throw new Error('ffmpeg not found'); if (r.status) throw new Error('ffmpeg: ' + r.stderr.slice(-400)); };
const logRender = (dir, kind, t0, frames, errors, file) => {
  const log = path.join(dir, 'receipt.json'), list = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : [];
  list.push({ at: new Date().toISOString(), kind, seconds: +((Date.now() - t0) / 1000).toFixed(1), frames, errors, files: [file] });
  fs.writeFileSync(log, JSON.stringify(list, null, 2));
};

// runs in the page: the engine's own hero rig (core/hero2d.js) standing, then six expression presets from core/pose.js (EX).
// It needs no story code, so it works right after new-short.mjs.
async function modelSheet() {
  const tl = await (await fetch('timeline.json')).json(), M = await import('./core/pose.js'), H = await import('./core/hero2d.js');
  const stand = { ...M.pose(0, tl), ...M.POSES.STAND, x: 960, y: 1192, scale: 1, flat: 0, turn: 1, rot: 0, headRot: 0, prop: '', prop2: '' };
  const face = (n, look = [-.5, 0]) => { const e = M.EX[n]; return { brows: e.b, browTilt: e.t, squint: e.sq, pupil: e.pu, mouth: e.m, mouthOpen: e.open, lid: e.wide ? Math.min(e.lid, .1) : e.lid, eyes: e.lid >= .85 ? 'closed' : e.wide ? 'wide' : 'open', look }; };
  const scarf = p => {      // both tails hanging still from the knot (the same shape pose.js bakes when he stands still)
    const k = M.heroPoints(p).knot, fc = (p.turn ?? 1) < 0 ? -1 : 1, out = {};
    [[7, 21], [6, 18]].forEach(([n, len], j) => { const pts = [k]; let [x, y] = k; for (let s = 1; s <= n; s++) { const ax = -fc * (.78 + .16 * j) * len, ay = len * (.5 + .08 * s), l = Math.hypot(ax, ay); x += ax / l * len; y += ay / l * len; pts.push([x, y]); } out[j ? 'b' : 'a'] = pts; });
    return out;
  };
  const cells = [['FRONT', { ...stand, ...face('det', [0, 0]), turn: 0 }, 0], ['3/4', { ...stand, ...face('det') }, 0],
    ...[['determined', 'det'], ['joy', 'joy'], ['surprise', 'surprise'], ['sad', 'sad'], ['angry', 'angry'], ['sheepish', 'sheepish']].map(([name, n]) => [name, { ...stand, ...face(n) }, 1])];
  const c = document.createElement('canvas'), g = c.getContext('2d'), cw = 420, ch = 560;
  c.width = cw * 4; c.height = ch * 2; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  cells.forEach(([name, p, close], i) => {
    p.scarf = scarf(p);
    const x0 = (i % 4) * cw, y0 = Math.floor(i / 4) * ch, k = close ? 1.25 : .9, hd = close ? p.y - 270 : p.y - 400;
    g.save(); g.beginPath(); g.rect(x0, y0, cw, ch); g.clip(); g.fillStyle = close ? '#f5f0e6' : '#efe8da'; g.fillRect(x0, y0, cw, ch);
    g.translate(x0 + cw / 2, y0 + (close ? 290 : 40)); g.scale(k, k); g.translate(-(p.x + (close ? 20 : 0)), close ? -hd : -hd + 10);
    H.drawHero(g, p, {}); g.restore();
    g.font = '600 22px Inter, sans-serif'; const w = g.measureText(name).width; g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(x0 + 6, y0 + 6, w + 14, 30); g.fillStyle = '#fff'; g.fillText(name, x0 + 13, y0 + 29);
  });
  return c.toDataURL('image/png');
}

try {
  if (mode === 'model') {
    const dir = path.resolve(target || '.'), t0 = Date.now(), P = await openEngine(dir), out = path.join(dir, 'review', 'model.png');
    let url; try { url = await P.pg.evaluate(modelSheet); } finally { await P.close(); }
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    logRender(dir, 'model sheet', t0, 8, P.errors.length, 'review/model.png');
    console.log(`MODEL SHEET  front, 3/4, six expressions -> ${out}`);
  } else if (mode === 'storyboard') {
    const dir = path.resolve(target || '.'), tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8')), t0 = Date.now();
    const P = await openEngine(dir), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'board-'));
    let kf;
    try {
      kf = opt('frames', null) ? String(opt('frames')).split(',').map(s => ({ f: +s, label: '' }))
        : await P.pg.evaluate(async () => { const tl = await (await fetch('timeline.json')).json(), m = await import('./core/scene.js'); return m.keyframes ? m.keyframes(tl) : null; })
        || Array.from({ length: 8 }, (_, i) => ({ f: Math.round(i * (tl.frames - 1) / 7), label: '' }));
      await P.pg.evaluate(() => { const d = document.createElement('div'); d.id = 'cap'; d.style.cssText = 'position:fixed;left:420px;top:1760px;width:1080px;height:160px;box-sizing:border-box;padding:18px 34px;background:rgba(10,10,14,.82);color:#fff;font:700 50px Inter,Arial,sans-serif;line-height:1.15;z-index:9'; document.body.appendChild(d); });
      for (let i = 0; i < kf.length; i++) {
        const { f, label } = kf[i];
        await P.pg.evaluate((f, cap) => { window.setF(f, {}); document.getElementById('cap').textContent = cap; }, f, [`#${i + 1}`, `${(f / tl.fps).toFixed(1)} s`, label].filter(Boolean).join(' · '));
        await P.pg.screenshot({ type: 'png', clip: { x: 420, y: 0, width: 1080, height: 1920 }, path: path.join(tmp, String(i).padStart(3, '0') + '.png') });
      }
    } finally { await P.close(); }
    const cols = Math.min(+opt('cols', 5), kf.length), rows = Math.ceil(kf.length / cols), out = path.join(dir, 'review', 'storyboard.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    ff(['-framerate', '1', '-i', path.join(tmp, '%03d.png'), '-vf', `scale=432:768,tile=${cols}x${rows}:margin=16:padding=16:color=0x15151a`, '-frames:v', '1', out]);
    fs.rmSync(tmp, { recursive: true, force: true });
    logRender(dir, 'storyboard', t0, kf.length, P.errors.length, 'review/storyboard.png');
    console.log(`STORYBOARD  ${kf.length} panels -> ${out}`);
    if (P.errors.length) { console.log(`WARNING: page errors: ${P.errors.slice(0, 3).join(' | ')}`); process.exit(1); }
  } else if (mode === 'video') {
    const v = path.resolve(target), { w, h, fps } = probe(v), dur = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v], { encoding: 'utf8' }).stdout;
    const n = Math.max(1, Math.floor(dur)), tall = h > w, cols = tall ? Math.min(n, 13) : Math.min(n, 7), rows = Math.ceil(n / cols), out = v.replace(/\.[^.]+$/, '') + '-sheet.png';
    ff(['-i', v, '-vf', `select='not(mod(n\\,${Math.round(fps)}))',scale=${tall ? '216:384' : '384:216'},drawtext=${arialOpt()}text='%{eif\\:t+0.01\\:d}s':x=6:y=4:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.55,tile=${cols}x${rows}`, '-frames:v', '1', out]);
    console.log(`SHEET  ${n} frames (1 per second) -> ${out}`);
  } else { console.log('usage: node sheet.mjs model <project> | storyboard <project> [--frames 0,45,90] | video <file.mp4>'); process.exit(2); }
} catch (e) { console.error('ERROR: ' + e.message); process.exit(2); }
