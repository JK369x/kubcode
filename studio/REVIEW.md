# Private clone package review — 2026-10-28

Goal: another authorized collaborator can clone this repository, inspect/use the selected visual style and set up the same Thai JK voice workflow without the original workspace paths.

Architecture: retain the small catalog/gallery and use pinned HyperFrames as the renderer. Bundle project-local skills, production guides, selected art, standalone components and private study references. Bundle the synthetic reference WAV/profile/helper, not model weights, credentials or the original machine's runtime.

Evidence:
- npm test: 3 passed, including a relocated voice-bundle dry-run with checksum/identity intact and model-path override.
- npm run check: one selected style and referenced assets present.
- Fresh-folder npm ci, npm test, npm run check and HyperFrames snapshot succeeded without the original source folder paths.
- HyperFrames check returned ok=true, runtime/layout passed, zero lint errors. One inline SVG structure warning remains in the one-second still example.
- All four bundled skills pass frontmatter validation.
- New repo-local voice environment installed successfully and --check reports no missing dependencies; exact primary and transitive versions are pinned. A one-sentence synthesis completed successfully; its WAV sample and portable provenance are included. No human listening comparison is claimed.
- Source scan found no hardcoded /Users paths, credential patterns or private keys in distributable files.
- GitHub repository visibility verified PRIVATE before pushing.

Known limits: JK Soft Story v2 is selected for still visual direction only. Animation/audio/full-film approval is separate. Components are editable geometry, not an IK engine. Prefix SVG ids when composing. MLX voice generation currently requires Apple Silicon macOS; Windows/Linux can use the visual library and existing audio but not this helper. TTS delivery and agent-authored scenes are not bitwise deterministic across hardware/agents. Source screenshots are private study references, not production assets or a public redistribution license.

Repository: https://github.com/JK369x/jk-animation-studio
No collaborators were invited automatically.
