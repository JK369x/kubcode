/**
 * Clips the homepage may show, with the reason each one may be shown.
 *
 * This list is the only way a clip reaches the public site. To add a clip,
 * add (or uncomment) one line here, then run `npm run showcase` to cut its
 * poster and preview loop into public/showcase/<id>/ and refresh
 * lib/showcase.json. `npm test` fails if the list, the generated manifest
 * and the files on disk disagree.
 *
 * - `source`: `studio:<clip id>` is ~/Studio/clips/<clip id>/video.mp4 (with
 *   its clip.json); `style:<path>` is a file under
 *   ~/work/ai-video/jk-animation-studio/styles/. Sources are read only.
 * - `rights`: why we may publish it (not shown on the page).
 * - `credits`: shown on the card and in the credit line under the marquee.
 * - `at`: second of the source where the 3.5 s preview starts; the poster is
 *   that same frame, so the swap from poster to video does not jump.
 * - `style`: key into SHOWCASE_STYLES. The homepage shows one card per style;
 *   a clip in a new style adds a card (add the style below first).
 * - `cover`: the one clip per style that represents it on the homepage.
 */
export type ShowcaseCredit = { text: string; href?: string };

/**
 * Styles the homepage shows, one card each.
 * - `name`: card title.
 * - `skill`: catalogue slug. With one, the card offers "ดู template"
 *   (/skills/<slug>) and a download locked behind sign-in; without one, it
 *   only links to its cover clip's published post.
 * - `detail`: one or two Thai sentences shown on hover/focus. Facts only,
 *   from the skill page, the clip's clip.json and its rights note.
 * - `tools`: /tools page slugs the style really uses, most telling first
 *   (the card shows three). Tools without a page are left out.
 */
export type ShowcaseStyle = { name: string; skill?: string; detail: string; tools: readonly string[] };

export const SHOWCASE_STYLES: Readonly<Record<string, ShowcaseStyle>> = {
  "sitcom-toon": {
    name: "Sitcom Toon",
    detail: "การ์ตูนซิตคอมไซไฟ ตัวละครและฉากวาดด้วยโค้ด พากย์ไทยด้วยเสียงสังเคราะห์ เรนเดอร์ผ่าน Chromium และ FFmpeg",
    tools: ["ffmpeg"],
  },
  "low-poly": {
    name: "Low-poly 3D",
    skill: "low-poly-urban",
    detail: "เมืองและฉาก 3 มิติแบบ low-poly เขียนด้วย Three.js ขยับกล้องด้วย GSAP ซับไทยไฮไลต์คำสำคัญ",
    tools: [],
  },
  mystery: {
    name: "Mystery Story",
    detail: "เล่าเรื่องลึกลับด้วยภาพ SVG/HTML ที่เขียนด้วยโค้ด เน้นข้อความสำคัญบนจอ ไม่ใช้ภาพหรือฟุตเทจจากคลัง",
    tools: [],
  },
  "what-if": {
    name: "What If Lab",
    skill: "freshstack-what-if",
    detail: "ตัวละครเส้นในโลก “ถ้าเกิดว่า…” ทุกฉากเป็น SVG ไม่ใช้โมเดลสร้างภาพ เรนเดอร์ด้วย Remotion",
    tools: ["what-if-animation", "remotion", "opencode", "glm-5-3-flash", "elevenlabs"],
  },
  "soft-story-motion": {
    name: "Soft Story Motion",
    detail: "เรื่องเล่า 2D แสงเงานุ่มที่ขยับได้ ฉาก SVG เคลื่อนด้วย GSAP ยังเป็นรุ่นทดลอง",
    tools: [],
  },
  "soft-story": {
    name: "Soft Story",
    skill: "jk-soft-story",
    detail: "ภาพ 2D แสงเงานุ่มสำหรับเล่าเรื่อง ฉากเป็น SVG ที่แก้ไขต่อได้",
    tools: [],
  },
};

