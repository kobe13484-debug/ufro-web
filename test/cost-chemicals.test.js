import test from 'node:test';
import assert from 'node:assert/strict';
import * as cost from '../src/core/cost.js';

const { calculateContinuousChemicalCost, calculateEventChemicalCost } = cost;
const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('continuous RO chemicals use RO-feed volume', () => {
  assert.equal(typeof calculateContinuousChemicalCost, 'function');
  const result = calculateContinuousChemicalCost({
    flows: { roFeed: 3000, pretreatmentFeed: 5000 },
    chemicals: [
      { name: 'Antiscalant', flowBasis: 'roFeed', dosageKgM3: 0.0017, unitPrice: 250 },
      { name: 'NaHSO3', flowBasis: 'roFeed', dosageKgM3: 0.0034, unitPrice: 80 },
    ],
  });
  closeTo(result.rows[0].kgPerDay, 5.1);
  closeTo(result.rows[0].costPerDay, 1275);
  closeTo(result.rows[1].costPerDay, 816);
});

test('pretreatment chemicals use pretreatment inlet volume', () => {
  const result = calculateContinuousChemicalCost({
    flows: { roFeed: 3000, pretreatmentFeed: 5000 },
    chemicals: [
      { name: 'PAC', flowBasis: 'pretreatmentFeed', dosageKgM3: 0.02, unitPrice: 10 },
      { name: 'Polymer', flowBasis: 'pretreatmentFeed', dosageKgM3: 0.001, unitPrice: 100 },
    ],
  });
  closeTo(result.rows[0].costPerDay, 1000);
  closeTo(result.rows[1].costPerDay, 500);
});

test('event chemical daily cost derives from intervalDays', () => {
  assert.equal(typeof calculateEventChemicalCost, 'function');
  const result = calculateEventChemicalCost({ chemicals: [
    { name: 'UF CEB', kgEvent: 10, unitPrice: 100, intervalDays: 7 },
    { name: 'RO CIP', kgEvent: 20, unitPrice: 40, intervalDays: 60 },
  ] });
  closeTo(result.rows[0].dailyEquivalentCost, 1000 / 7);
  closeTo(result.rows[0].eventsPer60Days, 60 / 7);
  closeTo(result.rows[1].dailyEquivalentCost, 800 / 60);
});
