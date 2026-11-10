// finish.mjs: silent render + voice + SFX on words + ducked music + one-word captions -> out/short-v3-final.mp4
//   node finish.mjs [silent.mp4] [voice.mp3] [timing.json]
//   defaults: ../out/short-v3-silent.mp4, voice/voice.mp3, voice/voice-timing.json (take.mjs output or your own recording, see SKILL.md)
//   sound cues come from voice/cues.json: {"cues":[[sfx,line,wordStem,offsetS]],"impact":{sfx:frame},"hits":[[sfx,frame,vol]],"capUp":[[f0,f1]]}
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const root = path.join(here, '..');
const silent = process.argv[2] || path.join(root, 'out', 'short-v3-silent.mp4');
const T = JSON.parse(fs.readFileSync(path.resolve(process.argv[4] || path.join(here, 'voice-timing.json')), 'utf8').replace(/^\uFEFF/, ''));
const words = T.lines.flatMap(l => l.words.map(w => ({ ...w, line: l.line })));

// SFX on the word they belong to: [sfx, line, word stem, offset s]
const CF = fs.existsSync(path.join(here, 'cues.json')) ? JSON.parse(fs.readFileSync(path.join(here, 'cues.json'), 'utf8')) : {};
const CUES = CF.cues || [];
const at = (line, stem) => words.find(w => w.line === line && w.w.replace(/[^\w]/g, '').toLowerCase().startsWith(stem.toLowerCase()));
// verified on-screen impact frames from the animator win over word timing (30 fps)
const IMPACT = CF.impact || {};   // clang/ding +4: critic r4 measured the star 4 f after
const sfx = CUES.map(([n, line, stem, off]) => {
  if (IMPACT[n] != null) return { n, t: IMPACT[n] / 30 };
  const w = at(line, stem); if (!w) throw new Error(`cue word not found: ${stem} (line ${line})`); return { n, t: Math.max(0, w.start + off) };
});
// hits with a visible impact but no cue word: [sfx, frame, volume]  (hook hammer swings)
for (const [n, f, v] of (CF.hits || [])) sfx.push({ n, t: f / 30, v });
// a whoosh on every whip cut in the shot list (starts 3 frames before the cut)
const shotsFile = path.join(path.dirname(silent), '..', 'shots.json');
if (fs.existsSync(shotsFile)) for (const s of JSON.parse(fs.readFileSync(shotsFile, 'utf8')))
  if (s.transition_in === 'whip' && !sfx.some(x => Math.abs(x.t - s.f_in / 30) < 0.25)) sfx.push({ n: 'whoosh', t: Math.max(0, (s.f_in - 3) / 30), v: 0.35 });

// captions like the reference: original case, 1–2 words (a short word joins the next), held until the next group, max 0.9 s
const ts = s => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${x}`; };
const clean = w => w.replace(/["“”.,!?;:]/g, '');
const groups = [];
for (let i = 0; i < words.length; i++) {
  const w = words[i], n = words[i + 1];
  const pair = n && n.line === w.line && clean(w.w).length <= 3 && !/[.,!?]$/.test(w.w) && n.start - w.start < 0.45;
  groups.push({ start: w.start, end: (pair ? n : w).end, text: pair ? `${clean(w.w)} ${clean(n.w)}` : clean(w.w) });
  if (pair) i++;
}
// shots where a hero prop sits in the caption band: lift the caption there instead (frame ranges, 30 fps)
const CAP_UP = CF.capUp || [];
const ev = groups.map((w, i) => {
  const end = Math.min(groups[i + 1]?.start ?? w.end + 0.4, w.start + 0.9);
  const txt = w.text;
  const mv = CAP_UP.some(([a, b]) => w.start * 30 >= a && w.start * 30 < b) ? 1180 : 0;
  return `Dialogue: 0,${ts(w.start)},${ts(end)},W,,0,0,${mv},,{\\fscx80\\fscy80\\t(0,90,\\fscx100\\fscy100)}${txt}`;
});
const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: W,Arial Black,108,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,10,6,2,60,60,560,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${ev.join('\n')}\n`;
fs.writeFileSync(path.join(here, 'captions.ass'), ass);

const out = path.join(root, 'out'); fs.mkdirSync(out, { recursive: true });
const dst = path.join(out, 'short-v3-final.mp4');
const inputs = ['-i', silent, '-i', path.resolve(process.argv[3] || path.join(here, 'voice.mp3')), '-i', path.join(here, 'sfx', 'music.mp3'), ...sfx.flatMap(s => ['-i', path.join(here, 'sfx', `${s.n}.mp3`)])];
const sfxChains = sfx.map((s, i) => `[${i + 3}:a]volume=${s.v ?? 0.55},adelay=${Math.round(s.t * 1000)}|${Math.round(s.t * 1000)}[s${i}]`);
const subs = path.join(here, 'captions.ass').replace(/\\/g, '/').replace(/:/g, '\\:');
const fc = [
  `[0:v]subtitles='${subs}'[v]`, // libass can't read the woff2 fonts dir; Arial Black is a system font
  `[1:a]asplit=2[vo][key]`,
  `[2:a]volume=0.30,afade=t=out:st=${(T.duration).toFixed(2)}:d=1.0[mu]`,
  `[mu][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[duck]`,
  ...sfxChains,
  `[vo][duck]${sfx.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sfx.length + 2}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]`,
].join(';');
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', dst], { stdio: 'inherit' });
console.log(`wrote ${dst}  (${sfx.length} sfx, ${groups.length} captions from ${words.length} words)`);
