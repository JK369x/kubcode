// chrome.mjs: zero-dependency headless Chrome/Edge driver. It implements only the small part of the puppeteer-core API
// that the engine's render.mjs and the make-short scripts use, over the Chrome DevTools protocol.
// Needs Node 22+ (built-in WebSocket). No npm install, no network.
//   import chrome from './chrome.mjs';  const br = await chrome.launch({ args: [...] });  const pg = await br.newPage();
//   pg.setViewport / goto / evaluate / waitForFunction / screenshot / evaluateOnNewDocument / on('console'|'pageerror');  br.close()
// shortcut: one main frame per page, no workers or iframes; switch to puppeteer-core if a script ever needs more.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

export function findBrowser() {
  const e = process.env, pf = e.ProgramFiles, pf86 = e['ProgramFiles(x86)'], la = e.LOCALAPPDATA;
  const list = [e.CHROME_PATH,
    pf && `${pf}\\Google\\Chrome\\Application\\chrome.exe`, pf86 && `${pf86}\\Google\\Chrome\\Application\\chrome.exe`, la && `${la}\\Google\\Chrome\\Application\\chrome.exe`,
    pf86 && `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`, pf && `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,   // Edge ships with every Windows 10/11
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return list.find(p => p && fs.existsSync(p)) || null;
}

async function launch({ executablePath, args = [], timeout = 30000 } = {}) {
  if (typeof WebSocket === 'undefined') throw new Error(`Node 22 or newer is needed (you have ${process.version}). Install the LTS from https://nodejs.org and open a new terminal.`);
  const exe = (executablePath && fs.existsSync(executablePath)) ? executablePath : findBrowser();
  if (!exe) throw new Error('No Chrome or Edge found. Install Google Chrome, or set CHROME_PATH to the full path of chrome.exe.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'make-short-chrome-'));
  const own = /^--(headless|remote-debugging-port|user-data-dir)/;
  const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--enable-unsafe-swiftshader', ...args.filter(a => !own.test(a)), 'about:blank'];
  const proc = spawn(exe, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  const killer = () => { try { proc.kill(); } catch { } };
  process.on('exit', killer);                                   // never leave a headless Chrome running after a crash
  let log = '';
  const wsUrl = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`Chrome did not start within ${timeout / 1000} s: ${exe}\n${log.slice(-800)}`)), timeout);
    proc.stderr.on('data', d => { log = (log + d).slice(-8000); const m = /DevTools listening on (ws:\/\/\S+)/.exec(log); if (m) { clearTimeout(t); res(m[1]); } });   // keep draining stderr or Chrome blocks
    proc.on('exit', c => { clearTimeout(t); rej(new Error(`Chrome closed (code ${c}) before it was ready: ${exe}\n${log.slice(-800)}`)); });
    proc.on('error', er => { clearTimeout(t); rej(er); });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = er => rej(new Error('cannot connect to Chrome: ' + (er.message || er.type))); });
  let seq = 0; const pending = new Map(), subs = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
    if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`)); else p.res(m.result); } }
    else for (const fn of subs.get(`${m.sessionId || ''}|${m.method}`) || []) fn(m.params);
  };
  ws.onclose = () => { for (const p of pending.values()) p.rej(new Error('Chrome connection closed')); pending.clear(); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej, method });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
  const sub = (sid, method, fn) => { const k = `${sid}|${method}`; if (!subs.has(k)) subs.set(k, []); subs.get(k).push(fn); };

  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sid);
    await Promise.all([S('Page.enable'), S('Runtime.enable'), S('Log.enable')]);
    const hand = { console: [], pageerror: [] }, emit = (k, v) => (hand[k] || []).forEach(fn => fn(v));
    const msg = (type, text) => ({ type: () => type === 'warning' ? 'warn' : type, text: () => text });   // same shape as puppeteer's ConsoleMessage
    sub(sid, 'Runtime.consoleAPICalled', e => emit('console', msg(e.type, e.args.map(a => a.value !== undefined ? String(a.value) : (a.description || a.unserializableValue || '')).join(' '))));
    sub(sid, 'Log.entryAdded', ({ entry }) => emit('console', msg(entry.level, entry.text + (entry.url ? ' ' + entry.url : ''))));
    sub(sid, 'Runtime.exceptionThrown', ({ exceptionDetails: d }) => { const t = (d.exception && d.exception.description) || d.text, e = new Error(t.split(/\r?\n/)[0]); e.stack = t; emit('pageerror', e); });
    let loaded = null; sub(sid, 'Page.loadEventFired', () => loaded && loaded());
    const code = (fn, args) => typeof fn === 'function' ? `(${fn})(...${JSON.stringify(args)})` : String(fn);
    const run = async expression => {
      const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    };
    return {
      on(k, fn) { (hand[k] || (hand[k] = [])).push(fn); return this; },
      setViewport: ({ width, height, deviceScaleFactor = 1 }) => S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false }),
      evaluateOnNewDocument: (fn, ...args) => S('Page.addScriptToEvaluateOnNewDocument', { source: code(fn, args) }),
      async goto(url, { timeout: tmo = 60000 } = {}) {
        const done = new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('page did not load in time: ' + url)), tmo); loaded = () => { clearTimeout(t); loaded = null; res(); }; });
        const r = await S('Page.navigate', { url });
        if (r.errorText) throw new Error(`cannot open ${url}: ${r.errorText}`);
        await done;
      },
      evaluate: (fn, ...args) => run(code(fn, args)),
      async waitForFunction(fn, { timeout: tmo = 30000, polling = 100 } = {}, ...args) {
        const t0 = Date.now();
        for (; ;) {
          if (await run(code(fn, args))) return true;
          if (Date.now() - t0 > tmo) throw new Error(`timed out after ${tmo / 1000} s waiting for ${String(fn).slice(0, 80)}`);
          await new Promise(r => setTimeout(r, polling));
        }
      },
      async screenshot({ type = 'png', quality, clip, path: file } = {}) {
        const p = { format: type, captureBeyondViewport: false };
        if (type === 'jpeg') p.quality = quality ?? 80;
        if (clip) p.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 };
        const b = Buffer.from((await S('Page.captureScreenshot', p)).data, 'base64');
        if (file) fs.writeFileSync(file, b);
        return b;
      },
      close: () => send('Target.closeTarget', { targetId }),
    };
  }

  return {
    newPage,
    async close() {
      try { await Promise.race([send('Browser.close'), new Promise(r => setTimeout(r, 3000))]); } catch { }
      if (proc.exitCode === null) await new Promise(r => { const t = setTimeout(() => { killer(); r(); }, 4000); proc.once('exit', () => { clearTimeout(t); r(); }); });
      try { ws.close(); } catch { }
      process.off('exit', killer);
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { }   // a locked temp profile is harmless
    },
  };
}

export default { launch, findBrowser };
