// core/scene.js: every timed WORLD state of "One Door, Ten Worlds". Styles draw it; they never key their own timing.
//   scene(f, tl) -> plain numbers/strings (+ the cubes[] and labels[] arrays):
//   {hearts, heartFx, title, door:{open, explode, glowHinge, glowPlate}, impact:{x,y,f,big}, cam:{x,y,zoom},
//    pencil, cubes[{x,y,rot,s,a}], term:{typed, reply}, slide, chisel, thunk, scan, tear, tearX, tearY, crack,
//    labels[{id,text,sub,x,y,ax,ay,a,glow}], light, sheet:{cursor, click, zoom}, beat, world}
//   beats(tl) -> frame numbers of every acting/world beat (keyed in style-local u, bonks at segment end - 15).
//   punch(f, tl) -> {zoom, dx, dy}: bonk camera punches; compose applies them on top of scene().cam.
import { clamp, lerp, seg as prog, ease, K } from './util.js';
import { pose, heroPoints } from './pose.js';     // call-time only (circular import is safe that way)

export const FLOOR = 1350, HOME = 760;
export const DOOR = {
  x0: 1040, x1: 1420, y0: 520, y1: 1350,
  handle: { x0: 1058, x1: 1158, y: 1010 },                       // horizontal bar on the left edge
  plate: { x0: 1065, x1: 1185, y0: 915, y1: 970 },               // PULL, legible in every style
  hinges: [{ x: 1420, y: 600 }, { x: 1420, y: 935 }, { x: 1420, y: 1270 }],   // right edge, on OUR side
};
export const DRAWN = { x0: 470, x1: 700, y0: 840, y1: 1350 };     // blueprint: the door he pencils on the wall
export const HEARTS = { x: 960, y: 465, gap: 60, n: 10 };         // heart i centre = x + (i - 4.5) * gap
export const TITLE = { lines: ['ONE DOOR.', 'TEN WORLDS.'], x: 470, y: [560, 640], cap: 64 };
export const CUBE = 92;                                           // voxel tower cube size
export const TERM = { cmd: '> open door', reply: 'no.' };

export function beats(tl) {
  const S = {}; tl.styles.forEach(s => S[s.id] = s);
  const at = (id, u) => Math.round(S[id].start + u * (S[id].end - S[id].start)), bonk = id => S[id].end - 15;
  const B = { N: tl.frames };
  // 1 pixel: stare, huff, deep wind-up, sprint, jump ARC, BONK
  B.windup = at('pixel', .28); B.run = at('pixel', .4); B.jump = at('pixel', .52); B.bonk1 = bonk('pixel'); B.titleOff = at('pixel', .6);
  // 2 blueprint: looks at his line hands, turns, pencils a door, ta-da, smug dip, walks into it
  B.hands = at('blueprint', .1); B.draw0 = at('blueprint', .3); B.draw1 = at('blueprint', .5); B.smug = at('blueprint', .55); B.walk2 = at('blueprint', .68); B.bonk2 = bonk('blueprint');
  // 3 voxel: 3 cubes, crouch, climb, wobble, collapse, cube on the head
  B.cube1 = at('voxel', .15); B.cube2 = at('voxel', .22); B.cube3 = at('voxel', .29); B.climb = at('voxel', .35); B.top = at('voxel', .49); B.wobble = at('voxel', .52); B.collapse = at('voxel', .62); B.bonk3 = bonk('voxel');
  // 4 ascii: types, "no.", offended take, fists, headbutt
  B.type0 = at('ascii', .05); B.type1 = at('ascii', .3); B.reply = at('ascii', .38); B.offend = at('ascii', .45); B.butt = at('ascii', .65); B.bonk4 = bonk('ascii');
  // 5 flat: deep crouch, dive, head goes under the door gap, stuck (kicks), only the scarf gets through, pops back
  B.crouch = at('flat', .15); B.dive = at('flat', .24); B.stuck = at('flat', .32); B.scarfThru = at('flat', .45); B.pop = at('flat', .62); B.bonk5 = bonk('flat');
  // 6 woodcut: chisel + mallet, three strikes, snap + THUNK, stinging hands, mallet rebound
  B.tools = at('woodcut', .15); B.strike1 = at('woodcut', .25); B.strike2 = at('woodcut', .35); B.strike3 = at('woodcut', .45); B.snap = at('woodcut', .53); B.bonk6 = bonk('woodcut');
  // 7 lidar: dark, scan sweep, he turns away while the plate glows, toe stub (small)
  B.scan0 = at('lidar', .1); B.plate = at('lidar', .37); B.scan1 = at('lidar', .6); B.step = at('lidar', .7); B.bonk7 = bonk('lidar');
  // 8 watercolor: slumps against the door, slides down, one tear, it hits the floor (= the ring centre)
  B.slump = at('watercolor', .2); B.sit = at('watercolor', .38); B.tear0 = at('watercolor', .48); B.tearFall = at('watercolor', .62); B.bonk8 = bonk('watercolor');
  // 9 glass: rage, back up (8 f anticipation into a deep wind-up), charge, BIG BONK, crack
  B.rage = at('glass', .12); B.back = at('glass', .4); B.charge = B.back + 8; B.bonk9 = bonk('glass');
  // 10 teardown: explode, labels read one by one, eyes widen + slow turn to camera, facepalm, PULL, swing, light
  B.explode0 = at('teardown', .08); B.explode1 = at('teardown', .16); B.lab1 = at('teardown', .2); B.lab2 = at('teardown', .28); B.lab3 = at('teardown', .33);
  B.palm = at('teardown', .4375); B.rebuild0 = at('teardown', .5); B.rebuild1 = at('teardown', .575); B.grip = at('teardown', .6); B.pull = at('teardown', .625);
  B.swing = at('teardown', .72); B.light0 = at('teardown', .8125); B.light1 = S.teardown.end;
  // 11 sheet: cursor glides, APPROVE click, zoom into panel 1 (lands on frame 0)
  B.cursor0 = at('sheet', .1); B.click = at('sheet', .4167); B.zoom0 = at('sheet', .5); B.zoom1 = S.sheet.end;
  B.bonks = [B.bonk1, B.bonk2, B.bonk3, B.bonk4, B.bonk5, B.bonk6, B.bonk7, B.bonk8, B.bonk9];
  B.hits = B.bonks;                                               // generic name pose.js uses for hit-stops (3 f) and exact impact frames
  return B;
}


