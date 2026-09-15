import test from 'node:test';
import assert from 'node:assert/strict';

let streamModule = {};
try {
  streamModule = await import('../src/core/stream.js');
} catch {
  // RED state: production stream module does not exist yet.
}

const { createStream, mixStreams } = streamModule;

test('createStream normalizes numeric flow and TDS', () => {
  assert.equal(typeof createStream, 'function');
  const stream = createStream({ name: 'A', flow: '10', tds: '500' });
  assert.equal(stream.name, 'A');
  assert.equal(stream.flow, 10);
  assert.equal(stream.tds, 500);
});

test('mixStreams uses flow-weighted TDS', () => {
  assert.equal(typeof mixStreams, 'function');
  const mixed = mixStreams([
    { flow: 100, tds: 600 },
    { flow: 50, tds: 300 },
  ]);
  assert.equal(mixed.flow, 150);
  assert.equal(mixed.tds, 500);
});

test('mixStreams returns a zero stream when total flow is zero', () => {
  assert.equal(typeof mixStreams, 'function');
  const mixed = mixStreams([
    { flow: 0, tds: 800 },
    { flow: 'invalid', tds: 200 },
  ]);
  assert.equal(mixed.flow, 0);
  assert.equal(mixed.tds, 0);
});
