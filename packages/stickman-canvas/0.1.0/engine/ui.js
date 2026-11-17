// Stickman Canvas v2 — on-screen graphics (kubcode.dev, MIT). Clean-room.
import { W, H, FONT, ease, clamp, rgba, glow, prog } from "./core.js";

/** Glowing Thai/caps title. k = 0..1 in. */
export function title(g, text, k, { y = 380, size = 120, col = "#f4ff9a", glowCol = "#d8ff6a" } = {}) {
  const a = ease.back(clamp(k)), op = clamp(k * 2);
  g.save(); g.globalAlpha = op; g.translate(W / 2, y); g.scale(0.7 + 0.3 * a, 0.7 + 0.3 * a);
  g.font = `800 ${size}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = glowCol; g.shadowBlur = 40; g.fillStyle = col; g.fillText(text, 0, 0);
  g.shadowBlur = 0; g.lineWidth = 2; g.strokeStyle = rgba("#ffffff", 0.4); g.strokeText(text, 0, 0);
  g.restore();
}
/** Pill line (question / chapter) with a soft border. */
export function bigLine(g, text, k, { y = 300, size = 54, col = "#f6f2e6", border = "#7dffb0" } = {}) {
  const a = ease.out(clamp(k));
  g.save(); g.globalAlpha = clamp(k * 2); g.font = `700 ${size}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
  const w = g.measureText(text).width + size * 1.1, h = size * 1.55;
  g.translate(W / 2, y + (1 - a) * 30);
  g.fillStyle = "rgba(6,12,9,.78)"; g.strokeStyle = rgba(border, 0.6); g.lineWidth = 3;
  g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.fill(); g.stroke();
  g.fillStyle = col; g.fillText(text, 0, 2); g.restore();
}
/** Small top label "01 / ..." like a chapter tag. */
export function chapter(g, text, { y = 120, col = "#d8ff6a" } = {}) {
  g.save(); g.font = `700 30px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
  const w = g.measureText(text).width + 70; g.fillStyle = "rgba(4,10,7,.75)"; g.strokeStyle = rgba(col, 0.5); g.lineWidth = 2.5;
  g.beginPath(); g.roundRect(W / 2 - w / 2, y - 30, w, 60, 14); g.fill(); g.stroke();
  g.fillStyle = "#e9f6e0"; g.fillText(text, W / 2, y + 1); g.restore();
}
/** Counter that rolls to a number as it is spoken. */
export function counter(g, x, y, value, k, { prefix = "", suffix = "", size = 110, col = "#ffd166" } = {}) {
  const v = Math.round(value * ease.out(clamp(k)));
  g.save(); g.globalAlpha = clamp(k * 3); g.font = `800 ${size}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = col; g.shadowBlur = 30; g.fillStyle = col; g.fillText(prefix + v.toLocaleString("en-US") + suffix, x, y); g.restore();
}
/** Bar chart that grows in. rows: [[label, value(0..1), colour]] */
export function bars(g, x, y, w, rows, k, { gap = 150 } = {}) {
  rows.forEach(([label, v, col], i) => {
    const a = ease.out(clamp((k - i * 0.15) / 0.5));
    g.save(); g.globalAlpha = clamp(a * 2);
    g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.roundRect(x, y + i * gap, w, 44, 22); g.fill();
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 20; g.beginPath(); g.roundRect(x, y + i * gap, Math.max(44, w * v * a), 44, 22); g.fill();
    g.shadowBlur = 0; g.font = `700 46px ${FONT}`; g.fillStyle = "#f6f2e6"; g.textBaseline = "bottom"; g.fillText(label, x, y + i * gap - 10);
    g.restore();
  });
}
/** Blueprint grid + line-art diagram helper. */
export function blueprintGrid(g, t, M) {
  g.fillStyle = M.sky[0]; g.fillRect(0, 0, W, H);
  g.strokeStyle = rgba("#7fb2ff", 0.13); g.lineWidth = 1.5;
  for (let x = 0; x <= W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = (t * 14) % 54; y <= H; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
}
/** Speech bubble with a pop. */
export function bubble(g, x, y, text, k, { col = "#f6f2e6", size = 40 } = {}) {
  const a = ease.back(clamp(k));
  g.save(); g.globalAlpha = clamp(k * 3); g.translate(x, y); g.scale(a, a); g.font = `700 ${size}px ${FONT}`;
  const w = g.measureText(text).width + 50, h = size * 1.8;
  g.fillStyle = col; g.beginPath(); g.roundRect(-w / 2, -h, w, h, 26); g.fill();
  g.beginPath(); g.moveTo(-14, -2); g.lineTo(0, 26); g.lineTo(18, -2); g.fill();
  g.fillStyle = "#0b0f0c"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 0, -h / 2 + 2); g.restore();
}
/** Thai caption + small English line, one keyword highlighted. y ≈ 79% of H. */
export function caption(g, th, kw, en, k, { y = H * 0.79, hl = "#ffc23d" } = {}) {
  if (k <= 0) return;
  g.save(); g.globalAlpha = clamp(k * 6); g.font = `800 64px ${FONT}`; g.textBaseline = "middle";
  const parts = kw && th.includes(kw) ? [th.slice(0, th.indexOf(kw)), kw, th.slice(th.indexOf(kw) + kw.length)] : [th, "", ""];
  const total = parts.reduce((s, p) => s + g.measureText(p).width, 0); let x = W / 2 - total / 2;
  g.lineJoin = "round"; g.lineWidth = 12; g.strokeStyle = "#040605";
  parts.forEach((p, i) => {
    if (!p) return; const sc = i === 1 ? 1 + 0.06 * (1 - ease.out(clamp(k * 4))) : 1;
    g.save(); g.translate(x, y); g.scale(sc, sc); g.strokeText(p, 0, 0); g.fillStyle = i === 1 ? hl : "#fffaf0"; g.fillText(p, 0, 0); g.restore();
    x += g.measureText(p).width;
  });
  if (en) { g.font = `700 30px ${FONT}`; g.textAlign = "center"; g.lineWidth = 7; g.strokeText(en.toUpperCase(), W / 2, y + 60); g.fillStyle = "#d9d4c6"; g.fillText(en.toUpperCase(), W / 2, y + 60); }
  g.restore();
}
/** White flash in/out for transitions (k: 0..1 → peaks at 0). */
export function flash(g, k, col = "#ffffff") { if (k <= 0) return; g.save(); g.globalAlpha = k; g.fillStyle = col; g.fillRect(0, 0, W, H); g.restore(); }
