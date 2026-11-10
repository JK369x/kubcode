# QA checklist (step 7): pass/fail, never scores

Each line passes or fails. A failed line gets fixed (at most 2 rounds of fix, render, QA). After that, show the user what still fails and let them decide. Never give marks like "8/10".

## Automatic (`scripts/qa.mjs` runs all of them and writes `review/qa.md`)
| check | fails when | the fix |
|---|---|---|
| format 9:16 / 16:9 | not 1080x1920 / 1920x1080, not 30 fps, or longer than 25 s | timeline `frames` and `fps` |
| pops (both crops) | a unique jump: one frame changes 3x more than its neighbours and 1.5x more than any other spike within 12 frames, on a frame that is not a planned bonk, cut or seam (line boil, blinks and fast moves repeat, so they are not pops) | ease the move, add in-betweens, or list the frame in `beats(tl).pops` if it is planned |
| hard cut warning | the whole frame changes in one step, even on an allowed frame | a seam that ends too fast; spread it over its 15 frames |
| loop (9:16) | the last→first jump is more than 2.5x a normal frame step | end on frame 0's pose and camera |
| text in safe area | text 24 px tall or more sticks out of x/y 420–1500, or the page threw errors | move or shrink the text; fix the error shown |

The picture for each failure is in `review/`: `pops-9x16.png` (before | after), `loop.png` (last | first | difference).

## Eye checks
Look at `review/contact-9x16.png`, `review/contact-16x9.png` (one frame per second), the storyboard, and any pop pictures. For a close look at a frame, run `node render.mjs --stills f123` in the project; it saves `stills/f123.png`. Then answer each line yes or no in `review/qa.md`:

- [ ] Frame 1 shows the hero and what he wants; the hook text (if any) reads in under 1 s.
- [ ] Every beat of story.md is on screen, in order, within 0.5 s of its planned time.
- [ ] The hero's face (both eyes) is readable in every key frame; no arm, prop or text covers it.
- [ ] Each failure is bigger than the one before, and the payoff comes from the fact, not luck.
- [ ] The fact is true, matches its source in story.md, and stays on screen long enough to read.
- [ ] All text is spelled right and inside the safe square, and nothing says "1 prompt" or "one prompt".
- [ ] The scarf is the same red in every shot, and no other big shape uses that red.
- [ ] There is no red FAILED panel, no black frame, and no frozen stretch over 1 s that is not a planned hold.
- [ ] The last second flows into the first (the loop) with no jump in pose, camera or colour.
- [ ] Nothing looks like a famous character, brand or logo.
- [ ] 16:9: nothing important is cut at the sides, and the extra width shows the world, not empty space.
