import test from 'node:test';
import assert from 'node:assert/strict';

import { solveRequiredDilution, solveManualDilution } from '../src/core/dilution.js';
const closeTo = (a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

test('required dilution matches hand calculation', () => {
  assert.equal(typeof solveRequiredDilution, 'function');
  const r = solveRequiredDilution({
    rejectFlow:100,
    rejectConductivity:6000,
    targetConductivity:5400,
    dilutionConductivity:500,
  });
  closeTo(r.dilutionFlow, 100 * (6000-5400) / (5400-500));
  closeTo(r.finalFlow, 112.24489795918367, 1e-9);
  closeTo(r.finalConductivity, 5400, 1e-9);
  assert.equal(r.feasible, true);
});

test('manual dilution uses flow-weighted conductivity', () => {
  const r = solveManualDilution({
    rejectFlow:100,
    rejectConductivity:6000,
    sources:[{flow:20,conductivity:1000}],
  });
  closeTo(r.finalFlow, 120);
  closeTo(r.finalConductivity, 5166.666666666667, 1e-9);
});
