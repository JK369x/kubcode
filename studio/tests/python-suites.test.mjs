// Runs the offline Python suites (what-if host pipeline, ElevenLabs narration helper) under `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
for(const dir of ['pipelines/what-if-host','shared/voice']){
 test('python unittest: '+dir,async()=>{
  const {stderr}=await run('python3',['-m','unittest','discover','-s','tests'],{cwd:root+dir,env:{...process.env,ELEVENLABS_API_KEY:'',ELEVENLABS_VOICE_NAME:''}});
  assert.match(stderr,/\nOK/);
 });
}
test('the What If kit uses the same voice-by-name helper as shared/voice',async()=>{
 const a=await readFile(root+'shared/voice/scripts/elevenlabs_voice.py','utf8');
 const b=await readFile(root+'styles/freshstack-what-if/kit/scripts/elevenlabs_voice.py','utf8');
 assert.equal(b,a);
 const voice=await readFile(root+'styles/freshstack-what-if/kit/scripts/voice.py','utf8');
 assert.match(voice,/resolve_voice\(api, V\['name'\]\)/);
 assert.doesNotMatch(voice,/'id': '[A-Za-z0-9]{20}'/);
});
