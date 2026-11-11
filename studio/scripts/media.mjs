// Local media root. Large or private binaries (example MP4s, voice WAVs,
// licensed SFX, reference kits) are not tracked in Git; they live in a
// git-ignored folder, by default `<repo>/media` next to `studio/`.
// Override with STUDIO_MEDIA_ROOT. See docs/media.md.
import path from 'node:path';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const studioRoot=fileURLToPath(new URL('../',import.meta.url));
export const mediaExt=/\.(mp4|mov|webm|wav|mp3|m4a)$/i;

export function mediaRoot(env=process.env,root=studioRoot){
 return path.resolve(env.STUDIO_MEDIA_ROOT||path.join(root,'..','media'));
}

const exists=async p=>{try{await access(p);return true}catch{return false}};

// Resolve a style-relative ref: the style folder first, then
// <media>/studio-examples/<style>/<ref>. Returns null when not found.
export async function resolveStyleRef(styleDir,styleIdValue,ref,env=process.env,root=studioRoot){
 const local=path.join(styleDir,ref);
 if(await exists(local))return local;
 const media=path.join(mediaRoot(env,root),'studio-examples',styleIdValue,ref);
 if(await exists(media))return media;
 return null;
}