// ---------------------------------------------------------------- acting (the story's choreography; pose.js bakes it generically)
// acting(B, S) -> {body, face, props, scarfFlat}
//   body : [frame, POSES name | pose object, {x, y?, g:'ground'|'free', turn, scale, flat, floor, touch:['front'|'toe'|'L'|'R', x]}, ease]
//   face : [frame, EX name, look [x,y]]   (eyes lead 3 f, brows/lids 2 f, mouth 1 f: pose.js applies the leads)
//   props: [frame, near-hand prop, far-hand prop] (stepped)
//   scarfFlat(n) -> 0..1: tail A lies flat along the floor (flat world: only the scarf gets through)
export function acting(B, S) {
  return { body: body(B, S), face: face(B, S), props: props(B), scarfFlat: n => (n >= B.stuck - 2 && n < B.pop) ? clamp((n - (B.stuck - 2)) / 8) : 0 };
}
// rules: every move eases (no key closer than its distance needs: turns >= 10 f, big moves >= 6 f); every try has an anticipation
// crouch; every door bonk = 17% squash on the door, 3 f hit-stop (pose.js), bounce off, overshoot back, wobble, settle.
function body(B, S) {
  const st = id => S[id].start, X = HOME, DX = DOOR.x0 - 136;    // DX = pelvis x when his face touches the door (3/4 right)
  const T0 = { touch: ['front', DOOR.x0] }, TL = { touch: ['L', DOOR.x0 - 88] }, TH = { touch: ['R', DOOR.handle.x0 + 24] };
  const g = (x, o = {}) => ({ x, g: 'ground', turn: 1, ...o }), fr = (x, y, o = {}) => ({ x, y, g: 'free', turn: 1, ...o });
  const doorBonk = (t, y, end = 'DAZED') => [                     // squash on the door, hit-stop, bounce, overshoot back, wobble, settle
    [t, 'SPLAT', fr(DX, y, T0), 'lin'], [t + 3, 'SPLAT', fr(DX, y + 4, T0)], [t + 7, 'RECOIL', fr(DX - 55, y - 40), 'o3'],
    [t + 12, 'STAGGER', g(DX - 118), 'o'], [t + 17, 'WOBBLE', g(DX - 96), 'io'], [t + 22, end, g(DX - 104), 'io']];
  const TOP = FLOOR - 3 * CUBE;
  return [
    // 1 pixel: determined stare (camera on his face), huff, deep wind-up, sprint, jump ARC, BONK
    [-1e3, 'STARE', g(X)], [B.windup - 6, 'STARE', g(X + 4)], [B.windup - 2, 'HUFF', g(X), 'io'], [B.windup + 4, 'WIND', g(X - 30), 'io'],
    [B.run, 'RUN1', g(X + 10), 'o'], [B.run + 3, 'RUN2', g(X + 60)], [B.jump, 'LEAP', g(X + 100), 'io'], [B.jump + 4, 'APEX', fr(X + 128, 1040), 'o'],
    ...doorBonk(B.bonk1, 1130).map((k, i) => i ? k : [k[0], k[1], k[2], 'i']),
    // 2 blueprint: dazed, looks at his line-work hands, turns (10 f), pencils a door, ta-da, smug dip, walks INTO it, bonk, plops down
    [B.hands - 2, 'DAZED', g(DX - 104), 'io'], [B.hands + 4, 'HANDS', g(DX - 104), 'io'], [B.draw0 - 8, 'HANDS', g(DX - 102)],
    [B.draw0 + 2, 'DRAW_HI', g(800, { turn: -1 }), 'io'], [B.draw0 + 6, 'DRAW_LO', g(796, { turn: -1 }), 'io'], [B.draw0 + 9, 'DRAW_MID', g(792, { turn: -1 }), 'io'], [B.draw1, 'DRAW_HI', g(790, { turn: -1 }), 'io'],
    [B.smug + 2, 'TADA', g(792, { turn: -.45 }), 'o'], [B.walk2 - 6, 'SMUG', g(792, { turn: -.4 }), 'io'], [B.walk2 - 2, 'SMUG_DIP', g(792, { turn: -.75 }), 'io'],
    [B.walk2 + 1, 'WALK1', g(765, { turn: -1 }), 'o'], [B.bonk2 - 1, 'WALKIN', g(735, { turn: -1, scale: .97 }), 'io'],
    [B.bonk2, 'WSPLAT', g(730, { turn: -1, scale: .95, touch: ['front', 600] }), 'lin'], [B.bonk2 + 3, 'WSPLAT', g(730, { turn: -1, scale: .95, touch: ['front', 600] })],
    [B.bonk2 + 8, 'RECOIL', fr(770, 1110, { turn: -1 }), 'o3'], [B.bonk2 + 13, 'SITBUMP', g(805, { turn: -1 }), 'i'], [B.bonk2 + 17, 'DAZE', g(805, { turn: -1 }), 'io'],
    // 3 voxel: up and turning (10 f), three cubes, crouch, climb, proud on top, wobble (panic), topple, cube BONKs his head
    [st('voxel') + 8, 'DAZED', g(830, { turn: .1 }), 'io'], [B.cube1, 'PLACE', g(868), 'o'], [B.cube2 - 2, 'PICK', g(864), 'io'], [B.cube2, 'PLACE', g(868), 'o'],
    [B.cube3 - 3, 'PICK', g(864), 'io'], [B.cube3, 'PLACE_HI', g(870), 'o'], [B.climb + 1, 'CROUCH', g(868), 'io'], [B.climb + 4, 'CLIMB', fr(898, 1130), 'o'],
    [B.climb + 7, 'CLIMB', fr(940, 1040), 'io'], [B.top, 'TOP', g(988, { floor: TOP }), 'io'], [B.wobble + 2, 'WOB_A', g(986, { floor: TOP }), 'io'], [B.wobble + 4, 'WOB_B', g(994, { floor: TOP }), 'io'],
    [B.collapse, 'WOB_A', g(984, { floor: TOP }), 'io'], [B.collapse + 4, 'TOPPLE', fr(955, 1050), 'i'], [B.bonk3 - 2, 'TOPPLE', fr(940, 1190), 'i'], [B.bonk3, 'BONKED', g(930), 'lin'],
    [B.bonk3 + 3, 'BONKED', g(930)], [B.bonk3 + 9, 'DAZE', g(926), 'o'],
    // 4 ascii: up, leans in to read "> open door", "no." -> offended take, fists, lean back (anticipation), HEADBUTT
    [st('ascii') + 8, 'DAZE', g(924)], [B.type0 + 10, 'STAND', g(860), 'io'], [B.type1, 'READ', g(850), 'io'], [B.reply, 'READ', g(848)],
    [B.offend - 2, 'OFF_ANTIC', g(846), 'io'], [B.offend + 1, 'OFFENDED', g(836), 'o3'], [B.offend + 9, 'OFFENDED', g(834)], [B.butt - 3, 'FISTS', g(850), 'io'], [B.butt + 1, 'BUTT_BACK', g(858), 'io'],
    [B.bonk4 - 2, 'HEADBUTT', g(DX - 18), 'i'], [B.bonk4, 'HSPLAT', g(DX, T0), 'lin'], [B.bonk4 + 3, 'HSPLAT', g(DX, T0)], [B.bonk4 + 8, 'RECOIL', fr(DX - 55, 1120), 'o3'],
    [B.bonk4 + 13, 'STAGGER', g(DX - 118), 'o'], [B.bonk4 + 18, 'WOBBLE', g(DX - 100), 'io'], [B.bonk4 + 23, 'DAZED', g(DX - 110), 'io'],
    // 5 flat: deep crouch, dives flat, his HEAD goes under the door gap (flat .85), stuck kicking, only the scarf gets through, pops back, BONK
    [B.crouch, 'CROUCH_LO', g(785), 'io'], [B.dive, 'DIVE', fr(700, 1215), 'o'],
    [B.stuck, 'STUCK_A', fr(760, 1222, { flat: .85, touch: ['front', 1160] }), 'o'], [B.stuck + 4, 'STUCK_B', fr(760, 1222, { flat: .86, touch: ['front', 1166] })],
    [B.stuck + 8, 'STUCK_A', fr(760, 1222, { flat: .86, touch: ['front', 1170] })], [B.stuck + 12, 'STUCK_B', fr(760, 1222, { flat: .87, touch: ['front', 1172] })],
    [B.pop - 4, 'STUCK_A', fr(760, 1224, { flat: .9, touch: ['front', 1176] })], [B.pop + 3, 'POP', fr(DX - 40, 1110), 'o3'], [B.bonk5 - 2, 'POP', fr(DX - 12, 1092), 'o'],
    ...doorBonk(B.bonk5, 1100).map((k, i) => i ? k : [k[0], k[1], k[2], 'i']),
    // 6 woodcut: tools out, chisel to the door, three strikes (raise behind the head, swing over the top), snap, stinging hands, rebound BONK
    [B.tools, 'TOOLS', g(830), 'io'], [B.strike1 - 4, 'CHISEL', g(0, TL), 'io'], [B.strike1, 'STRIKE', g(0, TL), 'o3'], [B.strike2 - 3, 'CHISEL', g(0, TL), 'io'], [B.strike2, 'STRIKE', g(0, TL), 'o3'],
    [B.strike3 - 3, 'CHISEL', g(0, TL), 'io'], [B.strike3, 'STRIKE', g(0, TL), 'o3'], [B.snap - 3, 'RAISE_BIG', g(0, TL), 'io'], [B.snap, 'STRIKE', g(0, TL), 'o3'],
    [B.snap + 5, 'SHAKE_HANDS', g(828), 'o'], [B.bonk6 - 5, 'REBOUND', g(822), 'io'], [B.bonk6, 'BONK_SELF', g(820), 'lin'], [B.bonk6 + 3, 'BONK_SELF', g(820)],
    [B.bonk6 + 9, 'WOBBLE', g(810), 'o'], [B.bonk6 + 15, 'DAZED', g(804), 'io'],
    // 7 lidar: uneasy creeping, turns AWAY (10 f) while the PULL plate glows, turns back, steps, stubs his toe, hops
    [st('lidar') + 6, 'UNEASY', g(806), 'io'], [B.scan0 + 4, 'GROPE_A', g(816), 'io'], [B.plate - 12, 'UNEASY', g(826), 'io'], [B.plate - 2, 'UNEASY', g(828, { turn: -.75 }), 'io'],
    [B.plate + 5, 'UNEASY', g(830, { turn: -.75 })], [B.step - 1, 'GROPE_B', g(850), 'io'], [B.bonk7 - 1, 'STEP_TOE', g(0, { touch: ['toe', DOOR.x0 - 4] }), 'io'],
    [B.bonk7, 'STUB', g(0, { touch: ['toe', DOOR.x0] }), 'lin'], [B.bonk7 + 3, 'STUB', g(0, { touch: ['toe', DOOR.x0] })],
    [B.bonk7 + 7, 'HOP_A', fr(DX - 40, 1160), 'o'], [B.bonk7 + 11, 'HOP_B', g(DX - 52), 'i'], [B.bonk7 + 15, 'HOP_A', fr(DX - 62, 1166), 'o'], [B.bonk7 + 19, 'HOP_B', g(DX - 70), 'i'],
    // 8 watercolor: deflated, turns and leans his back on the door (10 f), slides down, hugs his knees, one tear, sobs
    [B.slump - 8, 'SAD', g(870, { turn: .6 }), 'io'], [B.slump + 2, 'SLUMP', g(975, { turn: -.45 }), 'io'], [B.sit, 'SIT_SAD', g(970, { turn: -.4 }), 'io'], [B.tearFall, 'SIT_SAD', g(970, { turn: -.4 })],
    [B.tearFall + 3, 'SOB', g(970, { turn: -.4 }), 'io'], [B.tearFall + 6, 'SIT_SAD', g(970, { turn: -.4 }), 'io'], [B.bonk8, 'SOB', g(970, { turn: -.4 }), 'io'], [B.bonk8 + 4, 'SIT_SAD', g(970, { turn: -.4 }), 'io'],
    // 9 glass: rises turning (11 f), rage trembles, backs up into the DEEPEST wind-up (8 f), charges, BIG BONK, flung back, lands on his back
    [st('glass') - 4, 'SIT_SAD', g(970, { turn: -.4 })], [B.rage, 'FISTS', g(925), 'io'], [B.rage + 6, 'RAGE', g(920), 'io'], [B.back, 'RAGE', g(918)],
    [B.back + 4, 'BACK_A', g(830), 'o'], [B.charge, 'WINDUP_DEEP', g(730), 'o'], [B.charge + 4, 'CHARGE_A', g(770), 'i'], [B.charge + 8, 'CHARGE_B', g(840)], [B.bonk9 - 2, 'CHARGE_A', g(885)],
    [B.bonk9, 'BIG_SPLAT', fr(DX, 1165, T0), 'lin'], [B.bonk9 + 3, 'BIG_SPLAT', fr(DX, 1170, T0)], [B.bonk9 + 8, 'BIG_RECOIL', fr(DX - 120, 1050), 'o3'],
    [B.bonk9 + 13, 'BIG_RECOIL', fr(DX - 210, 1150), 'i'], [B.bonk9 + 18, 'LIE', fr(DX - 250, FLOOR - 52), 'i'],
    // 10 teardown: lying, sits up flinching at the explosion (10 f), stands, reads each label, eyes widen + slow turn to camera, FACEPALM,
    //    sheepish, walks to the door, grips (crouch), PULLS, stumbles back as it swings, joy, sheepish triumph to camera
    [st('teardown') + 6, 'LIE', fr(DX - 250, FLOOR - 52)], [B.explode0 + 3, 'FLINCH', g(DX - 236), 'io'], [B.explode1, 'FLINCH', g(DX - 234)], [B.lab1 + 4, 'STAND', g(DX - 200), 'io'],
    [B.lab2, 'READ_S', g(DX - 196), 'io'], [B.lab3 + 4, 'READ_S', g(DX - 192)], [B.palm - 5, 'REALIZE', g(DX - 192, { turn: .25 }), 'io'], [B.palm - 2, 'FACEPALM', g(DX - 190, { turn: .25 }), 'o3'],   // arms lag 2 f: the mitten lands on f600
    [B.palm + 8, 'FACEPALM', g(DX - 190, { turn: .25 })], [B.palm + 14, 'SHEEPISH', g(DX - 186, { turn: .3 }), 'io'], [B.grip - 8, 'WALK1', g(DX - 140), 'io'], [B.grip - 4, 'WALK2', g(DX - 92)],
    [B.grip, 'GRIP', g(0, TH), 'io'], [B.pull + 3, 'PULL', g(0, TH), 'o3'], [B.swing - 6, 'PULL', g(0, TH)], [B.swing, 'PULL2', g(DX - 110), 'o'], [B.swing + 7, 'OPEN_JOY', g(DX - 150), 'io'],
    [B.light0 - 1, 'TRIUMPH', g(DX - 160, { turn: .35 }), 'io'], [B.light1, 'TRIUMPH', g(DX - 162, { turn: .35 })],
    // 11 sheet: the hero is the frame-0 pose again (panel 1 = frame 0)
    [B.light1 + 1, 'STARE', g(X)], [B.N + 1e3, 'STARE', g(X)],
  ];
}

