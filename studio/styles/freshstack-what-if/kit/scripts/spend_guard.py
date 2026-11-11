"""Fail-closed project-local paid ElevenLabs guard; no automatic retries.

Only private ledger hashes/IDs are recorded, never request prompts or credentials.
Transport accepts (path, canonical_body_bytes), returns (raw_bytes, headers).
"""
import fcntl
import hashlib
import json
import math
import os
import re
from pathlib import Path
import tempfile
from urllib.error import HTTPError


class SpendDenied(RuntimeError):
    pass


def canonical_body(body):
    return json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def _read(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise SpendDenied('Missing or malformed private authorization/state') from None


def _atomic(path, data):
    fd, name = tempfile.mkstemp(prefix='.pending-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            os.fchmod(out.fileno(), 0o600)
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def _json(path, data):
    _atomic(path, canonical_body(data))


def _number(value, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or (positive and value == 0):
        raise SpendDenied('Invalid numeric spending bound')
    return value


def _release_bound(approval, release):
    cap = _number(approval.get('credit_cap'), positive=True)
    if cap > 2000:
        raise SpendDenied('Approval exceeds project hard cap')
    scope = approval.get('scope', {})
    hard = {'voice_takes': 1, 'max_voice_characters': 400, 'new_sfx_clips': 8,
            'max_total_new_sfx_seconds': 12, 'music_beds': 1, 'max_music_seconds': 25}
    for key, maximum in hard.items():
        if _number(scope.get(key)) > maximum:
            raise SpendDenied('Approval scope exceeds project bounds')
    if scope.get('music_endpoint') != 'sound-generation':
        raise SpendDenied('Music must explicitly use sound-generation')
    rows = release.get('requests')
    if release.get('status') != 'released' or not isinstance(rows, list) or not rows:
        raise SpendDenied('Exact production release required')
    counts = dict(voice=0, sfx=0, music=0)
    durations = dict(sfx=0, music=0)
    total, ids, fingerprints = 0, set(), set()
    for row in rows:
        if not isinstance(row, dict):
            raise SpendDenied('Malformed release entry')
        identity, path, digest, kind = (row.get(k) for k in ('id', 'path', 'body_sha256', 'kind'))
        if not isinstance(identity, str) or not identity or identity in ids or not isinstance(path, str) or not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
            raise SpendDenied('Invalid or duplicate frozen request identity')
        fingerprint = (path.split('?')[0], digest)
        if fingerprint in fingerprints or kind not in counts:
            raise SpendDenied('Duplicate payload or missing explicit request kind')
        ids.add(identity)
        fingerprints.add(fingerprint)
        counts[kind] += 1
        reserve = _number(row.get('reserve_credits'), positive=True)
        if kind == 'voice':
            if not re.fullmatch(r'/v1/text-to-speech/[A-Za-z0-9_-]+/with-timestamps(?:\?output_format=mp3_44100_128)?', path) or row.get('model_id') != 'eleven_v3' or row.get('language_code') != 'th':
                raise SpendDenied('Only approved Thai v3 timestamped narration is allowed')
            estimate = _number(row.get('voice_characters'), positive=True)
            if estimate > scope['max_voice_characters']:
                raise SpendDenied('Narration character scope exceeded')
        else:
            if not re.fullmatch(r'/v1/sound-generation(?:\?output_format=mp3_44100_128)?', path) or not isinstance(row.get('model_id'), str) or not row['model_id']:
                raise SpendDenied('Explicit model and sound-generation endpoint required')
            duration = _number(row.get('duration_seconds'), positive=True)
            if duration > (scope['max_music_seconds'] if kind == 'music' else scope['max_total_new_sfx_seconds']):
                raise SpendDenied('Sound duration scope exceeded')
            durations[kind] += duration
            estimate = math.ceil(duration * 40)
        if reserve < estimate:
            raise SpendDenied('Reservation below conservative estimate')
        total += reserve
    if counts['voice'] > scope['voice_takes'] or counts['sfx'] > scope['new_sfx_clips'] or counts['music'] > scope['music_beds'] or durations['sfx'] > scope['max_total_new_sfx_seconds'] or durations['music'] > scope['max_music_seconds']:
        raise SpendDenied('Aggregate frozen release scope exceeded')
    if total > cap:
        raise SpendDenied('Frozen release exceeds numeric cap')
    return cap


def _payload_matches(row, body):
    if not isinstance(body, dict) or not isinstance(body.get('text'), str) or not body['text'].strip() or body.get('model_id') != row.get('model_id'):
        raise SpendDenied('Explicit payload text/model required')
    if row['kind'] == 'voice':
        if len(body['text']) != row['voice_characters'] or body.get('language_code') != row.get('language_code'):
            raise SpendDenied('Frozen voice metadata does not match payload')
    elif _number(body.get('duration_seconds'), positive=True) != row['duration_seconds']:
        raise SpendDenied('Explicit frozen sound duration required')


def _headers(headers):
    allowed = {'request-id', 'x-request-id', 'history-item-id', 'character-cost', 'content-type', 'date'}
    return {str(k).lower(): str(v) for k, v in (headers or {}).items() if str(k).lower() in allowed}


def paid_request(private, path, body, transport):
    private = Path(private)
    private.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(private, 0o700)
    with open(private / 'spend.lock', 'a+b') as lock:
        os.fchmod(lock.fileno(), 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        approval = _read(private / 'spend-approval.json')
        if approval.get('status') != 'approved' or approval.get('generation_gate') != 'open':
            raise SpendDenied('Paid generation gate is closed')
        release = _read(private / 'production-release.json')
        cap = _release_bound(approval, release)
        encoded = canonical_body(body)
        digest = hashlib.sha256(encoded).hexdigest()
        matches = [r for r in release.get('requests', []) if r.get('path') == path and r.get('body_sha256') == digest]
        if release.get('status') != 'released' or len(matches) != 1:
            raise SpendDenied('Exact production release required')
        row = dict(matches[0])
        _payload_matches(row, body)
        ledger_path = private / 'spend-ledger.json'
        release_digest = hashlib.sha256(canonical_body(release)).hexdigest()
        ledger = _read(ledger_path) if ledger_path.exists() else {'requests': [], 'release_sha256': release_digest}
        if ledger.get('release_sha256') != release_digest:
            raise SpendDenied('Frozen release changed; explicit operator reconciliation required')
        if any(r.get('body_sha256') == digest and r.get('path', '').split('?')[0] == path.split('?')[0] for r in ledger['requests']):
            raise SpendDenied('Duplicate paid payload is permanently blocked; recover persisted response')
        if any(r.get('state') not in ('received', 'reconciled') for r in ledger['requests']):
            raise SpendDenied('Previous paid outcome uncertain; explicit receipt reconciliation required')
        exposure = 0
        for previous in ledger['requests']:
            reserved = _number(previous.get('reserve_credits'), positive=True)
            if previous.get('state') == 'reconciled' and (not previous.get('receipt_id') or 'actual_credits' not in previous):
                raise SpendDenied('Reconciled outcome requires actual receipt and numeric credits')
            actual = _number(previous['actual_credits']) if 'actual_credits' in previous else reserved
            exposure += max(reserved, actual)
        if exposure + row['reserve_credits'] > cap:
            raise SpendDenied('Aggregate reserved/actual credit cap exceeded')
        token = hashlib.sha256((path + '\n' + digest).encode()).hexdigest()
        row.update(state='submitted', response_file=token + '.response.bin', headers_file=token + '.headers.json')
        ledger['requests'].append(row)
        _json(ledger_path, ledger)  # durable pre-submit reservation, under lock
        try:
            raw, headers = transport(path, encoded)  # exactly one attempt
            _atomic(private / row['response_file'], raw)
            _json(private / row['headers_file'], _headers(headers))
            row['state'] = 'received'
            _json(ledger_path, ledger)
        except BaseException as exc:
            # A timeout, process interruption, HTTP error or persistence failure
            # never proves that the provider did not charge. Retain the cap.
            row['state'] = 'uncertain'
            row['error_type'] = type(exc).__name__
            if isinstance(exc, HTTPError):
                row['http_status'] = exc.code
                try:
                    _atomic(private / row['response_file'], exc.read())
                    _json(private / row['headers_file'], _headers(exc.headers))
                finally:
                    _json(ledger_path, ledger)
            else:
                _json(ledger_path, ledger)
            raise SpendDenied('Paid outcome uncertain; recover private response and reconcile before continuing') from None
        return raw
