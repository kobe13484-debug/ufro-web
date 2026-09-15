import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/ufro_v8_backup.jsx', import.meta.url), 'utf8');

test('only the active Phase 1.5 calculation and diagram paths remain', () => {
  assert.equal(source.includes('const baseCalc = useMemo'), false);
  assert.equal(source.includes('function Phase15ProjectDiagram'), false);
  assert.equal(source.includes('function CleanPhase15Diagram'), false);
  assert.equal(source.includes('TSS 90% PROCESS'), false);
  assert.equal(source.includes('function SvgBlueprintPhase15Diagram'), true);
  assert.equal(source.includes('const ProcessDiagram = React.forwardRef'), true);
});
