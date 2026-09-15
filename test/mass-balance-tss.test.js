import test from 'node:test';
import assert from 'node:assert/strict';

let massBalanceModule = {};
try {
  massBalanceModule = await import('../src/core/massBalance.js');
} catch {
  // RED state: mass-balance core does not exist yet.
}

const { solveTssBalance } = massBalanceModule;
const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('TSS balance closes process reject and recycle streams', () => {
  assert.equal(typeof solveTssBalance, 'function');
  const result = solveTssBalance({
    grossFeedFlow: 223.0327067195679,
    rejectPct: 10,
    recyclePct: 70,
  });

  closeTo(result.processOutFlow, 200.7294360476111);
  closeTo(result.rejectFlow, 22.303270671956795);
  closeTo(result.recycleFlow, 15.612289470369756);
  closeTo(result.sludgeWasteFlow, 6.6909812015870385);
  closeTo(result.externalRawFlow, 207.42041724919815);
});

test('TSS balance conserves gross feed and internal recycle', () => {
  assert.equal(typeof solveTssBalance, 'function');
  const result = solveTssBalance({ grossFeedFlow: 100, rejectPct: 12, recyclePct: 65 });

  closeTo(result.grossFeedFlow, result.processOutFlow + result.rejectFlow);
  closeTo(result.rejectFlow, result.recycleFlow + result.sludgeWasteFlow);
  closeTo(result.grossFeedFlow, result.externalRawFlow + result.recycleFlow);
});

test('TSS balance clamps invalid percentages to physical limits', () => {
  assert.equal(typeof solveTssBalance, 'function');
  const result = solveTssBalance({ grossFeedFlow: 100, rejectPct: 150, recyclePct: -20 });
  closeTo(result.processOutFlow, 0);
  closeTo(result.rejectFlow, 100);
  closeTo(result.recycleFlow, 0);
  closeTo(result.externalRawFlow, 100);
});
