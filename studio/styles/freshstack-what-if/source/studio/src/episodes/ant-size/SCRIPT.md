# 07 — ถ้าคุณตัวเล็กลงเท่ามด (What if you shrank to the size of an ant?)

Style: `freshstack-what-if` (React SVG / Remotion 4.0.530, stick-figure rig in lit rooms, schematic fact card).
Format: vertical 1080×1920, 30 fps, the 1920×1080 FreshStack world cropped to a 9:16 window around x=960.
Voice: JK Thai narration (`shared/voice/scripts/narrate.py`). Target ~34–36 s like ep03/ep05.
Captions: `shared/captions/STYLE.md` — Thai with one highlighted phrase + small uppercase English line.
Characters (invented): Pip (hooded stick figure), ส้มโอ (orange house cat, simple line drawing, invented).

## Hook (0–2 s)
Frame 0: Pip wakes in bed; at ~0.4 s a "pop" + shake and he shrinks to a dot, the camera crash-zooms down to him
standing on a pillow that now looks like a hill. Title "WHAT IF YOU SHRANK / TO ANT SIZE?" pops in ≤0.3 s while the narrator asks.

## Structure (style formula)
Small personal scenes → one fictional rule → turn on real physics → cliffhanger.

| # | Line (Thai narration) | Shot / visual | Caption highlight | English line |
|---|---|---|---|---|
| l1 | ถ้าเช้านี้ตื่นมา คุณตัวเล็กลง เหลือเท่ามดตัวหนึ่ง | **S1 hook** bedroom, soft morning light. Shrink pop, crash zoom; blanket folds tower like dunes; Pip looks around, mouth open. Chip "ขนาด 3.4 มม.". | เท่ามด (amber) | WHAT IF YOU SHRANK TO ANT SIZE? |
| l2 | แมวที่บ้าน กลายเป็นยักษ์ สูงพอๆ กับตึกสี่สิบชั้น | **S2** bedroom floor, low worm's-eye angle. ส้มโอ's paw lands, ground shakes; tilt up a huge cat face filling the frame; a ghost outline of a 40-storey tower beside it for scale, tag "~125 ม.". Pip backs away slowly. | สูงพอๆ กับตึกสี่สิบชั้น (coral) | YOUR CAT IS NOW ~125 M TALL |
| l3 | กฎมีข้อเดียว ตัวเล็กลงห้าร้อยเท่า แต่ยังเป็นคุณคนเดิม | **S3** schematic rule card "กฎข้อเดียว · EPISODE RULE · NOT REAL": ✓ เล็กลง 500 เท่า (1.7 ม. → 3.4 มม.), ✓ คนเดิม ร่างเดิม (cyan, lands on "คนเดิม"). | ห้าร้อยเท่า (amber), คนเดิม (cyan) | ONE RULE: 500× SMALLER, STILL YOU |
| l4 | แล้วคุณก็พลาดตกจากโต๊ะ แต่ลงถึงพื้น แบบแทบไม่เจ็บ | **S4** desk edge, Pip slips; slow fall past a giant pencil and a coffee mug; lands on the rug with a tiny "pof", dusts himself off, surprised thumbs-up. | พลาดตกจากโต๊ะ / แทบไม่เจ็บ (coral) | YOU FALL… AND YOU'RE FINE |
| l5 | เพราะยิ่งตัวเล็ก น้ำหนักลดลงเร็วกว่าพื้นผิวที่ต้านลม คุณจึงตกช้าลงมาก | **S5** schematic, real-physics card (no fantasy look): "ฟิสิกส์จริง · SQUARE–CUBE"; two cubes, side ×10 smaller → weight ÷1,000, surface ÷100; drag arrows up vs weight arrow down, the small cube drifts. Formula label v_T = √(2mg / ρCA). | น้ำหนักลดลงเร็วกว่า / ตกช้าลงมาก | WEIGHT SHRINKS FASTER THAN DRAG AREA |
| l6 | ปีหนึ่งพันเก้าร้อยยี่สิบหก นักชีววิทยาคนหนึ่งเขียนไว้ว่า หนูตกบ่อเหมืองลึกราวเก้าร้อยเมตร ยังเดินจากไปได้ ถ้าพื้นนุ่มพอ | **S6** schematic: tall mine-shaft cross-section, depth ruler "~914 ม. (1,000 หลา)"; a little mouse icon drifts down, lands on a soft pad, walks off; tag "HALDANE, 1926 · ถ้าพื้นนุ่มพอ". | ปี 1926 / เก้าร้อยเมตร / ถ้าพื้นนุ่มพอ | 1926: A MOUSE SURVIVES A ~900 M SHAFT |
| l7 | แต่ข้างนอก ฝนเริ่มตกแล้ว ถ้าเม็ดแรก ตกลงมาตรงหัวคุณล่ะ? | **S7 cliffhanger** windowsill, grey light. Pip stands on the sill; a raindrop as big as he is wobbles toward camera in slow motion, reflection of Pip in it; Pip looks up, big "?" — cut unresolved. | เม็ดแรก / ตรงหัวคุณ (coral) | WHAT IF THE FIRST RAINDROP HITS YOU? |

