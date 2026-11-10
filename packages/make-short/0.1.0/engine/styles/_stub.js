// styles/_stub.js: placeholder style so the whole film renders end to end (flat colour, big name, soldier2d from the pose).
// Each styles/NN-name.js is replaced by its builder; the stub helper itself can stay.
export function makeStub({ id, name, bg, tint, fill }) {
  return {
    id, kind: '2d', stub: true,
    async init(api) { this.api = api; },
    render(out, s) {
      const g = out.getContext('2d'), { W, H, SQ, soldier2d } = this.api, p = s.p;
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = tint;                                           // world rushing UP: bands scroll with p.fall
      const off = (p.fall * 0.9) % 320; for (let y = -320 + (320 - off); y < H; y += 320) g.fillRect(0, y, W, 90);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.font = '700 110px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText(name, W / 2, SQ.y + SQ.s - 90);
      g.font = '500 40px JBM, monospace'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(`stub  u=${s.u.toFixed(2)}  ${p.st}`, W / 2, SQ.y + SQ.s - 36);
      soldier2d.drawSoldier(g, p, { fill });
      if (p.bang) soldier2d.drawBang(g, p);
    },
  };
}
