import test from 'node:test';
import assert from 'node:assert/strict';
let cost = {};
try { cost = await import('../src/core/cost.js'); } catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

const { calculateRawWaterCost, calculateEquipmentEnergy } = cost;

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('raw water cost uses external raw water, not gross process feed', () => {
  assert.equal(typeof calculateRawWaterCost, 'function');
  const result = calculateRawWaterCost({
    externalRawFlow: 207.42041724919815,
    grossFeedFlow: 223.0327067195679,
    operatingHoursPerDay: 22,
    unitCostPerM3: 5,
  });
  closeTo(result.volumePerDay, 207.42041724919815 * 22);
  closeTo(result.costPerDay, 207.42041724919815 * 22 * 5);
  assert.ok(result.costPerDay < 223.0327067195679 * 22 * 5);
});

test('equipment energy uses operating loadKw instead of nameplate kW', () => {
  assert.equal(typeof calculateEquipmentEnergy, 'function');
  const result = calculateEquipmentEnergy({
    equipment: [{ name: 'RO HP Pump', kw: 75, loadKw: 63.75, installedQty: 1, operatingQty: 1, hoursDay: 22 }],
    electricityCostPerKwh: 4,
  });
  closeTo(result.totalKwhPerDay, 63.75 * 22);
  closeTo(result.totalCostPerDay, 63.75 * 22 * 4);
});

test('standby equipment is not charged as operating equipment', () => {
  const result = calculateEquipmentEnergy({
    equipment: [{ name: 'Raw Water Pump', kw: 11, loadKw: 9.35, installedQty: 2, operatingQty: 1, hoursDay: 22 }],
    electricityCostPerKwh: 4,
  });
  closeTo(result.totalKwhPerDay, 9.35 * 1 * 22);
  assert.equal(result.rows[0].installedQty, 2);
  assert.equal(result.rows[0].operatingQty, 1);
});

