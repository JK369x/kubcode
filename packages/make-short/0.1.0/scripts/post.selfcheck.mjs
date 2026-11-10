// node post.selfcheck.mjs : no network, no key.
import assert from 'node:assert/strict';
import { parseArgs, storyText, buildPost } from './post.mjs';

const a = parseArgs(['C:\\p', '--platforms', 'youtube, TikTok', '--public', '--go', '--title', 'T']);
assert.deepEqual(a.platforms, ['youtube', 'tiktok']); assert.ok(a.go && a.public); assert.equal(a.flags.title, 'T');
assert.equal(parseArgs(['--list']).list, true);
assert.throws(() => parseArgs(['p', '--platforms', 'myspace']), /unknown platform/);
assert.throws(() => parseArgs(['p']), /--platforms/);
assert.throws(() => parseArgs(['p', '--platforms', 'youtube', '--schedule', 'soon']), /ISO/);

const s = storyText('# Why\n\nFact (one true sentence): air scatters blue.\n');
assert.equal(s.title, 'Why'); assert.equal(s.caption, 'air scatters blue.\n\n#Shorts');

const base = { accountId: '1', title: 'Why', caption: 'c', publicUrl: 'u' };
const yt = buildPost({ ...base, platform: 'youtube' });
assert.equal(yt.post.target.privacyStatus, 'private'); assert.equal(yt.scheduledTime, undefined);
assert.equal(buildPost({ ...base, platform: 'youtube', isPublic: true }).post.target.privacyStatus, 'public');
assert.equal(buildPost({ ...base, platform: 'tiktok' }).post.target.privacyLevel, 'SELF_ONLY');
assert.equal(buildPost({ ...base, platform: 'instagram' }).post.content.platform, 'instagram');
const sch = buildPost({ ...base, platform: 'youtube', schedule: '2030-06-15T15:00:00Z' });
assert.equal(sch.scheduledTime, '2030-06-15T15:00:00.000Z'); assert.ok(!('scheduledTime' in sch.post));
console.log('post self-check: OK');
