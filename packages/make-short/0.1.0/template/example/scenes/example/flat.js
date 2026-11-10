// scenes/<story>/flat.js: draws "Why ice floats" with the flat kit (styles/05-flat.js). It times nothing:
// every value comes from scene(f) (s.sc) and the hero's pose (s.p). New props are drawn with kit.shape / kit.line in the kit's palette.
import { FLOOR, TABLE, GLASS, WATER, ICE } from '../../core/scene.js';
const TAU = Math.PI * 2;

function kitchen(g, kit) {                       // the room: wall with a dot pattern, panelling, floor, a window and a lamp
  const { C, INK, shape, line, rrect } = kit;
  g.fillStyle = C.wall; g.fillRect(-10, -10, 1940, FLOOR + 10);
  g.fillStyle = C.dot;
  for (let r = 0; r <= 9; r++) for (let c = 0; c <= 18; c++) { const x = c * 110 + (r & 1 ? 55 : 0), y = r * 110 + 30; if (y > 950) continue; g.beginPath(); g.moveTo(x, y - 13); g.lineTo(x + 10, y); g.lineTo(x, y + 13); g.lineTo(x - 10, y); g.closePath(); g.fill(); }
  g.fillStyle = C.wain; g.fillRect(-10, 1030, 1940, FLOOR - 1030);
  g.fillStyle = C.rail; g.fillRect(-10, 1018, 1940, 20); line(g, [[-10, 1018], [1930, 1018]], 5); line(g, [[-10, 1038], [1930, 1038]], 5);
  g.fillStyle = C.base; g.fillRect(-10, 1290, 1940, 60); line(g, [[-10, 1290], [1930, 1290]], 5);
  g.fillStyle = C.floor; g.fillRect(-10, FLOOR, 1940, 600);
  g.fillStyle = C.floorL; for (const dy of [0, 70, 150, 245, 360, 500]) g.fillRect(-10, FLOOR + dy, 1940, 6);
  g.fillStyle = INK; g.fillRect(-10, FLOOR - 3, 1940, 7);
  shape(g, '#a9dcf2', rrect(110, 540, 260, 420, 16), 9); line(g, [[240, 540], [240, 960]], 8); line(g, [[110, 750], [370, 750]], 8);   // window (16:9 only)
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(180, 650, 50, 22, 0, 0, TAU); g.ellipse(228, 636, 38, 24, 0, 0, TAU); g.fill();
  line(g, [[1500, -10], [1500, 520]], 6);                                                                          // lamp (right, behind the label)
  shape(g, '#f2b948', gg => { gg.beginPath(); gg.moveTo(1415, 610); gg.lineTo(1585, 610); gg.lineTo(1540, 520); gg.lineTo(1460, 520); gg.closePath(); }, 8, true);
  g.fillStyle = 'rgba(255,214,120,.20)'; g.beginPath(); g.moveTo(1425, 610); g.lineTo(1575, 610); g.lineTo(1700, 1250); g.lineTo(1300, 1250); g.closePath(); g.fill();
}

function table(g, kit) {
  const { C, shape, rrect } = kit;
  for (const x of [TABLE.x0 + 50, TABLE.x1 - 90]) shape(g, C.woodD, rrect(x, TABLE.y + 20, 40, FLOOR - TABLE.y - 20, 6), 7);
  shape(g, C.wood, rrect(TABLE.x0, TABLE.y, TABLE.x1 - TABLE.x0, 40, 10), 8, true);
}

function cube(g, kit, c) {
  g.save(); g.translate(c.x, c.y); g.rotate(c.rot);
  kit.shape(g, '#e4f6ff', kit.rrect(-ICE / 2, -ICE / 2, ICE, ICE, 16), 7);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(-ICE / 2 + 12, -ICE / 2 + 12, 12, 30);
  g.fillStyle = 'rgba(140,200,240,.6)'; g.beginPath(); g.arc(10, 10, 7, 0, TAU); g.arc(-6, 20, 4, 0, TAU); g.fill();
  g.restore();
}

function glass(g, kit, sc) {                     // back tint, the ice if it is inside, water, then the glass outline and shine
  const { INK, line } = kit, { x0, x1, y0, y1 } = GLASS, side = gg => { gg.beginPath(); gg.moveTo(x0, y0); gg.lineTo(x0 + 14, y1); gg.lineTo(x1 - 14, y1); gg.lineTo(x1, y0); };
  g.fillStyle = 'rgba(214,240,255,.45)'; side(g); g.closePath(); g.fill();
  if (sc.ice.inGlass) cube(g, kit, sc.ice);
  g.save(); side(g); g.closePath(); g.clip(); g.fillStyle = 'rgba(70,160,225,.50)'; g.fillRect(x0, WATER, x1 - x0, y1 - WATER); g.restore();
  line(g, [[x0 + 4, WATER], [x1 - 4, WATER]], 5, '#2f7fc0');
  g.save(); g.lineJoin = g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 8; side(g); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.ellipse((x0 + x1) / 2, y0, (x1 - x0) / 2, 10, 0, 0, TAU); g.stroke(); g.restore();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x1 - 40, y0 + 30, 10, y1 - y0 - 70);
}

function splashes(g, kit, list) {
  for (const s of list) for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i - 3.5) * .32, v = 9 + (i % 3) * 3, t = s.age;
    const x = s.x + Math.cos(a) * v * t * 1.4, y = s.y + Math.sin(a) * v * t + .9 * t * t;
    if (y > WATER + 4) continue;
    g.save(); g.globalAlpha = 1 - t / 18; kit.shape(g, '#7cc4ef', gg => { gg.beginPath(); gg.arc(x, y, 9, 0, TAU); }, 4); g.restore();
  }
}

export default {
  async init() { },
  render(out, s, kit) {
    const g = out.getContext('2d'), sc = s.sc;
    kit.setBoil(s.f);
    kitchen(g, kit);
    table(g, kit);
    kit.hero(g, s.p, s.f);                       // the hero before the glass, so his hand reads as inside the water
    glass(g, kit, sc);
    if (!sc.ice.inGlass) cube(g, kit, sc.ice);   // held, or flying at his nose: in front of everything
    splashes(g, kit, sc.splash);
    kit.bonk(g, sc.impact, s.f - sc.impact.f);
    if (sc.hook.a > 0) { g.save(); g.globalAlpha = sc.hook.a; kit.text(g, sc.hook.text, sc.hook.x, sc.hook.y, 80, { col: kit.C.cream }); g.restore(); }
    if (sc.fact.a > 0) {
      const F = sc.fact; g.save(); g.globalAlpha = F.a;
      F.lines.forEach((t, i) => kit.text(g, t, F.x, F.y + i * 70, 56, { col: i ? '#ffe27a' : kit.C.cream }));
      kit.line(g, [[F.x + 280, F.y + 88], [F.ax, F.ay - 8]], 6);
      g.restore();
    }
    kit.finish(g, s.f);
  },
};
