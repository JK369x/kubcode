# QA: Why ice floats

Run 11/3/2026, 12:26:14 AM. Automatic checks: all PASS.

| check | result | detail |
|---|---|---|
| format 9x16 | PASS | 1080x1920, 30.00 fps, 9.0 s (want 1080x1920, 30 fps, 25 s or less) |
| format 16x9 | PASS | 1920x1080, 30.00 fps, 9.0 s (want 1920x1080, 30 fps, 25 s or less) |
| pops 9x16 | PASS | PASS: no unexpected pops (3 on allowed frames) |
| pops 16x9 | PASS | PASS: no unexpected pops (2 on allowed frames) |
| loop 9x16 | PASS | PASS: the loop joins like a normal frame step (picture: review/loop.png) |
| text in safe area | PASS | PASS: all readable text stays in the safe area (16 s) |

## Eye checks (answer yes/no after looking at review/contact-9x16.png, review/storyboard.png and any pop pictures)

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

## Tool output

```
POPS  <project>\out\why-ice-floats-9x16.mp4  270 frames @ 30 fps, master frames 0-269, 4 allowed windows, k=3
  ok   f133        change  15.6 (worst block  99)  3.4x local  allow 133
  ok   f202        change   3.5 (worst block  40)  3.0x local  allow 205
  ok   f204        change   5.0 (worst block  56)  3.7x local  allow 205
PASS: no unexpected pops (3 on allowed frames)
POPS  <project>\out\why-ice-floats-16x9.mp4  270 frames @ 30 fps, master frames 0-269, 4 allowed windows, k=3
  ok   f133        change  18.9 (worst block  89)  3.6x local  allow 133
  ok   f204        change   5.6 (worst block  69)  4.8x local  allow 205
PASS: no unexpected pops (2 on allowed frames)
LOOP  <project>\out\why-ice-floats-9x16.mp4  270 frames
  last -> first change 3.8 (worst block 30)
  normal step near the ends 3.1 (worst block 13)  ->  1.2x / 2.3x  (limit 2.5x)
  picture (last | first | difference): <project>\review\loop.png
PASS: the loop joins like a normal frame step
TEXT  <project>  frames 0-269 every 3, safe area x 420-1500, y 420-1500
  ...frame 90 (5 s)
  ...frame 180 (11 s)
  inside: 3 texts: "WILL IT SINK?" 72px, "SAME SIZE:" 52px, "ICE 8% LIGHTER" 52px
PASS: all readable text stays in the safe area (16 s)
```
