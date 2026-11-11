"""Pure provider-alignment parsing. Thai units are whitespace phrases, not words.

No Unicode normalization or invented/subdivided character timings is performed.
"""
import math
import re


def alignment_units(alignment, language_code=None, duration=None):
    try:
        chars, starts, ends = (alignment[k] for k in ('characters', 'character_start_times_seconds', 'character_end_times_seconds'))
        if not chars or len(chars) != len(starts) or len(chars) != len(ends):
            raise ValueError('Empty or mismatched provider alignment')
        previous_start = previous_end = 0
        for ch, start, end in zip(chars, starts, ends):
            if not isinstance(ch, str) or not ch:
                raise ValueError('Invalid alignment character')
            if any(isinstance(t, bool) or not isinstance(t, (int, float)) or not math.isfinite(t) for t in (start, end)):
                raise ValueError('Invalid alignment time')
            if not (0 <= start <= end and start >= previous_start and end >= previous_end):
                raise ValueError('Nonmonotonic provider alignment')
            if duration is not None and end > duration:
                raise ValueError('Alignment exceeds audio duration')
            previous_start, previous_end = start, end
    except (KeyError, TypeError) as exc:
        raise ValueError('Malformed provider alignment') from exc
    words, cur = [], None
    thai = language_code == 'th' or any('\u0e00' <= c <= '\u0e7f' for c in ''.join(alignment['characters']))
    for ch, start, end in zip(alignment['characters'], alignment['character_start_times_seconds'], alignment['character_end_times_seconds']):
        included = not ch.isspace() if thai else bool(re.fullmatch(r"[\w'’]+", ch))
        if included:
            if cur is None:
                cur = {'w': '', 's': start, 'e': end, 'p': ''}
                if thai:
                    cur['unit'] = 'phrase'
            cur['w'] += ch
            cur['e'] = end
        else:
            if cur is not None:
                words.append(cur)
                cur = None
            if not thai and words and ch.strip():
                words[-1]['p'] += ch
    if cur is not None:
        words.append(cur)
    return words
