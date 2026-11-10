import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainTapRecognizer } from '../src/terrain-tap-recognizer.mjs';

test('short stable touch creates exactly one terrain spell tap', () => {
  const taps=new TerrainTapRecognizer();
  taps.begin(1,100,120,20);
  taps.move(1,105,123);
  assert.deepEqual(taps.end(1,105,123,210),{x:105,y:123});
  assert.equal(taps.end(1,105,123,220),null);
});

test('drag, long press, and remote pointer release cannot create a spell command', () => {
  const taps=new TerrainTapRecognizer();
  taps.begin(1,20,20,0);
  taps.move(1,40,25);
  assert.equal(taps.end(1,40,25,80),null);
  taps.begin(2,20,20,100);
  assert.equal(taps.end(2,20,20,700),null);
  taps.begin(3,10,10,1000);
  assert.equal(taps.end(2,10,10,1100),null);
  assert.deepEqual(taps.end(3,10,10,1200),{x:10,y:10});
});

test('second finger or pointer cancel suppresses a terrain hit', () => {
  const taps=new TerrainTapRecognizer();
  taps.begin(1,30,30,0);
  taps.begin(2,50,40,10);
  assert.equal(taps.end(1,30,30,30),null);
  assert.equal(taps.end(2,50,40,40),null);
  taps.begin(3,20,20,50);
  taps.cancel();
  assert.equal(taps.end(3,20,20,80),null);
});

test('touch coordinates, times and pointer IDs are validated', () => {
  const taps=new TerrainTapRecognizer();
  assert.throws(()=>taps.begin(1.5,0,0,0),TypeError);
  assert.throws(()=>taps.begin(1,NaN,0,0),TypeError);
  taps.begin(3,10,10,10);
  assert.throws(()=>taps.end(3,10,10,Infinity),TypeError);
});
