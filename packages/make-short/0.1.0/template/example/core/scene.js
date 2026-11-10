// core/scene.js: THE STORY of "Why ice floats" (the make-short template example: 9 s = 270 frames at 30 fps).
// Everything that moves is timed HERE:
//   beats(tl)    every story moment as a frame number (+ hits = impacts, pops = planned sudden changes for QA)
//   acting(B,S)  the hero's key poses (POSES), faces (EX) and props, read by core/pose.js
//   scene(f,tl)  all world state at frame f, read by the scene file (scenes/<story>/<style>.js) as s.sc
//   keyframes()  the storyboard panels;  punch()  the camera kick on impacts (compose applies it)
// The scene file only draws what these say. Frame numbers below are for the 270-frame film; at() rescales them.
import { clamp, lerp, ease } from './util.js';
import { pose, heroPoints, POSES } from './pose.js';   // call-time only (pose.js imports this file too; that is fine)
export * from './kit-defaults.js';                // stage constants some kits import by name; this story does not use them

export const FLOOR = 1350;                                    // the floor line (the hero's soles stand on it)
export const TABLE = { x0: 1100, x1: 1660, y: 1250 };         // a low table; the hero stands left of it
export const GLASS = { x0: 1125, x1: 1305, y0: 1080, y1: 1250 };
export const WATER = 1118;                                    // the water surface in the glass
export const ICE = 70;                                        // ice cube size
export const X = 1050;                                        // the hero's pelvis x (standing spot)
export const CAM = { x: 1100, y: 1060, zoom: 1.2 };           // world point at the frame centre, and zoom: frames the hero and the glass
const GX = (GLASS.x0 + GLASS.x1) / 2, FLOAT = WATER + .4 * ICE, BOTTOM = GLASS.y1 - 16 - ICE / 2;   // floating ice: about 90% under water
export const TEXT = { hook: 'WILL IT SINK?', fact: ['SAME SIZE:', 'ICE 8% LIGHTER'] };   // 0.9167 vs 0.99987 g/cm3 = 8.3% (story.md has the sources)

export function beats(tl) {
  const N = tl.frames, at = f => Math.round(f * N / 270), B = { N };
  B.drop = at(30); B.splash = at(42); B.lean = at(60);
  B.push0 = at(88); B.release = at(120);
  B.bonk = at(133) | 1;                       // impacts sit on odd frames: the hero shows the hit exactly and holds it 3 f
  B.fallBack = B.bonk + 14;                   // the cube drops back into the glass
  B.fact0 = at(156); B.fact1 = at(166); B.realize = at(205); B.sheep = at(220);
  B.grab = at(240); B.lift = at(252); B.hookIn = at(248);
  B.hits = [B.bonk];                          // impacts: hit-stop in pose.js + camera punch below
  B.pops = [B.splash, B.bonk, B.fallBack, B.realize];   // planned sudden changes (impacts, cuts, a snappy take): QA allows these
  return B;
}
const CACHE = new Map();
const beatsOf = tl => { let b = CACHE.get(tl.frames); if (!b) CACHE.set(tl.frames, b = beats(tl)); return b; };

export function acting(B) {
  // a story can add its own key poses: start from a POSES entry and change channels (radians; arm 0 = down, + = forward)
  POSES.HOLD_UP ||= { ...POSES.PLACE, armL: .25, elbowL: .3, armR: 1.75, elbowR: .25 };   // near hand forward, a little above the shoulder
  const g = (x, o = {}) => ({ x, g: 'ground', turn: 1, ...o });   // standing on the floor, facing right (toward the glass)
  return {
    body: [                                                         // [frame, POSES name, place, ease into this key]
      [-30, 'HOLD_UP', g(X)], [B.drop - 2, 'HOLD_UP', g(X)],         // frame 0 = the want: ice held up over the glass
      [B.drop + 8, 'HANDS', g(X), 'io'], [B.lean, 'HANDS', g(X + 10)],
      [B.push0 - 14, 'HOLD_UP', g(X + 6), 'io'], [B.push0, 'PICK', g(X + 6), 'io'], [B.release - 4, 'PICK', g(X + 8)],   // a 14-frame lunge: no jumpy steps
      [B.release + 6, 'HANDS', g(X), 'io'], [B.bonk - 1, 'HANDS', g(X)],
      [B.bonk, 'STAGGER', g(X - 10), 'lin'], [B.bonk + 3, 'STAGGER', g(X - 10)], [B.bonk + 14, 'STAND', g(X - 20), 'o'],
      [B.fact0, 'READ', g(X - 20), 'io'], [B.realize, 'REALIZE', g(X - 20), 'io'], [B.sheep, 'SHEEPISH', g(X - 16), 'io'],
      [B.grab, 'PICK', g(X + 6), 'io'], [B.lift, 'HANDS', g(X), 'io'],
      [B.N - 12, 'HOLD_UP', g(X), 'io'], [B.N + 30, 'HOLD_UP', g(X)],   // settle 12 frames early so the scarf hangs like frame 0: the loop
    ],
    face: [                                                         // [frame, EX name, eye direction [x, y]]
      [-30, 'det', [1, .4]], [B.drop, 'focus', [1, .7]], [B.splash, 'surprise', [1, .6]],
      [B.push0 - 8, 'det', [1, .6]], [B.push0, 'effort', [1, .7]], [B.release, 'uhoh', [1, .3]],
      [B.bonk, 'ouch', [0, 0]], [B.bonk + 8, 'daze', [-.3, .2]],
      [B.fact0, 'read', [.8, -.7]], [B.realize, 'realize', [-.5, 0]], [B.sheep, 'sheepish', [-.5, 0]],
      [B.grab - 4, 'det', [1, .6]], [B.N - 12, 'det', [1, .4]],
    ],
    props: [[-30, '', '']],                                         // [frame, near-hand prop, far-hand prop]; the ice is drawn by the scene file
  };
}

