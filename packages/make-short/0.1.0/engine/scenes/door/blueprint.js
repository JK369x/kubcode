// scenes/door/blueprint.js: "One Door, Ten Worlds", world 2 (blueprint). Draws only what scene(f) says (s.sc). scene.pencil = draw-on progress of the 2nd door (core DRAWN rect).
// Scene contract (called by styles/02-blueprint.js): export default { init?(api, kit), render(out, s, kit) }. This scene needs no init.
import { DOOR as D, DRAWN } from '../../core/scene.js';
const GEO = { x: D.x0, y: D.y0, w: D.x1 - D.x0, h: D.y1 - D.y0, handle: D.handle, plate: D.plate, hinges: D.hinges };

function wob(i, a = 5) { return (Math.sin(i * 12.9898) * 43758.5453 % 1 - .5) * a; }
function pencilDoor(g, kit, t) {                                                                       // rough graphite sketch of the second door (DRAWN rect), drawn on in order
  if (t <= 0) return;
  const x0 = DRAWN.x0, y0 = DRAWN.y0, x1 = DRAWN.x1, y1 = DRAWN.y1, h = y1 - y0;
  const rough = (pts, seed) => pts.map((q, i) => [q[0] + wob(seed + i, 4.5), q[1] + wob(seed + i + 50, 4.5)]);
  const strokes = [
    rough([[x0 - 8, y1], [x0 + 2, y0 - 8]], 1), rough([[x0 - 10, y0 + 2], [x1 + 12, y0 - 3]], 4), rough([[x1 + 2, y0 - 10], [x1 - 3, y1 + 5]], 7),                  // jamb, header, jamb (overshoot at the corners)
    rough([[x0 + 16, y0 + 18], [x1 - 16, y0 + 15], [x1 - 17, y1 - 10], [x0 + 15, y1 - 11], [x0 + 16, y0 + 18]], 11),                                         // leaf
    rough([[x0 + 40, y0 + 50], [x1 - 40, y0 + 48], [x1 - 42, y0 + .42 * h], [x0 + 38, y0 + .42 * h + 2], [x0 + 40, y0 + 50]], 16),                         // upper panel
    rough([[x0 + 38, y0 + .56 * h], [x1 - 42, y0 + .56 * h - 2], [x1 - 40, y1 - 50], [x0 + 40, y1 - 52], [x0 + 38, y0 + .56 * h]], 22),                      // lower panel
    rough([[x1 - 54, y0 + .47 * h], [x1 - 54, y0 + .55 * h]], 28),                                                                                          // handle (no hinges, no plate: he forgot)
  ];
  const lens = strokes.map(s => s.reduce((a, q, i) => i ? a + Math.hypot(q[0] - s[i - 1][0], q[1] - s[i - 1][1]) : 0, 0)), tot = lens.reduce((a, b) => a + b, 0);
  g.save(); g.globalAlpha = .95;
  g.setLineDash([14, 12]); g.strokeStyle = 'rgba(207,227,247,.35)'; g.lineWidth = 1.4;                                              // construction lines run past the corners, as a sketch does
  if (t > .12) { g.beginPath(); g.moveTo(x0 - 50, y0 + 2); g.lineTo(x1 + 60, y0 - 3); g.moveTo(x0 - 4, y0 - 50); g.lineTo(x0 + 4, y1 + 24); g.stroke(); } g.setLineDash([]);
  let acc = 0;
  strokes.forEach((s, i) => { const a = acc / tot, b = (acc + lens[i]) / tot; acc += lens[i]; const q = Math.min(1, Math.max(0, (t - a) / (b - a))); if (q > 0) kit.pencil(g, s, q, 3, 30 + i, '#c3dbf2'); });
  g.restore();
}

export default {
  render(out, s, kit) {
    const g = out.getContext('2d'), sc = s.sc;
    kit.wall(g);
    pencilDoor(g, kit, sc.pencil || 0);
    kit.door(g, GEO, sc.door);
    kit.hero(g, s.p);
    const im = sc.impact, t = s.f - (im ? im.f : -99); if (im && im.f >= 0 && t >= 0 && t < 9) kit.impact(g, im.x, im.y, t, D.plate);
    kit.hearts(g, sc.hearts, sc.hearts < 10 && sc.heartFx < 1 ? { i: sc.hearts, t: sc.heartFx } : null);
    kit.sides(g); kit.vignette(g);
  },
};
