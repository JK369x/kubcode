// sfx.mjs: ElevenLabs sound effects + a music bed for the Short -> sfx\*.mp3. Cached: existing files are skipped.
import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const env = process.env.ELEVENLABS_ENV_FILE ? fs.readFileSync(process.env.ELEVENLABS_ENV_FILE, 'utf8') : '';
const key = process.env.ELEVENLABS_API_KEY || (env.match(/^(?:Creator_key|ELEVENLABS_API_KEY)\s*=\s*"?([^"\r\n]+)/m) || [])[1];
const dir = path.join(here, 'sfx'); fs.mkdirSync(dir, { recursive: true });

const SFX = {
  bend: 'cartoon metal knife bending with a comic boing, short',
  boot: 'cartoon boot kicking a tin can, dull thunk, short',
  rock: 'rock hitting a metal tin can, clank, then a small rock crumbling, cartoon',
  pan: 'cartoon frying pan bonk on a metal can, ringing',
  sit: 'cartoon squeak of someone sitting on a tin can, small creak',
  tree: 'tin can thrown hitting a tree trunk, wooden thock and leaves rustle, cartoon',
  clang: 'hammer hitting chisel on metal can, loud single clang, cartoon',
  pop: 'tin can lid popping open with a cartoon pop and hiss',
  whoosh: 'soft quick cartoon whoosh for a camera move',
  night: 'gentle magical shimmer transition, short',
  crate: 'wooden crate set down on grass, thud, cartoon',
  ding: 'bright cartoon sparkle ding reveal, single chime, short',
};
async function save(file, url, body) {
  if (fs.existsSync(file)) return console.log('cached', path.basename(file));
  const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) return console.log('FAIL', path.basename(file), r.status, (await r.text()).slice(0, 160));
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); console.log('ok', path.basename(file));
}
// one at a time: the plan's concurrency limit returns 429 on parallel calls
for (const [n, text] of Object.entries(SFX))
  await save(path.join(dir, `${n}.mp3`), 'https://api.elevenlabs.io/v1/sound-generation', { text, duration_seconds: n === 'whoosh' ? 0.8 : 1.5, prompt_influence: 0.5 });
await save(path.join(dir, 'music.mp3'), 'https://api.elevenlabs.io/v1/music', {
  prompt: 'Playful quirky cartoon background music for a funny history story short: pizzicato strings, light marimba, soft bassoon, bouncy, 110 BPM, instrumental, no vocals; turns mysterious and soft in the middle, then playful again at the end',
  music_length_ms: 60000,
});
