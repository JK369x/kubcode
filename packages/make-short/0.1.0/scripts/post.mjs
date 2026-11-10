// post.mjs: OPTIONAL auto-post of a finished Short through Blotato. DRY RUN unless --go.
//   node post.mjs --list
//   node post.mjs "P" --platforms youtube,tiktok,instagram            (dry run: prints the requests, sends nothing)
//   node post.mjs "P" --platforms youtube --go [--public] [--schedule 2030-06-15T15:00:00Z] [--title ".."] [--caption ".."]
//   account ids: --youtube-account ID --tiktok-account ID --instagram-account ID (else auto-picked if the platform has exactly one)
// Key: env BLOTATO_API_KEY (never printed). Docs: https://help.blotato.com/api/start
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url'; import { execFileSync } from 'node:child_process';

// Renders are near-lossless (~94 MB for 16 s); Blotato's file limit depends on plan, so ship a ~10 Mbps H.264 copy.
function uploadCopy(file) {
  if (fs.statSync(file).size < 40e6) return file;
  const dst = file.replace(/\.mp4$/, '-upload.mp4');
  if (!fs.existsSync(dst)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', dst]);
  return dst;
}

const BASE = 'https://backend.blotato.com/v2';
const PLATFORMS = ['youtube', 'tiktok', 'instagram'];

export function parseArgs(argv) {
  const a = { dir: null, platforms: [], go: false, list: false, public: false, flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--go') a.go = true; else if (t === '--list') a.list = true; else if (t === '--public') a.public = true;
    else if (t.startsWith('--')) { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${t} needs a value`); a.flags[t.slice(2)] = v; }
    else if (!a.dir) a.dir = t; else throw new Error(`unexpected argument "${t}"`);
  }
  a.platforms = (a.flags.platforms || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  for (const p of a.platforms) if (!PLATFORMS.includes(p)) throw new Error(`unknown platform "${p}" (use: ${PLATFORMS.join(', ')})`);
  if (a.flags.schedule && isNaN(Date.parse(a.flags.schedule))) throw new Error('--schedule must be an ISO date like 2030-06-15T15:00:00Z');
  if (!a.list && !a.platforms.length) throw new Error('give --platforms youtube,tiktok,instagram (or --list)');
  if (!a.list && !a.dir) throw new Error('give the project folder');
  return a;
}

// title = story.md "# heading"; caption = the true fact + #Shorts (no "1 prompt" claims, per the skill rules)
export function storyText(md) {
  const title = (/^#\s+(.+)$/m.exec(md) || [])[1] || '';
  const fact = (/^Fact[^:\n]*:[ \t]*(.+)$/m.exec(md) || [])[1] || '';
  return { title, caption: fact ? `${fact}\n\n#Shorts` : '#Shorts' };
}

export function buildPost({ platform, accountId, title, caption, publicUrl, isPublic, schedule }) {
  const target = {
    youtube: { targetType: 'youtube', title: title.slice(0, 100), privacyStatus: isPublic ? 'public' : 'private', shouldNotifySubscribers: false, isMadeForKids: false, containsSyntheticMedia: true },
    tiktok: { targetType: 'tiktok', privacyLevel: isPublic ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY', disabledComments: false, disabledDuet: false, disabledStitch: false, isBrandedContent: false, isYourBrand: false, isAiGenerated: true },
    instagram: { targetType: 'instagram', mediaType: 'reel' },
  }[platform];
  const body = { post: { accountId, content: { text: caption, mediaUrls: [publicUrl], platform }, target } };
  if (schedule) body.scheduledTime = new Date(schedule).toISOString();
  return body;
}

export function pickVideo(dir) {
  const out = path.join(dir, 'out');
  const all = fs.existsSync(out) ? fs.readdirSync(out).filter(f => /-9x16\.mp4$/.test(f)) : [];
  const f = all.find(f => f.endsWith('-voiced-9x16.mp4')) || all[0];
  if (!f) throw new Error(`no out\\*-9x16.mp4 in ${dir} (render the Short first)`);
  return path.join(out, f);
}

const redact = o => JSON.stringify(o, null, 2);
async function api(key, method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { 'blotato-api-key': key, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 200) }; }
  if (r.status === 401) throw new Error('401: Blotato rejected BLOTATO_API_KEY (copy the full key, it may end in "=")');
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${j.message || j.error || j.raw || text.slice(0, 200)}`);
  return j;
}

async function main() {
  const a = parseArgs(process.argv.slice(2)); const key = process.env.BLOTATO_API_KEY;
  if (a.list || a.go) if (!key) throw new Error('set BLOTATO_API_KEY first (Blotato > Settings > API)');
  if (a.list) {
    const { items = [] } = await api(key, 'GET', '/users/me/accounts');
    if (!items.length) console.log('No accounts connected. Connect channels in Blotato > Accounts.');
    for (const x of items) console.log(`${x.id}\t${x.platform}\t${x.fullname || ''} (@${x.username || ''})`);
    return;
  }
  const dir = path.resolve(a.dir), file = uploadCopy(pickVideo(dir)), size = fs.statSync(file).size;
  const md = fs.existsSync(path.join(dir, 'story.md')) ? fs.readFileSync(path.join(dir, 'story.md'), 'utf8') : '';
  const st = storyText(md), title = a.flags.title || st.title, caption = a.flags.caption || st.caption;
  if (!title) throw new Error('no title: add "# Title" to story.md or pass --title');
  let accounts = [];
  if (key) accounts = (await api(key, 'GET', '/users/me/accounts')).items || [];
  const acct = p => {
    if (a.flags[p + '-account']) return a.flags[p + '-account'];
    if (!key) return `<${p.toUpperCase()}_ACCOUNT_ID>`;
    const m = accounts.filter(x => x.platform === p);
    if (m.length !== 1) throw new Error(m.length ? `${m.length} ${p} accounts connected: pick one with --${p}-account <id> (see --list)` : `no ${p} account connected in Blotato (Accounts page)`);
    return m[0].id;
  };
  const ids = Object.fromEntries(a.platforms.map(p => [p, acct(p)]));
  const MB = (size / 1048576).toFixed(1);
  const posts = Object.fromEntries(a.platforms.map(p => [p, buildPost({ platform: p, accountId: ids[p], title, caption, publicUrl: '<PUBLIC_URL_FROM_UPLOAD>', isPublic: a.public, schedule: a.flags.schedule })]));

  console.log(`${a.go ? 'SENDING' : 'DRY RUN (nothing is sent; add --go to post)'}  file ${path.basename(file)} (${MB} MB)  platforms ${a.platforms.join(', ')}  ${a.public ? 'PUBLIC' : 'private/unlisted-safe'}`);
  console.log(`\n1) POST ${BASE}/media/uploads\n   blotato-api-key: <redacted>\n${redact({ filename: path.basename(file) })}`);
  console.log(`\n2) PUT <presignedUrl>   Content-Type: video/mp4   body: ${MB} MB raw file`);
  for (const [i, p] of a.platforms.entries()) console.log(`\n${3 + i}) POST ${BASE}/posts   (${p})\n   blotato-api-key: <redacted>\n${redact(posts[p])}`);
  console.log(`\nthen GET ${BASE}/posts/<postSubmissionId> every 10 s until published/failed`);
  if (!a.go) return;

  const up = await api(key, 'POST', '/media/uploads', { filename: path.basename(file) });
  const put = await fetch(up.presignedUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) }, body: fs.createReadStream(file), duplex: 'half' });
  if (!put.ok) throw new Error(put.status === 413 ? `file too big for your Blotato plan (${MB} MB): shorten or compress it` : `upload failed: ${put.status}`);
  console.log('uploaded.');
  for (const p of a.platforms) {
    posts[p].post.content.mediaUrls = [up.publicUrl];
    const r = await api(key, 'POST', '/posts', posts[p]);
    console.log(`${p}: accepted (${r.postSubmissionId})${r.scheduledTime ? ' scheduled ' + r.scheduledTime : ''}`);
    if (r.scheduledTime) continue;
    for (let n = 0; n < 60; n++) {
      await new Promise(res => setTimeout(res, 10000));
      const s = await api(key, 'GET', '/posts/' + r.postSubmissionId);
      if (s.status === 'published') { console.log(`${p}: PUBLISHED ${s.publicUrl || s.postUrl || '(no url returned)'}`); break; }
      if (s.status === 'failed') { console.log(`${p}: FAILED ${s.errorMessage || ''} (see https://my.blotato.com/posts?status=failed)`); process.exitCode = 1; break; }
      if (n === 59) console.log(`${p}: still ${s.status} after 10 min; check Blotato. Id ${r.postSubmissionId}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error('ERROR: ' + e.message.replace(process.env.BLOTATO_API_KEY || '\0', '<key>')); process.exit(2); });
