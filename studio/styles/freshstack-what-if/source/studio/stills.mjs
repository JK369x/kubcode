// Render selected frames of one composition to PNG for QA: node stills.mjs <CompositionId> <out_dir> f1 f2 ...
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [id, outDir, ...frames] = process.argv.slice(2);
if (!id || !outDir || !frames.length) throw new Error('Usage: node stills.mjs <CompositionId> <out_dir> <frame>...');
const serveUrl = await bundle({ entryPoint: path.join(here, 'src/index.ts') });
const composition = await selectComposition({ serveUrl, id });
for (const fr of frames) {
  await renderStill({ serveUrl, composition, frame: Number(fr), output: path.join(path.resolve(outDir), `f${fr}.png`), scale: 0.5 });
  console.log('still', fr);
}
