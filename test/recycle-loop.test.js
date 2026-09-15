import test from 'node:test';
import assert from 'node:assert/strict';
import { solveRoutes } from '../src/core/routes.js';

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const scenario = (rejectReturnPct) => solveRoutes({
  feedFlow: 100,
  routes: {A:{enabled:true,sharePct:100}},
  tssRejectPct: 10,
  sludgeRecyclePct: 70,
  ufRejectPct: 10,
  roRejectPct: 20,
  toRoPct: 50,
  rejectReturnPct,
});

function assertExternalClosure(result) {
  closeTo(result.externalRawFlow, result.productFlow + result.finalExternalWasteFlow);
  closeTo(result.feedFlow, result.externalRawFlow + result.internalRecycleFlow);
}

test('0% UF/RO return reduces raw water only by sludge recycle', () => {
  const result = scenario(0);
  closeTo(result.internalRecycleFlow, 7);
  closeTo(result.externalRawFlow, 93);
  closeTo(result.finalWastewaterFlow, 17.1);
  closeTo(result.finalExternalWasteFlow, 20.1);
  assertExternalClosure(result);
});

test('50% UF/RO return closes internal recycle loop', () => {
  const result = scenario(50);
  closeTo(result.rejectReturnFlow, 8.55);
  closeTo(result.internalRecycleFlow, 15.55);
  closeTo(result.externalRawFlow, 84.45);
  closeTo(result.finalWastewaterFlow, 8.55);
  closeTo(result.finalExternalWasteFlow, 11.55);
  assertExternalClosure(result);
});

test('100% UF/RO return leaves only sludge waste as external waste', () => {
  const result = scenario(100);
  closeTo(result.rejectReturnFlow, 17.1);
  closeTo(result.internalRecycleFlow, 24.1);
  closeTo(result.externalRawFlow, 75.9);
  closeTo(result.finalWastewaterFlow, 0);
  closeTo(result.finalExternalWasteFlow, 3);
  assertExternalClosure(result);
});
