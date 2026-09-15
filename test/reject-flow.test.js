import test from 'node:test';
import assert from 'node:assert/strict';
import { combineUfRoReject, combineUfRoRejectTds } from '../src/flowMath.js';

test('UF/RO Reject is UF Reject + RO Reject only, excluding TSS reject', () => {
  const result = combineUfRoReject({
    ufRejectFlow: 1151,
    roRejectFlow: 2590,
    tssRejectFlow: 1527,
  });

  assert.equal(result, 3741);
});

test('UF/RO Reject TDS is weighted from UF and RO reject only', () => {
  const result = combineUfRoRejectTds({
    ufRejectFlow: 1151,
    ufRejectTds: 1018,
    roRejectFlow: 2590,
    roRejectTds: 3000,
  });

  const expected = (1151 * 1018 + 2590 * 3000) / (1151 + 2590);
  assert.ok(Math.abs(result - expected) < 1e-9);
});
