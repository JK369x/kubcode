# Low-poly Urban

Status: selected v0.3. Visual tone, lighting and motion retain the actual 8-second approval from 2026-10-28. The newer Thai highlighted / small English caption treatment was separately approved on 2026-10-29. The original silent example does not establish audio or full-episode approval.

## Look
Grounded, faceted 3D urban storytelling with adult proportions and muted taupe, concrete grey, olive and charcoal. Restrained cool reflections and warm window lights. Preserve readable midtones and material planes; do not turn daylight into flat black silhouettes.

Use one low directional key, soft cool fill and atmospheric depth. The demo uses ACES exposure 0.88, hemisphere 1.05, key 1.75 and fill 0.32. These are scene settings, not a universal grade. Reframe lights per shot. Avoid bright pastel skies, uniformly lit faces, saturated toy cars and Soft Story round-head characters.

## Captions: Thai + English keyword highlight
Read captions.json and ../../shared/captions/STYLE.md. User approved this new default on 2026-10-29: primary Thai short phrases with selective colored keywords, smaller English translation below. Use the shared preset's font, outline, palette and restrained motion. The original 8-second example still demonstrates the older plain Robot Terminal treatment; it is historical visual/motion evidence, not the current caption default. Caption approval does not imply approval of unrelated new scenes or audio.

## Motion and tools
Three.js 0.170.0 renders actual geometry; GSAP drives one paused seekable HyperFrames timeline. Seed geometry once; every pose and camera state derives from time. examples/city contains the editable 8-second silent study. Its character turns once, the floating car rises and camera pushes in. No paid image/video generation or cloud credits were used.

## Reference and limits
Reference: [Higgsfield article](https://higgsfield.ai/@sanjii/blogs/how-to-make-an-animated-reel-with-claude-and-higgsfield-in-one-chat), observed 2026-10-28, plus user-supplied frames. The reference uses detailed generated environments. This procedural study is simpler and does not reproduce its texture detail, acting or audio. The robot caption treatment was requested separately for this style. The user approved this procedural interpretation; do not claim an exact recreation or approval of future full episodes.

## Reproduce
From repo root: npm ci. Preview: npx hyperframes preview styles/low-poly-urban/examples/city. Render: npx hyperframes render styles/low-poly-urban/examples/city --output /absolute/path/demo.mp4. Keep this style's palette, character construction and caption preset separate from JK Soft Story. Voice selection is independent.

## Interface integration — production feedback
The user rejected the monthly-payment popup treatment in the Elon episode (2026-10-28). Do not reuse it as an approved component. Design interfaces with the scene’s palette, material, lighting and shadows. Prefer a motivated in-world screen where appropriate; otherwise integrate the overlay with the film’s visual hierarchy. Avoid generic bright cards, decorative bounce and an unrelated app-like visual language. Show a still and a short motion proof before repeating this treatment across an episode. The existing episode is intentionally unchanged at the user’s request.

## Narrated episode build path

For the existing mall set, use [low-poly-beats-v1](../../pipelines/low-poly-beats-v1/README.md) and the [episode skill](../../.agents/skills/jk-low-poly-beats/SKILL.md). This is an executable plan path for camera/reveal/caption events; it retains the selected visual identity and does not imply new sets/actions exist. Preserve prior episodes and inspect actual speech/action/caption sync.
