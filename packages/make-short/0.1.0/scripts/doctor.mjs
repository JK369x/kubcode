// doctor.mjs: checks this PC can make Shorts. Changes nothing.
//   node doctor.mjs
// Checks Node 22+, ffmpeg + ffprobe, Chrome or Edge, and that headless Chrome can draw 3D (WebGL2).
// Exit code: 0 ready, 1 something to fix (each problem prints the exact fix).
import { spawnSync } from 'node:child_process';
import chrome, { findBrowser } from './lib/chrome.mjs';

let bad = 0;
const ok = (m) => console.log('  OK    ' + m), no = (m, fix) => { bad++; console.log('  FIX   ' + m + '\n        -> ' + fix); }, warn = (m) => console.log('  NOTE  ' + m);
console.log('make-short doctor');

const major = +process.versions.node.split('.')[0];
if (major >= 22) ok(`Node ${process.version}`);
else no(`Node ${process.version} is too old (need 22 or newer)`, 'run:  winget install OpenJS.NodeJS.LTS   then close and reopen the terminal (or install the LTS from https://nodejs.org)');

for (const tool of ['ffmpeg', 'ffprobe']) {
  const r = spawnSync(tool, ['-version'], { encoding: 'utf8' });
  if (r.error || r.status) no(`${tool} not found`, 'run:  winget install Gyan.FFmpeg   then close and reopen the terminal (it must work as "ffmpeg -version")');
  else ok(r.stdout.split('\n')[0].slice(0, 70));
}

const exe = findBrowser();
if (!exe) no('no Chrome or Edge found', 'run:  winget install Google.Chrome   (or set CHROME_PATH to the full path of chrome.exe)');
else {
  ok('browser ' + exe);
  if (major >= 22) {
    try {
      const br = await chrome.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'] });
      try {
        const pg = await br.newPage();
        const gl = await pg.evaluate(() => {
          const g = document.createElement('canvas').getContext('webgl2'); if (!g) return null;
          const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'yes';
        });
        if (!gl) no('headless Chrome has no WebGL2 (3D styles cannot render)', 'update Chrome/Edge and your graphics driver; 2D styles (flat, pixel, blueprint, ascii, woodcut, watercolor) still work');
        else if (/swiftshader|software|basic render/i.test(gl)) { ok('headless Chrome draws (software 3D)'); warn(`no GPU in headless Chrome (${gl}): 3D styles (voxel, lidar, teardown, glass) render slowly`); }
        else ok('headless Chrome draws 3D on ' + gl.slice(0, 80));
      } finally { await br.close(); }
    } catch (e) { no('headless Chrome did not start: ' + e.message.split('\n')[0], 'close every Chrome window and try again; if it still fails see references/windows-troubleshooting.md'); }
  }
}
console.log(bad ? `\n${bad} thing(s) to fix, then run this again.` : '\nREADY: this PC can make Shorts.');
process.exit(bad ? 1 : 0);
