// Stickman Canvas v2 — rig (kubcode.dev, MIT). Clean-room implementation.
import { lerp, clamp, rgba, mix, hash, noise } from "./core.js";

/**
 * A pose = joint positions in rig units relative to the hips (0,0), +y down,
 * facing right. Head radius 30. Keys: neck, hd (head centre), eL/hL (near elbow/hand),
 * eF/hF (far elbow/hand), kL/fL (near knee/foot), kF/fF (far knee/foot).
 */
const P = (o) => o;
export const POSES = {
  stand:   P({ neck: [0, -118], hd: [4, -160], eL: [10, -60], hL: [14, -8], eF: [-10, -62], hF: [-12, -10], kL: [8, 62], fL: [12, 128], kF: [-8, 62], fF: [-12, 128] }),
  talk:    P({ neck: [2, -118], hd: [8, -160], eL: [32, -66], hL: [62, -88], eF: [-12, -62], hF: [-14, -10], kL: [8, 62], fL: [12, 128], kF: [-8, 62], fF: [-12, 128] }),
  explain: P({ neck: [2, -118], hd: [8, -160], eL: [36, -70], hL: [70, -60], eF: [22, -72], hF: [52, -48], kL: [10, 62], fL: [16, 128], kF: [-10, 62], fF: [-16, 128] }),
  point:   P({ neck: [4, -118], hd: [10, -160], eL: [46, -100], hL: [98, -112], eF: [-10, -62], hF: [-12, -10], kL: [12, 62], fL: [20, 128], kF: [-10, 62], fF: [-18, 128] }),
  pointUp: P({ neck: [2, -118], hd: [6, -162], eL: [26, -150], hL: [36, -210], eF: [-10, -62], hF: [-12, -10], kL: [8, 62], fL: [12, 128], kF: [-8, 62], fF: [-12, 128] }),
  wave:    P({ neck: [0, -118], hd: [4, -160], eL: [40, -142], hL: [50, -200], eF: [-10, -62], hF: [-12, -10], kL: [8, 62], fL: [12, 128], kF: [-8, 62], fF: [-12, 128] }),
  cheer:   P({ neck: [0, -120], hd: [2, -164], eL: [36, -158], hL: [52, -216], eF: [-36, -158], hF: [-52, -216], kL: [14, 60], fL: [22, 124], kF: [-14, 60], fF: [-22, 124] }),
  think:   P({ neck: [0, -118], hd: [6, -160], eL: [20, -70], hL: [16, -128], eF: [-8, -70], hF: [14, -74], kL: [6, 62], fL: [10, 128], kF: [-8, 62], fF: [-12, 128] }),
  shrug:   P({ neck: [0, -116], hd: [2, -158], eL: [36, -96], hL: [58, -122], eF: [-36, -96], hF: [-58, -122], kL: [8, 62], fL: [12, 128], kF: [-8, 62], fF: [-12, 128] }),
  handsOnHead: P({ neck: [0, -118], hd: [0, -160], eL: [40, -150], hL: [16, -182], eF: [-40, -150], hF: [-16, -182], kL: [10, 62], fL: [16, 128], kF: [-10, 62], fF: [-16, 128] }),
  sad:     P({ neck: [8, -110], hd: [20, -148], eL: [14, -56], hL: [16, -4], eF: [-4, -58], hF: [0, -6], kL: [8, 62], fL: [12, 128], kF: [-8, 62], fF: [-12, 128] }),
  phone:   P({ neck: [2, -118], hd: [10, -158], eL: [26, -70], hL: [46, -110], eF: [14, -72], hF: [40, -104], kL: [8, 62], fL: [12, 128], kF: [-8, 62], fF: [-12, 128] }),
  crossArms: P({ neck: [0, -118], hd: [4, -160], eL: [26, -74], hL: [-14, -86], eF: [-24, -74], hF: [16, -88], kL: [10, 62], fL: [16, 128], kF: [-10, 62], fF: [-16, 128] }),
  ready:   P({ neck: [12, -104], hd: [24, -144], eL: [40, -56], hL: [62, -30], eF: [10, -56], hF: [36, -24], kL: [30, 50], fL: [24, 120], kF: [-22, 56], fF: [-36, 120] }),
  jump:    P({ neck: [0, -122], hd: [2, -166], eL: [38, -154], hL: [48, -210], eF: [-38, -154], hF: [-48, -210], kL: [26, 40], fL: [10, 92], kF: [-26, 40], fF: [-12, 92] }),
};
export function blendPose(a, b, k) {
  const o = {};
  for (const j in a) o[j] = [lerp(a[j][0], b[j][0], k), lerp(a[j][1], b[j][1], k)];
  return o;
}
/** [[t,'name'], ...] → pose at t, blending 0.3 s into each new key. */
export function posesAt(t, list, blend = 0.3) {
  let cur = POSES[list[0][1]];
  for (let i = 1; i < list.length; i++) {
    const [ti, name] = list[i];
    if (t < ti) break;
    cur = blendPose(cur, POSES[name], clamp((t - ti) / blend));
  }
  return cur;
}
/** Nobody stands frozen: subtle breathing and sway. */
export function breathe(p, t, amt = 1, seed = 1) {
  const b = Math.sin(t * 2.1 + seed) * 2.2 * amt, s = noise(t * 0.6, seed) * 2 * amt;
  const o = {};
  for (const j in p) { const up = ["neck", "hd", "eL", "hL", "eF", "hF"].includes(j); o[j] = [p[j][0] + (up ? s : 0), p[j][1] + (up ? b : 0)]; }
  return o;
}
export function walkPose(phase, run = false) {
  const a = Math.sin(phase), c = Math.cos(phase), st = run ? 46 : 30, lift = run ? 26 : 14;
  return {
    neck: [run ? 14 : 4, -118], hd: [run ? 24 : 8, -160],
    eL: [-a * 22, -62], hL: [-a * 40, run ? -40 : -12], eF: [a * 22, -62], hF: [a * 40, run ? -40 : -12],
    kL: [a * st * 0.6, 60], fL: [a * st, 128 - Math.max(0, c) * lift], kF: [-a * st * 0.6, 60], fF: [-a * st, 128 - Math.max(0, -c) * lift],
  };
}

