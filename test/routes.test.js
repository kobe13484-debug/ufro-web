import test from 'node:test';
import assert from 'node:assert/strict';

let routesModule = {};
try { routesModule = await import('../src/core/routes.js'); } catch {}
const { solveRoutes } = routesModule;
const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const base = {
  feedFlow: 100,
  tssRejectPct: 10,
  sludgeRecyclePct: 70,
  ufRejectPct: 10,
  roRejectPct: 20,
  toRoPct: 50,
};

test('route A closes TSS, UF and RO flow balance', () => {
  assert.equal(typeof solveRoutes, 'function');
  const result = solveRoutes({...base, routes:{A:{enabled:true,sharePct:100}}});
  closeTo(result.branches.A.productFlow, 72.9);
  closeTo(result.branches.A.tssRejectFlow, 10);
  closeTo(result.branches.A.ufRejectFlow, 9);
  closeTo(result.branches.A.roRejectFlow, 8.1);
  closeTo(result.feedFlow, result.productFlow + result.tssRejectFlow + result.ufRoRejectFlow);
});

test('routes B-only and C-only close independently', () => {
  const b = solveRoutes({...base, routes:{B:{enabled:true,sharePct:100}}});
  closeTo(b.productFlow, 90);
  closeTo(b.tssRejectFlow, 10);
  closeTo(b.feedFlow, b.productFlow + b.tssRejectFlow);

  const c = solveRoutes({...base, routes:{C:{enabled:true,sharePct:100}}});
  closeTo(c.productFlow, 100);
  closeTo(c.feedFlow, c.productFlow);
});

test('A+B+C routes close total flow balance', () => {
  const result = solveRoutes({...base, routes:{
    A:{enabled:true,sharePct:40},
    B:{enabled:true,sharePct:30},
    C:{enabled:true,sharePct:30},
  }});
  closeTo(result.branches.A.feedFlow, 40);
  closeTo(result.branches.B.feedFlow, 30);
  closeTo(result.branches.C.feedFlow, 30);
  closeTo(result.productFlow, 86.16);
  closeTo(result.feedFlow, result.productFlow + result.tssRejectFlow + result.ufRoRejectFlow);
});

test('disabled routes contribute zero and enabled shares normalize', () => {
  const result = solveRoutes({...base, routes:{
    A:{enabled:false,sharePct:90},
    B:{enabled:true,sharePct:5},
    C:{enabled:true,sharePct:5},
  }});
  closeTo(result.branches.A.feedFlow, 0);
  closeTo(result.branches.B.feedFlow, 50);
  closeTo(result.branches.C.feedFlow, 50);
  closeTo(result.feedFlow, 100);
});
