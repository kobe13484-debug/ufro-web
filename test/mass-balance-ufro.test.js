import test from 'node:test';
import assert from 'node:assert/strict';
import * as massBalance from '../src/core/massBalance.js';

const { solveUfBalance, solveRoBalance } = massBalance;
const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('UF balance closes feed into permeate and reject', () => {
  assert.equal(typeof solveUfBalance, 'function');
  const result = solveUfBalance({ feedFlow: 200.7294360476111, rejectPct: 10 });
  closeTo(result.permeateFlow, 180.65649244285);
  closeTo(result.rejectFlow, 20.072943604761093);
  closeTo(result.feedFlow, result.permeateFlow + result.rejectFlow);
});

test('RO balance closes feed into permeate and concentrate', () => {
  assert.equal(typeof solveRoBalance, 'function');
  const result = solveRoBalance({ feedFlow: 138.62596977140007, rejectPct: 25 });
  closeTo(result.permeateFlow, 103.96947732855006);
  closeTo(result.rejectFlow, 34.65649244285001);
  closeTo(result.feedFlow, result.permeateFlow + result.rejectFlow);
});
