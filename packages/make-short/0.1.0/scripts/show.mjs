// show.mjs: open a picture or video in the default app, so the user can look at it (a terminal cannot show images).
//   node show.mjs D:\shorts\sky\review\storyboard.png
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const f = path.resolve(process.argv[2] || '');
if (!fs.existsSync(f)) { console.error('ERROR: not found: ' + f); process.exit(2); }
const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${f}"`]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [f]];
spawn(cmd, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32' }).unref();
console.log('opened ' + f);