function face(B, S) {
  const st = id => S[id].start, CAM = [-.5, 0];
  return [
    [-1e3, 'det', [1, .05]], [B.windup - 2, 'det', [1, 0]], [B.windup + 2, 'effort', [1, .1]], [B.jump, 'effort', [1, -.1]], [B.bonk1, 'ouch', [0, 0]], [B.bonk1 + 7, 'stun', [-.2, .2]], [B.bonk1 + 16, 'daze', [-.3, .3]],
    [B.hands, 'curious', [.7, .55]], [B.draw0 - 4, 'idea', [.9, -.3]], [B.draw0 + 4, 'focus', [.9, -.6]], [B.draw0 + 9, 'focus', [.9, .4]],
    [B.smug, 'proud', CAM], [B.smug + 6, 'smug', CAM], [B.walk2, 'smugShut', [0, 0]], [B.bonk2, 'ouch', [0, 0]], [B.bonk2 + 7, 'stun', [.2, .2]],
    [st('voxel') + 4, 'daze', [.3, .3]], [B.cube1 - 4, 'det', [.8, .5]], [B.cube3, 'proud', [.7, -.4]], [B.top, 'hope', [.6, -.9]], [B.wobble + 1, 'uhoh', [.2, .8]], [B.wobble + 4, 'panic', [-.4, .6]],
    [B.collapse, 'panic', [0, -.6]], [B.bonk3, 'ouch', [0, 0]], [B.bonk3 + 7, 'daze', [-.2, -.5]],
    [st('ascii') + 6, 'read', [-.3, -.7]], [B.type0 + 4, 'read', [-.6, -.8]], [B.reply, 'offAntic', [-.6, -.8]], [B.offend, 'offended', CAM], [B.butt - 4, 'angry', [1, 0]],
    [B.butt + 1, 'rage', [1, -.1]], [B.bonk4, 'ouch', [0, 0]], [B.bonk4 + 7, 'daze', [-.3, .2]],
    [st('flat') + 6, 'det', [1, .9]], [B.dive, 'effort', [1, .3]], [B.stuck, 'squashed', [.6, 0]], [B.scarfThru, 'strain', [.9, 0]], [B.pop, 'surprise', [0, -.4]], [B.bonk5, 'ouch', [0, 0]], [B.bonk5 + 7, 'daze', [.2, .3]],
    [B.tools - 2, 'frustr', [1, .1]], [B.strike1, 'effort', [1, .2]], [B.strike3, 'frustr', [1, .2]], [B.snap - 3, 'rage', [1, 0]], [B.snap + 1, 'shock', [.8, .3]], [B.snap + 5, 'pain', [.2, .6]],
    [B.bonk6 - 5, 'uhoh', [.1, -.9]], [B.bonk6, 'ouch', [0, 0]], [B.bonk6 + 7, 'daze', [-.2, .2]],
    [st('lidar') + 4, 'uneasy', [-.8, 0]], [B.scan0 + 4, 'uneasy', [-1, -.2]], [B.plate - 12, 'uneasy', [-1, .1]], [B.plate + 8, 'uneasy', [.4, .1]], [B.bonk7, 'pain', [0, 0]], [B.bonk7 + 6, 'pain', [.3, .8]],
    [st('watercolor') + 6, 'sad', [.2, .7]], [B.slump, 'sad', [-.2, .8]], [B.sit, 'cry', [0, .9]], [B.tear0, 'cry', [-.2, .7]], [B.bonk8, 'cry', [.1, 1]],
    [st('glass') + 2, 'angry', [.8, .1]], [B.rage, 'rage', [1, 0]], [B.back, 'rage', [1, .05]], [B.charge, 'yell', [1, 0]], [B.bonk9, 'ouch', [0, 0]], [B.bonk9 + 7, 'stun', [.2, -.2]],
    [st('teardown') + 10, 'daze', [0, -.2]], [B.explode0, 'ouch', [0, 0]], [B.explode1, 'wonder', [.8, -.5]], [B.lab1, 'read', [1, -.9]], [B.lab2, 'read', [.9, .6]], [B.lab3, 'read', [.6, -.3]],
    [B.palm - 10, 'realize', [.6, -.3]], [B.palm - 6, 'realize', CAM], [B.palm, 'palm', [0, 0]], [B.palm + 13, 'sheepish', CAM], [B.grip - 8, 'det', [1, .3]], [B.pull, 'effort', [1, .2]], [B.swing, 'joy', [1, -.1]],
    [B.light0 - 4, 'triumph', CAM], [B.light1 + 1, 'det', [1, .05]],
  ];
}
// what he holds (stepped): [frame, near hand, far hand]
const props = B => [[-1e3, '', ''], [B.draw0 - 2, 'pencil', ''], [B.smug, '', ''], [B.cube1 - 6, 'cube', ''], [B.cube1, '', ''], [B.cube2 - 3, 'cube', ''], [B.cube2, '', ''], [B.cube3 - 3, 'cube', ''], [B.cube3, '', ''],
  [B.tools - 2, 'mallet', 'chisel'], [B.snap, 'mallet', 'chisel-snapped'], [B.bonk6 + 6, '', ''], [B.N + 1e3, '', '']];


