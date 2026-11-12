// Home hero, option B "phone stage" (owner decision 2026-11-11, merged in #85),
// in real Chrome against a running build:
//   BASE_URL=http://127.0.0.1:3040 node tests/kinetic-hero-browser.mjs [label]
// Needs the showcase media (posters + preview loops) the build may publish.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:3040';
const label = process.argv[2] || 'after';
const dir = `.qa/hero-browser-${label}`;
fs.mkdirSync(dir, { recursive: true });
const report = { base, label, checks: [], errors: [], screenshots: [], status: 'running' };
const check = (name, data = {}) => report.checks.push({ name, ...data });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const MUTE = '2026-11-01_what-if-studio_ep01_mute-touch';
const pick = (page, id) => page.locator(`[data-clip="${id}"]`);
const selected = (page) => page.locator('[role=radiogroup] [data-clip][data-state=on]').getAttribute('data-clip');
const typed = (page) => page.locator('h1 [aria-hidden=true]').innerText();
const playing = (page) => page.evaluate(() => [...document.querySelectorAll('[class*=screen] video')].filter((v) => !v.paused).length);
const accent = (page) => page.evaluate(() => getComputedStyle(document.querySelector('[class*=stageArea]')).getPropertyValue('--accent').trim());

async function open(opts = {}) {
  const { width = 1440, theme = 'dark', reducedMotion = 'no-preference', saveData = false } = opts;
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion });
  await context.addInitScript((t) => localStorage.setItem('jk-theme', t), theme);
  if (saveData) await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }));
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  const previews = [];
  page.on('request', (r) => /preview\.mp4/.test(r.url()) && previews.push(r.url()));
  const res = await page.goto(base + '/', { waitUntil: 'load' });
  assert.equal(res.status(), 200);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  return { page, context, previews };
}
async function shot(page, name) {
  const path = `${dir}/${name}.png`;
  await page.screenshot({ path });
  report.screenshots.push(path);
}

