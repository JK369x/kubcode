// The Longest Fall renderer. Headless Chrome frame capture -> ONE 1920x1920 master stream piped into TWO ffmpeg processes
// (16:9 crop=1920:1080:0:420 and 9:16 crop=1080:1920:420:0), libx264 crf 18 yuv420p.
//   node render.mjs                              full render: out/marathon-16x9.mp4, out/marathon-9x16.mp4 + out/contact-*.png
//   node render.mjs --from 100 --to 200          frame range (inclusive) -> out/part-100-200-16x9.mp4 / -9x16.mp4
//   node render.mjs --stills pixel-u10,t1-p50,f300   stills -> stills/<name>.png (16:9 crop + 9:16 crop side by side, DEBUG overlay on)
//        names: <styleId|index>-u<0..100>  |  <t1..t9|transition id>-p<0..100>  |  f<frame>   (or "all")
//        p50 renders the integer frame nearest to p=0.5. --clean = no overlay, --ss 0.8 = still scale
//   node render.mjs --model-sheet [name.png]     hero model sheet (front, 3/4, six expressions) -> stills/hero-model.png
//   --debug  draw the overlay (safe square, 16:9 edges, 9:16 Shorts UI bands) into the video too -> out/debug-*.mp4
// Integrator additions (One Door, Ten Worlds):
//   node render.mjs                              FULL film: out/door-16x9.mp4, out/door-9x16.mp4, out/door-9x16-chip.mp4 (the Short with the CHIP pill, same
//                                                capture pass), out/door-contact-16x9.png / -9x16.png (every 15th frame). First runs `--panels` in a fresh
//                                                browser (the storyboard sheet's 10 key frames), unless --no-panels. --no-chip skips the chip crop.
//   node render.mjs --panels                     pre-render the sheet's panel pictures -> out/door-panels/pNN.png (frames listed in scenes/<story>/sheet.js)
//   CHIP=1 node render.mjs ...                   draw the chip pill into every output (page opened with ?chip=1); parts: --chip adds a -9x16-chip.mp4
//   --tag X                                      prefix for stills / poses names (stills/X<name>.png), so parallel runs never overwrite each other
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url); const puppeteer = (await import('./chrome.mjs')).default;
const root = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; return (v === undefined || v.startsWith('--')) ? true : v; };
const tl = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));
const FPS = tl.fps, H8 = tl.handle || 8, outDir = path.join(root, 'out'), stillDir = path.join(root, 'stills');
fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(stillDir, { recursive: true });
const CHIP = process.env.CHIP === '1', TAG = typeof opt('tag', '') === 'string' ? opt('tag', '') : '';
const isFull = !argv.some(a => ['--from', '--to', '--stills', '--poses', '--model-sheet', '--panels', '--debug'].includes(a));
if (isFull && !argv.includes('--no-panels')) {                    // the sheet's key frames come from a fresh browser run (each shows the engine's own frame, deterministic)
  const tp = Date.now();
  for (let k = 1; k <= 3; k++) { const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--panels'], { stdio: 'inherit', env: { ...process.env, CHIP: '' } }); if (!r.status) break; console.log('panels pass failed (try ' + k + ')'); if (k === 3) process.exit(1); }
  console.log('panels pass s', ((Date.now() - tp) / 1000).toFixed(1));
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(d); } });
}).listen(0, '127.0.0.1');
await new Promise(r => srv.on('listening', r));
const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars'] });
const pg = await br.newPage(); await pg.setViewport({ width: 1920, height: 1920, deviceScaleFactor: 1 });
let errors = 0;
pg.on('console', m => { const t = m.text(); if (/\[style-error\]/.test(t)) errors++; if (m.type() === 'error' || m.type() === 'warning' || /^\[/.test(t)) console.log('[page]', t.slice(0, 400)); });
pg.on('pageerror', e => { errors++; console.log('[err]', e.message); });
await pg.goto(`http://127.0.0.1:${srv.address().port}/` + (CHIP ? '?chip=1' : ''));
await pg.waitForFunction('window.READY===true', { timeout: 120000 });
const clip = { x: 0, y: 0, width: 1920, height: 1920 };
const jpg = async (f, debug) => { await pg.evaluate((f, d) => window.setF(f, { debug: d }), f, debug); return pg.screenshot({ type: 'jpeg', quality: 95, clip, captureBeyondViewport: false }); };
const png = async (f, debug) => { await pg.evaluate((f, d) => window.setF(f, { debug: d }), f, debug); return pg.screenshot({ type: 'png', clip, captureBeyondViewport: false }); };
const t0 = Date.now();
const stillsArg = opt('stills', null), posesArg = opt('poses', null);
if (opt('panels', false)) {   // storyboard sheet key frames: the engine's own full 1920x1920 frames, PNG, no overlay, no chip -> out/door-panels/pNN.png
  const sc = await import(pathToFileURL(path.join(root, 'scenes', tl.story || 'door', 'sheet.js')).href);
  fs.mkdirSync(path.join(root, path.dirname(sc.panelFile(0))), { recursive: true });
  for (let i = 0; i < sc.PANELS.length; i++) {
    await pg.evaluate(f => window.setF(f, { chip: false }), sc.PANELS[i]);
    fs.writeFileSync(path.join(root, sc.panelFile(i)), await pg.screenshot({ type: 'png', clip, captureBeyondViewport: false }));
  }
  fs.writeFileSync(path.join(root, path.dirname(sc.panelFile(0)), 'panels.json'), JSON.stringify({ frames: sc.PANELS, made: new Date().toISOString() }));
  console.log('panels', sc.PANELS.join(','), '->', path.dirname(sc.panelFile(0)), '| s', ((Date.now() - t0) / 1000).toFixed(1));
  await br.close(); srv.close(); process.exit(0);
}
if (opt('model-sheet', false)) {   // hero model sheet (front, 3/4, six expressions from the film) -> stills/hero-model.png (anim-model.js)
  const url = await pg.evaluate(async () => { const m = await import('/anim-model.js'); const tl = await (await fetch('/timeline.json')).json(); return m.modelSheet(tl); });
  const out = path.join(stillDir, typeof opt('model-sheet') === 'string' ? opt('model-sheet') : 'hero-model.png');
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); console.log('model sheet ->', path.relative(root, out));
  await br.close(); srv.close(); process.exit(0);
}
if (posesArg) {   // pose sheet: safe-square crops of the listed frames in a grid -> stills/poses.png (clean, no overlay)
  const fr = String(posesArg).split(',').map(Number), tmp = path.join(stillDir, '_poses' + TAG); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  for (let i = 0; i < fr.length; i++) fs.writeFileSync(path.join(tmp, String(i).padStart(3, '0') + '.png'), await png(fr[i], false));
  const cols = +opt('cols', 6), sz = +opt('sz', 300), rows = Math.ceil(fr.length / cols);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(tmp, '%03d.png'), '-vf', `crop=1080:1080:420:420,scale=${sz}:${sz},drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='%{eif\\:n\\:d}':x=4:y=2:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.5,tile=${cols}x${rows}`, '-frames:v', '1', path.join(stillDir, TAG + 'poses.png')]);
  if (r.status) console.log(String(r.stderr)); else console.log('poses ->', 'stills/' + TAG + 'poses.png', 'frames', fr.join(','));
  fs.rmSync(tmp, { recursive: true, force: true });
  await br.close(); srv.close(); process.exit(0);
}

