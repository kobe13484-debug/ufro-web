import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhase15UiModel } from '../src/core/uiAdapter.js';

const MODEL = {
  mode: 'know-output', feedTds: 1000, productFlow: 100,
  routes: { A: { enabled: true, sharePct: 100 }, B: { enabled: false, sharePct: 0 }, C: { enabled: false, sharePct: 0 } },
  tssRejectPct: 15, sludgeRecyclePct: 60,
  ufRejectPct: 10, roRejectPct: 25, saltRejectionPct: 96,
  splitMode: 'manual', manualToRoPct: 75,
  hasTargetCond: false, targetCond: 0, tdsEcFactor: 0.5,
};

test('diagram TSS and sludge labels follow non-default engineering inputs', () => {
  const model = buildPhase15UiModel(MODEL);
  assert.deepEqual(model.diagramLabels, {
    process: 'Process 85%',
    reject: 'Reject 15%',
    return: '60% return',
    sludge: '40% Sludge',
  });
});
