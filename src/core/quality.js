import { mixStreams } from './stream.js';

export const DEFAULT_TDS_EC_FACTOR = 0.5;

const positiveFactor = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : DEFAULT_TDS_EC_FACTOR;
};
const nonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function tdsFromConductivity(conductivity, tdsEcFactor = DEFAULT_TDS_EC_FACTOR) {
  return nonNegative(conductivity) * positiveFactor(tdsEcFactor);
}

export function conductivityFromTds(tds, tdsEcFactor = DEFAULT_TDS_EC_FACTOR) {
  return nonNegative(tds) / positiveFactor(tdsEcFactor);
}

export function mixWaterQuality(streams = [], tdsEcFactor = DEFAULT_TDS_EC_FACTOR) {
  const mixed = mixStreams(streams);
  const factor = positiveFactor(tdsEcFactor);
  return {
    flow: mixed.flow,
    tds: mixed.tds,
    conductivity: conductivityFromTds(mixed.tds, factor),
    tdsEcFactor: factor,
  };
}

export function solveRoQuality({
  feedFlow = 0,
  feedTds = 0,
  recoveryPct = 0,
  saltRejectionPct = 0,
} = {}) {
  const feed = nonNegative(feedFlow);
  const feedConcentration = nonNegative(feedTds);
  const recovery = Number(recoveryPct);
  const rejection = Math.min(100, nonNegative(saltRejectionPct)) / 100;
  if (!Number.isFinite(recovery) || recovery < 0 || recovery >= 100) {
    return {
      valid: false,
      reason: 'RECOVERY_MUST_BE_BELOW_100',
      feedFlow: feed,
      permeateFlow: 0,
      concentrateFlow: feed,
      permeateTds: 0,
      concentrateTds: feedConcentration,
      soluteIn: feed * feedConcentration,
      solutePermeate: 0,
      soluteConcentrate: feed * feedConcentration,
      soluteBalanceError: 0,
    };
  }
  const recoveryFraction = recovery / 100;
  const permeateFlow = feed * recoveryFraction;
  const concentrateFlow = feed - permeateFlow;
  const permeateTds = feedConcentration * (1 - rejection);
  const soluteIn = feed * feedConcentration;
  const solutePermeate = permeateFlow * permeateTds;
  const concentrateTds = concentrateFlow > 0
    ? Math.max(0, (soluteIn - solutePermeate) / concentrateFlow)
    : 0;
  const soluteConcentrate = concentrateFlow * concentrateTds;
  return {
    valid: true,
    reason: null,
    feedFlow: feed,
    permeateFlow,
    concentrateFlow,
    permeateTds,
    concentrateTds,
    soluteIn,
    solutePermeate,
    soluteConcentrate,
    soluteBalanceError: soluteIn - solutePermeate - soluteConcentrate,
  };
}
