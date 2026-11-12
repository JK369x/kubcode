import {chromium} from '@playwright/test';import fs from 'node:fs';import assert from 'node:assert/strict';
const BASE=process.env.BASE_URL||'http://127.0.0.1:3040';
const dir='.qa/download-consistency';fs.mkdirSync(dir,{recursive:true});
const routes=JSON.parse(fs.readFileSync('.qa/project-visual-audit/report.json')).routes.filter(r=>r.startsWith('/skills/'));
const contrast=(fg,bg)=>{const lum=s=>{const c=s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};const a=lum(fg),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
const rgb=h=>'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
const browser=await chromium.launch({headless:true,channel:'chrome'});const report={detailCases:[],openedPreviewStatus:[],errors:[]};
try{for(const theme of ['dark','light']){
 const context=await browser.newContext({viewport:{width:375,height:844}});await context.addInitScript(t=>localStorage.setItem('jk-theme',t),theme);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 for(const route of routes){
  await page.goto(BASE+route,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  const region=page.locator('#download');const button=region.getByRole('button');assert.equal(await button.count(),1);assert.equal(await button.isDisabled(),true);
  const actual=await button.evaluate(b=>{const s=getComputedStyle(b),state=getComputedStyle(b.querySelector('span[id]')),r=b.getBoundingClientRect();return{background:s.backgroundColor,color:s.color,state:state.color,height:r.height,scroll:b.scrollWidth,client:b.clientWidth,text:b.innerText}});
  assert.equal(actual.background,rgb(theme==='light'?'#ecebf0':'#242327'));assert.ok(actual.height>=44);assert.ok(actual.scroll<=actual.client+1);assert.ok(contrast(actual.color,actual.background)>=4.5);assert.ok(contrast(actual.state,actual.background)>=4.5);assert.match(actual.text,/ยังไม่เปิดดาวน์โหลด/);
  const screenshot=`${dir}/375-${theme}-${route.split('/').at(-1)}.png`;await region.screenshot({path:screenshot});report.detailCases.push({route,theme,...actual,labelContrast:contrast(actual.color,actual.background),stateContrast:contrast(actual.state,actual.background),screenshot});
 }
 await page.goto(BASE,{waitUntil:'networkidle'});await page.getByRole('button',{name:'ดูผลงาน Thai Calm Narrator',exact:true}).click();
 await page.locator('#selected-example').waitFor({state:'visible'});const text=await page.locator('#selected-example').innerText();assert.match(text,/เวิร์กโฟลว์ในเครื่อง/);assert.doesNotMatch(text,/Shared workflow/);report.openedPreviewStatus.push({theme,locale:'Thai',passed:true});await context.close();
}assert.equal(report.errors.length,0);assert.equal(report.detailCases.length,routes.length*2);report.status='passed';fs.writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,detailCases:report.detailCases.length,statusCases:report.openedPreviewStatus.length,minLabelContrast:Math.min(...report.detailCases.map(x=>x.labelContrast)),minStateContrast:Math.min(...report.detailCases.map(x=>x.stateContrast))}));}finally{await browser.close()}
