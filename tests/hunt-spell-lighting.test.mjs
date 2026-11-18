import test from 'node:test';
import assert from 'node:assert/strict';
import {huntSpellLights} from '../src/hunt-spell-lighting.mjs';
import {huntFireballPosition} from '../src/hunt-fireball-flight.mjs';
import {createHuntFireballImpact} from '../src/hunt-fireball-visuals.mjs';
import {writeTransientLights} from '../src/lighting/transient-lighting.mjs';
import {defineLightingEnvironment} from '../src/lighting/environment-contract.mjs';
const cast={from:{x:0,y:1,z:0},point:{x:4,y:1,z:0},startedAt:100,duration:400,level:1};
const args={epoch:2,revision:9,now:300};
test('projectile light follows the exact visible arc and is absent outside flight lifetime',()=>{
  const lights=huntSpellLights({...args,cast});
  assert.deepEqual(huntFireballPosition(cast,300),[2,1.75,0]);
  assert.deepEqual(lights.emitters[0].position,huntFireballPosition(cast,300));
  assert.equal(huntSpellLights({...args,cast,now:99}).emitters.length,0);
  assert.equal(huntSpellLights({...args,cast,now:501}).emitters.length,0);
});
test('impact light uses observed spell level, fades and expires without persistent emission',()=>{
  const impact=createHuntFireballImpact({x:4,y:1,z:0},300,{level:5});
  const peak=huntSpellLights({...args,impact}).emitters[0];
  const fading=huntSpellLights({...args,impact,now:500}).emitters[0];
  assert.ok(peak.radiance[0]>fading.radiance[0]);
  const small=createHuntFireballImpact(impact.point,300,{level:1});
  assert.ok(peak.radius>huntSpellLights({...args,impact:small}).emitters[0].radius);
  assert.equal(huntSpellLights({...args,impact,now:1000}).emitters.length,0);
  assert.ok(huntSpellLights({...args,impact,reducedMotion:true}).emitters[0].radiance[0]<peak.radiance[0]);
});
test('generic transient upload is bounded to two slots and clears expired light buffers',()=>{
  const impact=createHuntFireballImpact({x:2,y:0,z:0},250,{level:1});
  const set=huntSpellLights({...args,cast,impact});
  const positions=new Float32Array(8),radiance=new Float32Array(6);
  assert.equal(writeTransientLights(set,positions,radiance),2);
  assert.equal(positions[3],set.emitters[0].radius);
  assert.equal(writeTransientLights(null,positions,radiance),0);
  assert.ok(positions.every(n=>n===0)&&radiance.every(n=>n===0));
  assert.throws(()=>writeTransientLights({...set,emitters:[...set.emitters,set.emitters[0]]},positions,radiance));
});
test('gameplay exposure lowers ambient without changing neutral tooling defaults',()=>{
  assert.deepEqual(defineLightingEnvironment().ambient,[1,1,1]);
  const dim=defineLightingEnvironment({daylight:.45,exposure:.42});
  assert.ok(dim.ambient.every(n=>n<.37&&n>.3));
  assert.equal(dim.exposure,.42);
  assert.throws(()=>defineLightingEnvironment({exposure:NaN}));
  assert.throws(()=>defineLightingEnvironment({exposure:-1}));
});
