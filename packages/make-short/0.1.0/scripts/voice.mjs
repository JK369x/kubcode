// voice.mjs: optional voice-over for a finished Short (ElevenLabs text-to-speech + ffmpeg mix).
//   node voice.mjs <project> [--voice <voiceId>] [--music <file>] [--dry]
// Reads the "## Narration" section of story.md, one line per beat:   - 0.3 | Can you catch the blue?
//   (start time in seconds, a pipe, the words; "0.3s" also works). Writes out\<slug>-voiced-9x16.mp4 (+ -16x9 if that
//   render exists). Never touches the silent renders. One TTS call per line, cached in <project>\voice\ (re-runs are free).
// Key: ELEVENLABS_API_KEY from the environment only. Never printed or written.
// Exit: 0 done, 1 done with warnings (a line was sped up past 1.25x or overruns), 2 could not run.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawnSync } from 'node:child_process';

const a = process.argv.slice(2), opt = n => { const i = a.indexOf(n); return i < 0 ? null : a[i + 1]; };
const dir = path.resolve(a.find(x => !x.startsWith('--')) || '.');
const VOICE = opt('--voice') || 'EXAVITQu4vr4xnSDxMaL'; // "Sarah": soft, warm explainer voice (ElevenLabs premade, free tier ok)
const MODEL = 'eleven_multilingual_v2', MAXSPEED = 1.25, MAXWPS = 3, dry = a.includes('--dry');
const music = opt('--music');
const die = m => { console.error('ERROR: ' + m); process.exit(2); };

const storyF = path.join(dir, 'story.md');
if (!fs.existsSync(storyF)) die(`${dir} is not a Short project (no story.md).`);
const story = fs.readFileSync(storyF, 'utf8'), meta = fs.existsSync(path.join(dir, 'short.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'short.json'), 'utf8')) : { slug: path.basename(dir) };
const sec = /^##[ \t]*Narration[ \t]*\r?$([\s\S]*?)(?=^#|(?![\s\S]))/im.exec(story);
if (!sec) die('story.md has no "## Narration" section. Add one line per beat, like "- 0.3 | Can you catch the blue?" (max 3 words per second).');
const lines = [...sec[1].matchAll(/^\s*[-*]?\s*([\d.]+)\s*s?\s*\|\s*(.+?)\s*$/gm)].map(m => ({ t: +m[1], text: m[2] })).sort((x, y) => x.t - y.t);
if (!lines.length) die('the Narration section has no lines in the form "- 0.3 | words".');

const probe = f => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout;
const vids = ['9x16', '16x9'].map(k => [k, path.join(dir, 'out', `${meta.slug}-${k}.mp4`)]).filter(([, f]) => fs.existsSync(f));
if (!vids.length) die('no silent render in out\\. Run render-short.mjs first.');
const total = probe(vids[0][1]);

let key = process.env.ELEVENLABS_API_KEY;
const cache = path.join(dir, 'voice'); fs.mkdirSync(cache, { recursive: true });

let billed = 0, warn = 0;
for (const l of lines) {
  l.words = l.text.split(/\s+/).length;
  l.file = path.join(cache, crypto.createHash('sha1').update(VOICE + MODEL + l.text).digest('hex').slice(0, 12) + '.mp3');
  if (fs.existsSync(l.file)) continue;
  if (dry) continue;
  if (!key) die('no ElevenLabs key. Set ELEVENLABS_API_KEY in your terminal.');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: l.text, model_id: MODEL }) });
  if (!r.ok) die(`ElevenLabs said ${r.status} ${(await r.text()).slice(0, 160).replace(key, '***')}. 401 = bad key, 402/429 = out of credits or too fast, 404 = unknown voice id.`);
  fs.writeFileSync(l.file, Buffer.from(await r.arrayBuffer())); billed += l.text.length;
}
lines.forEach((l, i) => {
  const next = i + 1 < lines.length ? lines[i + 1].t : total - 0.2, win = next - l.t - 0.1;
  if (l.words / (next - l.t) > MAXWPS) { warn++; console.log(`WARNING: "${l.text}" is ${l.words} words in ${(next - l.t).toFixed(1)} s (over ${MAXWPS} words/s). Shorten it.`); }
  if (!fs.existsSync(l.file)) return;
  l.dur = probe(l.file); l.tempo = Math.max(1, +(l.dur / win).toFixed(3));
  if (l.tempo > MAXSPEED) { warn++; console.log(`WARNING: line at ${l.t}s is ${l.dur.toFixed(1)} s but has ${win.toFixed(1)} s; ${MAXSPEED}x is the limit, so it will overrun. Shorten it.`); l.tempo = MAXSPEED; }
  else if (l.tempo > 1) console.log(`note: line at ${l.t}s sped up ${l.tempo}x to fit`);
});
const chars = lines.reduce((s, l) => s + l.text.length, 0);
if (dry) { console.log(`DRY: ${lines.length} lines, ${chars} characters (billed only for uncached lines).`); process.exit(0); }

const inputs = lines.flatMap(l => ['-i', l.file]);
const mi = music ? (fs.existsSync(music) ? ['-stream_loop', '-1', '-i', music] : die(`music file not found: ${music}`)) : [];
const chain = lines.map((l, i) => `[${i + 1}:a]${l.tempo > 1 ? `atempo=${Math.min(l.tempo, 2)},` : ''}aresample=44100,aformat=channel_layouts=mono,adelay=${Math.round(l.t * 1000)}:all=1[v${i}]`).join(';');
const vmix = `${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:duration=longest[voice]`;
// voice to -14 LUFS first; the music bed (-24 dB, faded) is added after, then a limiter stops peaks
const fg = `${chain};${vmix};[voice]loudnorm=I=-14:TP=-1.5:LRA=11[vn]` + (music
  ? `;[${lines.length + 1}:a]aformat=channel_layouts=stereo,volume=0.06,afade=t=in:d=1,afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5[m];[vn]aformat=channel_layouts=stereo[vs];[vs][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[mix]`
  : `;[vn]aformat=channel_layouts=stereo[mix]`);
for (const [k, f] of vids) {
  const o = path.join(dir, 'out', `${meta.slug}-voiced-${k}.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', f, ...inputs, ...mi, '-filter_complex', fg, '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), o], { encoding: 'utf8' });
  if (r.status) die('ffmpeg failed: ' + (r.stderr || '').slice(-400));
  console.log(`VOICED  out\\${path.basename(o)}  (${probe(o).toFixed(2)} s)`);
}
console.log(`${lines.length} lines, ${chars} characters in the script, ${billed} billed this run (cached lines are free).`);
process.exit(warn ? 1 : 0);
