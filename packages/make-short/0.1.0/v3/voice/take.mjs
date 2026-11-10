// take.mjs: narrate story.md with ElevenLabs (with-timestamps) -> <name>.mp3 + <name>-timing.json (per line + per word).
//   node take.mjs <voiceId> <name> [maxLines]
// Reads ..\story.md (numbered lines under a 'Narration' heading). Key: env ELEVENLABS_API_KEY, or a file named by ELEVENLABS_ENV_FILE
// containing Creator_key=... or ELEVENLABS_API_KEY=... (never printed). No key? Record yourself instead (see SKILL.md step 3).
import fs from 'node:fs'; import path from 'node:path';

const [voiceId, name, maxLines] = process.argv.slice(2);
if (!voiceId || !name) { console.error('usage: node take.mjs <voiceId> <name> [maxLines]'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const env = process.env.ELEVENLABS_ENV_FILE ? fs.readFileSync(process.env.ELEVENLABS_ENV_FILE, 'utf8') : '';
const key = process.env.ELEVENLABS_API_KEY || (env.match(/^(?:Creator_key|ELEVENLABS_API_KEY)\s*=\s*"?([^"\r\n]+)/m) || [])[1];
if (!key) throw new Error('No ElevenLabs key: set ELEVENLABS_API_KEY or record your own voice');

// narration = numbered lines after the "Narration" heading in story.md
const md = fs.readFileSync(path.join(here, '..', 'story.md'), 'utf8');
const sec = md.split(/^#+ .*narration.*$/im)[1] || '';
let lines = [...sec.split(/^#+ /m)[0].matchAll(/^\s*\d+\.\s+(.+)$/gm)].map(m => m[1].trim());
if (maxLines) lines = lines.slice(0, +maxLines);
if (!lines.length) throw new Error('no narration lines found in story.md');
// optional v4 delivery tag, e.g. EL_TAG="[fast-paced, energetic storyteller]"; it isn't spoken, so line offsets skip it
const tag = process.env.EL_TAG ? process.env.EL_TAG + ' ' : '';
const text = tag + lines.join(' ');

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
  method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, model_id: process.env.EL_MODEL || 'eleven_v4', voice_settings: { stability: 0.5, similarity_boost: 0.85, speed: +(process.env.EL_SPEED || 1.1) } }),
});
if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
const j = await res.json();
fs.writeFileSync(path.join(here, `${name}.mp3`), Buffer.from(j.audio_base64, 'base64'));

// characters -> words (with times) -> lines
const a = j.alignment, words = []; let cur = null;
a.characters.forEach((ch, i) => {
  if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
  if (!cur) cur = { w: '', start: a.character_start_times_seconds[i], ci: i };
  cur.w += ch; cur.end = a.character_end_times_seconds[i];
});
if (cur) words.push(cur);
let ci = tag.length;
const out = lines.map((t, n) => {
  const s = ci, e = ci + t.length; ci = e + 1;
  const ws = words.filter(w => w.ci >= s && w.ci < e).map(({ w, start, end }) => ({ w, start: +start.toFixed(3), end: +end.toFixed(3) }));
  return { line: n + 1, text: t, start: ws[0]?.start ?? null, end: ws.at(-1)?.end ?? null, words: ws };
});
console.assert(out.every(l => l.words.length), 'every line got words');
const dur = words.at(-1).end;
fs.writeFileSync(path.join(here, `${name}-timing.json`), JSON.stringify({ voiceId, duration: +dur.toFixed(3), chars: text.length, lines: out }, null, 1));
console.log(`${name}: ${lines.length} lines, ${text.length} chars billed, ${dur.toFixed(1)} s, ${(words.length / dur).toFixed(2)} words/s`);
