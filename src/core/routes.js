import { solveTssBalance, solveUfBalance, solveRoBalance } from './massBalance.js';

const ROUTE_IDS = ['A', 'B', 'C'];
const finiteNonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
const fraction = (percent) => Math.min(1, finiteNonNegative(percent) / 100);

function normalizedShares(routes = {}) {
  const enabled = ROUTE_IDS.filter((id) => routes[id]?.enabled === true);
  const result = { A: 0, B: 0, C: 0 };
  if (!enabled.length) return result;

  const total = enabled.reduce((sum, id) => sum + finiteNonNegative(routes[id]?.sharePct), 0);
  enabled.forEach((id) => {
    result[id] = total > 0
      ? finiteNonNegative(routes[id]?.sharePct) / total
      : 1 / enabled.length;
  });
  return result;
}

const emptyBranch = (enabled, share, feedFlow) => ({
  enabled,
  share,
  feedFlow,
  productFlow: 0,
  tssRejectFlow: 0,
  sludgeRecycleFlow: 0,
  sludgeWasteFlow: 0,
  ufRejectFlow: 0,
  roRejectFlow: 0,
});

export function solveRoutes({
  feedFlow = 0,
  routes = {},
  tssRejectPct = 0,
  sludgeRecyclePct = 0,
  ufRejectPct = 0,
  roRejectPct = 0,
  toRoPct = 0,
} = {}) {
  const totalFeed = finiteNonNegative(feedFlow);
  const shares = normalizedShares(routes);
  const branches = Object.fromEntries(ROUTE_IDS.map((id) => [
    id,
    emptyBranch(routes[id]?.enabled === true, shares[id], totalFeed * shares[id]),
  ]));

  if (branches.A.enabled) {
    const tss = solveTssBalance({
      grossFeedFlow: branches.A.feedFlow,
      rejectPct: tssRejectPct,
      recyclePct: sludgeRecyclePct,
    });
    const uf = solveUfBalance({ feedFlow: tss.processOutFlow, rejectPct: ufRejectPct });
    const roFeedFlow = uf.permeateFlow * fraction(toRoPct);
    const bypassFlow = uf.permeateFlow - roFeedFlow;
    const ro = solveRoBalance({ feedFlow: roFeedFlow, rejectPct: roRejectPct });
    Object.assign(branches.A, {
      tssOutFlow: tss.processOutFlow,
      tssRejectFlow: tss.rejectFlow,
      sludgeRecycleFlow: tss.recycleFlow,
      sludgeWasteFlow: tss.sludgeWasteFlow,
      ufFeedFlow: uf.feedFlow,
      ufPermeateFlow: uf.permeateFlow,
      ufRejectFlow: uf.rejectFlow,
      roFeedFlow,
      bypassFlow,
      roPermeateFlow: ro.permeateFlow,
      roRejectFlow: ro.rejectFlow,
      productFlow: bypassFlow + ro.permeateFlow,
    });
  }

  if (branches.B.enabled) {
    const tss = solveTssBalance({
      grossFeedFlow: branches.B.feedFlow,
      rejectPct: tssRejectPct,
      recyclePct: sludgeRecyclePct,
    });
    Object.assign(branches.B, {
      tssOutFlow: tss.processOutFlow,
      tssRejectFlow: tss.rejectFlow,
      sludgeRecycleFlow: tss.recycleFlow,
      sludgeWasteFlow: tss.sludgeWasteFlow,
      productFlow: tss.processOutFlow,
    });
  }

  if (branches.C.enabled) {
    branches.C.productFlow = branches.C.feedFlow;
  }

  const sum = (key) => ROUTE_IDS.reduce((total, id) => total + finiteNonNegative(branches[id][key]), 0);
  const productFlow = sum('productFlow');
  const tssRejectFlow = sum('tssRejectFlow');
  const sludgeRecycleFlow = sum('sludgeRecycleFlow');
  const sludgeWasteFlow = sum('sludgeWasteFlow');
  const ufRejectFlow = sum('ufRejectFlow');
  const roRejectFlow = sum('roRejectFlow');
  const ufRoRejectFlow = ufRejectFlow + roRejectFlow;

  return {
    feedFlow: sum('feedFlow'),
    productFlow,
    tssRejectFlow,
    sludgeRecycleFlow,
    sludgeWasteFlow,
    ufRejectFlow,
    roRejectFlow,
    ufRoRejectFlow,
    shares,
    branches,
  };
}
