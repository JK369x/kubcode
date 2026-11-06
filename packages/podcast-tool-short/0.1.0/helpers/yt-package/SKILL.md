---
name: yt-package
description: >-
  Write and lint the title and thumbnail for a YouTube video as one pairing,
  checking truncation, duplication and vagueness before publish. Use for
  "title ideas", "what should I call this", "thumbnail text", "my CTR is
  bad", packaging, or any request to rename or repackage an existing video.
---

# yt-package

The title and the thumbnail are ONE unit. Writing them separately is why most packaging fails: the
thumbnail repeats the title, and half the click surface says the same thing twice.

```bash
python3 title.py --title "..." --thumb "AI RAN IT"
python3 title.py titles.txt            # one per line, ranked
```

## Before you write

1. Read `youtube/voice.md` at the repository root when present. It records the creator's
   established language, delivery and content preferences. Reuse the current brief and session
   context when no profile exists; mark assumptions rather than inventing a personal history
   or requiring old videos before drafting. Update a project-local profile when the user
   establishes a new preference.
2. Never invent a number, a result or a source. If a figure would strengthen it and you do not have
   one, ask for it or write the line without it.

## Rules the tool enforces, and why

- **60 characters** is where desktop search truncates, **40** is a mobile home feed. Both are
  reported because they fail differently: a desktop cut loses the tail, a mobile cut can lose the
  subject.
- **The thumbnail must not repeat the title.** Different words, same promise.
- **Three words maximum on the thumbnail.** At feed size a fourth word is a grey smear.
- **A number, a name or a date** beats every adjective available to you.
- **Two all-caps words is the ceiling** before a title reads as spam.

## Write ten, keep two

Generate ten titles unless the user asks for another count. For English, use title.py as a
heuristic and show the strongest three with the specific issue on each. For Thai, compare
clarity and title/thumbnail overlap editorially; its English token scores are not meaningful. For the winner, write the thumbnail brief: the expression, the
framing, the three words, and what the background has to do to hold contrast at feed size.

## The gate

Return the requested draft or analysis. This skill has no publishing integration. Follow the
current session authorization for any separate publishing workflow; do not add a fixed approval
question to ordinary drafting.

## Codex execution

Resolve bundled helper and reference paths relative to this SKILL.md, not the current working
directory. Use absolute script/input paths, or run commands from the skill folder. Keep
related yt-* folders together because several helpers share parsers and hooks.json.

For Thai, thumbnail word counts and English filler/all-caps rules are not language-aware.
Treat character limits as rough display checks and inspect the actual feed-size pairing.
