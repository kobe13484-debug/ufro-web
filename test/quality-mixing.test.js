import test from 'node:test';
import assert from 'node:assert/strict';

let quality = {};
try { quality = await import('../src/core/quality.js'); } catch {}
const { tdsFromConductivity, conductivityFromTds, mixWaterQuality } = quality;
const closeTo = (a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

test('default EC/TDS factor is 0.5', () => {
  assert.equal(typeof tdsFromConductivity, 'function');
  closeTo(tdsFromConductivity(1000), 500);
  closeTo(conductivityFromTds(500), 1000);
});

test('user supplied EC/TDS factor is respected', () => {
  closeTo(tdsFromConductivity(1000, 0.64), 640);
  closeTo(conductivityFromTds(640, 0.64), 1000);
});

test('mixed raw and recycle quality is flow weighted', () => {
  const result = mixWaterQuality([
    {flow:80,tds:500},
    {flow:20,tds:2000},
  ]);
  closeTo(result.flow, 100);
  closeTo(result.tds, 800);
  closeTo(result.conductivity, 1600);
});
