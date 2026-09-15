import test from 'node:test';
import assert from 'node:assert/strict';
let adapter = {};
try { adapter = await import('../src/core/uiAdapter.js'); } catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

const { buildPhase15UiModel } = adapter;
const closeTo = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

const DEFAULT = {
  mode: 'know-output', feedTds: 1018, productFlow: 146,
  routes: { A: { enabled: true, sharePct: 100 }, B: { enabled: false, sharePct: 0 }, C: { enabled: false, sharePct: 0 } },
  tssRejectPct: 10, sludgeRecyclePct: 70, ufRejectPct: 10, roRejectPct: 25,
  saltRejectionPct: 96.56, splitMode: 'auto', manualToRoPct: 75,
  hasTargetCond: true, targetCond: 636, tdsEcFactor: 0.5, safetyMarginPct: 10,
  dilutionSources: [],
};

test('UI adapter matches default Plan A golden engineering values', () => {
  assert.equal(typeof buildPhase15UiModel, 'function');
  const model = buildPhase15UiModel(DEFAULT);
  closeTo(model.calc.feedFlow, 223.0327067195679);
  closeTo(model.calc.tssRejectFlow, 22.303270671956795);
  closeTo(model.calc.sludgeRecycleFlow, 15.612289470369756);
  closeTo(model.calc.ufRejectFlow, 20.072943604761093);
  closeTo(model.calc.roRejectFlow, 34.65649244285001);
  closeTo(model.calc.ufRoRejectFlow, 54.7294360476111);
  closeTo(model.kpi.productConductivity, 636);
});

test('UI adapter exposes route and stream outputs without mixing TSS into UF/RO reject', () => {
  const model = buildPhase15UiModel(DEFAULT);
  closeTo(model.routes.A.productFlow, 146);
  assert.equal(model.routes.B.enabled, false);
  const reject = model.streams.find((stream) => stream.id === 'ufro-reject');
  assert.ok(reject);
  closeTo(reject.flow, model.calc.ufRejectFlow + model.calc.roRejectFlow);
  closeTo(reject.flow, 54.7294360476111);
});

test('UI adapter uses safety margin and reports missing dilution source instead of inventing water', () => {
  const model = buildPhase15UiModel(DEFAULT);
  assert.equal(model.discharge.regulatoryAllowed, true);
  assert.equal(model.discharge.requiresAction, true);
  closeTo(model.discharge.operatingConductivityLimit, 5400);
  assert.equal(model.dilution.feasible, false);
  assert.equal(model.dilution.reason, 'NO_DILUTION_SOURCE');
});
