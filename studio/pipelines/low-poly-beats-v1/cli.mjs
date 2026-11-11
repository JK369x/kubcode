import {popMarkup,originalPopCSS} from './subtitles.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {normalizePlan} from './core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function loadPlan(file){const raw=await fs.readFile(file,'utf8');return {plan:normalizePlan(JSON.parse(raw)),sha:createHash('sha256').update(raw).digest('hex')}}
export async function checkMedia(plan,dir){
 const root=await fs.realpath(dir),files=new Map();
 for(const a of [...plan.audio,...plan.sounds]){
  const file=await fs.realpath(path.join(dir,a.file));if(!file.startsWith(root+path.sep))throw Error('media symlink escapes plan directory');if(!(await fs.stat(file)).isFile())throw Error('media is not a file');
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file],{encoding:'utf8',timeout:10000});if(probe.status!==0)throw Error('cannot probe '+a.file);const data=JSON.parse(probe.stdout);if(!data.streams.some(x=>x.codec_type==='audio')||Number(data.format.duration)+.04<a.duration)throw Error('media duration/stream invalid '+a.file);files.set(a.file,file);
 }
 return files;
}
export function captionMarkup(plan){
 const palette={amber:'#f2c35b',coral:'#ff8271',cyan:'#87dbd6'};let html='',script='';
 for(const c of plan.captions){
  let words,unitScript='';const progressive=plan.captionTreatment==='original-thai-pop';
  if(progressive){const x=popMarkup(c,esc,palette[c.accent]);words=x.words;unitScript=x.script}
  else {const i=c.thai.indexOf(c.highlight);words=esc(c.thai.slice(0,i))+`<strong id="key-${c.id}" class="keyword">${esc(c.highlight)}</strong>`+esc(c.thai.slice(i+c.highlight.length))}
  html+=`<div id="cue-${c.id}" class="clip caption-slot" data-start="${c.start}" data-duration="${c.end-c.start}" data-track-index="1" style="top:${c.y}px"><div id="body-${c.id}" class="caption-body"><span class="caption-th" lang="th">${words}</span><span class="caption-en" lang="en">${esc(c.english)}</span></div></div>`;
  script+=`tl.fromTo('#body-${c.id}',{opacity:0},{opacity:1,duration:.08,ease:'none'},${c.start});`+unitScript;
  if(!progressive)script+=`tl.to('#key-${c.id}',{color:'${palette[c.accent]}',duration:.06,ease:'none'},${c.keywordAt});`;
  script+=`tl.to('#body-${c.id}',{opacity:0,duration:.08},${c.end-.08});`;
 }
 return {html,script};
}
export async function build(file,out){
 const {plan:p,sha}=await loadPlan(file),media=await checkMedia(p,path.dirname(path.resolve(file)));await fs.mkdir(out);await fs.cp(path.join(here,'assets'),path.join(out,'assets'),{recursive:true});await fs.mkdir(path.join(out,'compositions'));
 for(const [rel,src] of media){const dest=path.join(out,rel);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(src,dest)}
 await fs.copyFile(path.join(here,'core.mjs'),path.join(out,'assets/plan-core.mjs'));await fs.copyFile(path.join(here,'subtitles.mjs'),path.join(out,'assets/subtitles.mjs'));await fs.writeFile(path.join(out,'assets/beat-plan.mjs'),'export const plan='+JSON.stringify(p)+';\n');
 const [rig,set,adapter]=await Promise.all(['rig.js','mall-set.js','adapter.js'].map(f=>fs.readFile(path.join(here,f),'utf8')));
 await fs.writeFile(path.join(out,'assets/world.js'),`import {plan} from './beat-plan.mjs';import {stateAt} from './plan-core.mjs';\n`+rig+'\n'+set+'\n'+adapter);
 const D=p.duration;const {html,script}=captionMarkup(p);
 const css=`#root{position:absolute;inset:0;width:1080px;height:1920px;pointer-events:none}.caption-slot{position:absolute;left:108px;right:150px;text-align:center}.caption-body{display:inline-block;max-width:100%;padding:5px 12px 7px;background:#061017bd;border-radius:3px}.caption-th{display:block;color:#fffaf0;font:600 65px/1.22 TerminalThai;-webkit-text-stroke:5px #091016;paint-order:stroke fill;text-shadow:0 3px 2px #04090c}.keyword{display:inline-block;font-weight:600;color:#fffaf0}.caption-en{display:block;margin:8px auto 0;color:#e5e7df;font:600 30px/1.2 TerminalThai;letter-spacing:.7px}.episode-mark{position:absolute;left:86px;top:195px;font:600 30px TerminalThai;color:#d0c6a8;background:#0a151bb8;padding:4px 10px}`;
 await fs.writeFile(path.join(out,'compositions/captions.html'),`<!doctype html><html><body><template><style>${css}${p.captionTreatment==='original-thai-pop'?originalPopCSS:''}</style><div id="root" data-composition-id="captions" data-start="0" data-duration="${D}" data-width="1080" data-height="1920"><div id="episode-mark" class="episode-mark">${esc(p.title)}</div>${html}</div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});${script}tl.to({t:0},{t:${D},duration:${D},ease:'none'},0);window.__timelines.captions=tl;</script></template></body></html>`);
 await fs.writeFile(path.join(out,'compositions/stage.html'),`<!doctype html><html><body><template><style>#root,canvas{position:absolute;inset:0;width:1080px;height:1920px}#shade{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 30%,#020b144d 90%);pointer-events:none}</style><div id="root" data-composition-id="stage" data-start="0" data-duration="${D}" data-width="1080" data-height="1920"><canvas id="stage-canvas" width="1080" height="1920" data-layout-allow-overflow></canvas><div id="shade"></div></div><script>window.__timelines=window.__timelines||{};const clock={t:0},tl=gsap.timeline({paused:true});tl.to(clock,{t:${D},duration:${D},ease:'none',onUpdate:()=>window.renderFilm?.(clock.t)});window.__timelines.stage=tl;window.__hf=window.__hf||{};window.__hf.buildReady=new Promise(resolve=>window.resolveFilm=resolve);</script><script type="module" src="assets/world.js"></script></template></body></html>`);
 let body=`<div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="1080" data-height="1920" data-fps="30">`;
 for(const [i,n] of ['stage','captions'].entries())body+=`<div id="host-${n}" class="clip" data-composition-id="${n}" data-composition-src="compositions/${n}.html" data-start="0" data-duration="${D}" data-width="1080" data-height="1920" data-track-index="${i+1}" data-track-kind="${i?'captions':'graphics'}" style="z-index:${i+1}"></div>`;
 for(const [i,a] of [...p.audio,...p.sounds.map(s=>({...s,start:s.at}))].entries())body+=`<audio id="audio-${a.id}" class="clip" src="${a.file}" data-start="${a.start}" data-duration="${a.duration}" data-track-index="${i+3}" data-track-kind="audio" data-volume="${a.volume}"></audio>`;
 body+=`</div><script>window.__timelines={};const tl=gsap.timeline({paused:true});tl.to({t:0},{t:${D},duration:${D},ease:'none'});window.__timelines.main=tl;</script>`;
 await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="th"><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>@font-face{font-family:TerminalThai;src:url('assets/fonts/ChakraPetch-SemiBold.ttf');font-weight:600}@font-face{font-family:TerminalLatin;src:url('assets/fonts/VT323-Regular.ttf')}html,body{margin:0;width:1080px;height:1920px;overflow:hidden}#root{position:relative;width:1080px;height:1920px}.clip{position:absolute;inset:0}</style></head><body>${body}</body></html>`);
 await fs.writeFile(path.join(out,'hyperframes.json'),JSON.stringify({paths:{assets:'assets',blocks:'compositions'},authoringSkill:'jk-low-poly-beats'},null,2));await fs.writeFile(path.join(out,'BUILD.json'),JSON.stringify({pipeline:'low-poly-beats-v1',scene:p.scene,planSha256:sha,duration:D,beats:p.beats.length,captions:p.captions.length,silent:!p.audio.length,source:path.resolve(file)},null,2));return {out,sha,duration:D};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const [cmd,file,out]=process.argv.slice(2);if(!['check','build'].includes(cmd)||!file)throw Error('Usage: cli.mjs check PLAN | build PLAN NEW_OUTPUT_DIR');if(cmd==='check'){const {plan,sha}=await loadPlan(file);await checkMedia(plan,path.dirname(path.resolve(file)));console.log(JSON.stringify({ok:true,sha,duration:plan.duration}))}else{if(!out)throw Error('new output directory required');console.log(JSON.stringify(await build(file,out)))}}catch(e){console.error(e.message);process.exitCode=1}}