## Facts (verified, with the fiction separated)
- **Fiction (episode rule, not real):** you shrink 500 times (1.7 m → 3.4 mm) and keep your body and mind. Landing "almost unhurt" in l4 is the scenario's consequence, explained by the real physics in l5–l6.
- **Real — scale (l1–l3):** 1.7 m ÷ 500 = 3.4 mm. Ants range from about 2 to 25 mm (Britannica, "Ant", https://www.britannica.com/animal/ant), so 3.4 mm is a small ant, not an "average" one. A cat ~25 cm at the shoulder × 500 ≈ 125 m (the 25 cm is our assumption); at ~3 m per storey that is roughly a 40-storey building.
- **Real — square–cube and falling speed (l5):** OpenStax, *University Physics Volume 1*, §6.4 "Drag Force and Terminal Speed": terminal speed v_T = √(2mg / ρCA); mass scales with length³ while area scales with length², so terminal speed falls as size shrinks (∝ √L — our step from the formula). OpenStax quotes Haldane: weight is "reduced to a thousandth, but its surface only to a hundredth". https://openstax.org/books/university-physics-volume-1/pages/6-4-drag-force-and-terminal-speed . Supporting measurement: falling canopy ants (*Cephalotes atratus*) descend at around 4 m/s while steering a glide — Yanoviak, Dudley & Kaspari (2005) *Nature* 433:624–626, DOI 10.1038/nature03254; speed from the UC Berkeley release, https://newsarchive.berkeley.edu/news/media/releases/2005/02/09_ants.shtml (not shown on screen).
- **Real — Haldane's mouse (l6):** J. B. S. Haldane, "On Being the Right Size", *Harper's Magazine*, March 1926, pp. 424–427 (https://harpers.org/archive/1926/03/on-being-the-right-size ; free text https://www.cs.utexas.edu/~witchel/S25-380L/papers/right-size.html): a mouse dropped down a thousand-yard mine shaft "gets a slight shock and walks away, provided that the ground is fairly soft." 1,000 yards ≈ 914 m, so narration says "ราวเก้าร้อยเมตร" and keeps "ถ้าพื้นนุ่มพอ". Haldane is cited, not shown as a character.
- **Cliffhanger (l7)** is a question, not a claim. Seed for a follow-up episode: mosquitoes survive raindrops that can weigh more than 50 times their mass, thanks to their low mass and strong exoskeleton — Dickerson, Shankles, Madhavan & Hu (2012) *PNAS* 109(25):9822–9827, DOI 10.1073/pnas.1205446109 (lab drops at 6–9 m/s).
- **Not used, kept for reference:** an Asian weaver ant can hold 100 times its body weight while clinging upside down (University of Cambridge, 19 Feb 2010, https://www.cam.ac.uk/node/24594). Don't use the "5,000×" neck-strength figure (Nguyen, Lilly & Castro 2014): it is the force that pulls the head off, not what an ant can carry.
