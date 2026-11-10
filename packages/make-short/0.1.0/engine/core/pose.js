// core/pose.js: THE one place the hero's motion is defined ("One Door, Ten Worlds"). World timing lives in core/scene.js.
// Pure ES module (no DOM). Baked once per timeline, random access afterwards (stills, --from/--to, fractional f).
//
// Hero conventions (see core/hero2d.js for the drawing)
//  * Root (x, y) = PELVIS in master px. Local frame: y down, 554 px tall at scale 1, faces +x when turn > 0.
//  * turn -1..1: 0 = front view, +-1 = 3/4 facing right/left (mirrored). rot = lean, + = forward (toward facing), about the pelvis.
//  * squash = y scale about the standing sole line (local y +158), volume kept (x by 1/squash). flat 0..1 = world-vertical
//    pancake about the floor line (flat world). scale 1 = medium shot.
//  * Limb angles: 0 = hanging down, + swings forward (toward facing), pi = straight up. L = FAR limb (behind), R = NEAR limb.
//    elbow: forearm bends FORWARD by elbow; knee: shin bends BACKWARD by knee.
//  * The hero steps on TWOS; every bonk shows on its exact (odd) frame and holds 3 f (hit-stop). Scarf drags 2-4 f, on ones.
// pose(f, tl) -> {x, y, scale, rot, squash, flat, turn, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, headRot, headDy,
//   eyes 'open'|'closed'|'wide', lid, squint, pupil, look [x,y] (+x = forward, -0.5 = at camera in 3/4), brows 0..1, browTilt -1 angry..+1 worried,
//   mouth (flat smile grin o frown grit scream smirk wobble), mouthOpen 0..1, prop, prop2, scarf {a:[[x,y]..], b:[[x,y]..]} (world px),
//   st (beat), act (=st), mood, seg, u, f, hit (frames since the last bonk, -1 if none), grounded}
import { TAU, clamp, lerp, seg as prog, ease, K, twos, wrapPi, noise } from './util.js';
import { beats, acting, FLOOR } from './scene.js';            // the story: beat table + acting keys (call-time only)

// ---- soldier-era exports, kept so the reference rigs (soldier2d/3d) and older style code still load
export const CX = 960, CY = 960, H0 = 380, FEET = 190, GROUND_Y = CY + FEET, PLANK_LEN = 210;
export const anchors = tl => beats(tl);                         // old name: now the story beat table
export const wobble = () => 0;
export const shake = () => ({ dx: 0, dy: 0, z: 1 });             // camera punches moved to scene.punch()

// ---- hero geometry (local px, scale 1)
export const HERO = { SOLE: 158, THIGH: 72, SHIN: 68, FOOT: 18, SHO_Y: -122, UPPER: 62, FORE: 56, MIT: 25, NECK: [0, -142], HEAD: [8, -270], HR: 126, BUTT: [-18, 34] };
const H = HERO, PAD = 24;
const dir = a => [Math.sin(a), Math.cos(a)];
const shoulder = (s, t) => [s === 'L' ? lerp(-50, -38, t) : lerp(50, 28, t), H.SHO_Y];
const hip = (s, t) => [s === 'L' ? lerp(-26, -12, t) : lerp(26, 12, t), 0];