const CACHE = new Map();
const beatsOf = tl => { const k = tl.frames + '|' + tl.styles.map(s => s.start + ':' + s.end).join(','); let b = CACHE.get(k); if (!b) CACHE.set(k, b = beats(tl)); return b; };

// bonk camera punch (ones): +4% zoom, 6 f decay; +8% on the glass bonk; small kick toward the impact
export function punch(f, tl) {
  const B = beatsOf(tl); let z = 1, dx = 0, dy = 0;
  B.bonks.forEach((b, i) => { const k = f - b; if (k < 0 || k > 6) return; const a = i === 8 ? .08 : i === 6 || i === 7 ? .02 : .04, d = Math.pow(1 - k / 7, 2); z += a * d; dy += 10 * a / .04 * d * Math.cos(k * 2.2); dx += 6 * a / .04 * d * Math.sin(k * 2.9); });
  return { zoom: z, dx, dy };
}

export function scene(f, tl) {
  const B = beatsOf(tl), p = pose(f, tl), lost = B.bonks.filter(b => f >= b).length, last = B.bonks[lost - 1];
  const bi = Math.max(0, lost - 1), imp = impactOf(bi, B, tl);
  // cubes: carried (in his hands), stacked (+ wobble), falling (cube 3 lands on his head at bonk3)
  const wob = f < B.wobble ? 0 : f < B.collapse ? .07 * Math.sin((f - B.wobble) * .9) * prog(f, B.wobble, B.wobble + 4) : 0;
  const cubes = [0, 1, 2].map(i => {
    const t0 = [B.cube1, B.cube2, B.cube3][i], sx = 990, sy = FLOOR - CUBE / 2 - i * CUBE, a = clamp((f - Math.max(t0 - 6, i ? [B.cube1, B.cube2][i - 1] : -1e3)) / 2);
    const hand = heroPoints(p).hand.R;
    if (f < t0) return { x: hand[0] + 10, y: hand[1] - 30, rot: 0, s: CUBE, a };
    if (f < B.collapse) return { x: sx + Math.sin(wob) * (sy - FLOOR) * -1 * (i ? 1 : 0), y: sy, rot: wob * (i ? 1 : .3), s: CUBE, a: 1 };
    const t = (f - B.collapse) / Math.max(1, B.bonk3 - B.collapse), fall = K([[0, 0], [1, 1, 'i']])(clamp(t));
    if (i === 2) { const tx = heroPoints(pose(B.bonk3, tl)).top; const bounce = f > B.bonk3 ? K([[0, 0], [6, -60, 'o'], [14, 0, 'i'], [18, -14, 'o'], [22, 0, 'i']])(f - B.bonk3) : 0;
      return { x: lerp(sx, tx[0], fall) + (f > B.bonk3 ? (f - B.bonk3) * 7 : 0), y: f <= B.bonk3 ? lerp(sy, tx[1] - CUBE / 2, fall) : Math.min(FLOOR - CUBE / 2, tx[1] - CUBE / 2 + bounce + (f - B.bonk3) * 9), rot: fall * .9 + (f > B.bonk3 ? (f - B.bonk3) * .08 : 0), s: CUBE, a: 1 }; }
    const dir = i ? 1 : -1, tt = clamp(t * .9);
    return { x: sx + dir * 140 * tt, y: Math.min(FLOOR - CUBE / 2, sy + 260 * tt * tt), rot: dir * 1.4 * tt, s: CUBE, a: 1 };
  });
  const live = id => { const s = tl.styles.find(q => q.id === id); return f >= s.start - 8 && f < s.end + 8; };
  const typedN = Math.floor(clamp((f - B.type0) / (B.type1 - B.type0)) * TERM.cmd.length), replyN = Math.floor(clamp((f - B.reply) / 4) * TERM.reply.length);
  const tear = f < B.tear0 ? 0 : clamp((f - B.tear0) / (B.bonk8 - B.tear0)), eye = heroPoints(p).eyes[1];
  const tY = tear < .55 ? eye[1] + 10 + 60 * (tear / .55) : lerp(eye[1] + 70, FLOOR - 4, ease.i((tear - .55) / .45));
  const L = [ { id: 'hinges', text: 'HINGES', sub: 'HINGES ON YOUR SIDE = PULL', x: 1250, y: 610, ax: 1470, ay: 760, t: B.lab1, glow: true },
    { id: 'handle', text: 'HANDLE', x: 1240, y: 1170, ax: 1150, ay: 1080, t: B.lab2, glow: false },
    { id: 'plate', text: 'PULL', x: 1080, y: 820, ax: 1125, ay: 900, t: B.lab3, glow: true } ];
  const labOn = t => f < B.rebuild0 ? clamp((f - t) / 6) : clamp(1 - (f - B.rebuild0) / 8);
  const open = K([[B.pull, 0], [B.swing, .8, 'o'], [B.swing + 6, 1.04, 'o'], [B.swing + 14, 1, 'io']]);
  return {
    hearts: 10 - lost, heartFx: lost ? clamp((f - last) / 20) : 1, title: 1 - prog(f, B.titleOff - 8, B.titleOff),
    door: { open: open(f), explode: K([[B.explode0, 0], [B.explode1, 1, 'o3'], [B.rebuild0, 1], [B.rebuild1, 0, 'io']])(f),
      glowHinge: K([[B.lab1 - 2, 0], [B.lab1 + 4, 1, 'o'], [B.rebuild0, .8], [B.rebuild1, 0]])(f),
      glowPlate: Math.max(K([[B.plate - 10, 0], [B.plate, 1, 'o'], [B.plate + 18, 0, 'io']])(f) * (f < B.bonk7 + 10 ? 1 : 0), K([[B.lab3 - 2, 0], [B.lab3 + 4, 1, 'o'], [B.pull, 1], [B.pull + 10, 0]])(f)) },
    impact: { x: imp[0], y: imp[1], f: lost ? last : -1, big: bi === 8 ? 1 : 0 },
    cam: { x: lerp(810, 960, ease.io(prog(f, 0, 14))), y: lerp(905, 960, ease.io(prog(f, 0, 14))), zoom: f < 14 ? lerp(1.35, 1, ease.io(f / 14)) : f >= B.light1 ? 1 : 1 + .06 * ease.io(prog(f, tl.styles.find(s => s.id === 'teardown').start, B.light1)) },
    pencil: live('blueprint') ? ease.io(prog(f, B.draw0, B.draw1)) : 0, cubes: live('voxel') ? cubes : cubes.map(q => ({ ...q, a: 0 })),
    term: live('ascii') ? { typed: TERM.cmd.slice(0, typedN), reply: TERM.reply.slice(0, replyN) } : { typed: '', reply: '' },
    slide: K([[B.dive, 0], [B.stuck, 1, 'o'], [B.pop, 1], [B.pop + 2, 0, 'o3']])(f),
    chisel: f < B.tools ? 0 : clamp((f - B.tools) / (B.snap - B.tools)), thunk: live('woodcut') ? clamp((f - B.snap) / 4) : 0,
    scan: prog(f, B.scan0, B.scan1), tear, tearX: eye[0] + 6, tearY: tY, crack: K([[B.bonk9, 0], [B.bonk9 + 1, .55, 'o'], [B.bonk9 + 10, 1, 'o']])(f),
    labels: L.map(l => ({ id: l.id, text: l.text, sub: l.sub || '', x: l.x, y: l.y, ax: l.ax, ay: l.ay, a: labOn(l.t), glow: l.glow ? 1 : 0 })),
    light: ease.i(prog(f, B.light0, B.light1)),
    sheet: { cursor: ease.io(prog(f, B.cursor0, B.click)), click: f < B.click ? 0 : clamp(1 - (f - B.click) / 6), zoom: ease.io(prog(f, B.zoom0, B.zoom1)) },
    beat: p.act, world: p.seg,
  };
}

// impact points (ring centres), one per bonk, taken from the pose at the bonk frame: face front, head top (cube, mallet),
// the stubbed toe, and where the tear lands
const IMP = new Map();
function impactOf(i, B, tl) {
  const key = i + '|' + B.bonks.join(','); if (IMP.has(key)) return IMP.get(key);
  const b = B.bonks[i], q = heroPoints(pose(b, tl));
  const v = i === 2 || i === 5 ? q.top : i === 6 ? [q.feet[1][0] + 30, q.feet[1][1] - 10] : i === 7 ? [q.eyes[1][0] + 6, FLOOR] : q.front;
  const r = [Math.round(v[0]), Math.round(v[1])]; IMP.set(key, r); return r;
}
