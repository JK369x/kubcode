import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('generated browser module parses rather than shipping an escaped-template syntax error',async()=>{
 const {renderGallery}=await import('../scripts/gallery.mjs');
 const html=renderGallery([]),script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
 const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('markdown catalog keeps author-specific clips and reference-only limitations',async()=>{
 const module=await import('../scripts/gallery.mjs');
 assert.equal(typeof module.renderCatalog,'function');
 const md=module.renderCatalog([{id:'paired',name:'Pair',status:'draft',version:'1',direction:'STYLE.md',examples:[{id:'claude',label:'Claude',author:'Claude Code',video:'c.mp4'}]}]);
 assert.match(md,/styles\/paired\/c.mp4/);assert.match(md,/Claude Code/);assert.match(md,/1 สไตล์/);
});
test('gallery shows separate author variants and a selectable style without inventing a pair',async()=>{
 const module=await import('../scripts/gallery.mjs').catch(()=>({}));
 assert.equal(typeof module.renderGallery,'function','gallery renderer must exist');
 const html=module.renderGallery([{id:'paired',name:'Thai <Story>',status:'draft',version:'1',direction:'STYLE.md',video:'c.mp4',examples:[{id:'claude',label:'Claude',author:'Claude Code',model:'opus',video:'c.mp4'},{id:'codex',label:'Codex',author:'Codex CLI',model:'gpt',video:'x.mp4'}]},{id:'glm',name:'GLM',status:'draft',version:'1',direction:'STYLE.md'}]);
 assert.match(html,/data-example/);assert.match(html,/Claude Code/);assert.match(html,/Codex CLI/);
 assert.match(html,/Thai &lt;Story&gt;/);assert.match(html,/id="prompt"/);assert.match(html,/id="search"/);
 assert.match(html,/data-style="glm"/);assert.doesNotMatch(html,/<Story>/);
 assert.match(html,/aria-label="การทำงานสำหรับ Thai &lt;Story&gt;"/);
 assert.match(html,/aria-label="คู่มือสไตล์ Thai &lt;Story&gt;"/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/mountToaster/);assert.match(html,/toast\.success/);
});
