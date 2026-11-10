// scenes/door/sheet.js: the door story's ending (world 11, f690-750). The teardown ends pure white; the light settles into a paper STORYBOARD SHEET:
// 10 square panels (5x2, one key frame per world, panel 0 = frame 0) pop in 2-3 f apart, a cursor glides to APPROVE and clicks (f715), then the
// camera dives into panel 0 and lands on the full 1920x1920 frame 0 (the loop cut 749 -> 0 is a 1-frame hold, pixel-identical).
// Reads core/scene.js `sheet {cursor, click, zoom}` (all eased there); the pops are keyed on the local frame s.fl (this segment is the integrator's).
// Importable from Node (render.mjs reads PANELS / panelFile to pre-render the panel pictures): no DOM at module level.
import { clamp, lerp, ease } from '../../core/util.js';
import { beats } from '../../core/scene.js';

export const PANELS = [0, 80, 140, 200, 260, 320, 380, 440, 500, 600];   // master frames: 0 = the loop panel (pixel stare), then each world's try peak
export const panelFile = i => `out/door-panels/p${String(i).padStart(2, '0')}.png`;

const PS = 196, GAP = 15, X0 = 440, Y0 = 598, ROW = 280, COLS = 5, W = 1920;           // 5 x 196 + 4 x 15 = 1040 inside the safe square (420-1500)
const BTN = { x: 960, y: 1226, w: 436, h: 104 };
const TIP = [1150, 1258], START = [1610, 1600], CTRL = [1350, 1500];                   // cursor: from beyond the safe corner, in an arc, onto the button
const POP = [2, 4, 6, 8, 11, 13, 15, 18, 20, 22], POPLEN = 6, BTN_POP = 15;           // local frames: panel i pops at POP[i]; 2-3 f apart
const ROT = [-.04, .03, -.025, .045, -.03, .035, -.045, .025, -.035, .04];            // pop wobble (rad), settles to 0
const KEND = W / PS, FIX = [X0 / (1 - PS / W), Y0 / (1 - PS / W)];                    // the dive is a pure zoom about FIX; at k = KEND panel 0 fills the frame
const cell = i => [X0 + (i % COLS) * (PS + GAP), Y0 + Math.floor(i / COLS) * ROW];
const bez = (t, a, b, c) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];

let PNL = null, PAPER = null, ZE = null;
export default {
  async init(api, kit) {
    PAPER = kit.paper();
    PNL = await kit.loadPanels(PANELS.map((_, i) => new URL(`../../${panelFile(i)}`, import.meta.url).href), { full: 0 });
  },
  render(out, s, kit) {
    const g = out.getContext('2d'), sh = s.sc.sheet, fl = s.fl;
    if (ZE === null) { const B = beats(s.tl); ZE = ease.io((s.tl.frames - 1 - B.zoom0) / (B.zoom1 - B.zoom0)); }
    const zn = Math.min(1, sh.zoom / ZE);                                                // 0..1, reaches exactly 1 on the last frame (749)
    if (zn >= 1) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(kit.full(PNL[0]), 0, 0); return; }   // = frame 0, 1:1 (the loop closes on an identical frame)
    const k = Math.exp(Math.log(KEND) * zn);

    g.save(); g.setTransform(k, 0, 0, k, FIX[0] * (1 - k), FIX[1] * (1 - k));            // camera: zoom about FIX
    g.drawImage(PAPER, 0, 0);

    const fade = 1 - kit.sm(.55, .9, zn);                                                // borders + shadows melt away as the camera closes in
    for (let i = 0; i < PANELS.length; i++) {
      const t = fl - POP[i]; if (t < 0) continue;
      const [x, y] = cell(i), a = clamp(t / 2), pop = lerp(.45, 1, ease.back(clamp(t / POPLEN), 2.4)), rot = ROT[i] * (1 - ease.o(clamp(t / (POPLEN + 2))));
      kit.notes(g, x, y + PS, PS, a * fade);
      g.save(); g.translate(x + PS / 2, y + PS / 2); g.rotate(rot); g.scale(pop, pop); g.translate(-PS / 2, -PS / 2); g.globalAlpha = a;
      if (fade > 0) { g.shadowColor = kit.palette.shadow; g.shadowBlur = 18 * fade; g.shadowOffsetY = 7 * fade; }
      kit.drawPanel(g, PNL[i], 0, 0, PS); g.shadowColor = 'transparent';
      kit.frame(g, 0, 0, PS, PS, k * pop, fade); g.restore();
    }

    // APPROVE button + cursor (UI melts away as the dive starts: z 0 -> .1)
    const ui = 1 - kit.sm(0, .1, sh.zoom), c = sh.cursor, t = Math.min(1, c / .82), done = c >= 1, age = done && sh.click > 0 ? 6 * (1 - sh.click) : done ? 99 : -1;
    const hover = kit.sm(.7, .84, c) * (done ? 0 : 1), press = clamp(sh.click * 1.5), ok = done ? (age < 1 ? .6 : 1) : 0;
    const bt = fl - BTN_POP, bpop = bt < 0 ? 0 : lerp(.5, 1, ease.back(clamp(bt / POPLEN), 2.4));
    kit.button(g, BTN.x, BTN.y, { w: BTN.w, h: BTN.h, hover, press, ok, pop: bpop, alpha: ui * clamp(bt / 2), check: age < 0 ? 0 : ease.back(clamp(age / 6), 2.6), burst: age < 0 ? 0 : clamp(age / 9) });
    if (c > 0) {
      const wob = kit.sm(.85, 1, t), pos = bez(ease.io(t), START, CTRL, TIP), cx = pos[0] + wob * 1.8 * Math.sin(fl * .9), cy = pos[1] + wob * 1.4 * Math.cos(fl * 1.3);
      kit.ripple(g, TIP[0], TIP[1], done && age < 99 ? age / 6 : 0, ui);
      kit.cursor(g, cx, cy, press, ui);
    }
    g.restore();

    kit.veil(g, 1 - ease.o(clamp(fl / 10)));                                             // f690 = pure white (the teardown's last frame); the paper clears from the centre out
  },
};
