import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:3040';
const phase=process.argv[2]||'after';
const dir=`.qa/kinetic-browser-${phase}`;
fs.mkdirSync(dir,{recursive:true});
const report={base,phase,checks:[],errors:[],screenshots:[],status:'running'};
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));
const check=(name,data={})=>report.checks.push({name,...data});
const hero=()=>page.locator('section:has(h1)').first();
async function settle(){
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return i.loading!=='lazy'||r.top<innerHeight&&r.bottom>0;}).every(i=>i.complete&&i.naturalWidth>0));
 await page.waitForTimeout(900);
}
async function runningLoops(){return hero().evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations===Infinity&&a.playState==='running').map(a=>({name:a.animationName,transform:getComputedStyle(a.effect.target).transform})));}
async function screenshot(name){const path=`${dir}/${name}.png`;await page.screenshot({path});report.screenshots.push(path);}
async function overflow(label){const d=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(d.scroll<=d.viewport,`${label} overflow ${JSON.stringify(d)}`);check('no document overflow',{label,...d});}
async function playSeek(){
 const video=page.locator('#selected-example video');await video.waitFor();
 await video.evaluate(async v=>{v.muted=true;await v.play();});
 const start=await video.evaluate(v=>v.currentTime);
 await page.waitForFunction(t=>document.querySelector('#selected-example video').currentTime>t+0.25,start,{timeout:15000});
 const advanced=await video.evaluate(v=>v.currentTime);
 const target=await video.evaluate(v=>{v.pause();v.currentTime=Math.min(3,v.duration/2);return v.currentTime;});
 await page.waitForFunction(t=>{const v=document.querySelector('#selected-example video');return !v.seeking&&Math.abs(v.currentTime-t)<0.2&&v.readyState>=2;},target,{timeout:15000});
 check('real native video advances and seeks',{source:await video.locator('source').getAttribute('src'),start,advanced,target});
}
try{
 assert.equal((await page.goto(base)).status(),200);await settle();
 assert.equal(await page.locator('h1').count(),1);
 assert.equal(await page.locator('.work-showcase').count(),0,'Rejected hero must be replaced, not restyled');
 assert.equal(await hero().count(),1,'New semantic hero section contains the h1');
 assert.equal(await hero().getByRole('link',{name:/สำรวจ|คลัง|เลือกดู|skills/i}).first().getAttribute('href'),'#skill-index');
 check('new hero replaces the rejected slab; one semantic h1 and useful browse action');
 await overflow('desktop dark');await screenshot('1440-dark-home');
 const loops=await runningLoops();assert.ok(loops.length>0,'Authored real-artwork idle motion actually runs');
 const before=await hero().evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations===Infinity).map(a=>getComputedStyle(a.effect.target).transform));
 await page.waitForTimeout(700);
 const after=await hero().evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations===Infinity).map(a=>getComputedStyle(a.effect.target).transform));
 assert.notDeepEqual(before,after,'Computed artwork matrices change over time');check('observable authored idle motion',{loops,before,after});
 await screenshot('1440-dark-motion-later');
 const pause=hero().getByRole('button',{name:/หยุด.*เคลื่อน|หยุด.*motion|หยุด.*แอนิเมชัน|หยุด.*เคลื่อนไหว/i}).first();
 await pause.focus();
 assert.ok(await pause.evaluate(el=>parseFloat(getComputedStyle(el).outlineWidth)>=2),'Pause has visible keyboard focus');
 await page.keyboard.press('Enter');await page.waitForTimeout(200);assert.equal((await runningLoops()).length,0);check('keyboard pause stops idle motion');await screenshot('1440-keyboard-paused');
 const resume=hero().locator('[data-motion-toggle]');await resume.click();await page.waitForTimeout(200);assert.ok((await runningLoops()).length>0);check('resume restores idle motion');
 const target=hero().getByRole('button',{name:/Stickman Cinema/}).first();
 const hit=await target.evaluate(el=>{const r=el.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/3;return {x,y,unobscured:document.elementFromPoint(x,y)?.closest('button')===el};});
 assert.equal(hit.unobscured,true,'The real moving artwork remains hit-testable');
 await page.mouse.click(hit.x,hit.y);
 await page.waitForFunction(()=>document.querySelector('#selected-example video source')?.getAttribute('src')?.includes('growkaz-stickman'));
 assert.ok(await page.locator('#selected-example').evaluate(el=>el===document.activeElement));
 check('hero selection hands off to real focused native preview');await playSeek();
 const codex=page.locator('#selected-example').getByRole('button',{name:'Codex',exact:true});await codex.click();await playSeek();
 const query=page.getByRole('textbox',{name:'ค้นหาในรายการ',exact:true});await query.fill('ไม่มีผลค้นหาแน่นอน zzz');
 await page.getByRole('heading',{name:'ยังไม่มีรายการที่ตรงกัน'}).waitFor();await page.getByRole('button',{name:'ล้างตัวกรอง'}).click();
 assert.equal(await page.locator('.skill-card').count(),7);check('search, empty-state reset and real catalog preserved');
 const card=page.locator('.skill-card').filter({hasText:'Thai Calm Narrator'});await card.locator('.card-preview').click();await page.getByText('ยังไม่มีสื่อพรีวิว',{exact:true}).first().waitFor();check('no-media selection stays honest');
 const disabled=page.locator('.skill-card button').filter({hasText:'ดาวน์โหลด skill'});assert.equal(await disabled.count(),7);
 for(const button of await disabled.all())assert.equal(await button.isDisabled(),true);check('catalog downloads remain disabled and full-width status available');
 for(const width of [1440,1280,768,390,375]){
  await page.setViewportSize({width,height:width<600?844:1000});
  for(const theme of ['dark','light']){
   await page.evaluate(t=>localStorage.setItem('jk-theme',t),theme);await page.goto(base);await settle();
   assert.equal(await page.locator('html').getAttribute('data-theme'),theme);await overflow(`${width}-${theme}`);
   assert.equal(await hero().getByRole('heading',{level:1}).count(),1);
   const images=await hero().locator('img').evaluateAll(els=>els.map(e=>({src:e.getAttribute('src'),complete:e.complete,w:e.naturalWidth})));
   assert.ok(images.every(i=>i.complete&&i.w>0));
   if([1440,768,390].includes(width))await screenshot(`${width}-${theme}-home`);
  }
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);await settle();
 await page.locator('#skill-index').scrollIntoViewIfNeeded();await page.waitForTimeout(400);assert.equal((await runningLoops()).length,0);check('offscreen hero pauses loops');
 await hero().scrollIntoViewIfNeeded();await page.waitForTimeout(300);assert.ok((await runningLoops()).length>0);check('returning hero resumes loops');
 const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
 if(await page.evaluate(()=>document.hidden)){
  await page.waitForTimeout(300);assert.equal((await runningLoops()).length,0);check('hidden document pauses loops');
 }else check('hidden document check unavailable in this headless browser; not claimed');
 await other.close();await page.bringToFront();
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);assert.equal((await runningLoops()).length,0);
 check('live reduced-motion preference stops spatial loops');await screenshot('1440-reduced-motion');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(300);assert.ok((await runningLoops()).length>0);check('live motion preference can restore eligible motion');
 await page.evaluate(()=>localStorage.setItem('jk-theme','light'));await page.goto(`${base}/articles`);await settle();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.goto(`${base}/skills/growkaz-stickman`);await settle();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await playSeek();check('theme and actual detail-page playback survive route navigation');
 const api=await page.request.get(`${base}/api/download/growkaz-stickman`);assert.deepEqual(await api.json(),{available:false});check('unlicensed skill download stays closed');
 const fallback=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});const staticPage=await fallback.newPage();await staticPage.goto(base);await staticPage.waitForTimeout(800);assert.equal(await staticPage.locator('h1').isVisible(),true);assert.ok(await staticPage.locator('section:has(h1) img').count()>0);check('SSR/no-JS hero content stays visible');await fallback.close();
 assert.equal(report.errors.length,0);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{fs.writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}