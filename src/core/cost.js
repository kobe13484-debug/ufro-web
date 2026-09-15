const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nonNegative = (value) => Math.max(0, number(value));

export function calculateRawWaterCost({
  externalRawFlow = 0,
  operatingHoursPerDay = 24,
  unitCostPerM3 = 0,
} = {}) {
  const flowPerHour = nonNegative(externalRawFlow);
  const hours = nonNegative(operatingHoursPerDay);
  const unitCost = nonNegative(unitCostPerM3);
  const volumePerDay = flowPerHour * hours;
  return {
    flowPerHour,
    operatingHoursPerDay: hours,
    unitCostPerM3: unitCost,
    volumePerDay,
    costPerDay: volumePerDay * unitCost,
  };
}

export function calculateEquipmentEnergy({ equipment = [], electricityCostPerKwh = 0 } = {}) {
  const unitCost = nonNegative(electricityCostPerKwh);
  const rows = equipment.filter((item) => item?.enabled !== false).map((item) => {
    const installedQty = Math.max(0, Math.floor(nonNegative(item?.installedQty ?? item?.qty ?? 1)));
    const operatingQty = Math.min(installedQty, Math.max(0, Math.floor(nonNegative(item?.operatingQty ?? installedQty))));
    const nameplateKw = nonNegative(item?.kw);
    const loadKw = Number.isFinite(Number(item?.loadKw)) ? nonNegative(item.loadKw) : nameplateKw;
    const hoursDay = nonNegative(item?.hoursDay);
    const dailyKwh = loadKw * operatingQty * hoursDay;
    return {
      ...item,
      installedQty,
      operatingQty,
      nameplateKw,
      loadKw,
      hoursDay,
      dailyKwh,
      costPerDay: dailyKwh * unitCost,
    };
  });
  return {
    rows,
    totalKwhPerDay: rows.reduce((sum, row) => sum + row.dailyKwh, 0),
    totalCostPerDay: rows.reduce((sum, row) => sum + row.costPerDay, 0),
    electricityCostPerKwh: unitCost,
  };
}

export function calculateContinuousChemicalCost({ chemicals = [], flows = {} } = {}) {
  const rows = chemicals.filter((chemical) => chemical?.enabled !== false).map((chemical) => {
    const flowBasis = String(chemical?.flowBasis ?? '');
    const volumePerDay = nonNegative(flows?.[flowBasis]);
    const dosageKgM3 = nonNegative(chemical?.dosageKgM3);
    const unitPrice = nonNegative(chemical?.unitPrice);
    const kgPerDay = dosageKgM3 * volumePerDay;
    return {
      ...chemical,
      flowBasis,
      volumePerDay,
      dosageKgM3,
      unitPrice,
      kgPerDay,
      costPerDay: kgPerDay * unitPrice,
    };
  });
  return {
    rows,
    totalKgPerDay: rows.reduce((sum, row) => sum + row.kgPerDay, 0),
    totalCostPerDay: rows.reduce((sum, row) => sum + row.costPerDay, 0),
  };
}

export function calculateEventChemicalCost({ chemicals = [] } = {}) {
  const rows = chemicals.filter((chemical) => chemical?.enabled !== false).map((chemical) => {
    const kgEvent = nonNegative(chemical?.kgEvent);
    const unitPrice = nonNegative(chemical?.unitPrice);
    const intervalDays = Math.max(1, nonNegative(chemical?.intervalDays));
    const costPerEvent = kgEvent * unitPrice;
    return {
      ...chemical,
      kgEvent,
      unitPrice,
      intervalDays,
      costPerEvent,
      eventsPer60Days: 60 / intervalDays,
      dailyEquivalentCost: costPerEvent / intervalDays,
    };
  });
  return {
    rows,
    totalDailyEquivalentCost: rows.reduce((sum, row) => sum + row.dailyEquivalentCost, 0),
  };
}