// local points of a pose (before mirror / lean / squash)
export function heroLocal(p) {
  const t = Math.min(1, Math.abs(p.turn ?? 1)), o = {};
  for (const s of ['L', 'R']) {
    const S = shoulder(s, t), a = p['arm' + s] + (s === 'L' ? -.3 : .3) * (1 - t), e = p['elbow' + s], E = [S[0] + H.UPPER * Math.sin(a), S[1] + H.UPPER * Math.cos(a)], d2 = dir(a + e);   // front view: arms splay out
    const W = [E[0] + H.FORE * d2[0], E[1] + H.FORE * d2[1]];
    o['arm' + s] = { S, E, W, M: [W[0] + 13 * d2[0], W[1] + 13 * d2[1]], d: d2 };
    const Hp = hip(s, t), la = p['leg' + s], k = p['knee' + s], Kn = [Hp[0] + H.THIGH * Math.sin(la), Hp[1] + H.THIGH * Math.cos(la)], A = [Kn[0] + H.SHIN * Math.sin(la - k), Kn[1] + H.SHIN * Math.cos(la - k)];
    o['leg' + s] = { H: Hp, K: Kn, A, sole: [A[0], A[1] + H.FOOT], a: la - k };
  }
  const hr = p.headRot || 0, c = Math.cos(hr), sn = Math.sin(hr), vx = H.HEAD[0] - H.NECK[0], vy = H.HEAD[1] - H.NECK[1];
  o.head = [H.NECK[0] + vx * c - vy * sn + (p.headDx || 0), H.NECK[1] + vx * sn + vy * c + (p.headDy || 0)];
  return o;
}
// local -> world (same transform chain as hero2d.drawHero)
export function toWorld(p, q) {
  const fc = (p.turn ?? 1) < 0 ? -1 : 1, sq = p.squash || 1, k = p.scale || 1, X = q[0] / sq, Y = H.SOLE + (q[1] - H.SOLE) * sq;
  const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
  let x = p.x + fc * k * (X * c - Y * s), y = p.y + k * (X * s + Y * c);
  if (p.flat) { y = FLOOR + (y - FLOOR) * (1 - .8 * p.flat); x = p.x + (x - p.x) * (1 + .15 * p.flat); }
  return [x, y];
}
// world anchor points (hero2d.anchors re-exports this): hands, head centre/top/front, eyes, mouth, soles, scarf knot
export function heroPoints(p) {
  const L = heroLocal(p), w = q => toWorld(p, q), hd = L.head, t = Math.min(1, Math.abs(p.turn ?? 1)), fx = hd[0] + 50 * t;
  return { hand: { L: w(L.armL.M), R: w(L.armR.M) }, head: w(hd), top: w([hd[0], hd[1] - H.HR]), front: w([hd[0] + H.HR * lerp(.2, .97, t), hd[1] + 10]),
    eyes: [w([fx - lerp(46, 30, t), hd[1] + 4]), w([fx + lerp(46, 36, t), hd[1] + 4])], mouth: w([fx + 4 * t, hd[1] + 74]),
    feet: [w(L.legL.sole), w(L.legR.sole)], knot: w([hd[0] - lerp(46, 52, t), -146]), pelvis: [p.x, p.y] };
}
function armIK(s, tx, ty, t = 1) {                               // mitten centre to a local target; elbow bends forward
  const S = shoulder(s, t), l1 = H.UPPER, l2 = H.FORE + 13, dx = tx - S[0], dy = ty - S[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 2, l1 + l2 - 1), th = Math.atan2(dx, dy);
  const a = th - Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), E = [S[0] + l1 * Math.sin(a), S[1] + l1 * Math.cos(a)];
  return [a, wrapPi(Math.atan2(S[0] + d * Math.sin(th) - E[0], S[1] + d * Math.cos(th) - E[1]) - a)];
}