const INK = "#050607", INK_FAR = "#27213a";

function capsule(g, pts, w, col) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke();
}

/**
 * Faces: drawn toward the facing side (3/4). expr picks eyes/brows/mouth.
 * talk 0..1 opens the mouth; look [x,y] shifts the pupils; blink closes them.
 */
export function face(g, x, y, r, { expr = "neutral", talk = 0, blink = false, look = [0, 0], front = false } = {}) {
  const off = front ? 0 : r * 0.28, ex = x + off, ey = y - r * 0.05, sp = r * 0.33, er = r * 0.16;
  const W = "#f6f2e6";
  g.save(); g.fillStyle = W; g.strokeStyle = W; g.lineCap = "round"; g.lineWidth = Math.max(2, r * 0.07);
  const eyes = (open = 1, ring = false) => {
    for (const s of [-1, 1]) {
      const cx = ex + s * sp + look[0] * r * 0.06, cy = ey + look[1] * r * 0.06;
      if (blink || open < 0.15) { g.beginPath(); g.moveTo(cx - er, cy); g.lineTo(cx + er, cy); g.stroke(); continue; }
      if (ring) { g.beginPath(); g.arc(cx, cy, er * 1.15, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, er * 0.45, 0, 7); g.fill(); }
      else { g.beginPath(); g.ellipse(cx, cy, er, er * open, 0, 0, 7); g.fill(); }
    }
  };
  const brows = (ang, dy = 0) => {
    for (const s of [-1, 1]) { const cx = ex + s * sp, cy = ey - r * 0.32 + dy; g.beginPath(); g.moveTo(cx - er * 1.3, cy + s * ang * er); g.lineTo(cx + er * 1.3, cy - s * ang * er); g.stroke(); }
  };
  const mx = ex, my = y + r * 0.42, mw = r * 0.34;
  const mouth = (kind) => {
    g.beginPath();
    if (talk > 0.05) { g.ellipse(mx, my, mw * 0.55, mw * 0.18 + talk * mw * 0.45, 0, 0, 7); g.fill(); return; }
    if (kind === "smile") { g.arc(mx, my - mw * 0.55, mw * 0.8, 0.35, Math.PI - 0.35); g.stroke(); }
    else if (kind === "grin") { g.moveTo(mx - mw, my - 2); g.quadraticCurveTo(mx, my + mw * 1.1, mx + mw, my - 2); g.closePath(); g.fill(); }
    else if (kind === "o") { g.ellipse(mx, my, mw * 0.35, mw * 0.5, 0, 0, 7); g.fill(); }
    else if (kind === "frown") { g.arc(mx, my + mw * 0.8, mw * 0.75, Math.PI + 0.45, -0.45); g.stroke(); }
    else if (kind === "wavy") { g.moveTo(mx - mw, my); g.bezierCurveTo(mx - mw / 2, my - 8, mx, my + 8, mx + mw / 2, my - 4); g.lineTo(mx + mw, my); g.stroke(); }
    else if (kind === "smirk") { g.moveTo(mx - mw * 0.6, my + 2); g.quadraticCurveTo(mx + mw * 0.3, my + 6, mx + mw, my - 8); g.stroke(); }
    else { g.moveTo(mx - mw * 0.7, my); g.lineTo(mx + mw * 0.7, my); g.stroke(); }
  };
  switch (expr) {
    case "smile": eyes(1); mouth("smile"); break;
    case "happy": eyes(0.55); mouth("grin"); break;
    case "surprised": eyes(1, true); brows(0, -r * 0.08); mouth("o"); break;
    case "shocked": eyes(1, true); brows(-0.25, -r * 0.12); mouth("o"); break;
    case "worried": eyes(0.9); brows(-0.5); mouth("wavy"); break;
    case "sad": eyes(0.75); brows(-0.6); mouth("frown"); break;
    case "angry": eyes(0.7); brows(0.7, r * 0.05); mouth("frown"); break;
    case "determined": eyes(0.6); brows(0.45, r * 0.04); mouth("neutral"); break;
    case "thinking": eyes(0.85); g.save(); look = [0.8, -0.8]; g.restore(); brows(0.25); mouth("smirk"); break;
    case "smirk": eyes(0.65); brows(0.2); mouth("smirk"); break;
    case "confused": eyes(1); brows(0.5); mouth("wavy"); break;
    default: eyes(1); mouth("neutral");
  }
  g.restore();
}

