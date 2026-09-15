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

const sourceCapacity = (source) => {
  const value = Number(source?.maxFlow);
  return Number.isFinite(value) ? Math.max(0, value) : Number.POSITIVE_INFINITY;
};

export function allocateDilutionSources({requiredFlow=0,sources=[],mode='equal'}={}) {
  const required = nonNegative(requiredFlow);
  const normalized = sources.map((source,index)=>({
    ...source,
    _index:index,
    enabled:source?.enabled===true,
    capacity:sourceCapacity(source),
    requestedFlow:nonNegative(source?.flow),
    priority:Number.isFinite(Number(source?.priority))?Number(source.priority):index,
    costPerM3:nonNegative(source?.costPerM3),
    actualFlow:0,
  }));
  const active = normalized.filter((source)=>source.enabled);
  if (required<=0) return {feasible:true,reason:null,totalAllocated:0,shortfall:0,allocations:normalized};
  if (!active.length) return {feasible:false,reason:'NO_DILUTION_SOURCE',totalAllocated:0,shortfall:required,allocations:normalized};

  let remaining=required;
  const takeSequential=(ordered,limitByRequest=false)=>{
    for (const source of ordered) {
      if (remaining<=1e-12) break;
      const available=limitByRequest?Math.min(source.capacity,source.requestedFlow):source.capacity;
      const take=Math.min(available,remaining);
      source.actualFlow=take;
      remaining-=take;
    }
  };
  if (mode==='manual') {
    takeSequential(active,true);
  } else if (mode==='priority') {
    takeSequential([...active].sort((a,b)=>a.priority-b.priority));
  } else if (mode==='lowest-cost') {
    takeSequential([...active].sort((a,b)=>a.costPerM3-b.costPerM3||a.priority-b.priority));
  } else {
    let pool=active.filter((source)=>source.capacity>0);
    while (remaining>1e-12 && pool.length) {
      const share=remaining/pool.length;
      const next=[];
      let progressed=false;
      for (const source of pool) {
        const available=source.capacity-source.actualFlow;
        const take=Math.min(share,available);
        source.actualFlow+=take;
        remaining-=take;
        if (take>0) progressed=true;
        if (available-take>1e-12) next.push(source);
      }
      if (!progressed) break;
      pool=next;
    }
  }

  const totalAllocated=normalized.reduce((sum,source)=>sum+source.actualFlow,0);
  const shortfall=Math.max(0,required-totalAllocated);
  return {
    feasible:shortfall<=1e-9,
    reason:shortfall<=1e-9?null:'INSUFFICIENT_DILUTION_CAPACITY',
    totalAllocated,
    shortfall,
    allocations:normalized,
  };
}