// ---- key poses: [armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, rot, squash, headRot]
const CH = ['armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR', 'rot', 'squash', 'headRot'];
const P = (...v) => Object.fromEntries(CH.map((k, i) => [k, v[i] ?? (k === 'squash' ? 1 : 0)]));
const ik = (side, x, y, t = 1) => armIK(side, x, y, t);
const withArms = (base, L, R) => ({ ...base, armL: L[0], elbowL: L[1], armR: R[0], elbowR: R[1] });
export const mixPose = (a, b, w) => Object.fromEntries(CH.map(k => [k, lerp(a[k], b[k], w)]));   // w > 1 = overshoot past b
// contrapposto default: weight on the far leg, near knee soft and forward, arms off the body, S-curve (lean back, head forward)
const STAND = P(-.22, .18, .3, .35, -.04, .24, .02, .38, -.03, 1, .06);
const SIT = P(.5, .6, .5, .4, 2.0, 2.15, 2.1, 2.25, -.05);
export const POSES = {
  STAND, SIT,
  STARE: P(-.55, -.32, 1.15, 1.25, -.3, .34, .1, .4, .12, 1, .12),                 // determined: leaning in, fists balled
  HUFF: P(-.6, -.38, 1.25, 1.35, -.32, .36, .12, .42, .02, .94, -.06),              // puffs up before the run
  WIND: P(-1.7, -1.45, .3, .4, .98, .48, 1.8, 1.25, .44, .86, .16),                // deep sprinter crouch (anticipation)
  RUN1: P(1.1, -1.05, 1.3, .9, -.9, 1.2, .5, 1.5, .32, 1.02, .1), RUN2: P(-1.05, 1.1, .9, 1.3, 1.2, -.9, 1.5, .5, .32, 1.02, .1),
  LEAP: P(-1.1, 1.95, .3, .2, -.9, -.4, .6, 1.2, .56, 1.1, -.14),                  // take-off: stretched, near arm reaching for the door
  APEX: P(-1.3, 1.75, .4, .3, .55, .25, 1.75, 1.45, .62, 1, -.1),                  // top of the arc: tucked
  SPLAT: P(1.95, 1.6, .3, .2, .4, .55, .5, .6, .08, 1.18, -.28),                   // squashed on the door (x 0.85), head snapped back
  RECOIL: P(-2.2, 2.05, .4, .5, 1.0, .7, .4, .3, -.46, .95, -.22),                 // bounces off, V arms
  STAGGER: P(-2.6, -1.4, .5, .4, -.62, .5, .2, .2, -.6, 1, -.16),                  // overshoot: leaning way back, windmilling
  WOBBLE: P(-1.6, 1.25, .4, .4, .22, -.16, .3, .2, .2, 1, .14),                    // wobble forward
  DAZED: P(-.38, .26, .2, .2, .12, -.1, .25, .32, -.07, .98, .18),                 // knock-kneed, limp arms
  SITBUMP: P(-1.2, 1.4, .3, .3, 1.9, 2.05, 1.8, 1.9, -.14, .84, .12),
  DAZE: P(-.35, .2, .2, .3, 2.0, 2.15, 2.1, 2.25, -.12, 1, -.14),
  HANDS: withArms(P(0, 0, 0, 0, -.04, .26, .02, .4, .04, 1, .16), ik('L', 126, -160), ik('R', 152, -172)),
  DRAW_HI: withArms(P(0, 0, 0, 0, -.32, .48, .1, .35, .14, 1, -.12), [-.5, .5], ik('R', 172, -244)),
  DRAW_LO: withArms(P(0, 0, 0, 0, -.25, .55, .1, .6, .26, .94, .1), [-.55, .5], ik('R', 150, -70)),
  DRAW_MID: withArms(P(0, 0, 0, 0, -.28, .45, .1, .4, .16, 1, 0), [-.5, .5], ik('R', 162, -190)),
  TADA: P(-1.9, 1.75, .3, .25, -.1, .3, .05, .3, -.1, 1.04, -.12),                 // presents his drawn door
  SMUG: P(-.55, -.45, .8, .75, -.2, .3, .05, .2, -.12, 1.02, -.18),                // chest out, chin up, hands on hips
  SMUG_DIP: P(-.6, -.5, .9, .85, .1, .5, .5, .8, .08, .9, .05),                    // little "hup" crouch before the stride
  WALK1: P(.35, -.32, .4, .4, -.5, .55, .3, .4, .06, 1, -.1), WALK2: P(-.32, .35, .4, .4, .55, -.5, .4, .3, .06, 1, -.1),
  WALKIN: P(-1.0, 1.4, .2, .2, -.4, .5, .2, .3, .14, 1, -.08),
  WSPLAT: P(-1.9, 1.6, .3, .3, .35, .5, .4, .5, .08, 1.18, -.26),
  PICK: P(.9, 1.0, .6, .6, .6, .3, 1.0, .6, .4, 1, .14),
  PLACE: P(1.25, 1.35, .5, .5, -.08, .22, .1, .3, .1, 1, .08),
  PLACE_HI: P(-2.0, 2.0, .35, .5, -.08, .24, .05, .3, -.06, 1, -.08),
  CROUCH: P(-1.0, -.9, .4, .4, .95, .75, 1.75, 1.55, .38, .86, .12),
  CLIMB: P(-1.6, 1.9, .6, .5, -.3, 1.6, .3, 2.0, .22, 1, .05),
  TOP: P(-2.25, 2.15, .2, .2, -.05, .24, .03, .35, -.08, 1.03, -.18),
  WOB_A: P(-2.4, 1.25, .3, .5, -.25, .4, .2, .5, -.28, 1, -.2), WOB_B: P(-1.5, 2.2, .5, .2, .35, -.25, .5, .2, .3, 1, .2),
  TOPPLE: P(-2.4, 2.0, .4, .5, .7, -.25, 1.0, .5, -.7, 1, -.2),
  BONKED: P(-1.3, 1.5, .3, .3, 2.0, 2.15, 2.1, 2.25, -.05, .78, .2),
  READ: P(-.25, .2, .3, .35, -.05, .26, .02, .4, -.08, 1, -.2),
  OFF_ANTIC: P(-.3, -.15, 1.2, 1.3, .1, .35, .4, .55, .16, .9, .14),
  OFFENDED: P(-2.05, 1.95, .5, .4, -.32, .32, .05, .22, -.26, 1.08, -.26),
  FISTS: P(-.5, -.25, 1.4, 1.5, -.3, .36, .15, .42, .12, .95, .12),
  BUTT_BACK: P(-1.0, -.8, 1.0, 1.0, .35, .55, .7, .9, -.32, .9, -.24),
  HEADBUTT: P(-1.5, -1.3, .3, .3, -.75, .6, .1, .6, .48, 1.06, .3),
  HSPLAT: P(-1.3, -1.1, .4, .4, -.6, .55, .2, .5, .38, 1.18, .12),
  CROUCH_LO: P(-1.2, -1.1, .4, .4, 1.1, .85, 2.0, 1.75, .5, .82, .16),
  DIVE: P(1.65, 1.55, .1, .1, -1.5, -1.45, .2, .3, 1.45),
  STUCK_A: P(1.7, 1.6, .1, .1, -1.2, -1.75, .6, .2, 1.52), STUCK_B: P(1.6, 1.7, .1, .1, -1.75, -1.2, .2, .6, 1.52),
  POP: P(-2.1, 2.0, .2, .2, -.12, .14, .2, .3, -.04, 1.22, -.16),
  TOOLS: P(.9, .5, 1.0, 1.2, -.3, .34, .1, .4, .06, 1, .08),
  CHISEL: P(1.45, 3.6, .25, .4, -.32, .36, .1, .42, -.06, 1.03, -.08),
  STRIKE: P(1.45, 1.55, .25, .15, -.28, .42, .15, .5, .18, .95, .14),
  RAISE_BIG: P(1.4, 3.5, .3, .7, -.36, .4, .1, .35, -.16, 1.05, -.16),
  SHAKE_HANDS: P(-.9, .9, 1.6, 1.7, -.2, .3, .2, .4, .1, .97, .1),
  REBOUND: P(1.0, 3.5, .5, .7, -.3, .36, .15, .3, -.14, 1, -.12),
  BONK_SELF: P(.8, 3.05, .6, 1.5, -.2, .34, .3, .4, .08, .84, .16),
  UNEASY: P(-.45, .55, 1.3, 1.45, -.12, .2, .25, .4, .1, .95, .08),
  GROPE_A: P(-1.2, 1.55, .3, .25, -.35, .4, .25, .35, .08, 1, .04), GROPE_B: P(-1.0, 1.5, .3, .25, .4, -.35, .35, .25, .08, 1, .04),
  TIPTOE: P(-1.1, 1.5, .3, .25, -.2, .5, .1, .5, .04, 1.05, 0),
  STEP_TOE: P(-1.1, 1.45, .3, .25, -.45, .75, .25, .2, .06, 1, .02),
  STUB: P(-1.9, 2.0, .3, .4, -.15, .45, .2, .6, -.08, .92, -.1),
  HOP_A: P(-1.2, .9, .3, .2, -.05, 1.3, .1, 1.9, .18, 1.04, .12), HOP_B: P(-1.0, .9, .3, .2, .15, 1.3, .55, 1.9, .16, .9, .12),
  SAD: P(-.08, .04, .1, .1, -.04, .2, .12, .3, .14, .95, .3),
  SLUMP: P(-.4, -.25, .2, .2, .35, .4, .6, .75, -.14, 1, .24),
  SIT_SAD: P(1.2, 1.3, 1.0, 1.1, 2.3, 2.4, 2.5, 2.6, -.04, 1, .34),
  SOB: P(1.2, 1.3, 1.0, 1.1, 2.3, 2.4, 2.5, 2.6, .02, .94, .4),
  RAGE: P(-.5, -.35, 1.5, 1.6, -.35, .42, .3, .5, .16, .93, .14),
  BACK_A: P(-.8, -.6, .9, .9, .45, -.2, .8, .3, .24, .92, .14),
  WINDUP_DEEP: P(-1.9, -1.7, .3, .3, 1.1, .4, 2.05, 1.1, .52, .8, .22),            // glass: deepest crouch, arms way back
  CHARGE_A: P(-1.4, -1.2, .5, .5, -.85, 1.15, .5, 1.5, .42, 1.04, .24), CHARGE_B: P(-1.2, -1.4, .5, .5, 1.15, -.85, 1.5, .5, .45, 1.04, .26),
  BIG_SPLAT: P(1.8, 1.55, .2, .2, .45, .25, .6, .4, .04, 1.2, -.32),
  BIG_RECOIL: P(-2.3, 2.1, .5, .5, 1.25, 1.45, .5, .6, -.75, .95, -.25),
  LIE: P(2.6, 2.2, .4, .5, .3, .5, .5, .7, -1.45),
  FLINCH: P(2.2, 2.0, 1.5, 1.6, 2.0, 2.15, 2.1, 2.25, -.22, .95, -.12),
  READ_S: P(-.25, .55, .3, 1.25, -.04, .26, .02, .4, -.05, 1, -.14),
  REALIZE: P(-.15, -.08, .2, .2, -.04, .1, .02, .1, -.1, 1.05, -.18),
  FACEPALM: withArms(P(0, 0, 0, 0, -.02, .28, .05, .42, .16, .93, .36), [-.15, .25], ik('R', 18, -262, .25)),
  SHEEPISH: withArms(P(0, 0, 0, 0, -.06, .28, .05, .4, -.05, 1, .08), ik('L', -70, -318), [.3, .5]),
  GRIP: withArms(P(0, 0, 0, 0, .25, .55, .6, .8, .12, .94, .08), [.3, .6], ik('R', 100, -182)),
  PULL: P(1.65, 1.85, .15, .05, -.65, .75, .1, .6, -.42, 1, -.12),
  PULL2: P(1.4, 1.6, .3, .2, .35, -.4, .5, .2, -.62, 1, -.2),
  OPEN_JOY: P(-1.95, 2.0, .5, .4, -.12, .3, .05, .35, -.12, 1.05, -.14),
  TRIUMPH: withArms(P(0, 0, 0, 0, -.14, .28, .05, .4, -.06, 1, -.06), ik('L', -70, -318), [.9, 2.0]),
};

