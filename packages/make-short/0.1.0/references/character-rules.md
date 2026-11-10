# Character rules (step 3, the model sheet)

## The hero
The engine's hero is an original kid: nobody's IP, the same in every style.
- **A big round head**, about 45% of his body height. It reads on a phone at a glance.
- **Huge eyes**: white with big dark pupils. They must still read as two eyes in the roughest styles (pixel, ASCII).
- **A short body**, mitten hands and a plain cool-dark tunic, so nothing competes with the face.
- **One colour anchor**: a long RED scarf with two tails.
  - It has the same red in every style and every shot, and that red is used for nothing else in the frame.
  - The tails trail 2–4 frames behind his moves.
- **Size**: about 560 px tall in a medium shot, with his feet on the floor line. The face is never smaller than 1/8 of the 9:16 frame height.

## What a Short may change
- Props in his hands, the world around him, and his acting.
- If the user wants another hero (a cat, a robot), say plainly that the rig is the kid and a new species needs new drawing code. Offer a prop, a hat or a costume colour instead; the scarf stays red.

## Acting (how the engine moves him; follow it in `acting()`)
- **Timing.** Key poses with eases, never a slide from A to B. He is drawn on twos (a new drawing every 2 frames); the camera and the world move on ones.
- **The face leads.** The eyes lead the head by 3 frames, then the brows, then the mouth.
- **Big moves.** Every big move gets:
  - an anticipation of 4–8 frames (the wind-up);
  - an overshoot of 10–20%;
  - a settle of 8–14 frames.
- **Impacts.** A bonk holds 3 frames (the hit-stop) before the recoil.
- **Holds** never freeze: slow drift keeps him alive.
- **One clear emotion per beat**, readable from the face alone:
  - determined
  - smug
  - panic
  - offended
  - sad
  - angry
  - reading
  - sheepish
  - joyful
- **After every gag**, a reaction: at least 0.5 s on his face.
- **Poses and faces.** Use the named poses (`POSES`) and expressions (`EX`) that `core/pose.js` exports; the example story shows how.

## The model sheet (shown before the storyboard)
Render it with `node render.mjs --model-sheet` in the project folder. It shows:
- the hero front and 3/4;
- six expressions;
- the colour anchor.

Look at it before you show it: are the eyes readable, is the scarf red, is nothing cut off? Then show it to the user in one line, for example "Here is the hero for this Short", and go on to the storyboard. The APPROVE gate covers both.
