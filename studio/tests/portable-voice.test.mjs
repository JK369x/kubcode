import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import path from 'node:path';
const run=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const mediaVoice=path.join(process.env.STUDIO_MEDIA_ROOT||path.join(root,'..','media'),'voice','narrator-reference.wav');
test('Thai narrator dry-run works after relocating the bundle without the original workspace',{skip:!existsSync(mediaVoice)&&'narrator reference WAV is local-only media (media/voice/)'},async()=>{
 const dir=await mkdtemp(root+'.test-clone-');
 try{
  await cp(root+'shared/voice',dir+'/voice',{recursive:true});
  await cp(mediaVoice,dir+'/voice/assets/narrator-reference.wav');
  await writeFile(dir+'/lines.json',JSON.stringify([{id:'hook',text:'ทดสอบเสียงไทย'}]));
  const profile=JSON.parse(await readFile(dir+'/voice/assets/narrator-profile.json','utf8'));
  assert.equal(profile.model_cache_path,undefined,'No machine-specific cache path in distributed profile');
  const {stdout}=await run('python3',[dir+'/voice/scripts/narrate.py','--lines',dir+'/lines.json','--out',dir+'/out','--dry-run'],{env:{...process.env,NARRATOR_MODEL_PATH:dir+'/model',NARRATOR_REFERENCE_PATH:'',STUDIO_MEDIA_ROOT:dir+'/no-media'}});
  const plan=JSON.parse(stdout);
  assert.equal(plan.voice_profile,'approved-calm-male-v1');
  assert.equal(plan.model_path,dir+'/model');
  assert.ok(plan.reference_path.startsWith(dir+'/voice/'));
  assert.equal(plan.offline,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Thai narrator refuses to run without the approved reference instead of substituting a voice',async()=>{
 const dir=await mkdtemp(root+'.test-clone-');
 try{
  await cp(root+'shared/voice',dir+'/voice',{recursive:true,filter:src=>!src.endsWith('.wav')});
  await writeFile(dir+'/lines.json',JSON.stringify([{id:'hook',text:'ทดสอบ'}]));
  await assert.rejects(run('python3',[dir+'/voice/scripts/narrate.py','--lines',dir+'/lines.json','--out',dir+'/out','--dry-run'],{env:{...process.env,NARRATOR_REFERENCE_PATH:'',STUDIO_MEDIA_ROOT:dir+'/no-media'}}),/reference WAV not found/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
