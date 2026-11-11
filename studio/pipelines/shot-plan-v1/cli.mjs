import {readFile,writeFile,mkdir,copyFile,realpath} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {validatePlan} from './plan.mjs'
const root=fileURLToPath(new URL('../../',import.meta.url));const here=fileURLToPath(new URL('./',import.meta.url))
async function main(){
 const [mode,input,slug,...extra]=process.argv.slice(2)
 if(!['check','build'].includes(mode)||!input||extra.length||(mode==='check'&&slug)||(mode==='build'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug||''))) throw Error('Usage: node pipelines/shot-plan-v1/cli.mjs check PLAN.json | build PLAN.json lowercase-slug')
 const planPath=await realpath(input); const raw=await readFile(planPath,'utf8'); if(Buffer.byteLength(raw)>100000) throw Error('Plan exceeds 100 KB')
 let plan;try{plan=JSON.parse(raw)}catch{throw Error('Plan is not valid JSON')}
 const {audio}=await validatePlan(plan,path.dirname(planPath));
 if(mode==='check'){console.log(`Valid: ${plan.title}; ${plan.duration}s; ${audio?'audio supplied':'silent'}`);return}
 const base=path.join(root,'outputs','shot-plan-v1');await mkdir(base,{recursive:true});const actualBase=await realpath(base);const actualRoot=await realpath(root)
 if(!actualBase.startsWith(actualRoot+path.sep)) throw Error('Output directory escapes repository')
 const dest=path.join(actualBase,slug);await mkdir(dest);await mkdir(path.join(dest,'assets'))
 const source=await readFile(path.join(root,'styles/jk-soft-story/examples/motion/index.html'),'utf8');const svg=source.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];if(!svg) throw Error('Built-in scene SVG not found')
 await copyFile(path.join(root,'styles/jk-soft-story/examples/motion/assets/gsap.min.js'),path.join(dest,'assets','gsap.min.js'))
 await copyFile(path.join(here,'runtime.js'),path.join(dest,'runtime.js'))
 let audioTag='';if(audio){await copyFile(audio.file,path.join(dest,'assets','voice'+audio.extension));audioTag=`<audio id="voice" src="assets/voice${audio.extension}" data-start="${plan.audio.start}" data-duration="${audio.duration}" data-track-index="8" data-volume="${plan.audio.volume}"></audio>`}
 const data=JSON.stringify(plan).replace(/</g,'\\u003c')
 const html=`<!doctype html><html lang="th"><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden}#root{position:relative;width:1920px;height:1080px;overflow:hidden}.clip{position:absolute;inset:0}svg{display:block;width:1920px;height:1080px}#subtitle-layer{position:absolute;inset:0;pointer-events:none}.subtitle{position:absolute;left:100px;right:100px;bottom:64px;text-align:center;opacity:0;font-family:system-ui,sans-serif;color:#fff7e8;font-weight:800;font-size:48px;line-height:1.25;text-shadow:-3px -3px 0 #15232b,3px -3px 0 #15232b,-3px 3px 0 #15232b,3px 3px 0 #15232b}.subtitle em{font-style:normal;color:#f5c874}.subtitle small{display:block;font-size:30px;letter-spacing:.04em}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${plan.duration}" data-width="1920" data-height="1080" data-fps="30"><div id="study" class="clip" data-start="0" data-duration="${plan.duration}" data-track-index="1" data-layout-allow-overflow>${svg}</div><div id="subtitle-layer"></div>${audioTag}</div><script type="application/json" id="shot-plan">${data}</script><script src="runtime.js"></script></body></html>`
 await writeFile(path.join(dest,'index.html'),html);await writeFile(path.join(dest,'plan.json'),JSON.stringify(plan,null,2)+'\n');console.log(`Built ${dest} (${audio?'audio':'silent'}). Render with HyperFrames; no generation invoked.`)
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