export type ShowcaseAllowEntry = {
  id: string;
  source: string;
  label: string;
  style: string;
  cover?: true;
  rights: string;
  at: number;
  credits?: readonly ShowcaseCredit[];
  /** Only for `style:` sources, which have no clip.json. */
  title?: string;
  madeWith?: Readonly<Record<string, string>>;
};

const ZOMBIE_RIGHTS =
  "Own work: story, cast and art made for the owner's channel. Drawing toolkit adapted from lemo-opuscar (MIT); synthetic voice VoxCPM2 (Apache-2.0); original music and foley. No stock media.";
const LOW_POLY_RIGHTS =
  "Own work: Three.js scenes authored in code, synthetic voice VoxCPM2, music bed and SFX from the HyperFrames library.";

const WHAT_IF_CREDIT: ShowcaseCredit = {
  text: "สไตล์จาก What If Animation ของ FreshStack (MIT)",
  href: "/tools/what-if-animation",
};
const ELEVENLABS_CREDIT: ShowcaseCredit = {
  text: "เสียงพากย์และดนตรีในคลิปเต็มจาก elevenlabs.io",
  href: "https://elevenlabs.io",
};

export const SHOWCASE_ALLOWLIST: readonly ShowcaseAllowEntry[] = [
  { id: "2026-10-25_zombie-condo_ep01_tomorrow-invasion", source: "studio:2026-10-25_zombie-condo_ep01_tomorrow-invasion", label: "ซอมบี้คอนโด EP.1", style: "sitcom-toon", cover: true, rights: ZOMBIE_RIGHTS, at: 22 },
  { id: "2026-10-25_zombie-condo_ep02_fridge-curry-paste", source: "studio:2026-10-25_zombie-condo_ep02_fridge-curry-paste", label: "ซอมบี้คอนโด EP.2", style: "sitcom-toon", rights: ZOMBIE_RIGHTS, at: 14.5 },
  { id: "2026-10-25_zombie-condo_ep03_mop-camera", source: "studio:2026-10-25_zombie-condo_ep03_mop-camera", label: "ซอมบี้คอนโด EP.3", style: "sitcom-toon", rights: ZOMBIE_RIGHTS, at: 9 },
  { id: "2026-10-25_zombie-condo_ep04_shopping-cart", source: "studio:2026-10-25_zombie-condo_ep04_shopping-cart", label: "ซอมบี้คอนโด EP.4", style: "sitcom-toon", rights: ZOMBIE_RIGHTS, at: 21 },
  { id: "2026-10-26_zombie-condo_ep05_tap-water-stops", source: "studio:2026-10-26_zombie-condo_ep05_tap-water-stops", label: "ซอมบี้คอนโด EP.5", style: "sitcom-toon", rights: ZOMBIE_RIGHTS, at: 2 },
  { id: "2026-10-26_zombie-condo_ep06_fire-stairs-voice", source: "studio:2026-10-26_zombie-condo_ep06_fire-stairs-voice", label: "ซอมบี้คอนโด EP.6", style: "sitcom-toon", rights: ZOMBIE_RIGHTS, at: 11 },
  { id: "2026-10-26_zombie-condo_ep07_neighbor-wont-open", source: "studio:2026-10-26_zombie-condo_ep07_neighbor-wont-open", label: "ซอมบี้คอนโด EP.7", style: "sitcom-toon", rights: ZOMBIE_RIGHTS, at: 10.5 },
  { id: "2026-10-29_mall-infection_ep01_first-night", source: "studio:2026-10-29_mall-infection_ep01_first-night", label: "ห้างติดเชื้อ EP.1", style: "low-poly", rights: LOW_POLY_RIGHTS, at: 79 },
  { id: "2026-10-30_mall-infection_ep02_stairs", source: "studio:2026-10-30_mall-infection_ep02_stairs", label: "ห้างติดเชื้อ EP.2", style: "low-poly", rights: LOW_POLY_RIGHTS, at: 27 },
  { id: "2026-10-28_satire-stories_ep01_elon-dream-low-poly", source: "studio:2026-10-28_satire-stories_ep01_elon-dream-low-poly", label: "เสียดสี: ถ้าโลกเป็นของ Elon", style: "low-poly", rights: `${LOW_POLY_RIGHTS} Labelled satire and fiction in the clip and its description.`, at: 23 },
  { id: "2026-10-25_us-antarctica_ep01_mystery-short", source: "studio:2026-10-25_us-antarctica_ep01_mystery-short", label: "สหรัฐกับแอนตาร์กติกา", style: "mystery", cover: true, rights: "Own work: inline SVG/HTML art authored in code (ASSETS.md), synthetic voice VoxCPM2, HyperFrames library SFX. No archival images or footage.", at: 2.5 },
  { id: "2026-11-01_freshstack-what-if_ep03_internet-gone-week", source: "studio:2026-11-01_freshstack-what-if_ep03_internet-gone-week", label: "What If: อินเทอร์เน็ตหาย 1 สัปดาห์", style: "what-if", cover: true, rights: "Own episode made with FreshStack's What If Animation skill (MIT, kelano86/what-if-animation); synthetic voice VoxCPM2. Credit shown.", at: 2, credits: [WHAT_IF_CREDIT] },
  { id: "2026-11-01_freshstack-what-if_ep05_no-one-can-lie", source: "studio:2026-11-01_freshstack-what-if_ep05_no-one-can-lie", label: "What If: ไม่มีใครโกหกได้", style: "what-if", rights: "Own episode made with FreshStack's What If Animation skill (MIT, kelano86/what-if-animation); synthetic voice VoxCPM2. Credit shown.", at: 2.3, credits: [WHAT_IF_CREDIT] },
  { id: "2026-11-01_what-if-studio_ep01_mute-touch", source: "studio:2026-11-01_what-if-studio_ep01_mute-touch", label: "Mute Touch", style: "what-if", rights: "Own episode (OpenCode/GLM authored) made with FreshStack's What If Animation skill (MIT). Voice and music are ElevenLabs output: the preview is muted and the elevenlabs.io credit is shown.", at: 10.5, credits: [WHAT_IF_CREDIT, ELEVENLABS_CREDIT] },
  { id: "2026-11-01_jk-soft-story-motion-v2_ep02_friends-drifting-apart", source: "studio:2026-11-01_jk-soft-story-motion-v2_ep02_friends-drifting-apart", label: "เพื่อนสนิทที่ห่างกันไป", style: "soft-story-motion", cover: true, rights: "Own work in the JK Soft Story style (own SVG/GSAP scenes; general ideas only from the Genhaha skills, no kit copied); synthetic voice.", at: 1.8 },
  { id: "low-poly-urban-study", source: "style:low-poly-urban/examples/city/demo.mp4", label: "Low-poly Urban", style: "low-poly", cover: true, title: "Low-poly Urban — ตัวอย่างสไตล์ 8 วินาที", rights: "Own style study: Three.js geometry authored in code, silent, no generated or stock media.", at: 1, madeWith: { renderer: "Three.js 0.170.0 + HyperFrames", style: "low-poly-urban", voice: "silent" } },
  { id: "jk-soft-story-still", source: "style:jk-soft-story/assets/selected-v2.png", label: "Soft Story", style: "soft-story", cover: true, title: "Soft Story — ภาพนิ่ง v2 ที่เลือกแล้ว", rights: "Own style study: editable SVG scene authored for the style.", at: 0, madeWith: { renderer: "Editable SVG", style: "jk-soft-story", voice: "silent" } },

  // Not shown yet. Third-party footage or audio: waiting for the owner's
  // decision. To show one, uncomment its line, replace the rights note with
  // the owner's decision and date, then run `npm run showcase`.
  // { id: "2026-10-26_celebrity-shorts_ep01_lisa-sawadika", source: "studio:2026-10-26_celebrity-shorts_ep01_lisa-sawadika", label: "LISA — SaWaDiKa", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-26_celebrity-shorts_ep02_elon-ai-control", source: "studio:2026-10-26_celebrity-shorts_ep02_elon-ai-control", label: "Elon Musk กับ AI", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-26_celebrity-shorts_ep03_jensen-ai-cost", source: "studio:2026-10-26_celebrity-shorts_ep03_jensen-ai-cost", label: "Jensen Huang กับต้นทุน AI", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-28_celebrity-shorts_ep04_lisa-acting-stage", source: "studio:2026-10-28_celebrity-shorts_ep04_lisa-acting-stage", label: "LISA — งานแสดง", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-28_celebrity-shorts_ep05_harry-kane-belief", source: "studio:2026-10-28_celebrity-shorts_ep05_harry-kane-belief", label: "Harry Kane", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-28_celebrity-shorts_ep06_taylor-swift-memories", source: "studio:2026-10-28_celebrity-shorts_ep06_taylor-swift-memories", label: "Taylor Swift", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-29_celebrity-shorts_ep07_lisa-red-flag", source: "studio:2026-10-29_celebrity-shorts_ep07_lisa-red-flag", label: "LISA — Red flag", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-29_celebrity-shorts_ep08_jenna-ortega-zombies", source: "studio:2026-10-29_celebrity-shorts_ep08_jenna-ortega-zombies", label: "Jenna Ortega กับซอมบี้", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-29_celebrity-shorts_ep09_mbappe-cant-please-all", source: "studio:2026-10-29_celebrity-shorts_ep09_mbappe-cant-please-all", label: "Mbappé", rights: "PENDING owner decision: third-party interview footage", at: 5 },
  // { id: "2026-10-25_tech-podcast_ep01_cliparr", source: "studio:2026-10-25_tech-podcast_ep01_cliparr", label: "พอดแคสต์: Cliparr", rights: "PENDING owner decision: LINUX Unplugged audio, CC BY-SA 4.0 (needs attribution + share-alike)", at: 5 },
  // { id: "2026-10-26_tech-podcast_ep02_clean-your-tv", source: "studio:2026-10-26_tech-podcast_ep02_clean-your-tv", label: "พอดแคสต์: Clean Your TV", rights: "PENDING owner decision: LINUX Unplugged audio, CC BY-SA 4.0 (needs attribution + share-alike)", at: 5 },
  // { id: "2026-10-26_tech-podcast_ep03_amazon-bee", source: "studio:2026-10-26_tech-podcast_ep03_amazon-bee", label: "พอดแคสต์: Amazon Bee", rights: "PENDING owner decision: The Launch audio, CC BY-SA 4.0 (needs attribution + share-alike)", at: 5 },
  // { id: "2026-10-26_tech-podcast_ep04_php-security", source: "studio:2026-10-26_tech-podcast_ep04_php-security", label: "พอดแคสต์: ช่องโหว่ PHP", rights: "PENDING owner decision: LINUX Unplugged audio, CC BY-SA 4.0 (needs attribution + share-alike)", at: 5 },

  // Not shown: made with a third-party kit that has no license and whose
  // import notes say "no public redistribution" (styles/*/PROVENANCE.json).
  // The upstream author's permission is needed first.
  // { id: "2026-11-01_growkaz-stickman_ep04_compound-interest", source: "studio:2026-11-01_growkaz-stickman_ep04_compound-interest", label: "Stickman: ดอกเบี้ยทบต้น", rights: "PENDING upstream permission: GrowKaz Stickman kit, no license", at: 3 },
  // Catalog demos growkaz-stickman (Claude, Codex) and thai-survival (Claude,
  // Codex) are excluded for the same reason. The catalog demo
  // freshstack-what-if-glm is Mute Touch, already listed above.
];
