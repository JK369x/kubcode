import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { characterSheet, coverBrief } from "../lib/cover-brief";

const docs = readFileSync("docs/covers.md", "utf8");

test("the mascot character sheet lives once, in docs/covers.md", () => {
  const sheet = characterSheet(docs);
  assert.match(sheet, /Kub, the cat/);
  assert.match(sheet, /Kode, the dog/);
  assert.throws(() => characterSheet("# no sheet here"), /character sheet/);
});

test("every cover brief carries the sheet, the cartoon style and the brand rules", () => {
  const brief = coverBrief({
    slug: "my-article",
    title: "ชื่อบทความ",
    description: "คำอธิบาย",
    scene: "Kub types on a laptop while Kode holds a microphone",
    sheet: characterSheet(docs),
  });
  assert.ok(brief.includes(characterSheet(docs)), "full character sheet in the prompt");
  assert.match(brief, /Kub types on a laptop while Kode holds a microphone/);
  assert.match(brief, /flat colour/i);
  assert.match(brief, /NOT glossy|no gloss/i);
  assert.match(brief, /no third-party logos/i);
  assert.match(brief, /no text/i);
  assert.match(brief, /public\/covers\/my-article\/:/);
  assert.match(brief, /cover\.jpg: 1600×900/);
  assert.match(brief, /og\.jpg/);
  assert.match(brief, /cover\.json/);
  assert.match(brief, /docs\/covers\/mascots\.png/, "uses the mascot reference sheet");
  // No scene given: the brief asks for the article's real activity.
  assert.match(coverBrief({ slug: "x", title: "t", description: "d", sheet: "S" }), /doing the article's real activity/);
});
