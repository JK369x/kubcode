import {readdir,readFile,access,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {mediaExt,resolveStyleRef} from './media.mjs';
export const styleId=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Media refs (mp4/wav/mp3…) may live in the git-ignored media root instead of
// the style folder. A missing media file is a warning unless strictMedia is set
// (option, or STUDIO_STRICT_MEDIA=1). Every other ref must exist.
export async function loadLibrary(root,{strictMedia=process.env.STUDIO_STRICT_MEDIA==='1',env=process.env,warnings=[]}={}){
 const base=path.join(root,'styles');
 const dirs=await readdir(base,{withFileTypes:true});
 const styles=[];
 for(const entry of dirs.filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
  const dir=path.join(base,entry.name);
  const item=JSON.parse(await readFile(path.join(dir,'style.json'),'utf8'));
  if(!styleId.test(item.id)||item.id!==entry.name)throw Error('Invalid style id: '+entry.name);
  if(!item.name||!item.version||!['draft','selected','retired'].includes(item.status))throw Error('Invalid metadata: '+entry.name);
  if(item.status==='selected'&&(!item.preview||!item.source))throw Error('Selected style needs preview and source: '+item.id);
  if(item.examples!==undefined&&!Array.isArray(item.examples))throw Error('Invalid examples: '+item.id);
  const exampleIds=new Set();
  for(const e of item.examples??[]){
   if(!e||!styleId.test(e.id??'')||!e.label||!e.author||!e.video||exampleIds.has(e.id))throw Error('Invalid example: '+item.id);
   exampleIds.add(e.id);
  }
  for(const ref of [item.direction,item.preview,item.source,item.video,item.example,item.captions,...(item.components??[]),...(item.examples??[]).map(e=>e.video)]){
   if(!ref)continue;
   if(path.isAbsolute(ref)||ref.split(/[\\/]/).includes('..'))throw Error('Asset must stay inside style: '+ref);
   if(mediaExt.test(ref)){
    if(await resolveStyleRef(dir,item.id,ref,env,root))continue;
    if(strictMedia)throw Error('Missing media: '+entry.name+'/'+ref);
    warnings.push('media not present locally: '+entry.name+'/'+ref);
    continue;
   }
   await access(path.join(dir,ref));
  }
  if(!item.direction)throw Error('Style needs direction: '+item.id);
  styles.push(item);
 }
 return styles;
}

export async function addStyle(root,id){
 if(!styleId.test(id))throw Error('Invalid style id: '+id);
 const base=path.join(root,'styles');await mkdir(base,{recursive:true});
 const dir=path.join(base,id);await mkdir(dir);
 await writeFile(path.join(dir,'style.json'),JSON.stringify({id,name:id,status:'draft',version:'0.1',direction:'STYLE.md',preview:null,source:null,components:[]},null,2)+'\n');
 await writeFile(path.join(dir,'STYLE.md'),'# '+id+'\n\nStatus: draft; no visual approval yet.\n\n## Direction\nDescribe the intended shapes, materials, lighting and palette.\n\n## Evidence\nAdd an original still and editable source, then set preview/source in style.json. Record the actual user selection before changing status to selected.\n');
 return dir;
}
