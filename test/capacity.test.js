import test from 'node:test';
import assert from 'node:assert/strict';
import { solveKnownInput, solveKnownOutput, solveRecoveryAwareBlend } from '../src/core/solver.js';

const process={
  tssRejectPct:10,
  sludgeRecyclePct:70,
  ufRejectPct:10,
  roRejectPct:25,
  toRoPct:100,
  saltRejectionPct:96.56,
};

test('known-input reports route max-flow violation and ignores disabled route capacity', () => {
  const r=solveKnownInput({feedFlow:100,...process,routes:{
    A:{enabled:true,sharePct:50,maxFlow:40},
    B:{enabled:true,sharePct:50,maxFlow:60},
    C:{enabled:false,sharePct:999,maxFlow:0},
  }});
  assert.equal(r.feasible,false);
  assert.equal(r.reason,'ROUTE_CAPACITY_EXCEEDED');
  assert.deepEqual(r.capacityViolations.map(v=>v.id),['A']);
  assert.equal(r.branches.C.feedFlow,0);
});

test('known-output respects route max flow', () => {
  const r=solveKnownOutput({productFlow:90,...process,routes:{B:{enabled:true,sharePct:100,maxFlow:80}}});
  assert.equal(r.feasible,false);
  assert.equal(r.reason,'ROUTE_CAPACITY_EXCEEDED');
  assert.equal(r.capacityViolations[0].id,'B');
});

test('quality target below achievable RO permeate is explicit infeasible', () => {
  const r=solveRecoveryAwareBlend({
    ...process,
    feedTds:1018,
    targetTds:20,
    routes:{A:{enabled:true,sharePct:100}},
  });
  assert.equal(r.feasible,false);
  assert.equal(r.reason,'TARGET_BELOW_ACHIEVABLE_QUALITY');
});
