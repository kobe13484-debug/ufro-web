import test from 'node:test';
import assert from 'node:assert/strict';
let network = {};
try { network = await import('../src/core/projectNetwork.js'); } catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

const { solveProjectNetwork } = network;
const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('phase 1.0 output splits once between sale and phase 1.5', () => {
  assert.equal(typeof solveProjectNetwork, 'function');
  const result = solveProjectNetwork({
    phase10: { outputFlow: 100, outputTds: 500, salePct: 20 },
    phase15OtherFeed: { flow: 20, tds: 1000 },
  });
  closeTo(result.phase10.sale.flow, 20);
  closeTo(result.phase10.toPhase15.flow, 80);
  closeTo(result.phase10.sale.flow + result.phase10.toPhase15.flow, 100);
  closeTo(result.phase15.feed.flow, 100);
  closeTo(result.phase15.feed.tds, 600);
});

test('increasing phase 1.0 sale reduces downstream phase 1.5 feed', () => {
  const lowSale = solveProjectNetwork({
    phase10: { outputFlow: 100, outputTds: 500, salePct: 20 },
    phase15OtherFeed: { flow: 20, tds: 1000 },
  });
  const highSale = solveProjectNetwork({
    phase10: { outputFlow: 100, outputTds: 500, salePct: 50 },
    phase15OtherFeed: { flow: 20, tds: 1000 },
  });
  closeTo(lowSale.phase15.feed.flow, 100);
  closeTo(highSale.phase15.feed.flow, 70);
  assert.ok(highSale.phase15.feed.flow < lowSale.phase15.feed.flow);
});
