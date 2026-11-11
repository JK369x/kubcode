import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadLibrary,addStyle} from '../scripts/library.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('a selected style cannot silently lose its approved reference asset',async()=>{
 const dir=await mkdtemp(root+'.test-');
 try{
  await mkdir(dir+'/styles/soft',{recursive:true});
  await writeFile(dir+'/styles/soft/style.json',JSON.stringify({id:'soft',name:'Soft',status:'selected',version:'2',direction:'STYLE.md',preview:'missing.png',source:'scene.svg',components:[]}));
  await writeFile(dir+'/styles/soft/STYLE.md','Direction');
  await writeFile(dir+'/styles/soft/scene.svg','<svg/>');
  await assert.rejects(loadLibrary(dir),/missing.png/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('adding a style creates a discoverable draft and never overwrites an existing style',async()=>{
 const dir=await mkdtemp(root+'.test-');
 try{
  await addStyle(dir,'paper-noir');
  const styles=await loadLibrary(dir);
  assert.equal(styles[0].id,'paper-noir');assert.equal(styles[0].status,'draft');
  assert.equal(styles[0].preview,null);
  await assert.rejects(addStyle(dir,'paper-noir'),/EEXIST/);
  await assert.rejects(addStyle(dir,'../escape'),/Invalid style id/);
  assert.equal((await loadLibrary(dir)).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a listed motion example must exist instead of leaving a broken preview link',async()=>{
 const dir=await mkdtemp(root+'.test-');
 try{
  await addStyle(dir,'urban');
  await writeFile(dir+'/styles/urban/style.json',JSON.stringify({id:'urban',name:'Urban',status:'draft',version:'0.1',direction:'STYLE.md',video:'missing.mp4',components:[]}));
  const env={STUDIO_MEDIA_ROOT:dir+'/media'};
  await assert.rejects(loadLibrary(dir,{strictMedia:true,env}),/missing.mp4/);
  const warnings=[];
  assert.equal((await loadLibrary(dir,{strictMedia:false,env,warnings})).length,1);
  assert.match(warnings[0],/urban\/missing.mp4/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('example media resolves from the git-ignored media root',async()=>{
 const dir=await mkdtemp(root+'.test-');
 try{
  await addStyle(dir,'urban');
  await writeFile(dir+'/styles/urban/style.json',JSON.stringify({id:'urban',name:'Urban',status:'draft',version:'0.1',direction:'STYLE.md',video:'examples/city/demo.mp4',components:[]}));
  await mkdir(dir+'/media/studio-examples/urban/examples/city',{recursive:true});
  await writeFile(dir+'/media/studio-examples/urban/examples/city/demo.mp4','fixture');
  const warnings=[];
  assert.equal((await loadLibrary(dir,{strictMedia:true,env:{STUDIO_MEDIA_ROOT:dir+'/media'},warnings})).length,1);
  assert.deepEqual(warnings,[]);
  await assert.rejects(loadLibrary(dir,{strictMedia:true,env:{STUDIO_MEDIA_ROOT:dir+'/elsewhere'}}),/demo.mp4/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('media refs still may not escape the style',async()=>{
 const dir=await mkdtemp(root+'.test-');
 try{
  await addStyle(dir,'urban');
  await writeFile(dir+'/styles/urban/style.json',JSON.stringify({id:'urban',name:'Urban',status:'draft',version:'0.1',direction:'STYLE.md',video:'../x.mp4',components:[]}));
  await assert.rejects(loadLibrary(dir,{strictMedia:false,env:{}}),/inside style/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a style-specific caption preset must exist',async()=>{
 const dir=await mkdtemp(root+'.test-');
 try{
  await addStyle(dir,'terminal');
  await writeFile(dir+'/styles/terminal/style.json',JSON.stringify({id:'terminal',name:'Terminal',status:'draft',version:'0.1',direction:'STYLE.md',captions:'missing.json'}));
  await assert.rejects(loadLibrary(dir),/missing.json/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
