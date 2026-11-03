import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const checks=[];const screenshots=[];
async function shot(path){await page.screenshot({path,animations:'disabled'});screenshots.push(path);}
async function settle(){await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.images].filter(i=>i.loading!=='lazy'||(i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0)).every(i=>i.complete&&i.naturalWidth));}
try{
 for(const theme of ['dark','light']){
  await page.setViewportSize({width:390,height:1000});await page.goto('http://127.0.0.1:3040');if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.theme-toggle').click(); await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);await settle();
  const mobile=await page.evaluate(()=>{const a=document.querySelector('.feature-link').getBoundingClientRect();const chips=[...document.querySelectorAll('.feature-tools .tool-chip')].map(x=>x.getBoundingClientRect().top);const p=document.querySelector('.card-preview');return{ctaBottom:a.bottom,toolsSameRow:Math.abs(chips[0]-chips[1])<2,matte:getComputedStyle(p).backgroundColor,surface:getComputedStyle(document.documentElement).getPropertyValue('--surface-soft').trim()};});
  assert(mobile.ctaBottom<=1000,JSON.stringify(mobile));assert(mobile.toolsSameRow,JSON.stringify(mobile));checks.push({theme,target:'mobile action and tool flow',...mobile});
  await page.locator('.featured-work').screenshot({path:`.impeccable/review/v2-${theme}-mobile-feature-full.png`,animations:'disabled'});screenshots.push(`.impeccable/review/v2-${theme}-mobile-feature-full.png`);
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:3040');if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.theme-toggle').click(); await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);await settle();
  const gap=await page.evaluate(()=>document.querySelector('.exhibit-provenance').getBoundingClientRect().top-document.querySelector('.feature-actions').getBoundingClientRect().bottom);assert(gap<=80,`provenance gap ${gap}`);checks.push({theme,target:'desktop copy grouping',gap});
  for(const key of ['ffmpeg','gsap']){
   const mark=page.locator(`[data-tool-mark="${key}"][data-mask-src]`).first();const mask=await mark.locator('.tool-mark-glyph').evaluate(e=>({image:getComputedStyle(e).maskImage,color:getComputedStyle(e).backgroundColor,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));assert(mask.image.includes('/tool-icons/')&&mask.width>0&&mask.height>0);assert.equal((await page.request.get(new URL(await mark.getAttribute('data-mask-src'), 'http://127.0.0.1:3040').href)).status(),200);checks.push({theme,target:key+' mounted sourced mask',...mask});
  }
  await page.locator('.skill-card').nth(4).scrollIntoViewIfNeeded();await settle();await shot(`.impeccable/review/v2-${theme}-catalog-tail.png`);
  await page.locator('.skill-card').filter({hasText:'What If Lab'}).locator('.card-preview').click();await page.waitForFunction(()=>document.querySelector('#selected-example').dataset.shape==='landscape');
  await page.evaluate(()=>{document.querySelector('#selected-example video')?.pause();scrollTo(0,0);});await settle();
  const landscape=await page.locator('#selected-example .media-stage').evaluate(e=>{const v=e.querySelector('video');const r=e.getBoundingClientRect();return{stageRatio:r.width/r.height,sourceRatio:v.videoWidth/v.videoHeight,objectFit:getComputedStyle(v).objectFit};});assert(Math.abs(landscape.stageRatio-landscape.sourceRatio)<.02,JSON.stringify(landscape));assert.equal(landscape.objectFit,'contain');checks.push({theme,target:'actual landscape feature',...landscape});await shot(`.impeccable/review/v2-${theme}-landscape-feature.png`);
 }
 fs.writeFileSync('.qa/feature-v2-fixes-results.json',JSON.stringify({status:'passed',checkedAt:new Date().toISOString(),checks,screenshots},null,2));console.log(JSON.stringify({status:'passed',checks,screenshots},null,2));
}finally{await browser.close();}
