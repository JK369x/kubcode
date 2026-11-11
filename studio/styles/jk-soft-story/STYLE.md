# Visual direction — selected v2, 2026-10-28

## Provenance and current decision

Source supplied by user: https://www.youtube.com/watch?v=XbXiFizyGko
Five screenshots supplied on 2026-10-28 are kept outside Git in the local media store, `media/archive/reference-frames/jk-soft-story/source-frames/01.png–05.png` (private study references only; kubcode is a public repo).
They are evidence for interpretation, not finished assets to reuse in our videos.
The user rejected the rigid previous illustration and explicitly selected our
soft-story-v2 still with “ok เอาแนวนี้” on 2026-10-28. JK Soft Story v2 is now the
visual baseline. Animation, sound and full-episode quality still need their own review.

## Read the five examples differently

1. 01.png: close character scene. Dark head has a broad soft highlight and an uneven
   warm/pink rim; it is not a black disk with a yellow stroke. Shoulders are rounded,
   elbows curved, sleeve planes shaded. Collar, folds and hands have separate depth.
   Cat and brick background add detail; do not copy the cat or identical outfit as a rule.
2. 02.png: character ensemble. Identity comes from silhouette, hair, uniform and small
   accessories. Faces vary through eyelids, lashes, eye shapes and restrained blush.
   Cloth highlights follow the body rather than a straight highlight stripe. Expressions
   and proportions can vary; not every person should be the same head in another shirt.
3. 03.png: geographic overview. Real coastlines and relief carry the information;
   dark blue sea and a quiet grid support small local lights. Do not invent coastlines
   or place arbitrary outbreaks as factual geography. Fictional simulation markers
   should be labelled accordingly. Use sourced/licensed map geometry when producing one.
4. 04.png: concept infographic. Rounded scientific symbols have shaded thickness,
   one warm highlighted figure stands out against a muted population grid. Show the
   relationship visually; calculate counts from data, not manually repeated guesses.
5. 05.png: narrative explanation. Concrete props, depth and one highlighted item tell
   the idea; the character reacts alongside it. Background detail has hierarchy and
   slightly lower local contrast than the important prop. Avoid wallpaper-like clutter.

## Character construction

- Curve the silhouette with cubic Bézier shapes. Keep shoulders round and connect
  upper arm → elbow → forearm with changing width; avoid rigid tubes and sharp hinges.
- Hands need a palm, thumb and a readable finger gesture. Avoid circles/hexagons at
  wrists, fork hands, oversized palms or cheerful open hands without a story reason.
- Dark head is a shaded volume: charcoal/mauve lit side, blue-black shadow, subtle
  cool bounce. A small colour shift is more useful than a thick contour.
- Typical eye state uses two warm ivory shapes. Change upper lid, height, angle and
  spacing to communicate attention or worry. Mouth is optional; avoid permanent
  exaggerated frown, smile, teeth or a sweat-drop symbol in every shot.
- Anchor garments to body: collar shadow, shoulder cap, elbow compression folds,
  cuff, seam/zip and small fabric highlights. Only a few purposeful folds per joint.
- Put cast shadows where head meets collar, sleeve meets torso and hands meet props.
  These separate shapes more naturally than stroking every edge.

## Lighting and material

Trial palette: dark face #1c202b–#50464a, garment #358487–#82c7bf, warm practical
light #f0c18e, cool outdoor navy #13263f. These are starting values, not locked colours.
Do not force the same clothes, brick wall or teal/orange palette onto every country.

At 1920×1080, start with a selective 1–3 px lit contour rather than a 6–12 px yellow
outline. A local 3–6 px blurred halo can support that contour; it should not become
an all-around neon sticker. Concentrate bloom at motivated light sources/edges.
Use a broad radial light on a face and a directional gradient on cloth. Avoid one
flat fill plus a single stripe pretending to be material shading.

Use different spatial scales: small brick/mortar and fabric detail, medium props,
large lighting shapes. Keep the subject and contact point crisp; atmosphere belongs
mostly behind them. Do not add full-frame fog, brown wash, grain or blur just to hide
weak geometry. A dark scene must still have readable faces, hands and action.

## Shot and graphic language

A narrative sequence can move from environment → character reaction → close contact
with a prop → explanatory comparison. Each shot should answer the current narration.
Country chapters need distinct environments and physical problems; a shared rig is
fine but a shared city with another flag is not enough.

Maps, population comparisons, food/fuel stores and travel connections need dedicated
visuals with clear units and honest fictional assumptions. Keep labels brief. Do not
fill ten minutes with the same character tableau or repeated arbitrary arrows.

## Current study and known limits

Original trial: assets/scene-v2.svg.
Rendered still: assets/selected-v2.png.
Scene: a person inside a warm room notices an infected figure through a rainy window.
The sleeve, cuff, hands, eyes and prop groups remain editable SVG, not a generated
flat bitmap. Only a still has been rendered; no animation or sound update is claimed.

Still imperfect: material rendering remains vector-based and less rich than the
reference, the torso pose is fairly frontal, and the infected character is simplified.
The user selected this image as the visual direction. Keep these limitations visible
while developing motion; do not flatten or harden the art to make rigging easier.

## Sound boundary

The screenshots provide no sound evidence. Exact music, foley and mix of the source
are unverified. Keep the existing Thai narrator voice; a later audio pass can add quiet ambience
and contact-specific foley. Don't claim the sound matches merely because the image does.