// ---- face: expression presets {brows, tilt, lid, squint, mouth, open, pupil, wide}
const E = (b, t, lid, sq, m, open = 0, pu = 1, wide = 0) => ({ b, t, lid, sq, m, open, pu, wide });
export const EX = {
  det: E(.25, -.7, .12, .15, 'flat'), effort: E(.15, -.8, .2, .3, 'grit'), ouch: E(.3, .6, 1, 0, 'grit'), stun: E(.9, .4, 0, 0, 'o', .6, .55, 1),
  daze: E(.45, .4, .45, 0, 'wobble'), curious: E(.75, .3, 0, 0, 'o', .35, 1.15), idea: E(.9, -.1, 0, .2, 'grin', 0, 1.2, 1), focus: E(.35, -.3, .25, .1, 'smirk'),
  smug: E(.35, -.3, .5, .35, 'smirk'), smugShut: E(.4, -.2, 1, .2, 'smirk'), hope: E(.7, .2, 0, .2, 'smile', 0, 1.15), proud: E(.5, -.1, .1, .3, 'grin', 0, 1.1),
  panic: E(1, 1, 0, 0, 'scream', 1, .6, 1), read: E(.55, .1, .1, 0, 'flat'), offAntic: E(.2, -.4, .4, .3, 'flat', 0, .9), offended: E(.05, -1, 0, 0, 'o', .8, .7, 1),
  angry: E(0, -1, .3, .3, 'grit', 0, .9), squashed: E(.8, .6, 0, 0, 'o', .7, .8, 1), strain: E(.3, .7, .3, .5, 'grit'), surprise: E(1, .3, 0, 0, 'o', .8, .7, 1),
  frustr: E(.05, -.9, .35, .35, 'grit', 0, .9), shock: E(1, .5, 0, 0, 'o', .9, .55, 1), uhoh: E(.85, .9, 0, 0, 'wobble', 0, .7, 1), uneasy: E(.75, .85, 0, 0, 'wobble', 0, .65),
  pain: E(.4, .9, .85, .4, 'scream', .6), sad: E(.55, 1, .45, 0, 'frown', 0, 1.15), cry: E(.6, 1, .55, .2, 'wobble', 0, 1.2), rage: E(0, -1, .35, .45, 'grit', 0, .75),
  yell: E(0, -1, .15, .2, 'scream', 1, .75), wonder: E(.85, .3, 0, 0, 'o', .5, 1.2), realize: E(1, .2, 0, 0, 'o', .7, .5, 1), palm: E(.2, .8, 1, 0, 'flat'),
  sheepish: E(.65, .8, .2, .3, 'smile', 0, 1.1), joy: E(.9, .2, 0, .3, 'grin', 0, 1.2, 1), triumph: E(.6, .5, .15, .45, 'grin', 0, 1.1),
};

