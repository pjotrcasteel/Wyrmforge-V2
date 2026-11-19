import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeHuntBiomeMood,HUNT_BIOME_MOODS}
  from '../src/lighting/hunt-biome-mood.mjs';
import {huntRoutePreview} from '../src/hunt-route-preview.mjs';
import {shadowStampAlpha,makeShadowStampPixels}
  from '../src/shadow-stamp-texture.mjs';
import {SpriteLightingCache,SPRITE_LIGHT_STABLE_INSTANCES}
  from '../src/sprite-lighting-cache.mjs';

test('healthy Wet Forest is warm and bright; Wyrm lair remains dark and readable',()=>{
  const start=describeHuntBiomeMood();
  const end=describeHuntBiomeMood({kind:'wyrm-lair',progress:1,daylight:.45});
  assert.ok(start.exposure>=.68,'uncorrupted forest must not reuse dark .42 exposure');
  assert.ok(start.environment.ambient[1]>start.environment.ambient[2],
    'healthy forest should retain warm daylight');
  assert.ok(end.exposure<=.36);
  assert.ok(end.environment.ambient[0]>0.2,
    'corrupt lair must remain readable to emissive fire and spells');
  assert.ok(start.environment.ambient.every((v,i)=>v>end.environment.ambient[i]));
  assert.ok(start.warmth>end.warmth&&end.ash>start.ash);
  assert.throws(()=>describeHuntBiomeMood({progress:-.1}),RangeError);
  assert.throws(()=>describeHuntBiomeMood({progress:1.5}),RangeError);
  assert.throws(()=>describeHuntBiomeMood({daylight:NaN}),RangeError);
});

test('actual World Map highland route has monotonic darker progression',()=>{
  const route=huntRoutePreview('highland',0);
  assert.ok(route);
  let last=Infinity;
  for(const stop of route.stops){
    const mood=describeHuntBiomeMood({
      kind:stop.kind,progress:stop.profile.corruption.progress,
      daylight:stop.profile.corruption.daylight
    });
    assert.ok(mood.exposure<=last+1e-10,stop.kind+' gets unexpectedly brighter');
    assert.ok(mood.environment.ambient.every(Number.isFinite));
    last=mood.exposure;
  }
  assert.equal(HUNT_BIOME_MOODS['wyrm-lair'],1);
  assert.ok(route.stops.at(-1).profile.corruption.progress===1);
});

test('canopy caster is a directional irregular silhouette, not circular contact pool',()=>{
  const a=makeShadowStampPixels(24,'canopy');
  const b=makeShadowStampPixels(24);
  assert.equal(a.length,b.length);
  const sample=(pixels,x,y)=>pixels[(y*24+x)*4+3];
  const x=sample(a,5,12),z=sample(a,12,5);
  assert.notEqual(x,z,'canopy side and top must not have circular symmetry');
  assert.notEqual(sample(a,8,8),sample(a,15,15),
    'the irregular sun footprint must be asymmetric');
  assert.ok(sample(a,12,12)>120);
  for(let i=0;i<24;i++){
    assert.equal(sample(a,i,0),0);
    assert.equal(sample(a,0,i),0);
    assert.equal(sample(a,i,23),0);
    assert.equal(sample(a,23,i),0);
  }
  assert.notDeepEqual(a,b,'contact root and directional canopy cannot share a round stamp');
  assert.throws(()=>shadowStampAlpha(12,12,24,'unknown'),RangeError);
});

function fixture(){
  const canvases=[];
  const factory=(w,h)=>{
    const canvas={getContext:()=>({
      drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(w*h*4).fill(120)}),
      createImageData:()=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData(){}
    })};
    canvases.push(canvas);
    return canvas;
  };
  const draws=[],ctx={drawImage:(...args)=>draws.push(args)};
  return {cache:new SpriteLightingCache(factory),ctx,draws,canvases};
}
test('fixed trees and stones ignore sub-quantum tint shimmer while keeping Fireball response',()=>{
  const {cache,ctx,draws}=fixture();
  const image={},sprite={x:0,y:0,w:18,h:18},rect=[2,3,18,18];
  cache.beginFrame();
  cache.draw(ctx,image,sprite,rect,[.41,.41,.41],[.41,.41,.41],'oak:42');
  const original=draws.at(-1)[0];
  cache.beginFrame();
  cache.draw(ctx,image,sprite,rect,[.43,.40,.42],[.43,.40,.42],'oak:42');
  assert.equal(draws.at(-1)[0],original,
    'small lighting quantization variance must not shimmer fixed world tree');
  cache.beginFrame();
  cache.draw(ctx,image,sprite,rect,[1.5,.4,.4],[1.5,.4,.4],'oak:42');
  assert.notEqual(draws.at(-1)[0],original,'large nearby spell cast must still change sprite light');
  for(let i=0;i<SPRITE_LIGHT_STABLE_INSTANCES+30;i++){
    cache.beginFrame();
    cache.draw(ctx,image,sprite,rect,[.4,.4,.4],[.4,.4,.4],'rock:'+i);
    assert.ok(cache.statistics.stableInstances<=SPRITE_LIGHT_STABLE_INSTANCES);
  }
  cache.clear();assert.equal(cache.statistics.stableInstances,0);
});

test('real Hunt wires stable object IDs and a reversible biome light comparison',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const preview=readFileSync(new URL('../src/hunt-tree-preview.mjs',import.meta.url),'utf8');
  const caster=readFileSync(new URL('../src/terrain-directional-shadow-cache.mjs',import.meta.url),'utf8');
  assert.match(host,/describeHuntBiomeMood\(/);
  assert.match(host,/playQuery\.get\('biomeLighting'\)!=='off'/);
  assert.match(preview,/layer\.stableLightId=tree\.id/);
  assert.match(preview,/null,layer\.prop\.id/);
  assert.match(caster,/s\.alpha,'canopy'/);
});
