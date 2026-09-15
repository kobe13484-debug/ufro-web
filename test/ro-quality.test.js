import test from 'node:test';
import assert from 'node:assert/strict';
import * as quality from '../src/core/quality.js';

const { solveRoQuality } = quality;
const closeTo = (a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

test('RO quality conserves solute mass', () => {
  assert.equal(typeof solveRoQuality, 'function');
  const r = solveRoQuality({
    feedFlow:100,
    feedTds:1018,
    recoveryPct:75,
    saltRejectionPct:96.56,
  });
  assert.equal(r.valid, true);
  closeTo(r.permeateFlow, 75);
  closeTo(r.concentrateFlow, 25);
  closeTo(r.permeateTds, 35.0192);
  closeTo(r.concentrateTds, 3966.9424, 1e-6);
  closeTo(r.soluteIn, r.solutePermeate + r.soluteConcentrate, 1e-6);
});

test('RO quality fails safely at 100% recovery', () => {
  const r = solveRoQuality({feedFlow:100,feedTds:1018,recoveryPct:100,saltRejectionPct:96.56});
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'RECOVERY_MUST_BE_BELOW_100');
  for (const value of [r.permeateFlow,r.concentrateFlow,r.permeateTds,r.concentrateTds]) {
    assert.equal(Number.isFinite(value), true);
  }
});
