const asNonNegativeFinite = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, number);
};

const asFraction = (percent) => Math.min(1, asNonNegativeFinite(percent) / 100);

export function solveTssBalance({ grossFeedFlow = 0, rejectPct = 0, recyclePct = 0 } = {}) {
  const grossFeed = asNonNegativeFinite(grossFeedFlow);
  const rejectFraction = asFraction(rejectPct);
  const recycleFraction = asFraction(recyclePct);
  const processOutFlow = grossFeed * (1 - rejectFraction);
  const rejectFlow = grossFeed - processOutFlow;
  const recycleFlow = rejectFlow * recycleFraction;
  const sludgeWasteFlow = rejectFlow - recycleFlow;
  const externalRawFlow = grossFeed - recycleFlow;

  return {
    grossFeedFlow: grossFeed,
    processOutFlow,
    rejectFlow,
    recycleFlow,
    sludgeWasteFlow,
    externalRawFlow,
  };
}

export function solveUfBalance({ feedFlow = 0, rejectPct = 0 } = {}) {
  const feed = asNonNegativeFinite(feedFlow);
  const rejectFraction = asFraction(rejectPct);
  const rejectFlow = feed * rejectFraction;
  const permeateFlow = feed - rejectFlow;
  return { feedFlow: feed, permeateFlow, rejectFlow };
}

export function solveRoBalance({ feedFlow = 0, rejectPct = 0 } = {}) {
  const feed = asNonNegativeFinite(feedFlow);
  const rejectFraction = asFraction(rejectPct);
  const rejectFlow = feed * rejectFraction;
  const permeateFlow = feed - rejectFlow;
  return { feedFlow: feed, permeateFlow, rejectFlow };
}
