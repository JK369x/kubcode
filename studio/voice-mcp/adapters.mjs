// Provider HTTP contracts are isolated for offline mock testing. Not exposed by MCP.
const endpoints={google:'https://texttospeech.googleapis.com/v1',elevenlabs:'https://api.elevenlabs.io'}
function credential(secret){if(typeof secret!=='string'||!secret.trim()) throw Error('Provider credential required')}
async function request(fetchImpl,url,opts){let r;try{r=await fetchImpl(url,opts)}catch{throw Error('Provider request failed or cancelled; no automatic retry')};if(!r.ok) throw Error(`Provider request failed (${r.status}); no automatic retry`);return r}
export async function discoverVoices(provider,{secret,fetchImpl=fetch,signal,next}={}){
 credential(secret)
 if(provider==='google') {const r=await request(fetchImpl,`${endpoints.google}/voices?languageCode=th-TH`,{headers:{Authorization:`Bearer ${secret}`},signal});const j=await r.json();return {voices:(j.voices||[]).map(v=>({id:v.name,languages:v.languageCodes||[],gender:v.ssmlGender||null})),next:null}}
 if(provider==='elevenlabs'){if(next!==undefined&&(typeof next!=='string'||next.length>500))throw Error('Invalid page token');const query=new URLSearchParams({page_size:'100'});if(next)query.set('next_page_token',next);const r=await request(fetchImpl,`${endpoints.elevenlabs}/v2/voices?${query}`,{headers:{'xi-api-key':secret},signal});const j=await r.json();return {voices:(j.voices||[]).map(v=>({id:v.voice_id,name:v.name})),next:j.next_page_token||null}}
 throw Error('Unsupported provider')
}
export async function discoverElevenModels({secret,fetchImpl=fetch,signal}={}){credential(secret);const r=await request(fetchImpl,`${endpoints.elevenlabs}/v1/models`,{headers:{'xi-api-key':secret},signal});const data=await r.json();if(!Array.isArray(data))throw Error('Invalid model response');return data.map(m=>({id:m.model_id,name:m.name,languages:m.languages||[]}))}
// Intentionally unavailable from MCP; payment approval UX is not implemented.
export async function synthesizeForFutureIntegration(provider,{secret,text,voiceId,language,model,approval,fetchImpl=fetch,signal}){
 if(approval!==true) throw Error('Explicit user approval is required')
 credential(secret);if(typeof text!=='string'||!text.trim()||[...text].length>1500) throw Error('Invalid text')
 if(provider==='google'){
  if(!/^th-TH-[A-Za-z0-9-]+$/.test(voiceId)||language!=='th-TH') throw Error('Invalid Google voice/language')
  const r=await request(fetchImpl,`${endpoints.google}/text:synthesize`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({input:{text},voice:{languageCode:language,name:voiceId},audioConfig:{audioEncoding:'MP3'}}),signal});const j=await r.json();if(typeof j.audioContent!=='string'||!j.audioContent)throw Error('Provider returned no audio');return {audio:Buffer.from(j.audioContent,'base64'),format:'mp3',alignment:'none'}
 }
 if(provider==='elevenlabs'){
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(voiceId)||!/^eleven_[a-z0-9_]+$/.test(model||'')) throw Error('Invalid ElevenLabs voice/model')
  const r=await request(fetchImpl,`${endpoints.elevenlabs}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':secret,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:model}),signal});return {audio:Buffer.from(await r.arrayBuffer()),format:'mp3',alignment:'none'}
 }
 throw Error('Unsupported provider')
}
