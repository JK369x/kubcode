# RUBRIC (blank): score a Short against a reference clip

Use: an independent critic (a fresh subagent that did NOT build the film) fills the Score and Evidence columns. The builder never scores its own film (builders rate about 2 points too high). Nothing in this file is pre-filled: every score comes from this round's frames.

Method: extract frames at 4 fps (360x640) from the reference and from our render into `critic/fr_ref/` and `critic/fr_our/`; make matched 1 fps sheets (reference on top, ours below); compute lapvar (Laplacian variance) and frame-to-frame step with numpy. Items marked "eye" are counted by looking at strips. Verify every critic claim at full resolution before acting on it (lesson 28).

| # | Criterion | 10/10 means | Test you can run | Score /10 | Evidence (frames, numbers) |
|---|---|---|---|---|---|
| 1 | Character acting | Squash/stretch, lean, anticipation, reaction hold 0.4-0.8 s, mouth flaps on dialogue | Per character shot, count distinct pose/expression changes per second on 4 fps strips (eye). Target >= 2/s speaking; hold >= 0.4 s after each gag | | |
| 2 | Face size | Head 30-40% of frame height in character shots; no tiny characters | Head height / frame height on every character frame; fraction of frames < 15% | | |
| 3 | Sharpness | Blur only in intended 6-frame whips; beat frames sharp | lapvar per frame; median, and fraction < 0.35 x median; flagged frames must not be within 0.3 s of a cue word | | |
| 4 | Beat on screen | The noun/verb of each narration line is visible and big at its word +-0.25 s | For each line: frame at the cue word, visible and >= 25% of the frame? hits / lines | | |
| 5 | World richness | Several locations, painted textures, inked geometry, 6-12 props per frame | Count locations; props in 3 random frames per 10 s; lapvar | | |
| 6 | Grade | Saturated, motivated moods (day, night, interior) | signalstats SAT/YAVG per shot + eye on sheets | | |
| 7 | Comedy timing | Gag visible, then a 0.5-1 s hold on the reaction | At each gag frame: seconds before camera/shot change; is the face visible | | |
| 8 | Camera variety | Size change every 2-3 s; crane, low, dutch, macro; calm eased moves | Shot count from step spikes; list of distinct heights/angles | | |
| 9 | Captions | One word at a time, white, thick black stroke, ~68% height, on the word | Cap-height px at 1080, outline px, offset vs word start (check at full res) | | |
| 10 | Sound sync | Impacts/pops/whooshes within +-2 frames | Waveform peaks vs impact frames; missing hits | | |

Overall = unweighted mean: ____ / 10. Pass bar: criteria 1-4 each >= 7 and mean >= 8.

## Numeric targets (fill in from the reference for THIS Short)
- Head height >= 30% of frame in >= 70% of frames; < 5% of frames below 15%.
- lapvar median >= (reference median x 0.75); blur only on declared whips.
- every narration line has its noun/verb visible at >= 25% frame area at +-0.25 s.
- Speaking shots >= 2 pose/expression changes per second; 2-4 frame anticipation before each hit; 3-frame squash on impact; 12-24 frame reaction hold after each gag.
- >= 5 set dressings or locations (scale down for a 15 s Short: >= 2 locations, >= 8 props per wide); flat ground < 25% of frame.
- Captions cap-height >= 40 px at 1080 wide, outline >= 5 px, centre at 68% height.

## Critic report format (critique-rNN.md)
Score table (above), then "Top 3 fixes" each naming a FRAME RANGE (never a shot id; ids change), the criterion, and the evidence image path. Under 400 words.