// camera kick on every impact (compose adds it on top of scene().cam): +4% zoom, gone in 6 frames
export function punch(f, tl) {
  let zoom = 1, dx = 0, dy = 0;
  for (const b of beatsOf(tl).hits) { const k = f - b; if (k < 0 || k > 6) continue; const d = (1 - k / 7) ** 2; zoom += .04 * d; dy += 10 * d * Math.cos(k * 2.2); dx += 6 * d * Math.sin(k * 2.9); }
  return { zoom, dx, dy };
}

const hand = (f, tl) => heroPoints(pose(f, tl)).hand.R;            // the near mitten in world px
const held = (f, tl) => { const h = hand(f, tl); return { x: h[0] + 6, y: h[1] - ICE * .55, rot: 0 }; };   // sits on top of the mitten
const bob = (f, f0) => { const k = f - f0, d = Math.exp(-k / 8); return { x: GX + 4 * d * Math.sin(k * .7), y: FLOAT + 24 * d * Math.cos(k * .55), rot: .25 * d * Math.sin(k * .5) }; };

// the ice cube: held -> dropped -> floats -> pushed to the bottom -> shoots up into his nose -> back in the glass -> grabbed -> held
function ice(f, tl, B) {
  if (f < B.drop) return held(f, tl);
  if (f < B.splash) { const a = held(B.drop, tl), t = (f - B.drop) / (B.splash - B.drop); return { x: lerp(a.x, GX, t), y: lerp(a.y, FLOAT + 24, t * t), rot: .5 * t }; }
  if (f < B.push0 - 8) return bob(f, B.splash);
  if (f < B.release) { const b = bob(f, B.splash), h = hand(f, tl); return { x: lerp(b.x, GX, clamp((f - B.push0 + 8) / 6)), y: clamp(Math.max(b.y, h[1] + ICE * .45), FLOAT - 30, BOTTOM), rot: b.rot * .3 }; }
  const nose = heroPoints(pose(B.bonk - 1, tl)).front;
  if (f < B.bonk) { const t = ease.i((f - B.release) / (B.bonk - B.release)); return { x: lerp(GX, nose[0] + 30, t), y: lerp(BOTTOM, nose[1] + 10, t), rot: 2.4 * t }; }
  if (f < B.fallBack) { const t = (f - B.bonk) / (B.fallBack - B.bonk); return { x: lerp(nose[0] + 30, GX, t), y: lerp(nose[1] + 10, FLOAT + 24, t * t) - 150 * Math.sin(Math.PI * t * .8), rot: 2.4 + 3 * t }; }
  if (f < B.grab) return bob(f, B.fallBack);
  const b = bob(f, B.fallBack), h = held(f, tl), t = ease.io(clamp((f - B.grab) / 6));
  return { x: lerp(b.x, h.x, t), y: lerp(b.y, h.y, t), rot: lerp(b.rot, 0, t) };
}

export function scene(f, tl) {
  const B = beatsOf(tl), cube = ice(f, tl, B), nose = heroPoints(pose(B.bonk - 1, tl)).front;
  const splash = [[B.splash, GX], [B.fallBack, GX]].map(([s, x]) => ({ x, y: WATER, age: f - s })).filter(s => s.age >= 0 && s.age < 18);
  const factA = f < B.grab - 6 ? clamp((f - B.fact0) / (B.fact1 - B.fact0)) : clamp(1 - (f - (B.grab - 6)) / 10);
  const hookA = f < B.hookIn ? clamp(1 - (f - (B.drop - 10)) / 10) : clamp((f - B.hookIn) / (B.N - 8 - B.hookIn));
  return {
    ice: { ...cube, inGlass: cube.y > GLASS.y0 + 10 && cube.x > GLASS.x0 && cube.x < GLASS.x1 },
    splash,
    impact: { x: nose[0] + 10, y: nose[1], f: B.bonk, big: 0 },
    hook: { text: TEXT.hook, a: hookA, x: 680, y: 690 },                         // world px; with CAM this lands top-left in the safe square
    fact: { lines: TEXT.fact, a: factA, x: 1020, y: 690, ax: cube.x, ay: cube.y - ICE / 2 },
    cam: CAM,
  };
}

export function keyframes(tl) {          // storyboard panels: one per story beat
  const B = beatsOf(tl);
  return [{ f: 0, label: 'wants to sink the ice' }, { f: B.splash + 10, label: 'it floats' }, { f: B.push0 + 16, label: 'pushes it down' },
    { f: B.bonk + 1, label: 'BONK' }, { f: B.fact1 + 12, label: 'the fact' }, { f: B.sheep + 8, label: 'gets it' }, { f: B.N - 1, label: 'loops to frame 0' }];
}
