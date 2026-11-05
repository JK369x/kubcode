// Shared hover/focus preview: a card's muted loop plays only while someone
// points at or focuses it, never on its own and never before then (no
// download until asked). Respects reduced motion and Save-Data.

export function playPreview(card: HTMLElement) {
  const video = card.querySelector<HTMLVideoElement>("video[data-src]");
  if (!video) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  if (!video.getAttribute("src")) video.src = video.dataset.src!;
  card.dataset.playing = "";
  video.play().catch(() => delete card.dataset.playing);
}

export function stopPreview(card: HTMLElement) {
  const video = card.querySelector<HTMLVideoElement>("video");
  delete card.dataset.playing;
  if (!video) return;
  video.pause();
  if (video.readyState > 0) video.currentTime = 0;
}
