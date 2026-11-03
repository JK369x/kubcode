import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
const checks=[];
function luminance(color){const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function ratio(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
try{
 for(const theme of ['light','dark']){
  await page.goto('http://127.0.0.1:3040');
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.evaluate(()=>document.fonts.ready);
  const feature=page.locator('.feature-link');
  await feature.hover();
  await page.keyboard.press('Tab');
  await feature.focus();
  const actual=await feature.evaluate(el=>{const s=getComputedStyle(el);return{color:s.color,background:s.backgroundColor,outline:s.outlineStyle,outlineWidth:s.outlineWidth};});
  const contrast=ratio(actual.color,actual.background);
  checks.push({theme,target:'actual feature-link hover/focus',...actual,contrast});
  assert(contrast>=4.5,`${theme} feature hover contrast ${contrast}`);
  assert.equal(actual.outline,'solid');assert.equal(actual.outlineWidth,'3px');
  await page.screenshot({path:`.qa/cta-${theme}-feature-hover.png`,animations:'disabled'});
  // Isolated non-shipping fixture exercises the shared enabled-primary rule;
  // real account/download controls stay disabled and APIs remain unconfigured.
  await page.evaluate(()=>{const b=document.createElement('button');b.className='primary';b.id='cta-style-fixture';b.textContent='CSS test fixture — not signup';b.style.cssText='position:fixed;bottom:24px;left:24px;width:320px;z-index:999';document.body.append(b);});
  const fixture=page.locator('#cta-style-fixture');await fixture.hover();await fixture.focus();
  const shared=await fixture.evaluate(el=>{const s=getComputedStyle(el);return{color:s.color,background:s.backgroundColor,outline:s.outlineStyle,outlineWidth:s.outlineWidth};});
  const sharedContrast=ratio(shared.color,shared.background);
  checks.push({theme,target:'isolated enabled .primary fixture',...shared,contrast:sharedContrast});
  assert(sharedContrast>=4.5,`${theme} primary hover contrast ${sharedContrast}`);
  assert.equal(shared.outline,'solid');assert.equal(shared.outlineWidth,'3px');
  await fixture.screenshot({path:`.qa/cta-${theme}-primary-fixture.png`});
 }
 fs.writeFileSync('.qa/cta-contrast-results.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks},null,2));
}catch(error){fs.writeFileSync('.qa/cta-contrast-red.json',JSON.stringify({status:'failed',error:String(error),checks},null,2));throw error;}finally{await browser.close();}
