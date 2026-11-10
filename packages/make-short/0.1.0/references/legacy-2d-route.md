---
name: make-short
description: Turn one idea into an animated YouTube Short (9:16, plus a 16:9 version). Claude writes the story and the code that draws every frame; headless Chrome renders it on this PC. It works in gates - a story beat sheet the user approves, a character model sheet, a storyboard contact sheet - and renders in full only after the user types "approve". Then pass/fail QA, a receipt and an optional manual upload checklist. No API keys, never uploads. Use for "/make-short <idea>", "make an animated short about ...", "turn this into a Short".
---

# make-short

You make one animated Short from one idea:
- you write the story with the user, then the code that draws each frame;
- the engine renders it on this PC.

The user is not a developer. They read short messages, look at pictures you open for them, and type plain words. Nothing renders in full until they type **approve**, and nothing is ever uploaded.

**SKILL** = this skill's folder (Claude Code shows it as "Base directory for this skill"). **P** = the project folder that step 1 prints. In every command below, replace SKILL, P and the angle-bracket parts, and keep the quotes.

## Rules, always
- **Nothing paid, nothing published.** No API keys, no paid services, no uploads, no posting.
- **No false claims.** Never write "1 prompt", "one prompt", "one click" or "fully automatic", on screen or in titles, descriptions or messages. What is true: the user approved the storyboard, and Claude wrote the code for every frame.
- **Generic IP only.** Original hero and world; no famous characters, brands, logos or real people.
- **Gates stop.** At a gate, show the result and stop. Never go on until the user answers.
- **Show pictures.** Open every sheet and video with `node "SKILL\scripts\show.mjs" "<file>"`, then describe it in one line. Look at each picture yourself first (read the PNG).
- **Errors.** If a command fails, fix it with `references/windows-troubleshooting.md` and tell the user in one line. Never show a stack trace.
- **Short messages.** At most 5 lines between steps, plus the gate question.

## 0. Check the PC (once per PC)
- Run `node "SKILL\scripts\doctor.mjs"`.
- **The user sees** READY, or a FIX line with an exact command (for example `winget install Gyan.FFmpeg`).
- **The user types** nothing when it says READY. Otherwise they run the FIX command, open a new terminal, and you run doctor again.

## 1. Idea
1. **Choose.**
   - Take the idea from the user's message.
   - Propose a style from the "Pick a style" table in `references/style-catalogue.md`. 2D styles are the safest first run.
   - Propose a length: 15–20 s, never more than 25.
2. **The user sees** one line, for example: "Why the sky is blue, flat cartoon style, 18 s. OK?"
3. **The user types** "ok", or a change ("blueprint", "12 seconds"). Ask at most one question round.
4. **Make the project:** `node "SKILL\scripts\new-short.mjs" "<title>" --style <style> --seconds <s>`. It prints **P**.
   - The project goes in the current folder. Suggest `C:\shorts` if the current folder is inside OneDrive.

## 2. Story: GATE 1 (the treatment)
1. **Write the beat sheet.** Read `references/story-rules.md` and write `P\story.md`:
   - the logline and the want (seen in frame 1);
   - the true fact and its source;
   - three structures and your pick;
   - the beat table;
   - the loop.
2. **The user sees** the logline, the beat table, and the fact with its source.
3. **Ask:** "Approve the story, or tell me what to change."
4. **The user types** "approve" / "yes", or changes ("make him angrier", "the fact should be about X"). Change only what they ask, then show it again.
5. **When they approve**, fill in the "Story approved by the user:" line in story.md with the date and time.

## 3. Character: the model sheet
1. Run `node "SKILL\scripts\sheet.mjs" model "P"`, then `node "SKILL\scripts\show.mjs" "P\review\model.png"`.
2. **The user sees** the hero, front and 3/4, with six expressions. Its rules are in `references/character-rules.md`: a big head, big eyes, a red scarf.
3. **Say** one line, "This is the hero for this Short; next I build the storyboard", and go on.
4. **The user types** nothing, unless they want a change: a prop, a costume colour, or a different emotion in the story. The scarf stays red.

