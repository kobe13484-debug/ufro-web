import test from 'node:test';
import assert from 'node:assert/strict';
import * as quality from '../src/core/quality.js';

const { validateDischarge } = quality;

test('5,771 uS/cm is direct-OK with zero safety margin', () => {
  assert.equal(typeof validateDischarge, 'function');
  const r = validateDischarge({conductivity:5771,safetyMarginPct:0});
  assert.equal(r.regulatoryAllowed, true);
  assert.equal(r.operatingAllowed, true);
  assert.equal(r.requiresAction, false);
  assert.equal(r.severityStatus, 'PASS');
  assert.equal(r.operatingConductivityLimit, 6000);
});

test('5,771 uS/cm requires action with 10% safety margin', () => {
  const r = validateDischarge({conductivity:5771,safetyMarginPct:10});
  assert.equal(r.regulatoryAllowed, true);
  assert.equal(r.operatingAllowed, false);
  assert.equal(r.requiresAction, true);
  assert.equal(r.severityStatus, 'WARNING');
  assert.equal(r.operatingConductivityLimit, 5400);
  assert.equal(r.operatingTdsLimit, 2700);
});

test('conductivity above regulatory limit fails', () => {
  const r = validateDischarge({conductivity:6100,safetyMarginPct:0});
  assert.equal(r.regulatoryAllowed, false);
  assert.equal(r.severityStatus, 'FAIL');
});
