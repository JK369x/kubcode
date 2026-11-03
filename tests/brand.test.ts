import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('website uses the approved lowercase kubcode brand', () => {
  const layout=readFileSync('app/layout.tsx','utf8');
  assert.match(layout,/title: "kubcode —/);
  assert.match(layout,/>\s*kubcode\s*<\/Link>/);
  assert.match(layout,/<strong>kubcode<\/strong>/);
  assert.doesNotMatch(layout,/FIELDWORK|ชื่อชั่วคราว/);
});
