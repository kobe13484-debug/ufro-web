import test from 'node:test';
import assert from 'node:assert/strict';
import * as solver from '../src/core/solver.js';
import { solveRoutes } from '../src/core/routes.js';

const { solveRecoveryAwareBlend } = solver;
const closeTo=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const config={
  feedTds:1018,
  targetTds:318,
  routes:{A:{enabled:true,sharePct:50},B:{enabled:true,sharePct:50}},
  tssRejectPct:10,
  sludgeRecyclePct:70,
  ufRejectPct:10,
  roRejectPct:25,
  toRoPct:100,
  saltRejectionPct:96.56,
};

test('old product-share-as-feed-share logic reproduces ~806 uS/cm bug', () => {
  const roPermTds=1018*(1-0.9656);
  const oldAShare=(1018-318)/(1018-roPermTds);
  const flow=solveRoutes({...config,feedFlow:100,routes:{
    A:{enabled:true,sharePct:oldAShare*100},
    B:{enabled:true,sharePct:(1-oldAShare)*100},
  }});
  const productTds=(flow.branches.A.productFlow*roPermTds+flow.branches.B.productFlow*1018)/flow.productFlow;
  closeTo(productTds/0.5,806.4295648545931);
});

test('recovery-aware blend reaches 636 uS/cm target', () => {
  assert.equal(typeof solveRecoveryAwareBlend,'function');
  const r=solveRecoveryAwareBlend(config);
  assert.equal(r.feasible,true);
  closeTo(r.achievedTds,318,1e-6);
  closeTo(r.achievedConductivity,636,1e-6);
  closeTo(r.productShares.A,0.7121197077297949,1e-9);
  closeTo(r.feedShares.A,0.7856235029102412,1e-9);
  assert.ok(r.feedShares.A>r.productShares.A);
});

test('target below best achievable route is infeasible', () => {
  const r=solveRecoveryAwareBlend({...config,targetTds:20});
  assert.equal(r.feasible,false);
  assert.equal(r.reason,'TARGET_BELOW_ACHIEVABLE_QUALITY');
});
