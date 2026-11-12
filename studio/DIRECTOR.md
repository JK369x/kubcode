# Direction and production workflow

## Choose a style

Start with npm run styles. Read the selected STYLE.md and inspect its actual image/source. JK Soft Story v2 is selected for still visual direction; Low-poly Urban retains its selected 8-second visual/motion direction; captions were separately updated and approved on 2026-10-29. Audio and future episodes require separate review. If no style is specified, present the catalog and let the user choose. Never silently merge styles. Do not advertise earlier rejected auditions as additional approved styles. Add future styles as separate drafts.

## Build the story before expensive visuals

1. Research factual claims from primary sources and record URLs/dates. Keep hypothetical simulation rules distinct from evidence. Do not invent measured survival rates.
2. Write natural Thai narration with a clear question, concrete situations and a payoff. For the current zombie episode include Thailand, India, China and USA, with distinct visual problems rather than flags on a shared city.
3. Generate and listen to narration first. Use the exact saved Thai narrator voice. Revise changed chunks instead of regenerating the entire episode. Same voice does not imply identical delivery or bitwise audio across hardware.
4. Use actual audio durations to plan shots. A shot plan records its start/end, spoken phrase, visible action, camera, caption cue and sound cue. Do not extend a weak shot with dead air to reach a target length.
5. Prove the visual direction with a still, then a short motion pilot. The user selected the v2 still; a new animation should preserve its soft material shading and curves.
6. Produce chapter-sized compositions and distinct scenes. Share components and visual language, not identical full scenes repeated across a long film.

## Acting and camera

Each motion has a cause and contact point. Eyes attend to the threat before the head/body acts. Hands touch props, feet meet the floor, objects move in response. Do not turn zombies into swaying/dancing idle loops. Keep visible danger readable without making it a mascot.

Keep full-frame environments. Country entries can begin with a geographic zoom, then enter a specific situation. Geographic/data graphics use real geometry and labels; preserve fictional simulation labels where relevant.

## Captions and sound

Read the chosen style’s captions.json and shared/captions/STYLE.md first. For new Thai-narrated videos, the user selected Thai key phrase highlights with smaller English translations beneath them on 2026-10-29. This shared default applies independently of visual style unless the user requests another treatment or no captions. The plain white Robot Terminal captions in the old Low-poly example are historical. Place short phrase overlays on the picture without a blank caption band. Highlight meaningful words selectively. Narration comes first in the mix; time steps, metal movement, impacts, flags and arrows to actual visual events. Neither music nor an effects bed should hide awkward timing. Do not claim the inspiration clip's sound was analysed; it was not directly heard.

## Review evidence

Inspect the actual exported video, including scene transitions and the end. Technical checks do not establish creative approval. Record passed checks and specific limits. Separate style approval from animation, sound, factual review and final delivery status. Do not publish or upload finished videos without the user's request.

## Covers

Use shared/covers/STYLE.md for the user-selected default: ChatGPT-generated covers grounded in actual episode frames, strong hierarchy and readable Thai text. For voting episodes, explicitly group comment instructions with named numbered routes. This cover workflow is separate from code-based film production. Inspect the approved example and mobile/crop previews; retain the selected visual identity and accurate story promise.

## Low-poly mall episode integration

The supported entrypoint is pipelines/low-poly-beats-v1/cli.mjs with a validated plan; read .agents/skills/jk-low-poly-beats/SKILL.md. Shared named speech anchors should drive camera, reveals, captions and sound. A skill update or JK Window demo is not a changed episode. Verify the generated source-plan hash and actual exported timing.
