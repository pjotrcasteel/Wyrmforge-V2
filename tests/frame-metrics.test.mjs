import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameMetrics } from '../src/frame-metrics.mjs';

test('empty metrics report unknown percentiles rather than zero', () => {
  const data = new FrameMetrics().summary();
  assert.equal(data.count, 0);
  assert.equal(data.p50, null);
  assert.equal(data.p95, null);
  assert.equal(data.p99, null);
});

test('rolling window keeps only latest samples', () => {
  const data = new FrameMetrics(4);
  for (const ms of [10, 20, 30, 40, 50]) data.record(ms);
  assert.deepEqual(data.summary(), {
    count: 4, capacity: 4, p50: 30, p95: 50, p99: 50,
    hitchesOver33Ms: 2, hitchesOver50Ms: 0, hitchesOver100Ms: 0
  });
});

test('stutter thresholds are strictly greater than 33, 50 and 100ms', () => {
  const data = new FrameMetrics();
  for (const ms of [33, 34, 50, 51, 100, 101]) data.record(ms);
  assert.equal(data.summary().hitchesOver33Ms, 5);
  assert.equal(data.summary().hitchesOver50Ms, 3);
  assert.equal(data.summary().hitchesOver100Ms, 1);
});

test('invalid intervals and long tab-suspension gaps are excluded', () => {
  const data = new FrameMetrics();
  for (const ms of [NaN, Infinity, -5, 0, 1000, 5000]) {
    assert.equal(data.record(ms), false);
  }
  assert.equal(data.record(16), true);
  assert.equal(data.summary().count, 1);
});

test('reset starts an independent measurement window', () => {
  const data = new FrameMetrics(2);
  data.record(30);
  data.reset();
  assert.equal(data.summary().count, 0);
  data.record(17);
  assert.equal(data.summary().p99, 17);
});

test('invalid capacity is rejected', () => {
  for (const capacity of [0, -1, 1.5, Infinity]) {
    assert.throws(() => new FrameMetrics(capacity), RangeError);
  }
});
