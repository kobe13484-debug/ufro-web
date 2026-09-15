import { mixWaterQuality, solveRoQuality, tdsFromConductivity, conductivityFromTds, validateDischarge, DEFAULT_TDS_EC_FACTOR } from './quality.js';
import { solveRequiredDilution, allocateDilutionSources } from './dilution.js';

const IDS = ['A', 'B', 'C'];
const nonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
const fraction = (percent) => Math.min(1, nonNegative(percent) / 100);
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function normalizeRouteShares(routes = {}) {
  const enabled = IDS.filter((id) => routes[id]?.enabled === true);
  const shares = { A: 0, B: 0, C: 0 };
  const total = enabled.reduce((sum, id) => sum + nonNegative(routes[id]?.sharePct), 0);
  enabled.forEach((id) => {
    shares[id] = total > 0 ? nonNegative(routes[id]?.sharePct) / total : 1 / enabled.length;
  });
  return shares;
}

function solveTargetSplit({ feedTds, targetTds, roPermeateTds, roRecovery, splitMode, manualToRoPct }) {
  if (splitMode === 'manual') return { toRo: fraction(manualToRoPct), valid: true, bypassRo: false, warning: '' };
  if (feedTds <= 0) return { toRo: 0, valid: false, bypassRo: false, warning: 'NO_FEED_QUALITY' };
  if (feedTds <= targetTds) return { toRo: 0, valid: true, bypassRo: true, warning: '' };
  if (targetTds < roPermeateTds) return { toRo: 1, valid: false, bypassRo: false, warning: 'TARGET_BELOW_RO_PERMEATE' };
  const productBypassShare = clamp((targetTds - roPermeateTds) / (feedTds - roPermeateTds));
  const roProductShare = 1 - productBypassShare;
  const roFeedBasis = roRecovery > 0 ? roProductShare / roRecovery : 0;
  const ufPermeateBasis = productBypassShare + roFeedBasis;
  return {
    toRo: ufPermeateBasis > 0 ? roFeedBasis / ufPermeateBasis : 0,
    valid: roRecovery > 0,
    bypassRo: false,
    warning: roRecovery > 0 ? '' : 'NO_RO_RECOVERY',
  };
}

function solveRouteAFromProduct({ productFlow, tssRecovery, ufRecovery, roRecovery, toRo, feedTds, roPermeateTds }) {
  const productPerUfPermeate = (1 - toRo) + toRo * roRecovery;
  const ufPermeate = productPerUfPermeate > 0 ? productFlow / productPerUfPermeate : 0;
  const ufFeed = ufRecovery > 0 ? ufPermeate / ufRecovery : 0;
  const grossFeed = tssRecovery > 0 ? ufFeed / tssRecovery : 0;
  const roFeed = ufPermeate * toRo;
  const roPermeate = roFeed * roRecovery;
  const bypass = ufPermeate - roFeed;
  return {
    feedFlow: grossFeed, tssOutFlow: ufFeed, tssRejectFlow: grossFeed - ufFeed,
    ufOut: ufPermeate, ufRejectFlow: ufFeed - ufPermeate,
    roIn: roFeed, roOut: roPermeate, roRejectFlow: roFeed - roPermeate,
    ufBypass: bypass, productFlow, product: productFlow,
    productTds: productFlow > 0 ? (bypass * feedTds + roPermeate * roPermeateTds) / productFlow : 0,
  };
}

function solveRouteAFromFeed({ feedFlow, tssRecovery, ufRecovery, roRecovery, toRo, feedTds, roPermeateTds }) {
  const tssOut = feedFlow * tssRecovery;
  const ufPermeate = tssOut * ufRecovery;
  const roFeed = ufPermeate * toRo;
  const roPermeate = roFeed * roRecovery;
  const bypass = ufPermeate - roFeed;
  const productFlow = bypass + roPermeate;
  return {
    feedFlow, tssOutFlow: tssOut, tssRejectFlow: feedFlow - tssOut,
    ufOut: ufPermeate, ufRejectFlow: tssOut - ufPermeate,
    roIn: roFeed, roOut: roPermeate, roRejectFlow: roFeed - roPermeate,
    ufBypass: bypass, productFlow, product: productFlow,
    productTds: productFlow > 0 ? (bypass * feedTds + roPermeate * roPermeateTds) / productFlow : 0,
  };
}

