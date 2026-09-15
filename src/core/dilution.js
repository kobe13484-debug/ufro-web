const nonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function solveManualDilution({rejectFlow=0,rejectConductivity=0,sources=[]}={}) {
  const qReject = nonNegative(rejectFlow);
  const cReject = nonNegative(rejectConductivity);
  const active = sources.map((source)=>({
    ...source,
    flow: nonNegative(source?.flow),
    conductivity: nonNegative(source?.conductivity),
  })).filter((source)=>source.flow>0);
  const dilutionFlow = active.reduce((sum,source)=>sum+source.flow,0);
  const finalFlow = qReject + dilutionFlow;
  const conductivityLoad = qReject*cReject + active.reduce((sum,source)=>sum+source.flow*source.conductivity,0);
  const finalConductivity = finalFlow>0 ? conductivityLoad/finalFlow : 0;
  return {feasible:true,dilutionFlow,finalFlow,finalConductivity,sources:active};
}

export function solveRequiredDilution({
  rejectFlow=0,
  rejectConductivity=0,
  targetConductivity=0,
  dilutionConductivity=0,
}={}) {
  const qReject=nonNegative(rejectFlow);
  const cReject=nonNegative(rejectConductivity);
  const cTarget=nonNegative(targetConductivity);
  const cDilution=nonNegative(dilutionConductivity);
  if (cReject<=cTarget) {
    return {feasible:true,dilutionFlow:0,finalFlow:qReject,finalConductivity:cReject};
  }
  if (cDilution>=cTarget || cTarget<=0) {
    return {feasible:false,reason:'DILUTION_SOURCE_TOO_CONCENTRATED',dilutionFlow:0,finalFlow:qReject,finalConductivity:cReject};
  }
  const dilutionFlow=qReject*(cReject-cTarget)/(cTarget-cDilution);
  const finalFlow=qReject+dilutionFlow;
  const finalConductivity=finalFlow>0
    ? (qReject*cReject+dilutionFlow*cDilution)/finalFlow
    : 0;
  return {feasible:true,dilutionFlow,finalFlow,finalConductivity};
}
