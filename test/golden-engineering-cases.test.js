import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhase15UiModel } from '../src/core/uiAdapter.js';

const closeTo=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const base={mode:'know-output',productFlow:146,feedTds:1018,targetCond:636,hasTargetCond:true,tssRejectPct:10,sludgeRecyclePct:70,ufRejectPct:10,roRejectPct:25,saltRejectionPct:96.56,splitMode:'auto',manualToRoPct:75,safetyMarginPct:10,routes:{A:{enabled:true,sharePct:100},B:{enabled:false,sharePct:0},C:{enabled:false,sharePct:0}}};

test('default Plan A golden case remains stable',()=>{
  const {calc,kpi,discharge}=buildPhase15UiModel(base);
  closeTo(calc.feedFlow,223.0327067195679);
  closeTo(calc.ufRoRejectFlow,54.7294360476111);
  closeTo(calc.actualProductTDS*2,636);
  closeTo(kpi.externalRawFlow,207.4204172491981);
  assert.equal(discharge.requiresAction,true);
});

test('non-default TSS/sludge inputs change net raw demand and diagram labels coherently',()=>{
  const {calc,kpi,diagramLabels}=buildPhase15UiModel({...base,tssRejectPct:15,sludgeRecyclePct:60});
  assert.deepEqual(diagramLabels,{process:'Process 85%',reject:'Reject 15%',return:'60% return',sludge:'40% Sludge'});
  closeTo(kpi.externalRawFlow,calc.feedFlow-calc.sludgeWaterRecycle);
  assert.ok(kpi.netRecoveryPct>kpi.grossRecoveryPct);
});
