import { mixWaterQuality, conductivityFromTds, DEFAULT_TDS_EC_FACTOR } from './quality.js';

const nonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const fraction = (percent) => Math.min(1, nonNegative(percent) / 100);

export function solveProjectNetwork({ phase10 = {}, phase15OtherFeed = {} } = {}) {
  const outputFlow = nonNegative(phase10.outputFlow);
  const outputTds = nonNegative(phase10.outputTds);
  const saleFlow = outputFlow * fraction(phase10.salePct);
  const toPhase15Flow = outputFlow - saleFlow;
  const otherFlow = nonNegative(phase15OtherFeed.flow);
  const otherTds = nonNegative(phase15OtherFeed.tds);
  const phase15Feed = mixWaterQuality([
    { flow: toPhase15Flow, tds: outputTds },
    { flow: otherFlow, tds: otherTds },
  ]);

  return {
    phase10: {
      output: { flow: outputFlow, tds: outputTds },
      sale: { flow: saleFlow, tds: outputTds },
      toPhase15: { flow: toPhase15Flow, tds: outputTds },
    },
    phase15: { feed: phase15Feed },
  };
}


export function calculateProjectKpis(input = {}) {
  const externalRawFlow = nonNegative(input.phase10ExternalRawFlow) + nonNegative(input.phase15ExternalRawFlow);
  const phase10Sale = {
    flow: nonNegative(input.phase10Sale?.flow),
    tds: nonNegative(input.phase10Sale?.tds),
  };
  const phase15Product = {
    flow: nonNegative(input.phase15Product?.flow),
    tds: nonNegative(input.phase15Product?.tds),
  };
  const product = mixWaterQuality([phase10Sale, phase15Product]);
  const finalWasteFlow = nonNegative(input.finalWasteFlow);
  const physicalLossFlow = nonNegative(input.physicalLossFlow);
  const internalRecycleFlow = nonNegative(input.internalRecycleFlow);
  const totalOpexPerDay = nonNegative(input.totalOpexPerDay);
  const balanceError = externalRawFlow - product.flow - finalWasteFlow - physicalLossFlow;
  const factor = Number.isFinite(Number(input.tdsEcFactor)) && Number(input.tdsEcFactor) > 0
    ? Number(input.tdsEcFactor)
    : DEFAULT_TDS_EC_FACTOR;
  return {
    externalRawFlow,
    productFlow: product.flow,
    finalWasteFlow,
    physicalLossFlow,
    internalRecycleFlow,
    balanceError,
    balanceClosed: Math.abs(balanceError) <= 1e-9,
    netRecoveryPct: externalRawFlow > 0 ? (product.flow / externalRawFlow) * 100 : 0,
    finalProductTds: product.tds,
    finalProductConductivity: conductivityFromTds(product.tds, factor),
    totalOpexPerDay,
    opexPerM3: product.flow > 0 ? totalOpexPerDay / product.flow : 0,
  };
}
