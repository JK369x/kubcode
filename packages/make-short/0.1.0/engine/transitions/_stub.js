// transitions/_stub.js: labelled diagonal wipe (B revealed from the top-left). Each tN-name.js is replaced by its owner.
export function makeTransitionStub(id, label) {
  return {
    id, stub: true,
    render(ctx, A, B, p, s) {
      const W = A.width, H = A.height, q = 2 * p;
      ctx.drawImage(A, 0, 0);
      ctx.save(); ctx.beginPath();
      if (q <= 1) { ctx.moveTo(0, 0); ctx.lineTo(q * W, 0); ctx.lineTo(0, q * H); }
      else { ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, (q - 1) * H); ctx.lineTo((q - 1) * W, H); ctx.lineTo(0, H); }
      ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.beginPath();
      if (q <= 1) { ctx.moveTo(q * W, 0); ctx.lineTo(0, q * H); } else { ctx.moveTo(W, (q - 1) * H); ctx.lineTo((q - 1) * W, H); }
      ctx.stroke();
      ctx.font = '700 64px Inter, sans-serif'; ctx.textAlign = 'center'; const t = `${label}  p=${p.toFixed(2)}`, w = ctx.measureText(t).width;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(W / 2 - w / 2 - 20, 1330, w + 40, 90); ctx.fillStyle = '#fff'; ctx.fillText(t, W / 2, 1396); ctx.restore();
    },
  };
}
