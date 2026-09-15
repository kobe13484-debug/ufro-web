import test from 'node:test';
import assert from 'node:assert/strict';
import * as cost from '../src/core/cost.js';

const { calculateTotalOpex } = cost;
const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('total OPEX reconciles daily cost and cost per product m3', () => {
  assert.equal(typeof calculateTotalOpex, 'function');
  const result = calculateTotalOpex({
    productVolumePerDay: 10000,
    rawWaterCostPerDay: 22816.245897411794,
    electricityCostPerDay: 12000,
    continuousChemicalCostPerDay: 4500,
    eventChemicalCostPerDay: 500,
    laborCostPerDay: 3000,
    dilutionCostPerDay: 1000,
    sludgeWasteCostPerDay: 2000,
    otherCostPerDay: 750,
  });
  closeTo(result.costPerM3 * 10000, result.totalCostPerDay);
});

test('monthly OPEX equals daily cost times configured operating days', () => {
  const result = calculateTotalOpex({
    productVolumePerDay: 8000,
    operatingDaysPerMonth: 26,
    rawWaterCostPerDay: 10000,
    electricityCostPerDay: 7000,
    continuousChemicalCostPerDay: 2500,
    eventChemicalCostPerDay: 300,
    laborCostPerDay: 2000,
    dilutionCostPerDay: 400,
    sludgeWasteCostPerDay: 600,
    otherCostPerDay: 200,
  });
  closeTo(result.totalCostPerMonth, result.totalCostPerDay * 26);
  closeTo(result.productVolumePerMonth, 8000 * 26);
});

test('zero product volume returns zero unit cost without NaN or Infinity', () => {
  const result = calculateTotalOpex({ productVolumePerDay: 0, rawWaterCostPerDay: 1000 });
  assert.equal(result.costPerM3, 0);
  assert.ok(Number.isFinite(result.totalCostPerDay));
});