/**
 * Outfit: { top: 'hoodie'|'tshirt'|'jacket'|'none', color, head: 'cap'|'beanie'|'headband'|'hair'|'none', headColor, glasses }
 * One saturated signature item per character keeps them recognisable.
 */
export function drawFigure(g, o) {
  const { x, y, s = 1, facing = 1, pose = POSES.stand, outfit = {}, expr = "neutral", talk = 0, blink = false, look = [0, 0],
    rim = null, shadow = true, alpha = 1, label = null } = o;
  const P = (pt) => [x + pt[0] * s * facing, y - 128 * s + pt[1] * s];
  const hip = P([0, 0]), neck = P(pose.neck), hd = P(pose.hd), R = 30 * s, lw = 15 * s;
  g.save(); g.globalAlpha = alpha;
  if (shadow) { const sh = g.createRadialGradient(x, y + 4 * s, 0, x, y + 4 * s, 70 * s); sh.addColorStop(0, "rgba(0,0,0,.55)"); sh.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sh; g.beginPath(); g.ellipse(x, y + 4 * s, 70 * s, 14 * s, 0, 0, 7); g.fill(); }
  // far side first
  capsule(g, [hip, P(pose.kF), P(pose.fF)], lw, INK_FAR);
  capsule(g, [neck, P(pose.eF), P(pose.hF)], lw * 0.86, INK_FAR);
  // torso (garment colour if any)
  const torsoCol = outfit.top && outfit.top !== "none" ? outfit.color : INK;
  capsule(g, [hip, neck], lw * (outfit.top && outfit.top !== "none" ? 2.0 : 1.15), torsoCol);
  if (outfit.top === "hoodie") { g.fillStyle = mix(outfit.color, "#000000", 0.25); g.beginPath(); g.arc(neck[0] - 6 * s * facing, neck[1] + 4 * s, 15 * s, 0, 7); g.fill(); }
  capsule(g, [hip, P(pose.kL), P(pose.fL)], lw, INK);
  // feet
  for (const f of [P(pose.fL), P(pose.fF)]) capsule(g, [f, [f[0] + 14 * s * facing, f[1]]], lw * 0.9, INK);
  // near arm: sleeve in garment colour
  const eL = P(pose.eL), hL = P(pose.hL);
  if (outfit.top && outfit.top !== "none") capsule(g, [neck, eL], lw * 1.25, outfit.color);
  capsule(g, [outfit.top && outfit.top !== "none" ? eL : neck, ...(outfit.top && outfit.top !== "none" ? [] : [eL]), hL], lw * 0.86, INK);
  // head
  g.fillStyle = INK; g.beginPath(); g.arc(hd[0], hd[1], R, 0, 7); g.fill();
  // rim light: crescent on the side facing the light
  if (rim) {
    const [dx, dy] = rim.dir, a = Math.atan2(dy, dx);
    g.save(); g.strokeStyle = rim.color; g.lineWidth = (rim.w || 4.5) * s; g.shadowColor = rim.color; g.shadowBlur = 10 * s;
    g.beginPath(); g.arc(hd[0], hd[1], R - 1.5 * s, a - 1.25, a + 1.25); g.stroke();
    const nx = -Math.sin(a) * 0, side = Math.sign(dx || 0.0001) * 6 * s;
    g.globalAlpha = 0.85; g.lineWidth = 3 * s;
    g.beginPath(); g.moveTo(neck[0] + side, neck[1] + 6 * s); g.lineTo(hip[0] + side, hip[1] - 4 * s); g.stroke();
    g.beginPath(); g.moveTo(hip[0] + side * 0.6, hip[1]); const kL = P(pose.kL); g.lineTo(kL[0] + side * 0.6, kL[1]); g.stroke();
    g.restore();
  }
  // head item
  const hc = outfit.headColor || outfit.color || "#f2c21a";
  g.fillStyle = hc; g.strokeStyle = hc;
  if (outfit.head === "cap") { g.beginPath(); g.ellipse(hd[0], hd[1] - R * 0.42, R * 1.0, R * 0.62, 0, Math.PI, 0); g.fill(); g.fillRect(hd[0] - (facing < 0 ? R * 1.45 : 0), hd[1] - R * 0.48, R * 1.45, 6 * s); }
  else if (outfit.head === "beanie") { g.beginPath(); g.arc(hd[0], hd[1] - 2 * s, R * 1.05, Math.PI * 1.05, -0.05); g.fill(); g.beginPath(); g.arc(hd[0], hd[1] - R * 1.05, 6 * s, 0, 7); g.fill(); }
  else if (outfit.head === "headband") { g.lineWidth = 8 * s; g.beginPath(); g.arc(hd[0], hd[1], R + 1, Math.PI * 1.08, -0.08); g.stroke(); g.beginPath(); g.moveTo(hd[0] - R * facing, hd[1] - 10 * s); g.quadraticCurveTo(hd[0] - R * 1.7 * facing, hd[1] - 4 * s, hd[0] - R * 2.1 * facing, hd[1] + 10 * s); g.stroke(); }
  else if (outfit.head === "hair") { g.fillStyle = INK; g.beginPath(); g.ellipse(hd[0] - 4 * s * facing, hd[1] - R * 0.7, R * 1.05, R * 0.55, 0, Math.PI, 0); g.fill(); g.beginPath(); g.arc(hd[0] - R * 0.9 * facing, hd[1] - R * 0.2, R * 0.45, 0, 7); g.fill(); }
  face(g, hd[0] + (facing < 0 ? -2 : 0), hd[1], R, { expr, talk, blink, look: [look[0] * facing, look[1]] });
  if (facing < 0) { /* face() draws toward +x; mirror offset handled by drawing at mirrored x */ }
  if (outfit.glasses) { g.strokeStyle = "#f6f2e6"; g.lineWidth = 2.5 * s; for (const sx of [-1, 1]) { g.beginPath(); g.arc(hd[0] + R * 0.28 * facing + sx * R * 0.33, hd[1] - R * 0.05, R * 0.24, 0, 7); g.stroke(); } }
  // name tag (pill under the feet), like a cast label
  if (label) {
    g.font = `700 ${18 * s}px 'Anuphan', sans-serif`; const tw = g.measureText(label).width + 26 * s;
    g.fillStyle = "rgba(10,14,12,.85)"; g.strokeStyle = hc; g.lineWidth = 2 * s;
    const ly = y + 22 * s; g.beginPath(); g.roundRect(x - tw / 2, ly, tw, 30 * s, 15 * s); g.fill(); g.stroke();
    g.fillStyle = hc; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, x, ly + 15 * s);
  }
  g.restore();
  return { head: [hd[0], hd[1], R], hand: hL };
}

