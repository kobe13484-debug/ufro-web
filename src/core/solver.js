import { solveRoutes } from './routes.js';

const nonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function solveKnownInput({feedFlow=0,...process}={}) {
  const requestedFeed=nonNegative(feedFlow);
  const result=solveRoutes({feedFlow:requestedFeed,...process});
  const feasible=requestedFeed===0 || result.feedFlow>0;
  return {
    ...result,
    mode:'known-input',
    feasible,
    reason:feasible?null:'NO_ACTIVE_ROUTE',
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
  return {
    ...result,
    mode:'known-output',
    feasible:true,
    reason:null,
    targetProductFlow:targetProduct,
    productRecovery:recovery,
  };
}
