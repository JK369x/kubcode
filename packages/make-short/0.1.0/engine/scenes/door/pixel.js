// scenes/door/pixel.js: "One Door, Ten Worlds", world 1 (pixel). Draws only what scene(f) says (s.sc); keeps no timing of its own.
// Scene contract (called by styles/01-pixel.js): export default { init?(api, kit), render(out, s, kit) }. This scene needs no init.
// The camera is s.cam (= scene().cam, f0 close-up zoom 1.35 -> 1 by f14), applied natively by the pixel kit (the style sets nativeCam).
import { DOOR as D } from '../../core/scene.js';
const GEO = { x: D.x0, y: D.y0, w: D.x1 - D.x0, h: D.y1 - D.y0, handle: D.handle, plate: D.plate, hinges: D.hinges };

export default {
  render(out, s, kit) {
    const sc = s.sc;
    kit.begin(s.cam || sc.cam);
    kit.wall();
    kit.door(GEO, sc.door);
    kit.hero(s.p);
    const im = sc.impact, t = s.f - (im ? im.f : -99);
    if (im && im.f >= 0 && t >= 0 && t < 9) {                                                                  // BONK burst: pixel stars thrown off the impact point (3 f hit-stop, then they fly)
      const k = Math.max(0, t - 3);
      const PL = D.plate;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI + i * .5, d = 40 + k * 26 + (i % 2) * 18, wx = im.x - 30 + Math.cos(a) * d, wy = im.y + Math.sin(a) * d * .9;                         // upper half only, and never inside the plate zone: PULL stays readable through every bonk
        if (wx > PL.x0 - 40 && wx < PL.x1 + 40 && wy > PL.y0 - 40 && wy < PL.y1 + 40) continue;
        const x = kit.X(wx), y = kit.Y(wy); kit.rect(x - 1, y - 1, 3, 3, i % 2 ? 11 : 19); kit.rect(x, y - 2, 1, 5, i % 2 ? 11 : 19); kit.rect(x - 2, y, 5, 1, i % 2 ? 11 : 19); }
    }
    kit.hearts(sc.hearts, sc.hearts < 10 && sc.heartFx < 1 ? { i: sc.hearts, t: sc.heartFx } : null);          // the lost heart (slot = hearts left) shakes, then drops over heartFx 0..1
    const tt = sc.title;                                                                                       // number = opacity (pixel dissolve)
    if (tt > 0) ['ONE DOOR.', 'TEN WORLDS.'].forEach((ln, i) => kit.text(ln, 470, 572 + i * 88, 72, 19, tt));
    kit.present(out);
  },
};
