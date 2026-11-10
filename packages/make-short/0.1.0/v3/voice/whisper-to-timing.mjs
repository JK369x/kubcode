// whisper-to-timing.mjs: free route. Turns Whisper word-timestamp JSON of YOUR recording into voice-timing.json for finish.mjs.
//   whisper my-voice.wav --model small --language en --word_timestamps True --output_format json --output_dir .
//   node whisper-to-timing.mjs whisper.json   (reads ../story.md narration lines, writes voice-timing.json)
// Lines are assigned by word count, in order. Re-read the result: a mis-heard word shifts later lines.
import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const md = fs.readFileSync(path.join(here, '..', 'story.md'), 'utf8');
const sec = md.split(/^#+ .*narration.*$/im)[1] || '';
const lines = [...sec.split(/^#+ /m)[0].matchAll(/^\s*\d+\.\s+(.+)$/gm)].map(m => m[1].trim());
const ws = j.segments.flatMap(s => s.words).map(w => ({ w: w.word.trim(), start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
let i = 0;
const out = lines.map((t, n) => { const c = t.split(/\s+/).length; const words = ws.slice(i, i + c); i += c;
  return { line: n + 1, text: t, start: words[0]?.start ?? null, end: words.at(-1)?.end ?? null, words }; });
if (i !== ws.length) console.warn(`WARNING: story has ${i} words, recording has ${ws.length}; check line boundaries`);
fs.writeFileSync(path.join(here, 'voice-timing.json'), JSON.stringify({ duration: ws.at(-1).end, lines: out }, null, 1));
console.log(`wrote voice-timing.json: ${lines.length} lines, ${ws.length} words`);
