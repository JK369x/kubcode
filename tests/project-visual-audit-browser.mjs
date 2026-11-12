import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const BASE=process.env.BASE_URL||'http://127.0.0.1:3040';
const dir='.qa/project-visual-audit';fs.mkdirSync(dir,{recursive:true});
const slugs=file=>[...fs.readFileSync(file,'utf8').matchAll(/slug:\s*"([^"]+)"/g)].map(m=>m[1]);
const routes=['/','/articles','/account',...slugs('lib/catalog.ts').map(s=>'/skills/'+s),...fs.readdirSync('content/articles').filter(f=>f.endsWith('.mdx')).map(f=>'/articles/'+f.slice(0,-4))];
assert.equal(new Set(routes).size,routes.length);
const report={routes,routeStates:[],catalog:[],errors:[],status:'running'};
const browser=await chromium.launch({headless:true,channel:'chrome'});
function ratio(fg,bg){const cv=s=>{const a=s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;};const a=cv(fg),b=cv(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
try{
 for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(t=>{try{localStorage.setItem('jk-theme',t)}catch{}},theme);
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({theme,error:e.message}));
  for(const width of [1440,768,375]){
   await page.setViewportSize({width,height:width<600?844:1000});
   for(const route of routes){
    const res=await page.goto(BASE+route,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.detail-grid .exhibit video').evaluateAll(async videos=>{
      await Promise.all(videos.map(v=>v.readyState>=2?Promise.resolve():new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('native first frame not ready')),10000);
        v.addEventListener('loadeddata',()=>{clearTimeout(timer);resolve()},{once:true});
        v.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('native video error'))},{once:true});
      })));
    });
    await page.waitForTimeout(150);
    const info=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,width:innerWidth,scroll:document.documentElement.scrollWidth,h1:[...document.querySelectorAll('h1')].map(e=>e.textContent),bodyFont:getComputedStyle(document.body).fontFamily,background:getComputedStyle(document.body).backgroundColor,headerBrand:document.querySelector('.brand')?.textContent,brokenVisibleImages:[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&(!i.complete||!i.naturalWidth)}).map(i=>i.getAttribute('src'))}));
    assert.equal(res.status(),200,route);assert.equal(info.theme,theme);assert.equal(info.h1.length,1,route+' one h1');assert.equal(info.headerBrand,'kubcode');assert.match(info.bodyFont,/Anuphan/);assert.ok(info.scroll<=width+1,JSON.stringify({route,width,...info}));assert.deepEqual(info.brokenVisibleImages,[],route+' images');
    if(route==='/')assert.equal(await page.locator('#selected-example').isVisible(),false,'no solitary Stickman block on initial home');
    const screenshot=`${dir}/${width}-${theme}-${route==='/'?'home':route.slice(1).replaceAll('/','-')}.png`;
    await page.screenshot({path:screenshot});report.routeStates.push({route,width,theme,status:res.status(),...info,screenshot});
   }
   await page.goto(BASE,{waitUntil:'networkidle'});
   for(const image of await page.locator('.card-preview > img').all()){
    await image.evaluate(async img=>{img.scrollIntoView({block:'center',behavior:'instant'});await img.decode();if(!img.naturalWidth)throw new Error('blank catalog image');});
   }
   await page.locator('#skill-index').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await page.waitForTimeout(300);
   const cards=await page.locator('.skill-card').evaluateAll(els=>els.map(el=>{
    const r=el.getBoundingClientRect();const poster=el.querySelector('.card-preview > img');const p=poster?.getBoundingClientRect();const button=[...el.querySelectorAll('button')].find(b=>b.textContent.includes('ดาวน์โหลด skill'));const s=button?getComputedStyle(button):null;
    const marks=[...el.querySelectorAll('[data-tool-mark]')].map(m=>{const r=m.getBoundingClientRect();return {tool:m.getAttribute('data-tool-mark'),width:r.width,height:r.height}});
    return {name:el.querySelector('h3')?.textContent,media:el.getAttribute('data-media'),card:{width:r.width,height:r.height},poster:p?{width:p.width,height:p.height,naturalWidth:poster.naturalWidth,naturalHeight:poster.naturalHeight,complete:poster.complete,fit:getComputedStyle(poster).objectFit}:null,button:s?{disabled:button.disabled,background:s.backgroundColor,color:s.color,border:s.borderStyle,width:button.getBoundingClientRect().width}:null,marks};
   }));
   for(const card of cards){
    assert.ok(card.button?.disabled);assert.notEqual(card.button.border,'dashed','no rejected dashed button');assert.ok(ratio(card.button.color,card.button.background)>=4.5,'download text contrast '+card.name);
    if(card.media==='poster'){assert.ok(card.poster.naturalWidth>0&&card.poster.naturalHeight>0&&card.poster.complete,card.name+' actual decoded media');assert.equal(card.poster?.fit,'cover');assert.ok(card.poster.width>=card.card.width-3,card.name+' fills width');assert.ok(card.poster.height>=card.card.height-3,card.name+' fills height');}
    for(const mark of card.marks){assert.ok(mark.width<=24&&mark.height<=24,JSON.stringify(mark));}
   }
   const screenshot=`${dir}/${width}-${theme}-catalog.png`;await page.screenshot({path:screenshot});report.catalog.push({width,theme,cards,screenshot});
   if(width<600){
    await page.locator('.skill-card').first().evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
    await page.screenshot({path:`${dir}/${width}-${theme}-first-card.png`});
   }
  }
  await context.close();
 }
 assert.equal(report.errors.length,0);report.status='passed';
}catch(e){report.status='failed';report.failure=String(e);throw e;}
finally{fs.writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,routes:routes.length,routeStates:report.routeStates.length,catalogStates:report.catalog.length,errors:report.errors,failure:report.failure}));await browser.close();}