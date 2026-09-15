import { solveRoutes } from './routes.js';
import { solveRoQuality, conductivityFromTds, DEFAULT_TDS_EC_FACTOR } from './quality.js';

const nonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function solveKnownInput({feedFlow=0,...process}={}) {
  const requestedFeed=nonNegative(feedFlow);
  const result=solveRoutes({feedFlow:requestedFeed,...process});
  const routeAvailable=requestedFeed===0 || result.feedFlow>0;
  const capacityFeasible=result.capacityFeasible!==false;
  const feasible=routeAvailable&&capacityFeasible;
  const reason=!routeAvailable?'NO_ACTIVE_ROUTE':!capacityFeasible?'ROUTE_CAPACITY_EXCEEDED':null;
  return {
    ...result,
    mode:'known-input',
    feasible,
    reason,
    requestedFeedFlow:requestedFeed,
  };
}

export function solveKnownOutput({productFlow=0,...process}={}) {
  const targetProduct=nonNegative(productFlow);
  if (targetProduct===0) {
    const result=solveRoutes({feedFlow:0,...process});
    return {...result,mode:'known-output',feasible:true,reason:null,targetProductFlow:0,productRecovery:0};
  }
  const unit=solveRoutes({feedFlow:1,...process});
  const recovery=unit.feedFlow>0 ? unit.productFlow/unit.feedFlow : 0;
  if (!Number.isFinite(recovery) || recovery<=0) {
    const result=solveRoutes({feedFlow:0,...process});
    return {
      ...result,
      mode:'known-output',
      feasible:false,
      reason:'NO_PRODUCT_RECOVERY',
      targetProductFlow:targetProduct,
      productRecovery:0,
    };
  }
  const requiredFeed=targetProduct/recovery;
  const result=solveRoutes({feedFlow:requiredFeed,...process});
  const capacityFeasible=result.capacityFeasible!==false;
  return {
    ...result,
    mode:'known-output',
    feasible:capacityFeasible,
    reason:capacityFeasible?null:'ROUTE_CAPACITY_EXCEEDED',
    targetProductFlow:targetProduct,
    productRecovery:recovery,
  };
}

function routeMetric(id, config) {
  const unit=solveRoutes({...config,feedFlow:1,routes:{[id]:{enabled:true,sharePct:100}}});
  const branch=unit.branches[id];
  const recovery=unit.productFlow;
  let productTds=nonNegative(config.feedTds);
  if (id==='A' && recovery>0) {
    const ro=solveRoQuality({
      feedFlow:1,
      feedTds:config.feedTds,
      recoveryPct:100-nonNegative(config.roRejectPct),
      saltRejectionPct:config.saltRejectionPct,
    });
    productTds=(branch.bypassFlow*config.feedTds+branch.roPermeateFlow*ro.permeateTds)/branch.productFlow;
  }
  return {id,recovery,productTds};
}

export function solveRecoveryAwareBlend(config={}) {
  const ids=['A','B','C'].filter((id)=>config.routes?.[id]?.enabled===true);
  if (!ids.length) return {feasible:false,reason:'NO_ACTIVE_ROUTE',feedShares:{A:0,B:0,C:0},productShares:{A:0,B:0,C:0}};
  const metrics=ids.map((id)=>routeMetric(id,config));
  const target=nonNegative(config.targetTds);
  const minTds=Math.min(...metrics.map((m)=>m.productTds));
  const maxTds=Math.max(...metrics.map((m)=>m.productTds));
  if (target<minTds-1e-9) return {feasible:false,reason:'TARGET_BELOW_ACHIEVABLE_QUALITY',routeMetrics:metrics};
  if (target>maxTds+1e-9) return {feasible:false,reason:'TARGET_ABOVE_ACHIEVABLE_QUALITY',routeMetrics:metrics};
  const productShares={A:0,B:0,C:0};
  if (Math.abs(maxTds-minTds)<=1e-12) {
    const totalPref=ids.reduce((sum,id)=>sum+nonNegative(config.routes?.[id]?.sharePct),0);
    ids.forEach((id)=>{productShares[id]=totalPref>0?nonNegative(config.routes[id].sharePct)/totalPref:1/ids.length;});
  } else {
    const low=metrics.reduce((best,m)=>m.productTds<best.productTds?m:best,metrics[0]);
    const lowShare=(maxTds-target)/(maxTds-minTds);
    productShares[low.id]=Math.max(0,Math.min(1,lowShare));
    const high=metrics.filter((m)=>Math.abs(m.productTds-maxTds)<=1e-9);
    const remaining=1-productShares[low.id];
    const pref=high.reduce((sum,m)=>sum+nonNegative(config.routes?.[m.id]?.sharePct),0);
    high.forEach((m)=>{productShares[m.id]=remaining*(pref>0?nonNegative(config.routes[m.id].sharePct)/pref:1/high.length);});
  }

  const feedBasis={A:0,B:0,C:0};
  for (const metric of metrics) {
    if (productShares[metric.id]>0 && metric.recovery<=0) {
      return {feasible:false,reason:'NO_PRODUCT_RECOVERY',routeMetrics:metrics,productShares};
    }
    feedBasis[metric.id]=metric.recovery>0?productShares[metric.id]/metric.recovery:0;
  }
  const feedBasisTotal=ids.reduce((sum,id)=>sum+feedBasis[id],0);
  const feedShares={A:0,B:0,C:0};
  ids.forEach((id)=>{feedShares[id]=feedBasisTotal>0?feedBasis[id]/feedBasisTotal:0;});
  const routed=solveRoutes({...config,feedFlow:1,routes:Object.fromEntries(ids.map((id)=>[
    id,{...config.routes[id],enabled:true,sharePct:feedShares[id]*100},
  ]))});
  const metricById=Object.fromEntries(metrics.map((m)=>[m.id,m]));
  const qualityLoad=ids.reduce((sum,id)=>sum+routed.branches[id].productFlow*metricById[id].productTds,0);
  const achievedTds=routed.productFlow>0?qualityLoad/routed.productFlow:0;
  const factor=Number.isFinite(Number(config.tdsEcFactor))&&Number(config.tdsEcFactor)>0
    ? Number(config.tdsEcFactor)
    : DEFAULT_TDS_EC_FACTOR;
  return {
    feasible:true,
    reason:null,
    feedShares,
    productShares,
    routeMetrics:metrics,
    achievedTds,
    achievedConductivity:conductivityFromTds(achievedTds,factor),
    targetTds:target,
  };
}
