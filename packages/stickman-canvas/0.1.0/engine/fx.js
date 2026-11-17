// Stickman Canvas v2 — atmosphere and set pieces (kubcode.dev, MIT). Clean-room.
import { W, H, GY, CX, hash, rgba, mix, glow, clamp, noise } from "./core.js";

export function backdrop(g, M) {
  const s = g.createLinearGradient(0, -400, 0, H + 400); s.addColorStop(0, M.sky[0]); s.addColorStop(1, M.sky[1]);
  g.fillStyle = s; g.fillRect(-600, -600, W + 1200, H + 1200);
}
/** Back wall with big panels (window glow behind). */
export function stageWall(g, M, t) {
  g.fillStyle = M.wall; g.fillRect(-600, -200, W + 1200, GY + 200);
  // two large light panels: one warm, one cool (the signature "window" element)
  for (const [x, col] of [[60, M.warm], [W - 500, M.cool]]) {
    const pg = g.createLinearGradient(0, 300, 0, GY - 120);
    pg.addColorStop(0, rgba(col, 0.42)); pg.addColorStop(1, rgba(col, 0.12));
    g.fillStyle = pg; g.fillRect(x, 320, 440, GY - 460);
    g.strokeStyle = rgba(col, 0.25); g.lineWidth = 3;
    for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(x, 320 + i * (GY - 460) / 10); g.lineTo(x + 440, 320 + i * (GY - 460) / 10); g.stroke(); }
    g.strokeStyle = "#040806"; g.lineWidth = 16; g.strokeRect(x, 320, 440, GY - 460);
  }
  // truss on top with small spot lamps
  g.fillStyle = "#060a08"; g.fillRect(-600, 250, W + 1200, 28);
  g.strokeStyle = "#0c1611"; g.lineWidth = 3;
  for (let x = -600; x < W + 600; x += 40) { g.beginPath(); g.moveTo(x, 250); g.lineTo(x + 20, 278); g.lineTo(x + 40, 250); g.stroke(); }
  for (const [x, col] of [[180, M.warm], [W - 180, M.cool], [CX, M.key]]) { g.fillStyle = "#0a0f0c"; g.fillRect(x - 14, 276, 28, 22); glow(g, x, 300, 70, col, 0.9 + 0.1 * Math.sin(t * 9 + x)); }
}
/** Reflective floor with perspective lines. */
export function stageFloor(g, M) {
  const f = g.createLinearGradient(0, GY - 40, 0, H); f.addColorStop(0, mix(M.floor, M.wall2, 0.5)); f.addColorStop(1, M.floor);
  g.fillStyle = f; g.fillRect(-600, GY - 40, W + 1200, H);
  g.strokeStyle = rgba(M.rim, 0.07); g.lineWidth = 2;
  for (let i = -14; i <= 14; i++) { g.beginPath(); g.moveTo(CX + i * 40, GY - 40); g.lineTo(CX + i * 220, H + 200); g.stroke(); }
  for (let j = 0; j < 9; j++) { const y = GY - 40 + Math.pow(j / 9, 1.8) * (H - GY + 240); g.beginPath(); g.moveTo(-600, y); g.lineTo(W + 600, y); g.stroke(); }
}
/** Vertical beam of light from the truss down to the floor. */
export function beam(g, x, M, t, w = 90, a = 1) {
  g.save(); g.globalCompositeOperation = "lighter";
  const k = 0.85 + 0.15 * Math.sin(t * 3.1);
  const b = g.createLinearGradient(x - w, 0, x + w, 0);
  b.addColorStop(0, rgba(M.key, 0)); b.addColorStop(0.5, rgba(M.key, 0.42 * a * k)); b.addColorStop(1, rgba(M.key, 0));
  g.fillStyle = b; g.beginPath(); g.moveTo(x - w * 0.35, 290); g.lineTo(x + w * 0.35, 290); g.lineTo(x + w, GY + 30); g.lineTo(x - w, GY + 30); g.fill();
  const c = g.createLinearGradient(x - 14, 0, x + 14, 0);
  c.addColorStop(0, rgba("#ffffff", 0)); c.addColorStop(0.5, rgba("#fffbe0", 0.75 * a * k)); c.addColorStop(1, rgba("#ffffff", 0));
  g.fillStyle = c; g.fillRect(x - 14, 290, 28, GY - 260);
  // pool on the floor
  const p = g.createRadialGradient(x, GY + 20, 0, x, GY + 20, w * 2.4);
  p.addColorStop(0, rgba(M.key, 0.45 * a)); p.addColorStop(1, rgba(M.key, 0));
  g.fillStyle = p; g.beginPath(); g.ellipse(x, GY + 20, w * 2.4, w * 0.5, 0, 0, 7); g.fill();
  g.restore();
}
export function godRays(g, x, y, M, t, n = 7, len = 1200, a = 0.12) {
  g.save(); g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const ang = Math.PI / 2 + (i - (n - 1) / 2) * 0.12 + Math.sin(t * 0.4 + i) * 0.02, sp = 0.035;
    const gr = g.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    gr.addColorStop(0, rgba(M.key, a)); gr.addColorStop(1, rgba(M.key, 0));
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang - sp) * len, y + Math.sin(ang - sp) * len); g.lineTo(x + Math.cos(ang + sp) * len, y + Math.sin(ang + sp) * len); g.fill();
  }
  g.restore();
}
export function dust(g, t, M, n = 70, area = [0, 200, W, GY]) {
  g.save(); g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const x = area[0] + ((hash(i) * (area[2] - area[0]) + noise(t * 0.3, i) * 60) % (area[2] - area[0]));
    const y = area[1] + ((hash(i * 7.3) * (area[3] - area[1]) - t * (8 + hash(i * 3) * 18)) % (area[3] - area[1]) + (area[3] - area[1])) % (area[3] - area[1]);
    const r = 1.2 + hash(i * 5) * 2.6; g.fillStyle = rgba(M.key, 0.25 + 0.5 * hash(i * 11) * (0.6 + 0.4 * Math.sin(t * 2 + i)));
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.restore();
}
export function fog(g, M, y = GY - 60, h = 260, a = 0.35) {
  const f = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  f.addColorStop(0, rgba(M.fog, 0)); f.addColorStop(0.5, rgba(M.fog, a)); f.addColorStop(1, rgba(M.fog, 0));
  g.fillStyle = f; g.fillRect(-600, y - h / 2, W + 1200, h);
}
export function rings(g, x, y, t, col, n = 3) {
  g.save(); g.strokeStyle = col; g.lineWidth = 3;
  for (let i = 0; i < n; i++) { const k = ((t * 0.9 + i / n) % 1); g.globalAlpha = (1 - k) * 0.6; g.beginPath(); g.arc(x, y, 50 + k * 90, 0, 7); g.stroke(); }
  g.restore();
}
export function sparkles(g, x, y, t, col, n = 10, R = 160) {
  g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = col;
  for (let i = 0; i < n; i++) { const a = hash(i) * 7 + t * 0.6, r = R * (0.4 + 0.6 * hash(i * 2)), k = 0.5 + 0.5 * Math.sin(t * 6 + i * 2); g.globalAlpha = k; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.7; g.beginPath(); g.moveTo(px, py - 8 * k); g.lineTo(px + 2, py); g.lineTo(px, py + 8 * k); g.lineTo(px - 2, py); g.fill(); g.beginPath(); g.moveTo(px - 8 * k, py); g.lineTo(px, py + 2); g.lineTo(px + 8 * k, py); g.lineTo(px, py - 2); g.fill(); }
  g.restore();
}
/** A floating screen / monitor with lines of "code" being typed. */
export function screen(g, x, y, w, h, M, t, lines = [], typed = 1) {
  g.fillStyle = "#08100c"; g.strokeStyle = rgba(M.rim, 0.35); g.lineWidth = 4;
  g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill(); g.stroke();
  glow(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.7, M.cool, 0.35);
  g.font = "700 38px Anuphan, ui-monospace, monospace"; g.textBaseline = "top";
  let left = Math.floor(typed * lines.join("").length);
  lines.forEach((l, i) => {
    g.fillStyle = rgba(M.rim, 0.45); g.fillText(String(i + 1), x + 18, y + 30 + i * 62);
    const s = l.slice(0, Math.max(0, left)); left -= l.length;
    g.fillStyle = "#cfe9ff"; g.fillText(s, x + 70, y + 30 + i * 62);
    if (left < 0 && left > -l.length - 1 && Math.floor(t * 3) % 2 === 0) g.fillRect(x + 72 + g.measureText(s).width, y + 30 + i * 62, 14, 40);
  });
}
/** Soft foreground silhouette (over-the-shoulder / crowd head). */
export function fgHead(g, x, y, r, col = "#020302") {
  g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.beginPath(); g.ellipse(x, y + r * 1.9, r * 1.6, r * 1.1, 0, Math.PI, 0); g.fill();
}
