"""Step 2: timestamped narration; optionally retain all provider pauses.

python <skill>/scripts/voice.py <slug> [--force]
Reads src/episodes/<slug>/episode.json (script, voice, gaps).
Writes public/<slug>/voice_raw.mp3 and voice.wav, episode words.json, and
out/<slug>/words_raw.json plus intact provider alignment_raw.json and
normalized_alignment_raw.json under out/<slug>.

Set episode "preserve_pauses": true (or voice.preserve_pauses) to bypass pause
removal entirely. Default false retains legacy tightening. There is no time
stretching or pitch processing. Thai alignment units are whitespace-delimited
phrases, retaining combining marks/punctuation and original character times;
they are explicitly labeled unit="phrase", not linguistic word segmentation.

Voice fields: id, model, settings, optional language_code. Explicit settings
replace defaults, never merge. Only legacy eleven_multilingual_v2 inherits
legacy settings; language_code is omitted for that model. Thai v3 workflows
can explicitly select model="eleven_v3", language_code="th", settings={"stability":0.5}.
No v3 settings are forced here. Every POST remains subject to wi.api's frozen
release, numeric cap and permanent duplicate protection (including --force).
Changing gaps or preserve_pauses reuses the raw take without a new POST.

Legacy gaps defaults (seconds): word=.12, comma=.2, sentence=.3, question=.45;
optional pairs={"anything|One":.6}. Long gaps are cut only when not preserving.
"""
import base64, hashlib, json, re, sys, time, unicodedata

import numpy as np

from voice_alignment import alignment_units
from wi import SR, api, spent_since, decode, ep_dir, load_episode, load_json, log_cost, out_dir, pub_dir, save_json, write_wav

slug = sys.argv[1]
force = '--force' in sys.argv
ep = load_episode(slug)
V = {'id': 'TX3LPaxmHKxFdv7VOQHJ', 'model': 'eleven_multilingual_v2', 'settings': {'stability': 0.4, 'similarity_boost': 0.8, 'style': 0.35, 'use_speaker_boost': True}}
V.update(ep.get('voice', {}))
# Only the legacy v2 model inherits tutorial defaults. Other model settings are
# explicit operator choices; a provided settings object is never merged.
if V['model'] != 'eleven_multilingual_v2' and 'settings' not in ep.get('voice', {}):
    V.pop('settings', None)
text = ' '.join(b['text'].strip() for b in ep['script'])
preserve_pauses = ep.get('preserve_pauses', V.get('preserve_pauses', False))
provider_config = {k: v for k, v in V.items() if k != 'preserve_pauses'}
sig = hashlib.sha1(json.dumps([text, provider_config], sort_keys=True).encode()).hexdigest()[:12]
raw_mp3 = pub_dir(slug) / 'voice_raw.mp3'
raw_words = out_dir(slug) / 'words_raw.json'
meta = load_json(out_dir(slug) / 'voice_meta.json', {})

if force or meta.get('sig') != sig or not raw_mp3.exists() or not raw_words.exists():
    print(f'{len(text)} characters to ElevenLabs (voice {V["id"]})')
    t0 = time.time()
    request = {'text': text, 'model_id': V['model']}
    if 'settings' in V:
        request['voice_settings'] = V['settings']
    if V.get('language_code') and V['model'] != 'eleven_multilingual_v2':
        request['language_code'] = V['language_code']
    res = json.loads(api(f'/v1/text-to-speech/{V["id"]}/with-timestamps?output_format=mp3_44100_128', request))
    al = res['alignment']
    # Preserve provider character arrays intact; never normalize or invent word times.
    save_json(out_dir(slug) / 'alignment_raw.json', al)
    if res.get('normalized_alignment') is not None:
        save_json(out_dir(slug) / 'normalized_alignment_raw.json', res['normalized_alignment'])
    alignment_units(al, V.get('language_code'))  # validate before decoding/writing audio
    audio_bytes = base64.b64decode(res['audio_base64'], validate=True)
    x = decode(audio_bytes)
    words = alignment_units(al, V.get('language_code'), duration=len(x) / SR)
    raw_mp3.write_bytes(audio_bytes)
    save_json(raw_words, words)
    save_json(out_dir(slug) / 'voice_meta.json', {'sig': sig, 'chars': len(text)})
    used, n = spent_since(t0, expect=1)
    log_cost(slug, 'voice', used, f'{len(text)} characters' + ('' if n else '; not in the history yet, check the usage page'))
else:
    print('Voice unchanged since the last call: reusing it (no credits).')
    x = decode(raw_mp3)
    cached_alignment = load_json(out_dir(slug) / 'alignment_raw.json')
    if cached_alignment is not None:
        words = alignment_units(cached_alignment, V.get('language_code'), duration=len(x) / SR)
    else:
        # Legacy English caches can retain their timings. Thai needs the parent
        # character alignment recovered from the private response, not a new POST.
        words = load_json(raw_words)
        if V.get('language_code') == 'th' or any('\u0e00' <= ch <= '\u0e7f' for w in words for ch in w['w']):
            raise ValueError('Recover provider alignment for this Thai cache; do not regenerate')

# ---------------------------------------------------------------- tighten the pauses
G = {'word': 0.12, 'comma': 0.2, 'sentence': 0.3, 'question': 0.45, 'pairs': {}}
G.update(ep.get('gaps', {}))
cuts = []


def bare(w):
    return ''.join(ch for ch in w if re.fullmatch(r'\w', ch) or unicodedata.category(ch).startswith('M'))


for a, b in ([] if preserve_pauses else zip(words, words[1:])):
    gap = b['s'] - a['e']
    key = bare(a['w']) + '|' + bare(b['w'])
    if key in G['pairs']:
        keep = G['pairs'][key]
    elif '?' in a['p'] or '!' in a['p']:
        keep = G['question']
    elif '.' in a['p'] or ':' in a['p'] or ';' in a['p'] or '…' in a['p']:
        keep = G['sentence']
    elif ',' in a['p'] or '—' in a['p'] or '-' in a['p']:
        keep = G['comma']
    else:
        keep = G['word']
    if gap > keep:
        mid = (a['e'] + b['s']) / 2
        rm = gap - keep
        cuts.append((mid - rm / 2, mid + rm / 2))
parts, last = [], 0.0
for s, e in cuts:
    parts.append(x[int(last * SR):int(s * SR)])
    last = e
parts.append(x[int(last * SR):])
fade = int(0.004 * SR)  # a 4 ms fade either side of each join, so no click
for i, part in enumerate(parts):
    part = part.copy()
    if i > 0 and len(part) > fade:
        part[:fade] *= np.linspace(0, 1, fade)
    if i < len(parts) - 1 and len(part) > fade:
        part[-fade:] *= np.linspace(1, 0, fade)
    parts[i] = part
y = np.concatenate(parts)
write_wav(pub_dir(slug) / 'voice.wav', y)


def shift(t):
    return t - sum(min(e, t) - s for s, e in cuts if t > s)


out = [dict(w) if preserve_pauses else {**w, 's': round(shift(w['s']), 3), 'e': round(shift(w['e']), 3)} for w in words]
save_json(ep_dir(slug) / 'words.json', out)
print(f'Tightened {len(cuts)} pauses, removed {sum(e - s for s, e in cuts):.2f} s: {len(x) / SR:.2f} s -> {len(y) / SR:.2f} s')