if (stillsArg) {
  const debug = !opt('clean', false), ss = +opt('ss', 0.8);
  const styleBy = k => tl.styles.find((s, i) => s.id === k || String(i + 1) === k || s.file.includes(k));
  const transBy = k => tl.transitions.find(t => t.id === k || `${t.id}-${t.name}` === k);
  let list = stillsArg === 'all' ? [] : String(stillsArg).split(',');
  if (stillsArg === 'all') { for (const s of tl.styles) for (const u of [10, 50, 90]) list.push(`${s.id}-u${u}`); for (const t of tl.transitions) list.push(`${t.id}-p50`); }
  for (const name of list) {
    let m, f;
    if ((m = /^f(\d+)$/.exec(name))) f = +m[1];
    else if ((m = /^(.+)-([up])(\d+)$/.exec(name))) {
      const q = +m[3] / 100;
      if (m[2] === 'u') { const s = styleBy(m[1]); if (!s) { console.log('unknown style', name); continue; } f = Math.round(s.start + q * (s.end - s.start)); }
      else { const t = transBy(m[1]); if (!t) { console.log('unknown transition', name); continue; } f = Math.round(t.boundary - H8 + q * (2 * H8 - 1)); }
    } else { console.log('bad still name', name); continue; }
    f = Math.max(0, Math.min(tl.frames - 1, f));
    const master = path.join(stillDir, '_master' + TAG + '.png'); fs.writeFileSync(master, await png(f, debug));
    const out = path.join(stillDir, `${TAG}${name}.png`), a = Math.round(1920 * ss), b = Math.round(1080 * ss), c = Math.round(1920 * ss);
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', master, '-filter_complex',
      `[0:v]split=2[a][b];[a]crop=1920:1080:0:420,scale=${a}:${b}[c];[b]crop=1080:1920:420:0,scale=${Math.round(1080 * ss)}:${c}[d];[c]pad=${a}:${c}:0:0:#101010[e];[e][d]hstack`, out]);
    if (r.status) console.log(String(r.stderr)); else console.log('still', name, 'f' + f, '->', path.relative(root, out));
    fs.rmSync(master, { force: true });
  }
} else {
  const debug = !!opt('debug', false), F0 = +opt('from', 0), F1 = +opt('to', tl.frames - 1), part = (opt('from', null) !== null || opt('to', null) !== null);
  const tag = (debug ? 'debug-' : '') + (part ? `part-${F0}-${F1}-` : 'door-');
  const chipCrop = !debug && !CHIP && (part ? !!opt('chip', false) : !opt('no-chip', false));   // the Short WITH the chip pill, from the same capture pass (window.__chipOver)
  const enc = (suffix, vf) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-vf', vf,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', path.join(outDir, tag + suffix + '.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] });
  const TV = 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p';   // mjpeg is full-range bt601: convert once to limited bt709
  const A = enc('16x9', 'crop=1920:1080:0:420,' + TV), B = enc('9x16', 'crop=1080:1920:420:0,' + TV), C = chipCrop ? enc('9x16-chip', TV) : null;
  const w = (p, buf) => p.stdin.write(buf) ? null : new Promise(r => p.stdin.once('drain', r));
  const done = p => new Promise(r => p.on('close', r));
  for (let f = F0; f <= F1; f++) {
    const buf = await jpg(f, debug); await Promise.all([w(A, buf), w(B, buf)]);
    if (C) { await pg.evaluate(f => window.__chipOver(f), f); await w(C, await pg.screenshot({ type: 'jpeg', quality: 95, clip: { x: 420, y: 0, width: 1080, height: 1920 }, captureBeyondViewport: false })); }
    if (f % 60 === 0) console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  A.stdin.end(); B.stdin.end(); if (C) C.stdin.end(); await Promise.all([done(A), done(B), ...(C ? [done(C)] : [])]);
  console.log('done', tag + '16x9.mp4', tag + '9x16.mp4', C ? tag + '9x16-chip.mp4' : '', '| capture+encode s', ((Date.now() - t0) / 1000).toFixed(1));
  if (!part && !debug) {   // contact sheets: every 15th frame (50 tiles), labelled with the master frame number
    const sheet = (src, dst, sc, tile) => spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(outDir, src), '-vf',
      `select='not(mod(n,15))',scale=${sc},drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='%{eif\\:n*15\\:d}':x=6:y=4:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.55,tile=${tile}`, '-frames:v', '1', '-vsync', '0', path.join(outDir, dst)]);
    for (const r of [sheet('door-16x9.mp4', 'door-contact-16x9.png', '384:216', '10x5'), sheet('door-9x16.mp4', 'door-contact-9x16.png', '216:384', '10x5')]) if (r.status) console.log(String(r.stderr));
  }
}
console.log('errors', errors, '| render s', ((Date.now() - t0) / 1000).toFixed(1));
await br.close(); srv.close();