export function buildPhase15UiModel(input = {}) {
  const factor = Number.isFinite(Number(input.tdsEcFactor)) && Number(input.tdsEcFactor) > 0
    ? Number(input.tdsEcFactor) : DEFAULT_TDS_EC_FACTOR;
  const feedTds = nonNegative(input.feedTds);
  const targetTds = input.hasTargetCond === false
    ? feedTds
    : tdsFromConductivity(input.targetCond, factor);
  const tssRecovery = 1 - fraction(input.tssRejectPct);
  const ufRecovery = 1 - fraction(input.ufRejectPct);
  const roRecovery = 1 - fraction(input.roRejectPct);
  const roQuality = solveRoQuality({
    feedFlow: 1,
    feedTds,
    recoveryPct: roRecovery * 100,
    saltRejectionPct: input.saltRejectionPct,
  });
  const roPermeateTds = roQuality.permeateTds;
  const roRejectTds = roQuality.concentrateTds;
  const split = solveTargetSplit({
    feedTds, targetTds, roPermeateTds, roRecovery,
    splitMode: input.splitMode, manualToRoPct: input.manualToRoPct,
  });
  const shares = normalizeRouteShares(input.routes);
  const branches = {
    A: { enabled: input.routes?.A?.enabled === true, share: shares.A },
    B: { enabled: input.routes?.B?.enabled === true, share: shares.B },
    C: { enabled: input.routes?.C?.enabled === true, share: shares.C },
  };
  const mode = input.mode === 'know-input' ? 'know-input' : 'know-output';
  if (mode === 'know-output') {
    const product = nonNegative(input.productFlow);
    const aProduct = product * shares.A;
    Object.assign(branches.A, branches.A.enabled ? solveRouteAFromProduct({
      productFlow: aProduct, tssRecovery, ufRecovery, roRecovery, toRo: split.toRo, feedTds, roPermeateTds,
    }) : { feedFlow: 0, productFlow: 0, product: 0 });
    const bProduct = product * shares.B;
    Object.assign(branches.B, branches.B.enabled ? {
      feedFlow: tssRecovery > 0 ? bProduct / tssRecovery : 0,
      tssOutFlow: bProduct,
      tssRejectFlow: tssRecovery > 0 ? bProduct / tssRecovery - bProduct : 0,
      productFlow: bProduct,
      product: bProduct,
      productTds: feedTds,
    } : { feedFlow: 0, productFlow: 0, product: 0 });
    const cProduct = product * shares.C;
    Object.assign(branches.C, branches.C.enabled ? {
      feedFlow: cProduct,
      productFlow: cProduct,
      product: cProduct,
      productTds: feedTds,
    } : { feedFlow: 0, productFlow: 0, product: 0 });
  } else {
    const feed = nonNegative(input.feedFlow);
    const aFeed = feed * shares.A;
    Object.assign(branches.A, branches.A.enabled ? solveRouteAFromFeed({
      feedFlow: aFeed, tssRecovery, ufRecovery, roRecovery, toRo: split.toRo, feedTds, roPermeateTds,
    }) : { feedFlow: 0, productFlow: 0, product: 0 });
    const bFeed = feed * shares.B;
    const bProduct = bFeed * tssRecovery;
    Object.assign(branches.B, branches.B.enabled ? {
      feedFlow: bFeed,
      tssOutFlow: bProduct,
      tssRejectFlow: bFeed - bProduct,
      productFlow: bProduct,
      product: bProduct,
      productTds: feedTds,
    } : { feedFlow: 0, productFlow: 0, product: 0 });
    const cFeed = feed * shares.C;
    Object.assign(branches.C, branches.C.enabled ? {
      feedFlow: cFeed,
      productFlow: cFeed,
      product: cFeed,
      productTds: feedTds,
    } : { feedFlow: 0, productFlow: 0, product: 0 });
  }

  const sludgeRecycleFraction = fraction(input.sludgeRecyclePct);
  for (const id of ['A', 'B']) {
    const reject = nonNegative(branches[id].tssRejectFlow);
    branches[id].sludgeRecycleFlow = reject * sludgeRecycleFraction;
    branches[id].sludgeWaterRecycle = branches[id].sludgeRecycleFlow;
    branches[id].sludgeWasteFlow = reject - branches[id].sludgeRecycleFlow;
  }
  const sum = (key) => IDS.reduce((total, id) => total + nonNegative(branches[id]?.[key]), 0);
  const feedFlow = sum('feedFlow');
  const finalProduct = sum('productFlow');
  const tssOutFlow = sum('tssOutFlow');
  const tssRejectFlow = sum('tssRejectFlow');
  const sludgeRecycleFlow = sum('sludgeRecycleFlow');
  const sludgeWasteFlow = sum('sludgeWasteFlow');
  const ufRejectFlow = nonNegative(branches.A.ufRejectFlow);
  const roRejectFlow = nonNegative(branches.A.roRejectFlow);
  const ufRoReject = mixWaterQuality([
    { flow: ufRejectFlow, tds: feedTds },
    { flow: roRejectFlow, tds: roRejectTds },
  ], factor);
  const totalReject = mixWaterQuality([
    { flow: tssRejectFlow, tds: feedTds },
    { flow: ufRoReject.flow, tds: ufRoReject.tds },
  ], factor);
  const product = mixWaterQuality(IDS.map((id) => ({
    flow: nonNegative(branches[id].productFlow),
    tds: nonNegative(branches[id].productTds),
  })), factor);
  const discharge = validateDischarge({
    tds: ufRoReject.tds,
    tdsEcFactor: factor,
    safetyMarginPct: input.safetyMarginPct,
  });
  let dilution = { feasible: true, reason: null, needed: false, dilutionFlow: 0 };
  if (discharge.requiresAction) {
    const activeSources = (input.dilutionSources ?? []).filter((source) => source?.enabled === true);
    if (!activeSources.length) {
      dilution = { feasible: false, reason: 'NO_DILUTION_SOURCE', needed: true, dilutionFlow: 0 };
    } else {
      const source = activeSources.reduce((best, item) =>
        nonNegative(item.conductivity) < nonNegative(best.conductivity) ? item : best, activeSources[0]);
      const required = solveRequiredDilution({
        rejectFlow: ufRoReject.flow,
        rejectConductivity: ufRoReject.conductivity,
        targetConductivity: discharge.operatingConductivityLimit,
        dilutionConductivity: source.conductivity,
      });
      const allocation = required.feasible
        ? allocateDilutionSources({ requiredFlow: required.dilutionFlow, sources: input.dilutionSources, mode: input.dilutionAllocationMode ?? 'lowest-cost' })
        : { feasible: false, reason: required.reason, totalAllocated: 0, allocations: [] };
      dilution = {
        feasible: required.feasible && allocation.feasible,
        reason: required.feasible ? allocation.reason : required.reason,
        needed: true,
        dilutionFlow: required.dilutionFlow,
        finalFlow: required.finalFlow,
        finalConductivity: required.finalConductivity,
        allocation,
      };
    }
  }

  const calcToRO = nonNegative(branches.A.ufOut) > 0
    ? (nonNegative(branches.A.roIn) / nonNegative(branches.A.ufOut)) * 100
    : 0;
  const calcBypass = nonNegative(branches.A.ufOut) > 0
    ? (nonNegative(branches.A.ufBypass) / nonNegative(branches.A.ufOut)) * 100
    : 100;
  branches.A.calcToRO = calcToRO;
  branches.A.calcBypass = calcBypass;
  branches.A.actualProductTDS = nonNegative(branches.A.productTds);
  const tssDischarge = validateDischarge({ tds: feedTds, tdsEcFactor: factor, safetyMarginPct: input.safetyMarginPct });
  const roRejectDischarge = validateDischarge({ tds: roRejectTds, tdsEcFactor: factor, safetyMarginPct: input.safetyMarginPct });
  const totalRejectDischarge = validateDischarge({ tds: totalReject.tds, tdsEcFactor: factor, safetyMarginPct: input.safetyMarginPct });
  const roPermCond = conductivityFromTds(roPermeateTds, factor);
  const roPermCondLimit = nonNegative(input.roPermCondLimit);
  const calc = {
    route: IDS.filter((id) => branches[id].enabled).join('+'),
    routes: branches,
    routeShares: shares,
    tssEnabled: branches.A.enabled || branches.B.enabled,
    ufroEnabled: branches.A.enabled,
    feedFlow,
    tssOutFlow,
    tssRejectFlow,
    sludgeRecycleFlow,
    sludgeWaterRecycle: sludgeRecycleFlow,
    sludgeWasteFlow,
    ufOut: nonNegative(branches.A.ufOut),
    ufBypass: nonNegative(branches.A.ufBypass),
    roIn: nonNegative(branches.A.roIn),
    roOut: nonNegative(branches.A.roOut),
    ufRejectFlow,
    roRejectFlow,
    ufRoRejectFlow: ufRoReject.flow,
    ufRoRejectTDS: ufRoReject.tds,
    totalReject: totalReject.flow,
    finalProduct,
    feedTDS: feedTds,
    ufPermTDS: feedTds,
    ufRejectTDS: feedTds,
    tssRejectTDS: feedTds,
    roPermTDS: roPermeateTds,
    roRejectTDS: roRejectTds,
    totalRejectTDS: totalReject.tds,
    actualProductTDS: product.tds,
    overallRecovery: feedFlow > 0 ? (finalProduct / feedFlow) * 100 : 0,
    blendValid: split.valid,
    blendWarning: split.warning,
    bypassRO: split.bypassRo,
    targetTDS: targetTds,
    hasTargetCond: input.hasTargetCond !== false,
    calcToRO,
    calcBypass,
    ufRoRejectStatus: discharge.severityStatus,
    ufRoRejectAllowed: discharge.regulatoryAllowed,
    ufRoRejectMargin: discharge.operatingConductivityMargin,
    productCondStatus: input.hasTargetCond !== false && product.conductivity > nonNegative(input.targetCond) ? 'FAIL' : 'PASS',
    tssRejectStatus: tssDischarge.severityStatus,
    ufRejectStatus: tssDischarge.severityStatus,
    roRejectStatus: roRejectDischarge.severityStatus,
    totalRejectStatus: totalRejectDischarge.severityStatus,
    totalRejectAllowed: totalRejectDischarge.regulatoryAllowed,
    totalRejectMargin: totalRejectDischarge.operatingConductivityMargin,
    roPermCond,
    roPermCondLimit,
    roPermCondStatus: !branches.A.enabled || roPermCond <= roPermCondLimit ? 'PASS' : 'FAIL',
    sourceAllocations: input.sourceAllocations ?? [],
  };

  const streams = [
    { id: 'gross-feed', flow: feedFlow, tds: feedTds, conductivity: conductivityFromTds(feedTds, factor) },
    { id: 'product', flow: finalProduct, tds: product.tds, conductivity: product.conductivity },
    { id: 'tss-reject', flow: tssRejectFlow, tds: feedTds, conductivity: conductivityFromTds(feedTds, factor) },
    { id: 'sludge-recycle', flow: sludgeRecycleFlow, tds: feedTds, conductivity: conductivityFromTds(feedTds, factor) },
    { id: 'sludge-waste', flow: sludgeWasteFlow, tds: feedTds, conductivity: conductivityFromTds(feedTds, factor) },
    { id: 'uf-reject', flow: ufRejectFlow, tds: feedTds, conductivity: conductivityFromTds(feedTds, factor) },
    { id: 'ro-reject', flow: roRejectFlow, tds: roRejectTds, conductivity: conductivityFromTds(roRejectTds, factor) },
    { id: 'ufro-reject', flow: ufRoReject.flow, tds: ufRoReject.tds, conductivity: ufRoReject.conductivity },
  ];
  const externalRawFlow = Math.max(0, feedFlow - sludgeRecycleFlow);
  const kpi = {
    grossFeedFlow: feedFlow,
    externalRawFlow,
    finalProduct,
    grossRecoveryPct: feedFlow > 0 ? (finalProduct / feedFlow) * 100 : 0,
    netRecoveryPct: externalRawFlow > 0 ? (finalProduct / externalRawFlow) * 100 : 0,
    productTds: product.tds,
    productConductivity: product.conductivity,
    ufRoRejectFlow: ufRoReject.flow,
    ufRoRejectConductivity: ufRoReject.conductivity,
  };

  const pctText = (value) => {
    const rounded = Math.round(clamp(nonNegative(value), 0, 100) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };
  const tssRejectPct = clamp(nonNegative(input.tssRejectPct), 0, 100);
  const sludgeRecyclePct = clamp(nonNegative(input.sludgeRecyclePct), 0, 100);
  const diagramLabels = {
    process: `Process ${pctText(100 - tssRejectPct)}%`,
    reject: `Reject ${pctText(tssRejectPct)}%`,
    return: `${pctText(sludgeRecyclePct)}% return`,
    sludge: `${pctText(100 - sludgeRecyclePct)}% Sludge`,
  };

  calc.diagramLabels = diagramLabels;
  return { calc, kpi, streams, routes: branches, discharge, dilution, diagramLabels };
}