const CACHE = new Map();
const sigOf = tl => `${tl.frames}|` + tl.styles.map(s => `${s.id}:${s.start}:${s.end}`).join('|');
const bakeOf = tl => { const k = sigOf(tl); let b = CACHE.get(k); if (!b) CACHE.set(k, b = bake(tl)); return b; };

export function bake(tl) {
  const S = {}; tl.styles.forEach(s => S[s.id] = s);
  const B = beats(tl), N = tl.frames, M = N + 2 * PAD;
  const ACT = acting(B, S);
  const KS = ACT.body.map(k => ({ t: k[0], p: typeof k[1] === 'string' ? POSES[k[1]] : k[1], name: typeof k[1] === 'string' ? k[1] : (k[1].name || 'pose'), o: k[2], e: k[3] || 'io' }));
  for (let i = 1; i < KS.length; i++) if (KS[i].t < KS[i - 1].t) KS[i].t = KS[i - 1].t;   // monotonic (compressed timelines)
  const groundY = (pp, floor) => { const tmp = { ...pp, y: 0 }, L = heroLocal(tmp); return floor - Math.max(toWorld(tmp, L.legL.sole)[1], toWorld(tmp, L.legR.sole)[1], toWorld(tmp, H.BUTT)[1]); };
  const keyBody = k => {
    const b = { ...k.p, x: k.o.x, turn: k.o.turn ?? 1, scale: k.o.scale ?? 1, flat: k.o.flat ?? 0 }; b.y = k.o.g === 'free' ? k.o.y : groundY(b, k.o.floor ?? FLOOR);
    if (k.o.touch) { const q = heroPoints(b), [what, tx] = k.o.touch, cur = what === 'front' ? q.front[0] : what === 'toe' ? q.feet[1][0] + 40 : q.hand[what][0]; b.x += tx - cur; k.o.x = b.x; }
    return b; };
  KS.forEach(k => k.body = keyBody(k));
  const chAt = n => {
    let i = 1; while (i < KS.length - 1 && n > KS[i].t) i++;
    const a = KS[i - 1], b = KS[i], w = n <= a.t ? 0 : n >= b.t ? 1 : ease[b.e]((n - a.t) / (b.t - a.t)), o = {};
    for (const k of [...CH, 'x', 'turn', 'scale', 'flat']) o[k] = lerp(a.body[k], b.body[k], w);
    return { a, b, w, o };
  };
  const LAG = [[['legL', 'legR'], 1], [['kneeL', 'kneeR', 'armL', 'armR'], 2], [['elbowL', 'elbowR'], 3]];
  const bodyAt = n => {
    const { a, b, w, o } = chAt(n);
    for (const [ks, l] of LAG) { const c = chAt(n - l).o; for (const k of ks) o[k] = c[k]; }   // overlapping action: offset keys, no new math
    const sym = clamp(1 - Math.abs(o.turn) / .3);                      // crossing turn 0 mirrors the drawing: make the pose symmetric there
    if (sym > 0) {
      for (const [l, r, mirror] of [['armL', 'armR', 1], ['legL', 'legR', 1], ['elbowL', 'elbowR', 0], ['kneeL', 'kneeR', 0]]) {
        const m = mirror ? (o[r] - o[l]) / 2 : (o[r] + o[l]) / 2; o[l] = lerp(o[l], mirror ? -m : m, sym); o[r] = lerp(o[r], m, sym);
      }
      o.rot *= 1 - sym; o.headRot *= 1 - sym * .5;
    }
    const both = a.o.g === 'ground' && b.o.g === 'ground';           // planted: re-ground every frame so feet never float or sink
    const fl = lerp(a.o.floor ?? FLOOR, b.o.floor ?? FLOOR, w), gy = groundY(o, fl);
    o.y = both ? gy : Math.min(lerp(a.body.y, b.body.y, w), gy);    // planted keys re-ground every frame; blends never sink below the floor
    o.grounded = both || (w < .5 ? a.o.g === 'ground' : b.o.g === 'ground'); o.st = (w < .5 ? a : b).name.toLowerCase();
    return o;
  };
  const FK = ACT.face.map(k => ({ t: k[0], e: EX[k[1]], name: k[1], look: k[2] }));
  const fAt = (n, lead) => { const m = n + lead; let i = 0; while (i < FK.length - 1 && FK[i + 1].t <= m) i++; return { a: FK[i], b: FK[Math.min(i + 1, FK.length - 1)], m }; };
  const faceCh = (n, lead, dur, get) => { const { a, b, m } = fAt(n, lead); const pa = FK[Math.max(0, FK.indexOf(a) - 1)], w = ease.o(clamp((m - a.t) / dur)); return lerp(get(pa), get(a), a === pa ? 1 : w); };
  const PR = ACT.props;
  const propAt = n => { let r = PR[0]; for (const q of PR) if (q[0] <= n) r = q; return r; };
  // blinks: irregular 50-140 f, never in eyes-shut or wide (shock) beats; one blink at each big thought change
  const shutOrWide = n => { const { a } = fAt(n, 3); return a.e.lid > .8 || a.e.wide; };
  const blinks = []; { let s = 27; const r = [41, 73, 58, 97, 66, 121, 52, 88, 77, 109]; let i = 0; while (s < N) { if (!shutOrWide(s) && !shutOrWide(s + 6)) blinks.push(s | 1); s += r[i++ % r.length]; } }
  const blinkShape = K([[0, 0], [2, 1, 'o'], [4, 1], [7, 0, 'io']]);
  const blinkLid = n => { let m = 0; for (const s of blinks) { const t = n - s; if (t > -1 && t < 8) m = Math.max(m, blinkShape(t)); } return m; };

  const raw = new Array(M);
  for (let i = 0; i < M; i++) {
    const n = i - PAD, o = bodyAt(n), fc = fAt(n, 0).a;
    // face channels lead the head/body: eyes/look 3 f, brows 2 f, lids 2 f, mouth 1 f (darts take 2 f, brows 4 f)
    const look = [faceCh(n, 3, 2, k => k.look[0]), faceCh(n, 3, 2, k => k.look[1])];
    const brows = faceCh(n, 2, 4, k => k.e.b), browTilt = faceCh(n, 2, 4, k => k.e.t), lid0 = faceCh(n, 2, 3, k => k.e.lid), squint = faceCh(n, 2, 3, k => k.e.sq);
    const mo = fAt(n, 1).a.e, wide = fAt(n, 3).a.e.wide, pupil = faceCh(n, 3, 3, k => k.e.pu);
    const lid = Math.max(lid0, blinkLid(n));
    o.look = look; o.brows = brows; o.browTilt = browTilt; o.squint = squint; o.pupil = pupil; o.mouth = mo.m; o.mouthOpen = mo.open;
    o.lid = wide && lid < .85 ? Math.min(lid, .1) : lid; o.eyes = lid >= .85 ? 'closed' : wide ? 'wide' : 'open';
    o.mood = fc.name; o.act = o.st; const pr = propAt(n); o.prop = pr[1]; o.prop2 = pr[2];
    // moving hold: slow drift on every channel (lattice 41/63/125 f) so nothing freezes
    const dn = (s) => .55 * noise(n / 41, s) + .3 * noise(n / 63, s + 1) + .15 * noise(n / 125, s + 2);
    o.rot += .014 * dn(1); o.headRot += .025 * dn(4); o.armL += .04 * dn(7); o.armR += .04 * dn(10); o.legL += .025 * dn(13); o.legR += .03 * dn(16); o.kneeR += .04 * dn(19);
    o.squash *= 1 + .007 * Math.sin(TAU * n / 83);
    const sym = clamp(1 - Math.abs(o.turn) / .3); if (sym > 0) o.look = [o.look[0] * (1 - sym), o.look[1]];   // gaze centres at the flip
    raw[i] = o;
  }
  // scarf: two tails hang from the knot and drag behind its motion (2-4 f), on ones
  const pts = raw.map(o => { const q = heroPoints(o); return [q.head, q.hand.L, q.hand.R, q.feet[0], q.feet[1]]; });
  const fast = raw.map((o, i) => i > 0 && pts[i].some((q, k) => Math.hypot(q[0] - pts[i - 1][k][0], q[1] - pts[i - 1][k][1]) > 55));
  const pick = n => { const hb = B.hits.find(b => n >= b && n < b + 3); if (hb != null) return hb; if (B.hits.some(b => n >= b - 1 && n < b)) return n;
    return (fast[n + PAD] || fast[n + PAD + 1]) ? n : twos(n); };   // twos for acting, ones for fast moves (no smear-sized jumps)
  const knot = raw.map((o, i) => heroPoints(raw[clamp(pick(i - PAD) + PAD, 0, M - 1)]).knot);
  const tails = [{ n: 5, len: 19, lag: .7, w: 1 }, { n: 4, len: 17, lag: .55, w: .8 }];
  const scarf = raw.map((o, i) => {
    const n = i - PAD, kn = knot[i], fc = (o.turn ?? 1) < 0 ? -1 : 1, slide = ACT.scarfFlat ? ACT.scarfFlat(n) : 0;
    const out = {};
    tails.forEach((T, j) => {
      const pts = [kn]; let px = kn[0], py = kn[1];
      for (let s = 1; s <= T.n; s++) {
        const back = Math.min(i, Math.round(s * T.lag + 1)), q0 = knot[i - back], q1 = knot[Math.max(0, i - back - 2)];
        const vx = (q0[0] - q1[0]) / 2, vy = (q0[1] - q1[1]) / 2;   // knot velocity some frames ago: the tail trails it
        const sp = Math.min(1, Math.hypot(vx, vy) / 14), flap = (.35 + .65 * sp) * Math.sin(n / 3.1 - s * 1.2 + j * 1.7) * (.25 + .12 * s);
        const fs = clamp((o.turn ?? 1) * 1.6, -1, 1), ang = -fs * (1.18 - .1 * j + .25 * sp) + flap + .04 * s * fs;   // ~68 deg back from vertical; lifts with speed; hangs down at turn 0
        let ax = Math.sin(ang) * T.len - vx * .7, ay = Math.cos(ang) * T.len - vy * .45;
        const l = Math.hypot(ax, ay) || 1; px += ax / l * T.len; py += ay / l * T.len;
        if (slide && j === 0) { px = lerp(px, kn[0] + s * 118, slide); py = lerp(py, FLOOR - 6, slide); }   // story hook: tail A slides flat along the floor
        py = Math.min(py, FLOOR - 4); pts.push([px, py]);
      }
      out[j ? 'b' : 'a'] = pts;
    });
    return out;
  });
  return { B, N, raw, scarf, tl, pick };
}

