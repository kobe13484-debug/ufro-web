import test from 'node:test';
import assert from 'node:assert/strict';
import * as dilution from '../src/core/dilution.js';

const { solveRejectReturnLoop } = dilution;
const closeTo = (a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

const base = {
  grossFeedFlow:100,
  productFlow:72.9,
  sludgeRecycleFlow:7,
  sludgeWasteFlow:3,
  treatedRejectFlow:17.1,
  treatedRejectTds:2000,
  externalRawTds:500,
  sludgeRecycleTds:800,
};

test('reject return changes external raw demand', () => {
  assert.equal(typeof solveRejectReturnLoop, 'function');
  const zero = solveRejectReturnLoop({...base,rejectReturnPct:0});
  const half = solveRejectReturnLoop({...base,rejectReturnPct:50});
  closeTo(zero.externalRawFlow,93);
  closeTo(half.externalRawFlow,84.45);
  closeTo(half.rejectReturnFlow,8.55);
  closeTo(half.finalWastewaterFlow,8.55);
});

test('returned reject quality feeds inlet mixing node', () => {
  const r = solveRejectReturnLoop({...base,rejectReturnPct:50});
  closeTo(r.inlet.flow,100);
  closeTo(r.inlet.tds,649.25);
  closeTo(r.inlet.conductivity,1298.5);
  closeTo(r.externalRawFlow, r.productFlow + r.finalExternalWasteFlow);
});
