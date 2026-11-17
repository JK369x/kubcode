// "เงินเดือนหายไปไหน" — 16 s example for Stickman Canvas v2 (kubcode.dev, MIT).
// Cast (ours): NOK = yellow cap + orange hoodie; PIM = teal headband + blue tee.
import * as C from "../engine/core.js";
import { drawFigure, bigFace, posesAt, breathe, talkAmount, POSES } from "../engine/rig.js";
import * as FX from "../engine/fx.js";
import * as UI from "../engine/ui.js";
const { W, H, GY, CX, ease, prog, clamp, keys } = C;
export const DURATION = 16, FPS = 30;
const NOK = { top: "hoodie", color: "#ff7a2f", head: "cap", headColor: "#f2c21a" };
const PIM = { top: "tshirt", color: "#2f8cff", head: "headband", headColor: "#3fe0c5" };
const M = C.MOODS.stage;

function stage(g, t, cam, { beamA = 1 } = {}) {
  FX.backdrop(g, M);
  C.layer(g, cam, 0.5, (g) => { FX.stageWall(g, M, t); });
  C.layer(g, cam, 0.85, (g) => { FX.stageFloor(g, M); FX.beam(g, CX, M, t, 95, beamA); FX.fog(g, M); });
}
const shots = [
  // 1 establishing: wide, two figures, "VS" title, slow push
  { d: 2.2, bars: 0, draw(g, t, k) {
      const cam = { z: keys(k, [[0, 1], [1, 1.06]]), x: 0 };
      stage(g, t, cam);
      C.layer(g, cam, 1, (g) => {
        drawFigure(g, { x: CX - 250, y: GY, s: 1.7, pose: breathe(POSES.ready, t, 1, 1), outfit: NOK, expr: "determined", rim: { color: M.rim, dir: [1, -0.4] }, label: "นก", blink: t % 3.1 > 3.0 });
        drawFigure(g, { x: CX + 250, y: GY, s: 1.7, facing: -1, pose: breathe(POSES.crossArms, t, 1, 2), outfit: PIM, expr: "smirk", rim: { color: M.rim, dir: [-1, -0.4] }, label: "พิม", blink: t % 2.7 > 2.6 });
      });
      FX.dust(g, t, M);
      UI.title(g, "เงินเดือน", prog(t, 0.2, 0.7), { y: 560, size: 150 });
      UI.chapter(g, "EPISODE · เงินหายไปไหน");
  } },
  // 2 medium two-shot: Nok talks, bubble with payday
  { d: 1.8, draw(g, t, k) {
      const cam = { z: keys(k, [[0, 1.18], [1, 1.24]]), x: keys(k, [[0, 40], [1, 10]]) };
      stage(g, t, cam);
      C.layer(g, cam, 1, (g) => {
        drawFigure(g, { x: CX - 210, y: GY, s: 1.7, pose: breathe(posesAt(t, [[0, "talk"], [0.8, "cheer"]]), t), outfit: NOK, expr: t < 0.8 ? "happy" : "happy", talk: talkAmount(t, 0.1, 0.8), rim: { color: M.rim, dir: [1, -0.4] } });
        drawFigure(g, { x: CX + 230, y: GY, s: 1.7, facing: -1, pose: breathe(POSES.stand, t, 1, 3), outfit: PIM, expr: "smile", rim: { color: M.rim, dir: [-1, -0.4] } });
      });
      FX.sparkles(g, CX - 170, GY - 440, t, "#ffd166", 10, 160);
      UI.bubble(g, CX - 80, GY - 720, "เงินเดือนออกแล้ว!", prog(t, 0.05, 0.35));
      UI.caption(g, "วันแรก รู้สึกรวยมาก", "รวย", "Day one feels rich", prog(t, 0.1, 0.5));
  } },
  // 3 insert: phone screen with spends being typed
  { d: 2.0, draw(g, t, k) {
      const cam = { z: keys(k, [[0, 1], [1, 1.07]]), x: -10 };
      stage(g, t, cam, { beamA: 0.5 });
      C.blurLayer(g, cam, 1.6, 12, (g) => FX.fgHead(g, W - 120, H * 0.86, 150, "#ff7a2f"));
      C.layer(g, cam, 1, (g) => FX.screen(g, 170, 560, 740, 470, M, t, ["ชานมไข่มุก  ฿65", "ค่าส่ง 0฿ (+ขั้นต่ำ ฿39)", "ผ่อน 0% x10  ฿990", "สติกเกอร์ LINE  ฿59", "กาแฟ  ฿75"], prog(t, 0.1, 1.6)));
      UI.caption(g, "จ่ายทีละนิด ไม่รู้ตัว", "ไม่รู้ตัว", "Small spends add up", prog(t, 0.2, 0.6));
  } },
  // 4 data card: counter ticks to the total
  { d: 1.8, draw(g, t, k) {
      const cam = { z: keys(k, [[0, 1.02], [1, 1.08]]), x: 0 };
      stage(g, t, cam, { beamA: 0.7 });
      C.layer(g, cam, 1, (g) => drawFigure(g, { x: CX, y: GY + 60, s: 1.6, pose: breathe(POSES.handsOnHead, t), outfit: NOK, expr: "shocked", rim: { color: M.rim, dir: [0, -1] } }));
      UI.bigLine(g, "5 วันใช้ไปแล้ว", prog(t, 0, 0.3), { y: 420 });
      UI.counter(g, CX, 620, 14830, prog(t, 0.15, 1.2), { prefix: "฿", size: 150 });
      UI.caption(g, "ห้าวัน หมดไปเกือบครึ่ง", "เกือบครึ่ง", "Half gone in five days", prog(t, 0.2, 0.6));
  } },
  // 5 giant face close-up: realisation
  { d: 1.6, draw(g, t, k) {
      const cam = { z: keys(k, [[0, 1.0], [1, 1.05]]), x: 0 };
      C.blurLayer(g, cam, 0.6, 14, (g) => stage(g, t, cam));
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, 0, W, H);
      const [sx, sy] = C.shake(t, k < 0.15 ? 10 : 0);
      bigFace(g, CX + 30 + sx, H * 0.52 + sy, 300, { outfit: NOK, expr: t < 0.5 ? "surprised" : "worried", look: [0.4, -0.2], rimColor: M.rim, rimSide: 1, blink: false });
      UI.caption(g, "เงินหายไปไหนหมด", "หายไปไหน", "Where did it go?", prog(t, 0.1, 0.5));
  } },
  // 6 freeze frame: time stops, Pim steps in (signature moment)
  { d: 2.2, draw(g, t, k) {
      const cam = { z: 1.12 + 0.03 * k, x: 0, r: 0.01 * Math.sin(t) };
      stage(g, t * 0.05, cam);
      C.layer(g, cam, 1, (g) => {
        drawFigure(g, { x: CX - 210, y: GY, s: 1.7, pose: POSES.handsOnHead, outfit: NOK, expr: "shocked", rim: { color: "#9fe8ff", dir: [1, -0.4] }, alpha: 0.85 });
        drawFigure(g, { x: CX + keys(k, [[0, 330], [0.5, 200]]), y: GY, s: 1.7, facing: -1, pose: breathe(posesAt(t, [[0, "stand"], [0.6, "pointUp"]]), t), outfit: PIM, expr: "smirk", talk: talkAmount(t, 0.7, 1.9), rim: { color: M.rim, dir: [-1, -0.4] } });
      });
      g.save(); g.globalAlpha = 0.18; g.fillStyle = "#7ad7ff"; g.fillRect(0, 0, W, H); g.restore();
      FX.sparkles(g, CX, GY - 300, 0.5, "#bff3ff", 24, 420);
      FX.rings(g, CX + 230, GY - 430, t, "#7dffb0");
      UI.bigLine(g, "หยุดก่อน!", prog(t, 0.1, 0.4), { y: 380, border: "#7ad7ff" });
      UI.caption(g, "มีวิธีง่ายกว่านั้น", "ง่ายกว่า", "There is an easier way", prog(t, 0.6, 1.0));
      UI.flash(g, 1 - prog(t, 0, 0.25));
  } },
  // 7 blueprint: 50/30/20 bars
  { d: 2.6, draw(g, t, k) {
      UI.blueprintGrid(g, t, C.MOODS.blueprint);
      C.layer(g, { z: 1 + 0.04 * k, x: 0 }, 1, (g) => drawFigure(g, { x: 200, y: GY + 240, s: 1.9, pose: breathe(POSES.explain, t), outfit: PIM, expr: "smile", talk: talkAmount(t, 0.2, 2.2), rim: { color: "#9cc8ff", dir: [1, -0.3] } }));
      UI.title(g, "กฎ 50/30/20", prog(t, 0, 0.35), { y: 380, size: 110, col: "#ffe08a", glowCol: "#ffd166" });
      UI.bars(g, 380, 640, 600, [["50% จำเป็น", 1, "#7fb2ff"], ["30% อยากได้", 0.6, "#c39bff"], ["20% เก็บก่อนใช้", 0.4, "#ffd166"]], prog(t, 0.3, 1.6), { gap: 170 });
      UI.caption(g, "แบ่งเงินเก็บก่อนใช้", "เก็บก่อน", "Pay yourself first", prog(t, 0.2, 0.6));
  } },
  // 8 resolution: both cheer, beam bright
  { d: 1.8, draw(g, t, k) {
      const cam = { z: keys(k, [[0, 1.08], [1, 1.0]]), x: 0 };
      stage(g, t, cam, { beamA: 1.3 });
      FX.godRays(g, CX, 300, M, t, 9, 1500, 0.1);
      C.layer(g, cam, 1, (g) => {
        drawFigure(g, { x: CX - 210, y: GY, s: 1.7, pose: breathe(POSES.cheer, t, 1.4), outfit: NOK, expr: "happy", rim: { color: M.rim, dir: [1, -0.4] }, label: "นก" });
        drawFigure(g, { x: CX + 230, y: GY, s: 1.7, facing: -1, pose: breathe(POSES.wave, t, 1.4, 4), outfit: PIM, expr: "happy", rim: { color: M.rim, dir: [-1, -0.4] }, label: "พิม" });
      });
      FX.dust(g, t, M, 110);
      UI.bigLine(g, "เดือนหน้า เก็บได้ ฿5,000", prog(t, 0.1, 0.4), { y: 420 });
  } },
];
let acc = 0; for (const s of shots) { s.from = acc; acc += s.d; s.to = acc; }

export function render(g, t) {
  const s = shots.find((x) => t >= x.from && t < x.to) ?? shots[shots.length - 1];
  const lt = t - s.from, k = clamp(lt / s.d);
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  s.draw(g, lt, k);
  g.setTransform(1, 0, 0, 1, 0, 0);
  C.finish(g, t, { grade: C.GRADES.emerald, grain: 0.05, vignette: 0.6 });
  // dip at the end
  if (t > DURATION - 0.5) { g.fillStyle = `rgba(0,0,0,${(t - DURATION + 0.5) / 0.5})`; g.fillRect(0, 0, W, H); }
}