## 4. Storyboard: the contact sheet
1. **Write the story code.** Follow `SKILL\template\README.md`, and copy patterns (never the story) from the working example in `SKILL\template\example\`. Two files:
   - `P\core\scene.js`:
     - `beats(tl)`: every beat as a frame, plus `hits` and `pops`;
     - `acting(B)`: the hero's poses, faces and props;
     - `scene(f, tl)`: all world state at frame f;
     - `keyframes(tl)`: the storyboard panels;
     - `punch()`: the camera kick on impacts.
   - `P\scenes\<slug>\<style>.js`: draws `scene(f)` with the style's kit. `references/style-catalogue.md` lists each kit's functions, and `P\scenes\door\<style>.js` is a full example.
2. **Check single frames while you write.** In P, run `node render.mjs --stills f0,f90 --clean`, then read `P\stills\f0.png`.
3. **Make the storyboard:** `node "SKILL\scripts\sheet.mjs" storyboard "P"`. Read `P\review\storyboard.png` yourself. Every panel must show its beat, with the face readable and the text inside the frame. Fix and repeat, at most 3 rounds.
4. **The user sees** this step take longest: 10–20 minutes of you writing code. Post one short progress line every few minutes, for example "Glass and water drawn; now the ice cube's path". They type nothing.

## 5. APPROVE: GATE 2
1. Open the storyboard: `node "SKILL\scripts\show.mjs" "P\review\storyboard.png"`.
2. **The user sees** the storyboard (one panel per beat, with time and caption) and this question:
   **"Type approve to render the video (about <N> minutes), or tell me what to change."**
   - N: about 2–3 minutes per 10 s for a 2D style on a gaming laptop (the 9 s flat example took 2.1–2.3 min). Double it on a slower PC; 3D styles take longer.
3. **The user types:**
   - **approve**: only that word passes. If they type "ok", "yes" or "looks good", ask them to type approve.
   - **notes**: change the story code, make the storyboard again (step 4.3), and ask again.
4. **When they approve**, fill in the "Storyboard approved" line in story.md with the date and time.

## 6. Render
1. Run `node "SKILL\scripts\render-short.mjs" "P"`. It renders both formats in one pass.
2. **The user sees** progress lines, then "RENDERED in N min". They type nothing.
3. **Output:** `P\out\<slug>-9x16.mp4` (the Short) and `P\out\<slug>-16x9.mp4`, with contact sheets in `P\review\`.
4. **On a drawing error** (a WARNING line), fix the scene file and render again.

## 7. QA: pass/fail
1. **Run the checks.** Run `node "SKILL\scripts\qa.mjs" "P"`. It checks the format, pops, the loop and text in the safe area, and writes `P\review\qa.md`.
2. **Look.** Read `review\contact-9x16.png`, `review\contact-16x9.png`, and any `pops-*.png` or `loop.png`. Answer every eye check in `qa.md` with yes or no (`references/qa-checklist.md`).
3. **Fix what fails.** For a FAIL, look at its picture first.
   - If a pop is planned (an impact, a snappy take), add its frame to `beats(tl).pops`.
   - Otherwise fix the motion, then render and QA again.
   - At most 2 rounds. After that, show the user what still fails and let them decide.
4. **The user sees** a list of PASS/FAIL lines, never scores. Then open the Short: `node "SKILL\scripts\show.mjs" "P\out\<slug>-9x16.mp4"`.
5. **The user types** nothing, or notes ("slower at the end"). Notes mean a fix, then render and QA again, all counted on the receipt.

## 8. Receipt
1. Run `node "SKILL\scripts\receipt.mjs" "P"`.
2. **The user sees** exactly what it prints:
   - the render minutes on this PC;
   - the number of renders;
   - the approvals recorded in story.md;
   - the files.

   Do not round or restate the numbers. They type nothing.

## 9. Upload checklist (optional, manual)
- Only if the user asks. **The user types** "upload checklist", and **sees** the filled-in checklist.
- Fill in `P\upload-checklist.md`:
  - three titles that start with a verb;
  - the description, with the fact's source and `#Shorts`;
  - the audience and disclosure answers.
- The user uploads by hand in YouTube Studio. Never upload, schedule or post for them.

## Files
- `scripts\`
  - `doctor.mjs`: checks the PC.
  - `new-short.mjs`: makes a project.
  - `sheet.mjs`: the model sheet, the storyboard and the video sheets.
  - `show.mjs`: opens a file for the user.
  - `render-short.mjs`: the full render.
  - `qa.mjs`: runs all the checks.
    - `qa-pops.mjs`: frame pops.
    - `qa-loop.mjs`: the loop.
    - `qa-text.mjs`: text in the safe area.
  - `receipt.mjs`: the receipt.
  - `sync-engine.mjs`: maintainers only.
- `references\`: story rules, character rules, the style catalogue, the QA checklist, Windows troubleshooting.
- `template\`: the project layout (`README.md`) and a complete 9 s example with its videos, sheets, QA and receipt.
- `engine\`: the renderer (core, styles, transitions, three.js, fonts). Never edit it; the story lives in P.
