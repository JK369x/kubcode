import test from 'node:test'
import assert from 'node:assert/strict'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {createServer} from './server.mjs'
import {discoverVoices,synthesizeForFutureIntegration} from './adapters.mjs'
import {randomUUID} from 'node:crypto'
const json=r=>JSON.parse(r.content[0].text)
test('SDK MCP supports discovery, idempotent prepare, cancel and shot-plan inspection without synthesis',async()=>{
 const [c,s]=InMemoryTransport.createLinkedPair();const server=createServer();const client=new Client({name:'test',version:'1'});await Promise.all([server.connect(s),client.connect(c)]);
 try{const listing=await client.listTools();assert.ok(listing.tools.some(t=>t.name==='prepare_voice_job'));assert.ok(!listing.tools.some(t=>t.name==='generate_voice'));
 const voices=json(await client.callTool({name:'list_voices',arguments:{provider:'google'}}));assert.equal(voices.voices[0].language,'th-TH');
 const req={requestId:randomUUID(),provider:'google',voiceId:'th-TH-Chirp3-HD-Charon',language:'th-TH',segments:[{id:'shot-1',text:'ทดสอบ'}]};const a=await client.callTool({name:'prepare_voice_job',arguments:req});assert.equal(json(a).status,'awaiting_user_approval_not_executable');assert.deepEqual(json(await client.callTool({name:'prepare_voice_job',arguments:req})),json(a));
 const conflict=await client.callTool({name:'prepare_voice_job',arguments:{...req,segments:[{id:'shot-1',text:'เปลี่ยน'}]}});assert.equal(conflict.isError,true);
 await client.callTool({name:'cancel_voice_job',arguments:{requestId:req.requestId}});assert.equal(json(await client.callTool({name:'voice_job_status',arguments:{requestId:req.requestId}})).status,'cancelled');
 const bad=await client.callTool({name:'inspect_shot_plan',arguments:{slug:'../../secret'}});assert.equal(bad.isError,true);
 const good=await client.callTool({name:'inspect_shot_plan',arguments:{slug:'window-choice-v1'}});assert.equal(json(good).segments[0].id,'shot-1');
 }finally{await client.close();await server.close()}
})
test('provider discovery and synthesis use mock only, fail closed without approval, and never silently retry',async()=>{
 const calls=[];const fake=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>url.includes('/voices')?{voices:[{name:'th-TH-Standard-A',languageCodes:['th-TH']}]}:{audioContent:Buffer.from('fake').toString('base64')},arrayBuffer:async()=>Buffer.from('fake')}};
 const v=await discoverVoices('google',{secret:'mock',fetchImpl:fake});assert.equal(v.voices[0].id,'th-TH-Standard-A');
 await assert.rejects(synthesizeForFutureIntegration('google',{secret:'mock',text:'hello',voiceId:'th-TH-Standard-A',language:'th-TH',approval:false,fetchImpl:fake}));assert.equal(calls.length,1);
 const g=await synthesizeForFutureIntegration('google',{secret:'mock',text:'hello',voiceId:'th-TH-Standard-A',language:'th-TH',approval:true,fetchImpl:fake});assert.equal(g.audio.toString(),'fake');
 const e=await synthesizeForFutureIntegration('elevenlabs',{secret:'mock',text:'hello',voiceId:'voice1',model:'eleven_v3',approval:true,fetchImpl:fake});assert.equal(e.audio.toString(),'fake');
 await assert.rejects(synthesizeForFutureIntegration('elevenlabs',{secret:'mock',text:'x',voiceId:'../bad',model:'eleven_v3',approval:true,fetchImpl:fake}));assert.equal(calls.length,3)
})
test('local stdio server lists tools and returns no credential values',async()=>{
 const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');const transport=new StdioClientTransport({command:process.execPath,args:[new URL('./server.mjs',import.meta.url).pathname],env:{PATH:process.env.PATH,ELEVENLABS_API_KEY:'mock-secret'}});const client=new Client({name:'stdio-test',version:'1'});await client.connect(transport);try{const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='list_voices'));const r=await client.callTool({name:'list_voice_providers',arguments:{}});const raw=JSON.stringify(r);assert.ok(!raw.includes('mock-secret'));assert.ok(raw.includes('present_unverified'))}finally{await client.close()}
})
test('ElevenLabs discovery follows opaque pagination and model data via mock transport',async()=>{
 const {discoverElevenModels}=await import('./adapters.mjs');const urls=[];const fake=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/v1/models')?[{model_id:'eleven_v3',name:'v3',languages:[{language_id:'th'}]}]:{voices:[{voice_id:'id',name:'Mock'}],next_page_token:'next'}}};
 const v=await discoverVoices('elevenlabs',{secret:'mock',next:'abc+123',fetchImpl:fake});assert.equal(v.next,'next');assert.ok(urls[0].includes('abc%2B123'));const m=await discoverElevenModels({secret:'mock',fetchImpl:fake});assert.equal(m[0].languages[0].language_id,'th');
 await assert.rejects(discoverElevenModels({secret:'mock',fetchImpl:async()=>{throw Error('secret')}}),/Provider request failed/)
})
