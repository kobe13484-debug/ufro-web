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
