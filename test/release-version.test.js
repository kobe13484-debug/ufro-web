import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/ufro_v8_backup.jsx',import.meta.url),'utf8');

test('release candidate is labeled JYN Plant Calculator v8.1',()=>{
  assert.equal(source.includes('JYN Reuse Water v8.1'),true);
  assert.equal(source.includes('>v8.1<'),true);
  assert.equal(source.includes('v8.0'),false);
});
