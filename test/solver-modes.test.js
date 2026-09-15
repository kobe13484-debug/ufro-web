import test from 'node:test';
import assert from 'node:assert/strict';

let solver = {};
try { solver = await import('../src/core/solver.js'); } catch {}
const { solveKnownInput, solveKnownOutput } = solver;
const closeTo=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const process={
  routes:{A:{enabled:true,sharePct:100}},
  tssRejectPct:10,
  sludgeRecyclePct:70,
  ufRejectPct:10,
  roRejectPct:20,
  toRoPct:50,
  rejectReturnPct:0,
};

test('known-input forward result can be solved backward to same feed', () => {
  assert.equal(typeof solveKnownInput,'function');
  assert.equal(typeof solveKnownOutput,'function');
  const forward=solveKnownInput({feedFlow:100,...process});
  assert.equal(forward.feasible,true);
  closeTo(forward.productFlow,72.9);
  const backward=solveKnownOutput({productFlow:forward.productFlow,...process});
  assert.equal(backward.feasible,true);
  closeTo(backward.feedFlow,100);
  closeTo(backward.productFlow,forward.productFlow);
});

test('known-output handles zero and infeasible product safely', () => {
  const zero=solveKnownOutput({productFlow:0,...process});
  assert.equal(zero.feasible,true);
  closeTo(zero.feedFlow,0);

  const impossible=solveKnownOutput({productFlow:10,routes:{}});
  assert.equal(impossible.feasible,false);
  assert.equal(impossible.reason,'NO_PRODUCT_RECOVERY');
  assert.equal(Number.isFinite(impossible.feedFlow),true);
});