/** Giant face close-up: fills the frame, shoulders cropped by the bottom edge. */
export function bigFace(g, cx, cy, r, { outfit = {}, expr = "neutral", talk = 0, blink = false, look = [0, 0], rimColor = "#7dffb0", rimSide = 1 } = {}) {
  g.save();
  const col = outfit.color || "#242424";
  g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy + r * 1.55, r * 1.25, r * 0.75, 0, Math.PI, 0); g.fill();
  g.fillStyle = INK; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.strokeStyle = rimColor; g.lineWidth = r * 0.06; g.shadowColor = rimColor; g.shadowBlur = r * 0.15;
  g.beginPath(); g.arc(cx, cy, r * 0.97, rimSide > 0 ? -1.4 : Math.PI - 1.4 + 2.8 - 2.8, rimSide > 0 ? 1.4 : Math.PI + 1.4); g.stroke();
  g.shadowBlur = 0;
  const hc = outfit.headColor || outfit.color;
  if (outfit.head === "cap") { g.fillStyle = hc; g.beginPath(); g.ellipse(cx, cy - r * 0.5, r * 1.0, r * 0.62, 0, Math.PI, 0); g.fill(); g.fillRect(cx - r * 1.0, cy - r * 0.56, r * 2.0, r * 0.14); g.fillRect(cx + r * 0.2, cy - r * 0.56, r * 1.1, r * 0.13); }
  if (outfit.head === "headband") { g.strokeStyle = hc; g.lineWidth = r * 0.22; g.beginPath(); g.arc(cx, cy, r * 1.0, Math.PI * 1.1, -0.1); g.stroke(); }
  face(g, cx, cy, r, { expr, talk, blink, look, front: true });
  g.restore();
}

/** Narration-driven talk amount (0..1), a smooth open/close at ~6 Hz. */
export const talkAmount = (t, from, to) => (t >= from && t <= to ? 0.35 + 0.65 * Math.abs(Math.sin((t - from) * 19)) * (0.6 + 0.4 * hash(Math.floor(t * 6))) : 0);
