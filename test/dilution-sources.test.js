import test from 'node:test';
import assert from 'node:assert/strict';
import * as dilution from '../src/core/dilution.js';

const { allocateDilutionSources } = dilution;
const closeTo = (a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

test('no enabled dilution source is infeasible', () => {
  assert.equal(typeof allocateDilutionSources, 'function');
  const r = allocateDilutionSources({requiredFlow:10,sources:[{id:'A',enabled:false,maxFlow:100}]});
  assert.equal(r.feasible, false);
  assert.equal(r.reason, 'NO_DILUTION_SOURCE');
  closeTo(r.totalAllocated, 0);
});

test('equal allocation respects source capacity', () => {
  const r = allocateDilutionSources({
    requiredFlow:100,
    mode:'equal',
    sources:[
      {id:'A',enabled:true,maxFlow:20},
      {id:'B',enabled:true,maxFlow:100},
    ],
  });
  assert.equal(r.feasible, true);
  closeTo(r.allocations.find(x=>x.id==='A').actualFlow,20);
  closeTo(r.allocations.find(x=>x.id==='B').actualFlow,80);
});

test('lowest-cost allocation exhausts cheap capacity first', () => {
  const r = allocateDilutionSources({requiredFlow:100,mode:'lowest-cost',sources:[
    {id:'cheap',enabled:true,maxFlow:30,costPerM3:1},
    {id:'expensive',enabled:true,maxFlow:100,costPerM3:5},
  ]});
  closeTo(r.allocations.find(x=>x.id==='cheap').actualFlow,30);
  closeTo(r.allocations.find(x=>x.id==='expensive').actualFlow,70);
});

test('manual allocation reports shortfall instead of inventing water', () => {
  const r = allocateDilutionSources({requiredFlow:100,mode:'manual',sources:[
    {id:'A',enabled:true,flow:30,maxFlow:100},
    {id:'B',enabled:true,flow:20,maxFlow:100},
  ]});
  assert.equal(r.feasible, false);
  assert.equal(r.reason, 'INSUFFICIENT_DILUTION_CAPACITY');
  closeTo(r.totalAllocated,50);
  closeTo(r.shortfall,50);
});
