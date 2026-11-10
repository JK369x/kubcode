// scenes/door/b4-standin.js (B4): the glue between core/scene.js + core/pose.js (the animator's timing, real) and my two styles' hero art.
// Until core/hero2d.js / hero3d.js land ("DROP 1"), the hero is drawn with the SOLDIER art (soldier2d ops, b4-rig3d) driven by an adapter that maps
// the hero pose to soldier fields (same limb conventions, 554 px tall, feet on the floor line). Swap point: adaptHero() and the kits' hero().
import { scene, DOOR, FLOOR, HOME } from '../../core/scene.js';
import { pose } from '../../core/pose.js';

export { DOOR, FLOOR, HOME };
const K = 554 / 380;                                            // soldier art scaled to the hero's height at scale 1
const MOUTH = { o: 'o', scream: 'o', wobble: 'o', smirk: 'smirk', grin: 'smirk', smile: 'smirk' };
export function adaptHero(p) {
  const k = K * (p.scale || 1), sole = p.y + 158 * (p.scale || 1);
  return {
    x: p.x, y: sole - 190 * k, scale: k, rot: (p.rot || 0) * .9, squash: p.squash || 1,
    armL: p.armL, armR: p.armR, elbowL: p.elbowL, elbowR: p.elbowR, legL: p.legL, legR: p.legR, kneeL: p.kneeL, kneeR: p.kneeR,
    cap: { dx: 0, dy: 0, rot: 0 }, eyes: p.eyes, lid: p.lid || 0, look: p.look || [0, 0], brows: p.brows ?? .5, mouth: MOUTH[p.mouth] || 'flat', bang: false,
    plank: { x: -999, y: -999, rot: 0, len: 0, carried: false }, st: p.st, f: p.f, hit: p.hit, grounded: p.grounded,
  };
}
const STATE = {
  real: true,
  sceneAt: (f, tl) => scene(f, tl),
  poseAt: (f, tl) => pose(f, tl),
  heroAt: (f, s) => pose(f, s.tl),
};
export async function loadState() { return STATE; }
// the lost heart for the kits: scene.hearts = hearts left, heartFx 0..1 = progress of the loss animation of heart index `hearts`
export const lostHeart = sc => (sc.heartFx < 1 ? { i: sc.hearts, t: sc.heartFx } : null);
