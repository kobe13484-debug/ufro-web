const asFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export function combineUfRoReject({ ufRejectFlow, roRejectFlow }) {
  return asFiniteNumber(ufRejectFlow) + asFiniteNumber(roRejectFlow);
}

export function combineUfRoRejectTds({ ufRejectFlow, ufRejectTds, roRejectFlow, roRejectTds }) {
  const ufFlow = asFiniteNumber(ufRejectFlow);
  const roFlow = asFiniteNumber(roRejectFlow);
  const totalFlow = ufFlow + roFlow;
  if (totalFlow <= 0) return 0;

  return (ufFlow * asFiniteNumber(ufRejectTds) + roFlow * asFiniteNumber(roRejectTds)) / totalFlow;
}
