import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {validatePlan} from '../pipelines/shot-plan-v1/plan.mjs'
const dir=new URL('../pipelines/shot-plan-v1/fixtures/',import.meta.url)
const sample=JSON.parse(await readFile(new URL('window-choice.json',dir),'utf8'))
const copy=()=>structuredClone(sample)
test('both plans validate under one contract',async()=>{assert.equal((await validatePlan(sample,dir.pathname)).audio,null); const other=JSON.parse(await readFile(new URL('radio-warning.json',dir),'utf8'));await validatePlan(other,dir.pathname)})
test('reject gaps, overlap, unsupported effects, unescaped captions and invalid highlight',async()=>{for(const edit of [p=>p.shots[1].start=2.7,p=>p.shots[1].start=2.3,p=>p.shots[0].effect='run',p=>p.shots[0].caption.thai='<script>',p=>p.shots[0].caption.highlight='absent',p=>p.duration=100]){const p=copy();edit(p);await assert.rejects(validatePlan(p,dir.pathname))}})
test('audio paths are confined and actual duration checked',async()=>{
 const d=await mkdtemp(path.join(tmpdir(),'jk-shot-test-'));try{await mkdir(path.join(d,'assets'));const wav=Buffer.alloc(44+16000);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);await writeFile(path.join(d,'assets','ok.wav'),wav)
 const p=copy();p.audio={file:'assets/ok.wav',start:0,volume:.8};assert.ok((await validatePlan(p,d)).audio.duration>.9);p.audio.start=7.5;await assert.rejects(validatePlan(p,d));p.audio.file='assets/../outside.wav';await assert.rejects(validatePlan(p,d));await symlink('/etc/hosts',path.join(d,'assets','bad.wav'));p.audio={file:'assets/bad.wav',start:0,volume:1};await assert.rejects(validatePlan(p,d));
 }finally{await rm(d,{recursive:true,force:true})}
})
