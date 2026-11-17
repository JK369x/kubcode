// Frame-by-frame render: headless Chromium draws each frame, FFmpeg encodes.
// Usage: node render.mjs example out.mp4 [--sheet]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
const [dir = "example", out = "out.mp4"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const sheet = process.argv.includes("--sheet");
const root = resolve(".");
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(root)) throw 0;
    res.writeHead(200, { "content-type": { ".js": "text/javascript", ".html": "text/html" }[extname(p)] ?? "application/octet-stream" });
    res.end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`http://127.0.0.1:${port}/${dir}/index.html?t=0`);
await page.waitForFunction(() => window.__ready);
await page.evaluate(() => document.fonts.ready);
const { DURATION, FPS } = await page.evaluate(() => window.__meta);
if (sheet) {
  const times = (process.env.SHEET_AT ?? '1,4.5,7.5,10.8').split(',').map(Number);
  for (const t of times) {
    await page.evaluate((x) => window.__frame(x), t);
    await page.locator("canvas").screenshot({ path: `${out.replace(/\.mp4$/, "")}-t${t}.png` });
  }
} else {
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", out], { stdio: ["pipe", "inherit", "inherit"] });
  const n = Math.round(DURATION * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => window.__frame(x), i / FPS);
    ff.stdin.write(await page.locator("canvas").screenshot({ type: "png" }));
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));
}
await browser.close(); server.close();
console.log("done", out);
