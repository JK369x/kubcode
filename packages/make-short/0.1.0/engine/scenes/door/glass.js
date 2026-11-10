// scenes/door/glass.js: the door story in stained glass (world 9, 470-530). Reads scene(f); draws with the glass kit; never times anything itself.
// Hallway = one leaded window: warm amber light behind the hero, cool deep fields at the sides, ruby door, leaded floor with a mirrored colour patch,
// iron saddle bars as mullions. Hearts are leaded ruby glass at the top. The big bonk (impact, crack) cracks the whole window; the world freezes
// at the seam start (522) so the shatter seam can use this canvas as the texture of the shards.
import { loadState, DOOR, FLOOR, lostHeart } from './b4-standin.js';

const W = 1920, TAU = Math.PI * 2, SEAM0 = 522;
let ST, WALL, FLR, STONE, GL, BL1, BL2, REF;
function hashf(a, b) { const n = Math.sin(a * 127.1 + b * 311.7 + 19.19) * 43758.5453; return n - Math.floor(n); }

export default {
  async init(api, kit) {
    ST = await loadState();
    const mk = kit.mk;
    WALL = mk(W, FLOOR); FLR = mk(W, W - FLOOR); GL = mk(W, W); BL1 = mk(480, 480); BL2 = mk(160, 160); REF = mk(W, 640); STONE = kit.stoneTile();
    let g = WALL.getContext('2d'); g.fillStyle = '#0a0710'; g.fillRect(0, 0, W, FLOOR);
    kit.quarryField(g, [90, 0, 420, FLOOR], ['emerald', 'cobalt'], 11, 150, 230, .68);          // left field, cool and deep
    kit.quarryField(g, [540, 0, 470, FLOOR], ['orange', 'ruby'], 12, 150, 230, .86);             // the hero's lancet: warm light
    kit.quarryField(g, [1030, 0, 800, FLOOR], ['emerald', 'cobalt'], 13, 150, 230, .68);        // right of the door
    g.fillStyle = '#16121a'; for (const x of [510, 1010]) g.fillRect(x, 0, 32, FLOOR);          // stone mullions
    g.fillStyle = 'rgba(255,255,255,.12)'; for (const x of [510, 1010]) g.fillRect(x, 0, 3, FLOOR);
    g.fillStyle = '#16121a'; g.fillRect(1830, 0, 90, FLOOR); g.fillRect(0, 0, 90, FLOOR);
    for (let y = 300; y < FLOOR; y += 520) { g.fillStyle = '#17141d'; g.fillRect(90, y - 10, 1740, 20); g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(90, y - 10, 1740, 3); }   // iron saddle bars
    g = FLR.getContext('2d'); g.fillStyle = '#0a0710'; g.fillRect(0, 0, W, W - FLOOR); kit.plankField(g, [90, 0, 1740, W - FLOOR], ['teal', 'violet'], 5);
    g.fillStyle = '#16121a'; g.fillRect(0, 0, 90, W - FLOOR); g.fillRect(1830, 0, 90, W - FLOOR);
  },
  render(out, s, kit) {
    const f = Math.min(s.f, SEAM0), sc = ST.sceneAt(f, s.tl), p = ST.heroAt(f, s), g = out.getContext('2d'), gl = GL.getContext('2d');
    kit.setImpact(sc.impact);
    // nave stone around the window
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#07050a'; g.fillRect(0, 0, W, W); g.globalAlpha = .55; g.drawImage(STONE, 0, 0); g.drawImage(STONE, 0, 1040); g.globalAlpha = 1; g.fillStyle = 'rgba(4,3,8,.7)'; g.fillRect(0, 0, W, W);
    // glass layer: wall, floor, door, hearts, hero (one layer, so the backlight treats them all alike)
    gl.setTransform(1, 0, 0, 1, 0, 0); gl.globalAlpha = 1; gl.clearRect(0, 0, W, W);
    gl.drawImage(WALL, 0, 0); gl.drawImage(FLR, 0, FLOOR);
    gl.fillStyle = '#17141d'; gl.fillRect(90, FLOOR - 14, 1740, 28); gl.fillStyle = 'rgba(255,255,255,.14)'; gl.fillRect(90, FLOOR - 14, 1740, 3);        // baseboard sill at the floor line
    kit.door(gl, DOOR, sc.door);
    gl.fillStyle = 'rgba(6,4,20,.3)'; gl.fillRect(0, 0, W, W); gl.fillStyle = 'rgba(6,4,20,.3)'; gl.fillRect(0, FLOOR, W, W - FLOOR);   // window plane sits behind the figure panel; the floor is darker
    kit.hearts(gl, sc.hearts, lostHeart(sc));
    kit.hero(gl, p);
    // compose: glass, bloom (irradiation into the lead), colour spill on the stone
    g.drawImage(GL, 0, 0);
    const b1 = BL1.getContext('2d'), b2 = BL2.getContext('2d');
    b1.setTransform(1, 0, 0, 1, 0, 0); b1.clearRect(0, 0, 480, 480); b1.filter = 'blur(3px)'; b1.drawImage(GL, 0, 0, 480, 480); b1.filter = 'none';
    b2.setTransform(1, 0, 0, 1, 0, 0); b2.clearRect(0, 0, 160, 160); b2.filter = 'blur(3px)'; b2.drawImage(GL, 0, 0, 160, 160); b2.filter = 'none';
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .27; g.drawImage(BL1, 0, 0, W, W); g.globalAlpha = .45; g.drawImage(BL2, 0, 0, W, W);
    g.globalCompositeOperation = 'source-over';
    // mirrored colour patch on the leaded floor (the window projects its light and his colours)
    const rg = REF.getContext('2d'); rg.setTransform(1, 0, 0, 1, 0, 0); rg.globalCompositeOperation = 'source-over'; rg.clearRect(0, 0, W, 640);
    rg.save(); rg.filter = 'blur(7px)'; rg.translate(0, 0); rg.scale(1, -1); rg.drawImage(GL, 0, FLOOR - 640, W, 640, 0, -640, W, 640); rg.restore();
    rg.globalCompositeOperation = 'destination-in'; const fade = rg.createLinearGradient(0, 0, 0, 640); fade.addColorStop(0, 'rgba(0,0,0,.9)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); rg.fillStyle = fade; rg.fillRect(0, 0, W, 640); rg.globalCompositeOperation = 'source-over';
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = .28; g.drawImage(REF, 0, FLOOR); g.globalAlpha = 1;
    // coloured shafts + dust (ones), vignette
    const sh = [[.07, 'rgba(255,60,90,A)', 300, 120], [.055, 'rgba(60,110,255,A)', 880, 150], [.065, 'rgba(255,190,70,A)', 1400, 110]];
    for (const [al, col, x0, wd] of sh) { const x = x0 + Math.sin(s.f * .02 + x0) * 60, gr = g.createLinearGradient(x, 0, x + 420, W); gr.addColorStop(0, col.replace('A', '0')); gr.addColorStop(.35, col.replace('A', String(al))); gr.addColorStop(1, col.replace('A', '0')); g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + wd, 0); g.lineTo(x + wd + 760, W); g.lineTo(x + 760, W); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(255,235,190,.55)'; for (let i = 0; i < 60; i++) { const x = 130 + hashf(i, 2) * 1660 + Math.sin(s.f * .03 + i) * 12, y = ((hashf(i, 3) * 1500 - s.f * (.3 + hashf(i, 6) * .5)) % 1500 + 1500) % 1500, r = 1.5 + hashf(i, 4) * 3; g.globalAlpha = .2 + hashf(i, 5) * .3; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // bonk: a soft burst at the impact, then the cracks across the whole window
    const bk = s.f - sc.impact.f; if (bk >= 0 && bk < 9) { const a = .3 * (1 - bk / 9), br = g.createRadialGradient(sc.impact.x, sc.impact.y, 0, sc.impact.x, sc.impact.y, 420); br.addColorStop(0, `rgba(255,240,200,${a})`); br.addColorStop(1, 'rgba(255,240,200,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = br; g.fillRect(0, 0, W, W); g.globalCompositeOperation = 'source-over'; }
    const vg = g.createRadialGradient(W / 2, W / 2, 620, W / 2, W / 2, 1350); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = vg; g.fillRect(0, 0, W, W);
    kit.crack(g, sc.impact.x, sc.impact.y, sc.crack);
  },
};
