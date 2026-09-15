import test from 'node:test';
import assert from 'node:assert/strict';
import { combineUfRoReject, combineUfRoRejectTds } from '../src/flowMath.js';

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('v8.0 default Plan A engineering baseline is frozen', () => {
  const feedTds = 1018;
  const productFlow = 146;
  const targetTds = 636 * 0.5;
  const tssRecovery = 0.90;
  const ufRecovery = 0.90;
  const roRecovery = 0.75;
  const saltRejection = 0.9656;
  const roPermTds = feedTds * (1 - saltRejection);
  const bypassRatio = (targetTds - roPermTds) / (feedTds - roPermTds);
  const bypassFlow = bypassRatio * productFlow;
  const roPermFlow = (1 - bypassRatio) * productFlow;
  const roFeedFlow = roPermFlow / roRecovery;
  const ufPermeateFlow = bypassFlow + roFeedFlow;
  const ufFeedFlow = ufPermeateFlow / ufRecovery;
  const ufRejectFlow = ufFeedFlow - ufPermeateFlow;
  const grossFeedFlow = ufFeedFlow / tssRecovery;
  const tssRejectFlow = grossFeedFlow - ufFeedFlow;
  const roRejectFlow = roFeedFlow - roPermFlow;
  const productTds = (bypassFlow * feedTds + roPermFlow * roPermTds) / productFlow;

  const ufRoRejectFlow = combineUfRoReject({ ufRejectFlow, roRejectFlow });
  const roRejectTds = (feedTds - roRecovery * roPermTds) / (1 - roRecovery);
  const ufRoRejectTds = combineUfRoRejectTds({
    ufRejectFlow,
    ufRejectTds: feedTds,
    roRejectFlow,
    roRejectTds,
  });

  closeTo(productTds * 2, 636);
  closeTo(grossFeedFlow, 223.0327067195679);
  closeTo(tssRejectFlow, 22.303270671956795);
  closeTo(tssRejectFlow * 0.70, 15.612289470369756);
  closeTo(tssRejectFlow * 0.30, 6.6909812015870385);
  closeTo(ufRejectFlow, 20.072943604761093);
  closeTo(roRejectFlow, 34.65649244285001);
  closeTo(ufRoRejectFlow, 54.7294360476111);
  closeTo(ufRoRejectTds * 2, 5770.736090139591);
});
