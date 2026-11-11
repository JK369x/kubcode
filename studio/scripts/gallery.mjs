import {readFileSync} from 'node:fs';
// Read lazily so tests and `check` run without `npm install`.
export const dingSource=()=>readFileSync(new URL('../node_modules/@yusufceng1z/ding/dist/index.js',import.meta.url),'utf8');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderCatalog(styles){
 const cell=s=>String(s??'').replaceAll('|','\\|').replace(/[\r\n]+/g,' ');
 const rows=styles.map(s=>{
  const base='styles/'+s.id+'/';
  const clips=(s.examples??[]).map(e=>'['+cell(e.label)+']('+base+e.video+') — '+cell(e.author)+(e.model?' / '+cell(e.model):'')).join('<br>')||(s.video?'[คลิป]('+base+s.video+')':'ยังไม่มีคลิปใน catalog');
  return '| ['+cell(s.name)+']('+base+s.direction+') | `'+s.id+'` | '+s.status+(s.availability==='reference'?' · reference only':'')+' | '+clips+' | '+cell(s.approvalScope)+' |';
 });
 return '# สไตล์วิดีโอทั้งหมด\n\nสร้างจาก `styles/*/style.json` ด้วย `npm run gallery` — อย่าแก้ไฟล์นี้ด้วยมือ\n\n'+styles.length+' สไตล์ · [เปิดแกลเลอรี](gallery/index.html) · [โครงสร้างและวิธีเลือก](WORKSPACE.md)\n\n| สไตล์ | ID | สถานะ | ตัวอย่างจริง / ผู้เขียน | ขอบเขต |\n|---|---|---|---|---|\n'+rows.join('\n')+'\n\n`draft` เลือกเพื่อทดลองได้แต่ไม่ใช่อนุมัติผลิต · reference only ต้องใช้ source kit แยก · ผู้เขียนโค้ดไม่ใช่โมเดลสร้างวิดีโอโดยตรง · สถานะอนุมัติภาพไม่ใช่อนุมัติเสียง/เผยแพร่\n';
}
const statusLabel={draft:'ฉบับทดลอง',selected:'เลือกแนวภาพแล้ว',retired:'เลิกใช้แล้ว'};
const fontFaces=()=>[400,500,600].map(w=>`@font-face{font-family:Anuphan;font-style:normal;font-weight:${w};font-display:swap;src:url(/gallery/fonts/anuphan-thai-${w}-normal.woff2) format('woff2');unicode-range:U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC}@font-face{font-family:Anuphan;font-style:normal;font-weight:${w};font-display:swap;src:url(/gallery/fonts/anuphan-latin-${w}-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`).join('');
export function renderGallery(styles){
 const ordered=[...styles].sort((a,b)=>Number(!!b.video)-Number(!!a.video)||Number(b.status==='selected')-Number(a.status==='selected')||a.name.localeCompare(b.name));
 const ids=s=>(s.examples??[]).map(e=>e.id);
 const counts={'':styles.length,video:styles.filter(s=>s.video).length,paired:styles.filter(s=>ids(s).includes('claude')&&ids(s).includes('codex')).length,claude:styles.filter(s=>ids(s).includes('claude')).length,codex:styles.filter(s=>ids(s).includes('codex')).length,glm:styles.filter(s=>ids(s).includes('glm')).length};
 const chips=[['','ทั้งหมด'],['video','มีวิดีโอ'],['paired','Claude + Codex'],['claude','Claude'],['codex','Codex'],['glm','GLM']].map(([v,l])=>`<label class="chip"><input type="radio" name="author" value="${v}" ${v===''?'checked':''}><span>${l}</span><span class="n" aria-hidden="true">${counts[v]}</span></label>`).join('');
 const cards=ordered.map((s,i)=>{
  const base='../styles/'+s.id+'/';
  const examples=s.examples??[];
  const primary=examples.find(e=>e.video===s.video)??examples[0];
  const attribution=primary?[primary.author,primary.model,primary.renderer,primary.voice].filter(Boolean).join(' · '):'ยังไม่มีหลักฐานแยก Claude / Codex';
  const H=i===0?'h2':'h3';
  return `<article class="card${i===0?' featured':''}" data-style="${escape(s.id)}" data-name="${escape(s.name)}" data-search="${escape([s.name,s.id,...(s.tags??[])].join(' ').toLowerCase())}" data-authors="${escape(examples.map(e=>e.id).join(' '))}">
   <div class="media">${s.video?`<video controls playsinline preload="none" ${s.preview?`poster="${base+escape(s.preview)}"`:''} src="${base+escape(s.video)}" aria-label="${escape(s.name)}"></video>`:s.preview?`<img loading="lazy" src="${base+escape(s.preview)}" alt="${escape(s.name)}">`:'<p class="empty">มีคู่มือ · ยังไม่มีวิดีโอตัวอย่าง</p>'}</div>
   <div class="body"><p class="kicker"><span class="status status-${escape(s.status)}">${escape(statusLabel[s.status]??s.status)}</span><span>v${escape(s.version)}${s.availability==='reference'?' · คู่มืออ้างอิง':''}</span></p><${H} class="title">${escape(s.name)}</${H}>
   <p class="desc">${escape(s.approvalScope??'แนวทดลอง ยังไม่มีการอนุมัติ')}</p>
   ${examples.length?`<label class="variant">วิดีโอตัวอย่าง<select data-example aria-label="ตัวอย่าง ${escape(s.name)}">${examples.map(e=>`<option value="${escape(e.id)}" ${e===primary?'selected':''}>${escape(e.label)}</option>`).join('')}</select></label><p class="attribution">${escape(attribution)}</p>`:''}
   <nav aria-label="การทำงานสำหรับ ${escape(s.name)}"><button type="button" data-select>เลือกสไตล์นี้</button><a aria-label="คู่มือสไตล์ ${escape(s.name)}" href="${base+escape(s.direction)}">คู่มือสไตล์</a>${s.source?`<a aria-label="ไฟล์ต้นฉบับแก้ไขได้ของ ${escape(s.name)}" href="${base+escape(s.source)}">ไฟล์ต้นฉบับ</a>`:''}${s.captions?`<a aria-label="รูปแบบคำบรรยายของ ${escape(s.name)}" href="${base+escape(s.captions)}">รูปแบบคำบรรยาย</a>`:''}</nav></div></article>`;
 }).join('');
 const json=JSON.stringify(styles).replace(/</g,'\\u003c');
 return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>เลือกสไตล์ — JK Animation Studio</title><style>
 ${fontFaces()}
 :root{--bg:#100e15;--surface:#1b1722;--surface-soft:#231d2d;--ink:#f5f1fb;--muted:#b8adca;--line:#38303f;--purple:#bb98ff;--selected:#d1b9ff;--selected-ink:#291640;--media:#0a090e;--radius:22px;--mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;color-scheme:dark}
 *{box-sizing:border-box}html{scrollbar-color:var(--line) var(--bg)}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 Anuphan,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
 a{color:var(--ink);text-decoration-color:var(--line);text-underline-offset:5px;text-decoration-thickness:1px}a:hover{text-decoration-color:var(--purple)}
 :focus-visible{outline:2px solid var(--selected);outline-offset:3px;border-radius:8px}::selection{background:var(--selected);color:var(--selected-ink)}
 .skip{position:absolute;left:16px;top:-100px;background:var(--selected);color:var(--selected-ink);padding:10px 16px;border-radius:999px;z-index:10}.skip:focus{top:12px}
 .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1310px;margin:auto;padding:24px clamp(20px,4vw,64px)}.brand{font-size:24px;font-weight:600;letter-spacing:-.03em;text-decoration:none}.brand b{color:var(--purple)}.tag{font-size:14px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:6px 14px}
 main{max-width:1136px;margin:auto;padding:48px 20px 96px}
 header h1{font-size:clamp(34px,5vw,48px);line-height:1.3;font-weight:500;letter-spacing:-.01em;margin:0}header p{color:var(--muted);font-size:18px;line-height:1.9;margin:8px 0 0;max-width:62ch}
 .tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-top:32px}
 .chips{display:flex;flex-wrap:wrap;gap:10px;border:0;margin:0;padding:0;min-width:0}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
 .chip{position:relative;display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:0 16px;border:1px solid var(--line);border-radius:999px;cursor:pointer;font-size:15px;transition:background .15s,border-color .15s}.chip:hover{border-color:var(--muted)}
 .chip input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}.chip .n{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--surface-soft);color:var(--muted);font-size:12px}
 .chip:has(input:checked){background:var(--selected);border-color:var(--selected);color:var(--selected-ink);font-weight:500}.chip:has(input:checked) .n{background:rgb(41 22 64/.14);color:var(--selected-ink)}.chip:has(input:focus-visible){outline:2px solid var(--selected);outline-offset:3px}
 .search{flex:0 1 300px;min-width:min(100%,240px)}
 input,select,textarea,button{font:inherit;color:inherit}
 input[type=search],select{width:100%;min-height:44px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:0 18px}select{border-radius:14px;padding:0 14px}input::placeholder{color:#9b90ad}
 #count{color:var(--muted);font-size:14px;margin:16px 0 0}
 #catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:48px 28px;margin-top:40px}
 .card{min-width:0;display:flex;flex-direction:column}.card[hidden],#start[hidden],#empty[hidden]{display:none}
 .media{aspect-ratio:16/10;background:var(--surface-soft);border-radius:var(--radius);overflow:hidden;display:grid;place-items:center}.media video,.media img{width:100%;height:100%;object-fit:contain;background:var(--media)}.empty{margin:0;padding:24px;color:var(--muted);font-size:14px;text-align:center}
 .body{padding-top:18px;display:flex;flex-direction:column;flex:1}
 .kicker{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0;font-size:13px;color:var(--muted)}.status{color:var(--purple);font-weight:500}.status-selected{background:var(--selected);color:var(--selected-ink);border-radius:999px;padding:1px 10px}.status-retired{color:var(--muted);text-decoration:line-through}
 .title{font-size:20px;font-weight:600;line-height:1.45;margin:6px 0 0}.desc{color:var(--muted);font-size:15px;line-height:1.75;margin:8px 0 0;overflow-wrap:anywhere}
 .variant{display:grid;gap:6px;font-size:13px;color:var(--muted);margin-top:16px}.attribution{font-size:13px;line-height:1.65;color:var(--muted);margin:8px 0 0;overflow-wrap:anywhere}
 .card nav{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;margin-top:auto;padding-top:18px}.card nav a{display:inline-flex;align-items:center;min-height:44px;font-size:14px}
 button{cursor:pointer;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--selected);background:var(--selected);color:var(--selected-ink);font-weight:500;transition:filter .15s}button:hover{filter:brightness(1.06)}
 .featured .title{font-size:clamp(26px,3.4vw,38px);line-height:1.3}
 @media(min-width:900px){.featured{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:40px;align-items:start}.featured .body{padding-top:8px}.featured .desc{font-size:17px}}
 #start{margin-top:40px;padding:28px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);scroll-margin-top:24px}#start h2{margin:0;font-size:24px;font-weight:600}#start p{color:var(--muted);margin:6px 0 16px}#start label{display:grid;gap:8px;font-size:14px;color:var(--muted)}
 textarea{width:100%;background:var(--media);border:1px solid var(--line);border-radius:14px;padding:16px;font:14px/1.75 var(--mono);color:var(--ink);resize:vertical;margin-bottom:16px}
 #feedback{min-height:1.6em;color:var(--purple);font-size:14px}#empty{color:var(--muted);margin-top:32px}
 footer{border-top:1px solid var(--line);margin-top:72px;padding-top:24px;color:var(--muted);font-size:14px}code{font-family:var(--mono);color:var(--purple);overflow-wrap:anywhere}
 .tst-viewport{--tst-radius:999px;--tst-bg:#231d2d;--tst-fg:#f5f1fb;--tst-success:#bb98ff;--tst-error:#ff9d9d;--tst-warning:#f3c28a;--tst-info:#d1b9ff}
 @media(max-width:600px){main{padding-top:24px}.tools{display:grid}.search{flex:1}header p{font-size:16px}#start{padding:20px}.tag{display:none}}
 @media(prefers-reduced-motion:reduce){*{transition:none!important}}
 </style></head><body><a class="skip" href="#catalog">ข้ามไปคลังสไตล์</a><div class="topbar"><a class="brand" href="/">JK Studio<b>.</b></a><span class="tag">คลังสไตล์ · ใช้ในเครื่อง</span></div><main><header><h1>เลือกสไตล์วิดีโอ</h1><p>ดูภาพจริง เลือกแนวที่อยากทำ แล้วคัดลอกโจทย์ไปใช้กับ agent — สไตล์ภาพแยกจากผู้เขียนโค้ด เครื่องเรนเดอร์ และเสียง</p></header>
 <div class="tools"><fieldset class="chips" id="author-filter"><legend class="sr">กรองตัวอย่าง</legend>${chips}</fieldset><label class="search"><span class="sr">ค้นหาสไตล์</span><input id="search" type="search" placeholder="ค้นหาสไตล์ แนวภาพ หรือเครื่องมือ"></label></div><p id="count" role="status">${styles.length} สไตล์</p>
 <div id="start" hidden tabindex="-1"><h2 id="chosen"></h2><p>การเลือกนี้สร้างโจทย์เริ่มงาน ไม่เปลี่ยนสถานะการอนุมัติและไม่เริ่มสร้างเสียงหรือเสียเครดิต</p><label>ข้อความเริ่มงาน<textarea id="prompt" rows="7" readonly></textarea></label><button id="copy" type="button">คัดลอกโจทย์</button><p id="feedback" role="status" aria-live="polite" aria-atomic="true"></p></div>
 <section id="catalog" aria-label="คลังสไตล์">${cards}</section><p id="empty" hidden>ไม่พบสไตล์ที่ตรงกัน ลองล้างคำค้นหรือเลือก “ทั้งหมด”</p><noscript>เปิด JavaScript เพื่อกรองและเลือกสไตล์ คู่มือและวิดีโอยังเปิดได้โดยตรง</noscript><footer>คู่มือทุกแนวระบุข้อจำกัดของตัวเอง · สถานะภาพไม่ใช่การอนุมัติเสียงหรือเผยแพร่ · เพิ่มแนวใหม่ด้วย <code>npm run new-style -- ชื่อภาษาอังกฤษตัวเล็ก</code></footer></main>
 <script id="style-data" type="application/json">${json}</script><script type="module">
 import {mountToaster,toast} from '/gallery/ding.js';mountToaster({position:'top-center',theme:'dark',labels:{region:'การแจ้งเตือน',dismiss:'ปิดการแจ้งเตือน'}});
 const styles=JSON.parse(document.getElementById('style-data').textContent),cards=[...document.querySelectorAll('[data-style]')];
 function choose(id,exampleId,scroll=false){const s=styles.find(s=>s.id===id);if(!s)return;const e=(s.examples??[]).find(e=>e.id===exampleId);const box=document.getElementById('start');box.hidden=false;document.getElementById('chosen').textContent=s.name+(e?' — '+e.label:'');document.getElementById('prompt').value=['อ่าน AGENTS.md, DIRECTOR.md และ TECHNIQUE.md','เลือก style: '+s.id,'อ่าน styles/'+s.id+'/'+s.direction,'รักษาภาษาภาพของสไตล์นี้ ไม่ผสมแนวอื่นโดยอัตโนมัติ',e?'ดูตัวอย่าง styles/'+s.id+'/'+e.video+' (ผู้เขียน: '+e.author+(e.model?' / '+e.model:'')+')':'ตรวจคู่มือและความพร้อมก่อนเริ่ม — อย่าอ้างว่ามีเวอร์ชัน Claude/Codex ที่ยังไม่ได้ทำ','หัวข้อ: [ใส่เรื่องที่อยากเล่า] · ความยาว: [ระบุ] · สัดส่วน: [ระบุ]','แยกผู้เขียนโค้ด / host render / voice และขออนุมัติก่อนเรียก API เสียเงิน ไม่อัปโหลดหรือเผยแพร่'].join('\\n');if(scroll){box.scrollIntoView({block:'start'});box.focus({preventScroll:true});toast.success('เลือกสไตล์แล้ว',{description:s.name});}}
 function filter(){const q=document.getElementById('search').value.toLowerCase().trim(),a=document.querySelector('input[name=author]:checked')?.value??'';let n=0;for(const c of cards){const authors=c.dataset.authors.split(' ');const okay=!a||(a==='paired'?authors.includes('claude')&&authors.includes('codex'):a==='video'?!!c.querySelector('video'):authors.includes(a));c.hidden=!(c.dataset.search.includes(q)&&okay);if(!c.hidden)n++;}document.getElementById('count').textContent=n+' / '+styles.length+' สไตล์';document.getElementById('empty').hidden=n!==0;}
 for(const c of cards){const s=styles.find(s=>s.id===c.dataset.style),select=c.querySelector('[data-example]');select?.addEventListener('change',()=>{const e=s.examples.find(e=>e.id===select.value),v=c.querySelector('video');if(v){v.pause();v.src='../styles/'+s.id+'/'+e.video;v.load();}c.querySelector('.attribution').textContent=[e.author,e.model,e.renderer,e.voice,e.notes].filter(Boolean).join(' · ');});c.querySelector('[data-select]').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('style',s.id);if(select)url.searchParams.set('example',select.value);else url.searchParams.delete('example');try{history.replaceState(null,'',url);}catch{}choose(s.id,select?.value,true);});}
 document.getElementById('search').addEventListener('input',filter);document.getElementById('author-filter').addEventListener('change',filter);document.getElementById('copy').addEventListener('click',async()=>{const text=document.getElementById('prompt'),feedback=document.getElementById('feedback');feedback.textContent='';try{await navigator.clipboard.writeText(text.value);feedback.textContent='คัดลอกแล้ว';toast.success('คัดลอกโจทย์แล้ว');}catch{text.focus();text.select();feedback.textContent='เลือกข้อความแล้ว กด ⌘C หรือ Ctrl+C เพื่อคัดลอก';toast.warning('คัดลอกอัตโนมัติไม่ได้',{description:'เลือกข้อความให้แล้ว กด ⌘C หรือ Ctrl+C'});}});const params=new URLSearchParams(location.search);if(params.has('style')){const c=cards.find(c=>c.dataset.style===params.get('style')),sel=c?.querySelector('[data-example]');if(sel&&[...sel.options].some(o=>o.value===params.get('example'))){sel.value=params.get('example');sel.dispatchEvent(new Event('change'));}choose(params.get('style'),sel?.value);}filter();
 </script></body></html>`;
}
export const fontFiles=[400,500,600].flatMap(w=>[`anuphan-thai-${w}-normal.woff2`,`anuphan-latin-${w}-normal.woff2`]);
