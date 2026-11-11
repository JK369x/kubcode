// Render one composition to H.264 + AAC: node render.mjs <CompositionId> <out.mp4>
// Remotion downloads its own chrome-headless-shell for the current platform on first use.
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [id, out] = process.argv.slice(2);
if (!id || !out) throw new Error('Usage: node render.mjs <CompositionId> <out.mp4>');
const serveUrl = await bundle({ entryPoint: path.join(here, 'src/index.ts') });
const composition = await selectComposition({ serveUrl, id });
let last = -1;
await renderMedia({
  serveUrl, composition, codec: 'h264', audioCodec: 'aac', crf: 20, concurrency: 2, outputLocation: path.resolve(out),
  onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; console.log('progress', p * 10); } },
});
console.log('done', out);
