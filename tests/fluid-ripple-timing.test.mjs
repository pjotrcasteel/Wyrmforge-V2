import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fluidRippleTiming,FLUID_FRAGMENT_GLSL
} from '../src/fluid/hunt-fluid-surface-renderer.mjs';

test('moving pixel water fades across every discrete sprite boundary without flashing',()=>{
  const span=1/.65;
  const end=fluidRippleTiming(span-0.00001);
  const start=fluidRippleTiming(span+0.00001);
  assert.equal(end.frame,0);
  assert.equal(start.frame,1);
  assert.ok(end.fade<1e-6);
  assert.ok(start.fade<1e-6,
    'a new sprite frame must begin fully dimmed, not instantly flash');
  const mid=fluidRippleTiming(span*.5);
  assert.equal(mid.frame,0);
  assert.ok(mid.fade>.99,
    'visible water glints must be allowed to develop between frame boundaries');
  assert.equal(fluidRippleTiming(0).fade,0);
  assert.deepEqual(fluidRippleTiming(span*1.5).frame,1);
});

test('water ripple fade and sprite offset are uniform across all fragments',()=>{
  assert.match(FLUID_FRAGMENT_GLSL,/uniform float uRippleFrame/);
  assert.match(FLUID_FRAGMENT_GLSL,/uniform float uRippleFade/);
  assert.match(FLUID_FRAGMENT_GLSL,/float rippleFade=uRippleFade/);
  assert.doesNotMatch(FLUID_FRAGMENT_GLSL,/smoothstep\(\.0,\.22,ripplePosition\)/);
  assert.throws(()=>fluidRippleTiming(Number.NaN),/finite/);
});
