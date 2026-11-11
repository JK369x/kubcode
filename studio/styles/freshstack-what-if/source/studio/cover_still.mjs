// Render one full-size frame of a composition for a cover background: node cover_still.mjs <CompositionId> <frame> <out.png>
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [id, frame, out] = process.argv.slice(2);
if (!id || !frame || !out) throw new Error('Usage: node cover_still.mjs <CompositionId> <frame> <out.png>');
const serveUrl = await bundle({ entryPoint: path.join(here, 'src/index.ts') });
const composition = await selectComposition({ serveUrl, id });
await renderStill({ serveUrl, composition, frame: Number(frame), output: path.resolve(out), scale: 1 });
console.log('cover still', out);
