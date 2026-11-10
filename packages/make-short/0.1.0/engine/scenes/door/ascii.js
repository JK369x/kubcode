// scenes/door/ascii.js: "One Door, Ten Worlds", world 4 (ascii). Draws only what scene(f) says (s.sc): scene.term = {typed, reply} are the strings to show.
// Scene contract (called by styles/04-ascii.js): export default { init?(api, kit), render(out, s, kit) }. This scene needs no init.
import { DOOR as D } from '../../core/scene.js';
const GEO = { x: D.x0, y: D.y0, w: D.x1 - D.x0, h: D.y1 - D.y0, handle: D.handle, plate: D.plate, hinges: D.hinges };

export default {
  render(out, s, kit) {
    const sc = s.sc;
    kit.begin();
    kit.wall();
    kit.door(GEO, sc.door);
    kit.hero(s.p);
    const im = sc.impact, t = s.f - (im ? im.f : -99); if (im && im.f >= 0 && t >= 0 && t < 9) kit.impact(im.x, im.y, t, D.plate);
    kit.hearts(sc.hearts, sc.hearts < 10 && sc.heartFx < 1 ? { i: sc.hearts, t: sc.heartFx } : null);
    const term = sc.term || { typed: '', reply: '' }, a = term.typed, b = term.reply;                         // terminal pane on the wall: the typed command, then the machine's reply
    kit.pane(440, 548, 570, 212);
    const typing = a.length < 11, fade = .5 + .5 * Math.cos(s.f * Math.PI * 2 / 20);              // blinking cursor: smooth phosphor-like fade while idle, solid while typing
    if (a) kit.text(a, 470, 628, 55, { cursor: b ? 0 : typing ? 1 : fade });
    if (b) kit.text(b, 470, 722, 55, { plain: true, lvl: 5, cursor: b.length < 3 ? 1 : fade });
    kit.present(out, s.f);
  },
};
