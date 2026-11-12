import {chromium} from '@playwright/test';
import fs from 'node:fs';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const BASE=process.env.BASE_URL||'http://127.0.0.1:3040';
const expected=JSON.parse(execFileSync('./node_modules/.bin/tsx',['-e','import {skills} from "./lib/catalog"; console.log(JSON.stringify(skills.filter(s=>s.examples[0]?.video).map(s=>"/skills/"+s.slug)))'],{encoding:'utf8'}));
const dir='.qa/project-visual-audit',audit=JSON.parse(fs.readFileSync(`${dir}/report.json`));
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
try{for(const theme of ['dark','light']){
 const context=await browser.newContext({viewport:{width:375,height:844}});
 await context.addInitScript(t=>localStorage.setItem('jk-theme',t),theme);
 const page=await context.newPage();
 for(const route of audit.routes.filter(r=>r.startsWith('/skills/'))){
  await page.goto(BASE+route,{waitUntil:'networkidle'});
  const video=page.locator('video').first();if(!await video.count())continue;
  await video.evaluate(async v=>{v.muted=true;await v.play()});
  await page.waitForFunction(()=>document.querySelector('video').currentTime>.25);
  await video.evaluate(v=>{v.pause();v.currentTime=Math.min(3,v.duration/2)});
  await page.waitForFunction(()=>{const v=document.querySelector('video');return !v.seeking&&v.readyState>=2&&v.currentTime>1});
  await page.waitForTimeout(150);
  const actual=await video.evaluate(v=>({source:v.currentSrc,currentTime:v.currentTime,duration:v.duration,readyState:v.readyState,decodedFrames:v.getVideoPlaybackQuality().totalVideoFrames,muted:v.muted,paused:v.paused,controls:v.controls,objectFit:getComputedStyle(v).objectFit,width:v.videoWidth,height:v.videoHeight}));
  assert.ok(actual.currentTime>1&&actual.decodedFrames>0);assert.ok(actual.muted&&actual.controls&&actual.paused);assert.equal(actual.objectFit,'contain');
  const screenshot=`${dir}/375-${theme}-${route.slice(1).replaceAll('/','-')}-after-play-seek.png`;
  await page.screenshot({path:screenshot});results.push({route,theme,captureState:'actual user-style muted play, then seek and pause; NOT untouched initial state',...actual,screenshot});
 }
 await context.close();
}assert.equal(results.length,expected.length*2);
for(const theme of ['dark','light'])assert.deepEqual(results.filter(r=>r.theme===theme).map(r=>r.route).sort(),[...expected].sort());
fs.writeFileSync(`${dir}/native-playback.json`,JSON.stringify({status:'passed',results},null,2));console.log(JSON.stringify({status:'passed',actualMediaRuns:results.length,sourceCount:new Set(results.map(r=>r.source)).size}));}finally{await browser.close()}