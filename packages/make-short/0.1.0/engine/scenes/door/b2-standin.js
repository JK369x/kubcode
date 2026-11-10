// scenes/door/b2-standin.js (B2): stand-in for core/scene.js + the hero pose until the animator's DROP 1 lands. Same shape as b4-standin.js:
//   loadState() -> { sceneAt(f, tl), heroAt(f, s), real }. If core/scene.js exports `scene`, the real timing is used and the hero pose is s.p;
//   otherwise the beat table of BUILD-SPEC-DOOR.md is evaluated here for worlds 3 (voxel 110-170) and 7 (lidar 350-410) with a soldier stand-in.
import { K, ease, clamp } from '../../core/util.js';

export const FLOOR = 1350, HOME = 760, SC = 560 / 380, Y_STAND = FLOOR - 190 * SC;           // soldier stand-in: 380 px x 1.4737 = 560 px tall, feet on the floor line
export const DOOR = { x0: 1040, x1: 1420, y0: 520, y1: 1350, hingeY: [640, 935, 1230], handle: [1068, 1010], plate: [1065, 915, 1185, 970] };
export const BONKS = [35, 95, 155, 215, 275, 335, 395, 455, 515];
const E = (f, a, b, e = 'io') => ease[e](clamp((f - a) / (b - a)));
const lerp = (a, b, t) => a + (b - a) * t;

// ---- world 3 (voxel): he stacks 3 cubes, the tower wobbles and collapses, the top cube BONKs his head at 155
export const TOWER_X = 930, CUBE = 170, HEAD = { x: HOME + 18, y: FLOOR - 470 };
function cubes(f) {
  const out = [], rest = k => FLOOR - CUBE / 2 - k * CUBE;
  for (let k = 0; k < 3; k++) {
    const t0 = 112 + 8 * k, t = f - t0; if (t < 0) continue;
    let x = TOWER_X, y = rest(k) - 150 * (1 - ease.o(clamp(t / 6))), rot = 0, sq = 1;
    if (t >= 6 && t < 9) sq = 1 - .08 * Math.sin((t - 6) / 3 * Math.PI);
    const w = clamp((f - 132) / 14), sway = Math.sin((f - 132) * .95) * w * (4 + 9 * k);
    if (f >= 132 && f < 146) { x += sway; rot = sway * .0035 * (k + 1); }
    if (f >= 146) {
      const c = f - 146;
      if (k === 2) {
        if (f < 155) { const u = c / 9; x = lerp(TOWER_X, HEAD.x + 30, ease.io(u)) + sway * (1 - u); y = lerp(rest(2), HEAD.y - CUBE / 2 + 20, u) - 140 * Math.sin(Math.PI * u); rot = u * 2.4; }
        else { const b = f - 155, u = clamp(b / 14); x = lerp(HEAD.x + 30, 600, ease.o(u)); y = lerp(HEAD.y - CUBE / 2 + 20, FLOOR - CUBE / 2, u * u) - 90 * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (1 - u); rot = 2.4 + u * 2.2; }
      } else if (k === 1) { const u = clamp((c - 2) / 14); x = lerp(TOWER_X + sway, TOWER_X + 170, ease.o(u)); y = lerp(rest(1), FLOOR - CUBE / 2, u * u); rot = u * .9; }
      else { const u = clamp((c - 4) / 12); x = TOWER_X + sway * (1 - u); rot = .14 * ease.o(u); }
    }
    out.push({ x, y, rot, size: CUBE, sq, sym: k });
  }
  return out;
}

export function standInScene(f) {
  const last = BONKS.filter(b => f >= b).pop() ?? -999, n = BONKS.filter(b => f >= b).length, head = f >= 150 && f < 190;
  const glow = f < 366 ? 0 : f < 380 ? E(f, 366, 380) : f < 400 ? 1 : 1 - E(f, 400, 414);               // the PULL plate lights up in the scan
  return {
    hearts: 10 - n, heartLost: n ? { i: 10 - n, t: clamp((f - last) / 26) } : null, title: null,
    door: { open: 0, explode: 0, glowHinge: 0, glowPlate: glow },
    impact: { x: head ? HEAD.x + 20 : 1040, y: head ? HEAD.y - 40 : 1010, f: last },
    cam: { x: 960, y: 960, zoom: 1 }, cubes: cubes(f), scan: E(f, 356, 390),
  };
}

