# flat-room — ห้องเวกเตอร์แสงอุ่น (Flat Room)

**ห้องเวกเตอร์แสงอุ่น · English: Warm Room** (key `flat-room`)

Look only. Story rules live in `formats/`; this look was first paired with `formats/know-to-survive`.
Kit (not moved, not copied): `media/archive/reference-kits/thai-survival/` — `kit/scripts/lib_draw.py`, `kit/scripts/framework.py`,
`kit/references/style-bible.md`, Claude/Codex sources under `source/`. Status: **draft**.

## Owner rule (2026-11-10)
**The orange cat Khanun (ขนุน, `cat()` / `khanun()` in the kit, palette keys `cat*`) is an upstream kit
character and must NOT be used any more** — not in new shots, covers or thumbnails. Design our own cast.
Existing rendered clips and the imported examples are left unchanged as history.

## Look
- Full-frame flat vector drawn as SVG in code; no outlines, shadows as solid shapes; never an empty black
  frame with floating objects.
- Muted Thai palette with film grain (~16%) and vignette (~55%), applied by `framework.py`.
- Palette (`lib_draw.py` `C`): night sky `#141a33→#2b3157`, moon `#efe6c8`, flood water `#1f3440`, walls
  `#8f8778`, wood floor `#5e4632`, roof `#5a2e2a`, warm practical light `#f2c46b`. Red `#c9353a` only for
  danger (danger boxes, danger bars, hazard arrows).
- Characters: round heads, tall thin bodies, plain faces (two dot eyes), real Thai clothes; default person
  `skin #e7c09b`, shirt `#3b5a7a`, trousers `#2b3b52`.
- Real Thai settings: ตึกแถว, หมู่บ้าน, ห้องเรียน, เถียงนา, flags, signs.

## Lighting / camera
- One warm interior pool or moonlight; tension from what is slowly revealed in a doorway/window.
- Every shot slow push 100% → 104–116% (sine.inOut); one main motion per shot; hard cuts; dark/candle shot
  before a turn; shots 3–7 s.
- 9:16 safe zones: no text 0–168 px; cards 200–560; subject 560–1130; captions band 1130–1300; nothing
  readable below 1330 or in the right ~120 px.

## Renderer
Python SVG builder (`build.py`, `shots.py`) + GSAP → HyperFrames 0.8.192; host FFmpeg mix. Thai font
Sukhumvit Set must be installed locally.

## Provenance
Upstream: locally supplied `thai-survival-clip` kit + Claude/Codex candidate workspaces. No top-level software
licence; private study only, no redistribution rights asserted — see `media/archive/reference-kits/thai-survival/PROVENANCE.json`.
