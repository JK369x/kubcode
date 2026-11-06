---
name: yt-seo
description: >-
  Write the description, tags and search-facing text for a YouTube video,
  aimed at the query a real person types. Use for "write my description",
  "tags", "SEO", "help this video get found", "nobody is finding this".
---

# yt-seo

Search is a smaller lever than packaging and a bigger one than people think for evergreen videos.
For a video aimed at the subscriber feed, say so and spend the effort on `$yt-package` instead.

## Before you write

1. Read `youtube/voice.md` at the repository root when present. It records the creator's
   established language, delivery and content preferences. Reuse the current brief and session
   context when no profile exists; mark assumptions rather than inventing a personal history
   or requiring old videos before drafting. Update a project-local profile when the user
   establishes a new preference.
2. Never invent a number, a result or a source. If a figure would strengthen it and you do not have
   one, ask for it or write the line without it.

## The description

- **The first two lines are the only ones anyone reads.** They show above "...more" and they are
  the search snippet. Say what the video gives them, in the words they would have typed.
- Then the link or the resource, if there is one, so it is above the fold.
- Then chapters (`$yt-chapters` writes them).
- Then the long version: what is covered, who it is for, what it assumes.

## Tags, honestly

Tags are a weak signal and YouTube has said so. Use them for disambiguation - spellings, the tool
names, the abbreviations people actually type - and stop. Fifteen is plenty. A wall of tags is not
a strategy and stuffing unrelated ones is against the terms.

## The query test

Before handing anything over, write the three search queries this video should win, and check the
title and first two description lines contain the words in those queries. If they do not, the
problem is the title, not the description.

## The gate

Return the requested draft or analysis. This skill has no publishing integration. Follow the
current session authorization for any separate publishing workflow; do not add a fixed approval
question to ordinary drafting.

## Codex execution

Resolve bundled helper and reference paths relative to this SKILL.md, not the current working
directory. Use absolute script/input paths, or run commands from the skill folder. Keep
related yt-* folders together because several helpers share parsers and hooks.json.