export function pose(f, tl) {
  const Bk = bakeOf(tl), B = Bk.B, N = Bk.N, fs = clamp(f, -PAD, N + PAD - 2);
  const fe = fs >= B.light1 ? 0 : Bk.pick(Math.floor(fs));                               // twos, except: the bonk frame (odd) shows exactly and holds 3 f (hit-stop)
  const R = Bk.raw[Math.round(fe) + PAD], sc = Bk.scarf[fs >= B.light1 ? PAD : Math.round(clamp(fs, -PAD, N + PAD - 1)) + PAD];
  let seg = tl.styles[tl.styles.length - 1];
  for (const s of tl.styles) if (f >= s.start && f < s.end) { seg = s; break; }
  if (f < tl.styles[0].start) seg = tl.styles[0];
  const last = B.hits.filter(b => f >= b).pop();
  return { cap: { dx: 0, dy: 0, rot: 0 }, plank: { x: -999, y: -999, rot: 0, len: 0, carried: false }, fall: 0, walk: 0, land: { f: 0, fall: 0, dist: 0 }, bang: false, ground: R.grounded ? FLOOR : null,   // TEMP soldier-era fields: old style code keeps loading during the swap; remove after builders move to drawHero
    ...R, look: R.look.slice(), scarf: { a: sc.a.map(q => q.slice()), b: sc.b.map(q => q.slice()) }, seg: seg.id, u: (f - seg.start) / (seg.end - seg.start), f, hit: last == null ? -1 : f - last };
}
