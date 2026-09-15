import { mixWaterQuality } from './quality.js';

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
