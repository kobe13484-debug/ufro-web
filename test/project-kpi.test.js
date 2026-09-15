import test from 'node:test';
import assert from 'node:assert/strict';
import * as network from '../src/core/projectNetwork.js';

const { calculateProjectKpis } = network;
const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('project KPI closes external input against product waste and loss', () => {
  assert.equal(typeof calculateProjectKpis, 'function');
  const result = calculateProjectKpis({
    phase10ExternalRawFlow: 120,
    phase15ExternalRawFlow: 80,
    phase10Sale: { flow: 20, tds: 500 },
    phase15Product: { flow: 150, tds: 300 },
    finalWasteFlow: 20,
    internalRecycleFlow: 30,
    physicalLossFlow: 10,
    totalOpexPerDay: 17000,
  });
  closeTo(result.externalRawFlow, 200);
  closeTo(result.productFlow, 170);
  closeTo(result.balanceError, 0);
  assert.equal(result.balanceClosed, true);
});

test('project KPI reports recovery product quality recycle and OPEX per m3', () => {
  const result = calculateProjectKpis({
    phase10ExternalRawFlow: 120,
    phase15ExternalRawFlow: 80,
    phase10Sale: { flow: 20, tds: 500 },
    phase15Product: { flow: 150, tds: 300 },
    finalWasteFlow: 20,
    internalRecycleFlow: 30,
    physicalLossFlow: 10,
    totalOpexPerDay: 17000,
  });
  closeTo(result.netRecoveryPct, 85);
  closeTo(result.internalRecycleFlow, 30);
  closeTo(result.finalProductTds, (20 * 500 + 150 * 300) / 170);
  closeTo(result.finalProductConductivity, result.finalProductTds / 0.5);
  closeTo(result.opexPerM3, 100);
});
