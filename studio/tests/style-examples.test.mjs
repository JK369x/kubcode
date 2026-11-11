import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,symlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadLibrary,addStyle} from '../scripts/library.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('author examples reject missing attribution and duplicate ids',async()=>{
 const dir=await mkdtemp(root+'.test-');
 try{
  const base=await addStyle(dir,'paired');await writeFile(base+'/clip.mp4','fixture');
  const item={id:'paired',name:'Paired',status:'draft',version:'1',direction:'STYLE.md'};
  for(const examples of [[{id:'claude',video:'clip.mp4'}],[{id:'claude',label:'Claude',author:'Claude Code',video:'clip.mp4'},{id:'claude',label:'Again',author:'Codex',video:'clip.mp4'}]]){
   await writeFile(base+'/style.json',JSON.stringify({...item,examples}));
   await assert.rejects(loadLibrary(dir),/Invalid example/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('every author-specific example must resolve to a real file inside its style',async()=>{
 const dir=await mkdtemp(root+'.test-');
 try{
  const base=await addStyle(dir,'paired');
  await writeFile(base+'/style.json',JSON.stringify({id:'paired',name:'Paired',status:'draft',version:'1',direction:'STYLE.md',examples:[{id:'claude',label:'Claude',author:'Claude Code',model:'claude-opus-5-5',video:'missing.mp4'}]}));
  await assert.rejects(loadLibrary(dir,{strictMedia:true,env:{STUDIO_MEDIA_ROOT:dir+'/media'}}),/missing.mp4/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
