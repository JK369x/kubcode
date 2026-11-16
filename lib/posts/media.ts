// Browser-side file facts for the composer: SHA-256, dimensions, duration.
// Pure helpers (no React) so they are unit-testable where possible.

export const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(file: Blob): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
}

export function videoFacts(file: File): Promise<{ width: number; height: number; seconds: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const out = { width: v.videoWidth, height: v.videoHeight, seconds: Math.round(v.duration * 1000) / 1000 };
      URL.revokeObjectURL(url);
      out.width && out.height && Number.isFinite(out.seconds) ? resolve(out) : reject(new Error("unreadable"));
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    v.src = url;
  });
}

export function imageFacts(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

/** PUT to the presigned URL with progress (fetch has no upload progress). */
export function putWithProgress(url: string, headers: Record<string, string>, file: Blob, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("upload network"));
    xhr.send(file);
  });
}

/** "YYYY-MM-DDTHH:mm" in Asia/Bangkok (UTC+7, no DST) → ISO UTC. */
export function bangkokLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5]);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** ISO → "YYYY-MM-DDTHH:mm" in Asia/Bangkok, for <input type="datetime-local">. */
export function isoToBangkokLocal(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  return d.toISOString().slice(0, 16);
}