try {
  {
    const { page, context, previews } = await open();
    // One h1: static line 1 + typed line 2; screen readers get the phrase once.
    assert.equal(await page.locator('h1').count(), 1);
    assert.match(await page.locator('h1').innerText(), /^เห็นคลิปไหนถูกใจ/);
    assert.equal(await typed(page), 'ทำแนวซอมบี้คอนโด');
    assert.equal(await page.locator('h1 .sr-only').innerText(), 'ทำแนวซอมบี้คอนโด');
    check('headline: one h1, line 2 is ทำแนว<แนวเรื่อง> of the selected clip, full phrase for screen readers');

    // Only the active preview plays, versioned URL; only the next poster preloads.
    assert.equal(await playing(page), 1);
    assert.ok(previews.length >= 1 && previews.every((u) => /preview\.mp4\?v=[0-9a-f]{12}$/.test(u)), JSON.stringify(previews));
    const preloads = await page.evaluate(() => [...document.querySelectorAll('link[rel=preload][as=image]')].map((l) => decodeURIComponent(l.href)).filter((h) => h.includes('/showcase/')));
    assert.equal(preloads.length, 1, JSON.stringify(preloads));
    assert.match(preloads[0], /freshstack-what-if_ep03/);
    check('only the active preview plays (?v= URL); only the next clip poster is preloaded', { previews: previews.length });
    await shot(page, '1440-dark-initial');

    // Auto-advance after ~6 s while untouched.
    const first = await selected(page);
    await page.waitForTimeout(6600);
    assert.notEqual(await selected(page), first);
    check('auto-advance moves to the next clip');

    // Picking a clip: aura colour + typed line change, auto-advance stops for good.
    await pick(page, MUTE).click();
    await page.waitForFunction(() => document.querySelector('h1 [aria-hidden=true]')?.textContent === 'ทำแนวถ้าเกิดว่า…', null, { timeout: 5000 });
    // The aura eases to Mute Touch's amber (#f2a64a) over 0.9 s.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[class*=stageArea]')).getPropertyValue('--accent').trim() === 'rgb(242, 166, 74)', null, { timeout: 3000 });
    assert.equal(await page.locator('[data-hero-auto]').getAttribute('aria-pressed'), 'true');
    const frames = [];
    await page.waitForTimeout(300);
    frames.push(await typed(page));
    check('a pick changes the aura and retypes the headline; auto-advance stops', { accent: await accent(page) });
    await page.waitForTimeout(6600);
    assert.equal(await selected(page), MUTE, 'stays on the picked clip');
    assert.equal(await playing(page), 1);
    await shot(page, '1440-dark-mute-touch');

    // Typewriter: erases only the differing tail, types by grapheme (tone marks never alone).
    await pick(page, 'low-poly-urban-study').click();
    const seen = [];
    for (let i = 0; i < 30; i++) {
      seen.push(await typed(page));
      await page.waitForTimeout(40);
    }
    assert.ok(seen.every((s) => s.startsWith('ทำแนว')), 'common prefix kept: ' + JSON.stringify(seen));
    for (const s of seen) assert.doesNotMatch(s, /ทำแนว[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/, 'no orphan mark after the prefix');
    await page.waitForFunction(() => document.querySelector('h1 [aria-hidden=true]')?.textContent === 'ทำแนวเบื้องหลังเมือง', null, { timeout: 5000 });
    check('typewriter keeps ทำแนว and types the new tail', { frames: [...new Set(seen)].length });

    // Keyboard: arrows / Home / End move the selection with focus; Tab leaves the group.
    await pick(page, await selected(page)).focus();
    await page.keyboard.press('Home');
    await page.waitForTimeout(150);
    assert.equal(await selected(page), '2026-10-25_zombie-condo_ep01_tomorrow-invasion');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const last = await selected(page);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.clip), last, 'focus follows');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    assert.equal(await selected(page), '2026-11-01_freshstack-what-if_ep03_internet-gone-week');
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert.equal(ring, 'solid', 'visible focus ring on the picker');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-hero-auto')), true);
    check('keyboard: Home / End / arrows (wrapping) select with focus, visible ring, Tab leaves the group');

    // Prev / next buttons.
    await page.getByRole('button', { name: 'คลิปถัดไป' }).click();
    await page.waitForTimeout(150);
    assert.equal(await selected(page), '2026-10-29_mall-infection_ep01_first-night');
    await page.getByRole('button', { name: 'คลิปก่อนหน้า' }).click();
    await page.waitForTimeout(150);
    assert.equal(await selected(page), '2026-11-01_freshstack-what-if_ep03_internet-gone-week');
    check('prev / next buttons');

    // Off screen: nothing plays; back on screen: the active preview resumes.
    await page.locator('#skill-index').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    assert.equal(await playing(page), 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    assert.equal(await playing(page), 1);
    check('the preview pauses off screen and resumes on return');
    await context.close();
  }

  // Reduced motion and Save-Data: posters only, final phrase, no auto-advance.
  for (const mode of ['reduced-motion', 'save-data']) {
    const { page, context, previews } = await open({ width: 390, reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference', saveData: mode === 'save-data' });
    await page.waitForTimeout(6600);
    assert.equal(previews.length, 0, `${mode}: no preview requests`);
    assert.equal(await playing(page), 0);
    assert.equal(await typed(page), 'ทำแนวซอมบี้คอนโด');
    assert.equal(await page.locator('[data-hero-auto]').count(), 0);
    assert.equal(await selected(page), '2026-10-25_zombie-condo_ep01_tomorrow-invasion', `${mode}: no auto-advance`);
    await pick(page, MUTE).click();
    await page.waitForTimeout(100);
    assert.equal(await typed(page), 'ทำแนวถ้าเกิดว่า…', `${mode}: final phrase at once`);
    assert.equal(previews.length, 0);
    check(`${mode}: posters only, no typing, no auto-advance`);
    await context.close();
  }

  // Layout: no sideways scroll; screenshots for every width and theme.
  for (const width of [1440, 1280, 768, 390, 375]) {
    for (const theme of ['dark', 'light']) {
      const { page, context } = await open({ width, theme });
      const d = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, vw: innerWidth }));
      assert.ok(d.scroll <= d.vw, `${width}-${theme} overflow ${JSON.stringify(d)}`);
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      if ([1440, 390].includes(width)) await shot(page, `${width}-${theme}`);
      await context.close();
    }
  }
  check('no horizontal scroll at 1440/1280/768/390/375 in both themes');

  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = String(error);
  throw error;
} finally {
  fs.writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.map((c) => c.name), failure: report.failure }, null, 2));
  await browser.close();
}
