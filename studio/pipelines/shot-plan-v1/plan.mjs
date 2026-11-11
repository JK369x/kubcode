import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const allowed=(obj, keys, name)=>{if(!obj || typeof obj!=='object' || Array.isArray(obj)) throw Error(`${name}: expected object`); for(const k of Object.keys(obj)) if(!keys.includes(k)) throw Error(`${name}: unknown field ${k}`)}
const finite=(v,min,max,name)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max) throw Error(`${name}: must be ${min}..${max}`)}
const caption=(v,max,name)=>{if(typeof v!=='string'||![...v].length||[...v].length>max||/[<>\u0000-\u001f\u007f]/u.test(v)) throw Error(`${name}: invalid text (max ${max}, no markup/control characters)`)}
export async function validatePlan(plan, planDir) {
 allowed(plan,['version','title','scene','duration','shots','audio'],'plan')
 if(plan.version!==1 || plan.scene!=='jk-window') throw Error('Only version 1 and scene jk-window are supported')
 caption(plan.title,80,'title'); finite(plan.duration,2,60,'duration')
 if(!Array.isArray(plan.shots)||plan.shots.length<1||plan.shots.length>20) throw Error('shots: expected 1..20 shots')
 let cursor=0
 for(const [i,s] of plan.shots.entries()) {
  allowed(s,['start','end','camera','effect','caption'],`shot ${i}`)
  finite(s.start,0,plan.duration,`shot ${i} start`);finite(s.end,0,plan.duration,`shot ${i} end`)
  if(Math.abs(s.start-cursor)>0.001 || s.end-s.start<0.8) throw Error(`shot ${i}: shots must be contiguous and at least 0.8s`)
  if(!['wide','hero','window'].includes(s.camera)) throw Error(`shot ${i}: unsupported camera`)
  if(!['none','blink','latch','hand'].includes(s.effect)) throw Error(`shot ${i}: unsupported effect`)
  allowed(s.caption,['thai','english','highlight'],`shot ${i} caption`);caption(s.caption.thai,70,'Thai caption');caption(s.caption.english,90,'English caption')
  if(typeof s.caption.highlight!=='string'||!s.caption.highlight||!s.caption.thai.includes(s.caption.highlight)) throw Error(`shot ${i}: highlight must occur in Thai caption`)
  cursor=s.end
 }
 if(Math.abs(cursor-plan.duration)>0.001) throw Error('shots must cover entire duration')
 let audio=null
 if(plan.audio!==undefined){
  allowed(plan.audio,['file','start','volume'],'audio');finite(plan.audio.start,0,plan.duration,'audio start');finite(plan.audio.volume,0,1,'audio volume')
  if(typeof plan.audio.file!=='string'||!/^assets\/[a-zA-Z0-9_-]+\.(wav|mp3)$/.test(plan.audio.file)) throw Error('audio file must be assets/<simple-name>.wav or .mp3')
  const root=await realpath(planDir);const dir=await realpath(path.join(planDir,'assets'));const file=await realpath(path.join(planDir,plan.audio.file))
  if(!dir.startsWith(root+path.sep)) throw Error('audio assets directory escapes plan directory')
  if(!file.startsWith(dir+path.sep)) throw Error('audio path escapes assets directory')
  if(!(await stat(file)).isFile()) throw Error('audio is not a file')
  const probe=spawnSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_type:format=duration','-of','json',file],{encoding:'utf8',timeout:10000})
  if(probe.error||probe.status!==0) throw Error('could not probe audio')
  let data;try{data=JSON.parse(probe.stdout)}catch{throw Error('invalid audio probe')}
  const duration=Number(data.format?.duration)
  if(!data.streams?.some(s=>s.codec_type==='audio')||!Number.isFinite(duration)||duration<=0||plan.audio.start+duration>plan.duration+0.01) throw Error('audio duration/stream invalid or exceeds composition')
  audio={file,duration,extension:path.extname(file).toLowerCase()}
 }
 return {audio}
}
