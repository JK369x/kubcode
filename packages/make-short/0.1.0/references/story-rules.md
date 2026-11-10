# Story rules (gate 1, the treatment)

Write the story before any drawing code. `story.md` keeps the film in one place, and the user approves it first.

## The film you can make
- 8–25 s at 30 fps. The engine renders ONE 1920x1920 master frame. The 9:16 Short is its middle column; the 16:9 version is its middle band.
- Everything that matters stays in the **safe square** (x 420–1500, y 420–1500): the face, the props, the text, the action. The edges are only the world.
- It is **silent**. The story must read with the sound off. Music can be added by hand when uploading (YouTube's audio library).
- One hero: the engine's kid (see `character-rules.md`). One world or a few, in one style or a few.

## A beat sheet passes when
1. **The want is in frame 1.** Frame 0 already shows the hero AND the thing he wants (a door, a jar, the sky), with no build-up and no logo. If there is a hook line, it has 4–7 words and reads in under 1 s.
2. **It escalates.** There are at least 2 tries, each bigger or different from the last, and each failure costs something visible (a heart, a dent, a mess).
3. **The payoff is earned.** The try that works comes from what the hero (and the viewer) learns, not from luck.
4. **One true fact (explainers).** The fact is one checkable sentence, shown by the picture and in at most 7 words on screen. Its source goes in `story.md`. No numbers you cannot source, and no "scientists say".
5. **It loops.** The last frames lead back into frame 0, in the same pose and with the same camera, so a replay feels like one film.
6. **It is 25 s or less.** Work on the beat grid: 15 frames = 0.5 s. Something changes every 1–2 s; no hold is longer than 2 s, and every beat holds at least 1 s so it reads.
7. **Every gag gets a reaction.** A hold of at least 0.5 s on the face after each gag.
8. **Text reads.**
   - At most 3 words per line, cap height of at least 54 px (master), inside the safe square.
   - On screen for at least `letters / 15 + 1 s`.
   - Only text the story needs.
9. **Generic IP.** Original hero and world. No famous characters, brands, logos, real people, or copied shots.
10. **Honest.**
    - Never write "1 prompt", "one prompt", "one click" or "fully automatic", anywhere.
    - What is true: a human approved the storyboard, and Claude wrote the code that draws every frame.

## Structures that fit 8–25 s (pick one, or invent one)
| structure | beats | good for |
|---|---|---|
| Try, fail, learn | want, try 1 fails, try 2 fails bigger, the fact appears, the right try works, loop | "how X works", "why X" explainers |
| Myth, then fact | hero does the common wrong thing, it backfires, the fact, does it right | busting a myth |
| Chain reaction | small cause, three growing effects, reveal, back to the start | "what happens if" |
| Zoom reveal | close detail, pull out in 3 steps, the surprise is the scale | size, distance, "inside X" |

## story.md format
```
# <title>
Logline: <one sentence: hero wants X, but Y, until Z>
Want: <what the hero wants, visible in frame 1>
Fact: <one sentence>  Source: <link or book>
Structures considered: 1) ... 2) ... 3) ...  -> chosen: <n> because <one line>
Loop: <how the last frames lead into frame 0>

| # | time | frames | picture (what we see) | hero feels | text on screen |
|---|------|--------|-----------------------|------------|----------------|
| 1 | 0.0-1.5 s | 0-45 | ... | determined | ... |
```
Show the user: the logline, the table, and the fact with its source. Then ask: "Approve the story, or tell me what to change." Change only what they ask.
