// page.mjs: open a project's engine page (index.html) in headless Chrome, the same way render.mjs does.
//   const P = await openEngine(root, { init });  await P.pg.evaluate(...);  await P.close();
// init (optional) = a function run in the page before any engine script (used by qa-text to watch text draws).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import chrome from './chrome.mjs';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css' };

export async function openEngine(root, { init, size = 1920 } = {}) {
  root = path.resolve(root);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`no index.html in ${root}: point --root at the short's folder (the one with render.mjs)`);
  const srv = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(root)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(d); } });
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const br = await chrome.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars'] });
  const errors = [];
  try {
    const pg = await br.newPage();
    await pg.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    pg.on('console', m => { const t = m.text(); if (/\[style-error\]/.test(t)) errors.push(t.slice(0, 300)); });
    pg.on('pageerror', e => errors.push(e.message.slice(0, 300)));
    if (init) await pg.evaluateOnNewDocument(init);
    await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
    await pg.waitForFunction('window.READY===true', { timeout: 180000 });
    return { pg, errors, close: async () => { await br.close(); srv.close(); } };
  } catch (e) { await br.close(); srv.close(); throw e; }
}
