import test from 'node:test';
import assert from 'node:assert/strict';
import { PointerGestures } from '../src/pointer-gestures.mjs';

test('one pointer pans in CSS pixels without zooming', () => {
  const gestures = new PointerGestures();
  assert.equal(gestures.begin(10, 100, 200), true);
  assert.deepEqual(gestures.move(10, 105, 198),
    { panX: 5, panY: -2, zoomRatio: 1, centerX: 105, centerY: 198 });
  assert.equal(gestures.activeCount, 1);
});

test('a two-finger pinch scales around its current midpoint', () => {
  const gestures = new PointerGestures();
  gestures.begin(1, 0, 0);
  gestures.begin(2, 10, 0);
  assert.deepEqual(gestures.move(2, 20, 0),
    { panX: 5, panY: 0, zoomRatio: 2, centerX: 10, centerY: 0 });
});

test('moving both pinch fingers also pans by their shared displacement', () => {
  const gestures = new PointerGestures();
  gestures.begin(1, 0, 0);
  gestures.begin(2, 10, 0);
  const a = gestures.move(1, 5, 0);
  const b = gestures.move(2, 15, 0);
  assert.equal(a.panX + b.panX, 5);
  assert.equal(a.zoomRatio * b.zoomRatio, 1);
});

test('lifting one pinch finger leaves the other at its last position', () => {
  const gestures = new PointerGestures();
  gestures.begin(1, 10, 10);
  gestures.begin(2, 30, 10);
  gestures.move(1, 12, 10);
  assert.equal(gestures.end(2), true);
  assert.deepEqual(gestures.move(1, 14, 10),
    { panX: 2, panY: 0, zoomRatio: 1, centerX: 14, centerY: 10 });
});

test('canceling an interaction prevents stale movement', () => {
  const gestures = new PointerGestures();
  gestures.begin(5, 10, 10);
  gestures.reset();
  assert.equal(gestures.move(5, 100, 100), null);
  assert.equal(gestures.activeCount, 0);
});

test('extra touches and duplicate starts do not reset the gesture baseline', () => {
  const gestures = new PointerGestures();
  assert.equal(gestures.begin(1, 0, 0), true);
  assert.equal(gestures.begin(1, 99, 99), false);
  assert.equal(gestures.begin(2, 10, 0), true);
  assert.equal(gestures.begin(3, 100, 0), false);
  assert.equal(gestures.activeCount, 2);
  assert.equal(gestures.move(3, 200, 200), null);
  assert.equal(gestures.move(1, 0, 0).zoomRatio, 1);
});

test('a new gesture after reset starts without stale offsets', () => {
  const gestures = new PointerGestures();
  gestures.begin(1, 3, 3);
  gestures.move(1, 10, 10);
  gestures.reset();
  gestures.begin(2, 100, 100);
  assert.equal(gestures.move(2, 101, 100).panX, 1);
});

test('invalid pointer data is rejected', () => {
  const gestures = new PointerGestures();
  assert.throws(() => gestures.begin(1.5, 1, 1), TypeError);
  assert.throws(() => gestures.begin(1, Infinity, 1), TypeError);
  gestures.begin(1, 0, 0);
  assert.throws(() => gestures.move(1, NaN, 0), TypeError);
});