export function standInHero(f) {
  const p = { x: HOME, y: Y_STAND + Math.sin(f * .09) * 2, scale: SC, rot: 0, squash: 1, armL: .08, armR: .08, elbowL: .3, elbowR: .3, legL: 0, legR: 0, kneeL: 0, kneeR: 0,
    cap: { dx: 0, dy: 0, rot: 0 }, eyes: 'open', lid: 0, look: [.6, 0], brows: .3, mouth: 'flat', bang: false, plank: { x: -999, y: -999, rot: 0, len: 0, carried: false },
    st: 'door', f, fall: 0, seg: 'door', u: 0, ground: FLOOR, walk: 0, land: { f: 0, fall: 0, dist: 0 } };
  const d = Math.sin(f * .07) * .02; p.armL += d; p.armR -= d;
  if (f >= 110 && f < 170) {
    if (f < 135) { const w = Math.sin((f - 112) * .5) * .12; p.armL = 1.5 + w; p.armR = 1.35 - w; p.look = [.7, -.4]; p.brows = .5; }
    else if (f < 155) { const k = clamp((f - 135) / 6), a = E(f, 146, 152); p.look = [lerp(.7, .5, k), -.9]; p.brows = 1; p.eyes = 'wide'; p.mouth = 'o'; p.armL = lerp(1.5, 2.8, a); p.armR = lerp(1.35, 2.6, a); p.rot = Math.sin((f - 135) * 1.1) * .03 * k; }
    else if (f < 159) { p.squash = .72; p.eyes = 'closed'; p.lid = 1; p.armL = 2.8; p.armR = 2.6; p.brows = 0; p.cap.dy = 22; }
    else { const k = E(f, 159, 167); p.squash = lerp(1.1, 1, ease.o(clamp((f - 159) / 6))); p.look = [0, .35]; p.brows = .1; p.lid = .5 * (1 - k); p.armL = lerp(2.8, .1, k); p.armR = lerp(2.6, .1, k); p.cap.dy = lerp(14, 0, k); }
  }
  if (f >= 350 && f < 410) {
    const k = E(f, 358, 366) * (1 - E(f, 390, 394)); p.look = [lerp(.6, -1, k), .1 * k]; p.brows = .2; p.rot = -.02 * k;
    if (f >= 394 && f < 400) { const b = f - 394; p.legR = .9 * Math.sin(Math.PI * Math.min(1, b / 4)); p.squash = b >= 1 && b < 4 ? .94 : 1; p.eyes = 'wide'; p.mouth = 'o'; p.brows = 1; }
  }
  return p;
}

// new hero pose (core/pose.js) -> the old soldier-rig fields, so the box soldier stand-in follows the REAL choreography until core/hero3d.js lands
const MOUTH = { flat: 'flat', smile: 'flat', grin: 'smirk', o: 'o', frown: 'flat', grit: 'flat', scream: 'o', smirk: 'smirk', wobble: 'flat' };
export function adaptPose(p) {
  const k = p.scale * 554 / 380;                                                                      // hero 554 px tall at scale 1 -> soldier 380 px tall
  return { x: p.x, y: p.y - 119 * p.scale, scale: k, rot: p.rot || 0, squash: p.squash || 1, armL: p.armL, armR: p.armR, elbowL: p.elbowL, elbowR: p.elbowR, legL: p.legL, legR: p.legR, kneeL: p.kneeL, kneeR: p.kneeR,
    cap: { dx: 0, dy: 0, rot: 0 }, eyes: p.eyes, lid: p.lid || 0, look: [p.look ? p.look[0] : 0, p.look ? p.look[1] : 0], brows: p.brows ?? .3, mouth: MOUTH[p.mouth] || 'flat', bang: false,
    plank: { x: -999, y: -999, rot: 0, len: 0, carried: false }, st: p.st, f: p.f, fall: 0, seg: p.seg, u: p.u, ground: 1350, walk: 0, land: { f: 0, fall: 0, dist: 0 } };
}

let STATE = null;
export async function loadState() {
  if (STATE) return STATE;
  let real = null;
  try { const m = await import('../../core/scene.js'); if (m && typeof m.scene === 'function') real = m.scene; } catch (e) { /* no scene.js */ }
  STATE = { real: !!real, sceneAt: (f, tl) => real ? real(f, tl) : standInScene(f), heroAt: (f, s) => real ? adaptPose(s.p) : standInHero(f) };
  return STATE;
}
