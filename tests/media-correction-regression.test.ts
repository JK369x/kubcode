import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { skills } from "../lib/catalog";
import { MEDIA_COVERS, coverFor } from "../lib/media-covers";
import { statusLabel } from "../lib/status-labels";

const NodeModule = require("node:module") as { _extensions: Record<string, (m:{exports:unknown})=>void> };
NodeModule._extensions[".css"] = m => { m.exports = new Proxy({}, {get:(_t,k)=>k==="__esModule"?false:String(k)}); };
const { DownloadAction } = require("../components/DownloadAction") as typeof import("../components/DownloadAction");
const { MediaSkillCard } = require("../components/MediaSkillCard") as typeof import("../components/MediaSkillCard");

test("cover derivatives belong to the exact genuine source video, without changing catalog originals", () => {
  for (const [slug, cover] of Object.entries(MEDIA_COVERS)) {
    const skill = skills.find(s=>s.slug===slug)!;
    assert.ok(skill.examples.some(e=>e.video===cover.video));
    assert.equal(coverFor(skill),cover.poster);
    assert.notEqual(cover.poster,skill.examples[0].poster);
    assert.equal(cover.second,4);
    assert.equal(cover.width,cover.crop[2]);
    assert.equal(cover.height,cover.crop[3]);
    assert.equal(coverFor({...skill,examples:[]}),undefined,"known slug cannot invent art without source media");
  }
});

test("first-row cards can request eager posters instead of blank lazy captures", () => {
  const html=renderToStaticMarkup(createElement(MediaSkillCard,{skill:skills[0],onSelectSkill:()=>{},eager:true}));
  assert.match(html,/<img[^>]+class="poster"[^>]+loading="eager"/);
});

test("detail download mounts the same truly disabled neutral control, not a purple fake action", () => {
  const html=renderToStaticMarkup(createElement(DownloadAction,{slug:skills[0].slug}));
  assert.match(html,/id="download" tabindex="-1"/);
  assert.match(html,/data-conditions="none"/);
  assert.match(html,/<button[^>]+class="unavailable"[^>]+disabled=""/);
  assert.match(html,/ดาวน์โหลด skill/);
  assert.match(html,/ยังไม่เปิดดาวน์โหลด/);
  assert.doesNotMatch(html,/class="primary"|\/api\/download|\.zip|ดาวน์โหลดสำเร็จ/);
});

test("catalog, opened preview, detail and register share truthful Thai status labels", () => {
  assert.equal(statusLabel("selected"),"เลือกแนวภาพแล้ว");
  assert.equal(statusLabel("draft"),"ฉบับทดลอง");
  assert.equal(statusLabel("experimental"),"ฉบับทดลอง");
  assert.equal(statusLabel("shared"),"เวิร์กโฟลว์ร่วม");
  assert.equal(statusLabel("local"),"เวิร์กโฟลว์ในเครื่อง");
  for (const skill of skills) assert.notEqual(statusLabel(skill.status),"รอตรวจ",skill.slug);
  assert.equal(statusLabel("unknown"),"รอตรวจ");
  assert.equal(statusLabel("__proto__"),"รอตรวจ");
});
