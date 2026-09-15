import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhase15UiModel } from '../src/core/uiAdapter.js';

const combinations = [['A'],['B'],['C'],['A','B'],['A','C'],['B','C'],['A','B','C']];
const closeTo=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const configFor=(enabled)=>({
  mode:'know-input', feedFlow:240, feedTds:1018, targetCond:636, hasTargetCond:true,
  tssRejectPct:10, sludgeRecyclePct:70, ufRejectPct:10, roRejectPct:25,
  saltRejectionPct:96.56, splitMode:'auto', manualToRoPct:75, safetyMarginPct:10,
  routes:Object.fromEntries(['A','B','C'].map(id=>[id,{enabled:enabled.includes(id),sharePct:100}])),
});

test('all A/B/C route combinations close gross flow and solute balance',()=>{
  for(const enabled of combinations){
    const {calc}=buildPhase15UiModel(configFor(enabled));
    closeTo(calc.feedFlow,calc.finalProduct+calc.totalReject);
    closeTo(calc.feedFlow*calc.feedTDS,calc.finalProduct*calc.actualProductTDS+calc.totalReject*calc.totalRejectTDS,1e-5);
    assert.equal(Number.isFinite(calc.actualProductTDS),true);
  }
});
