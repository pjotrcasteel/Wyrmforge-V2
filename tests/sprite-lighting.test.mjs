import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleSurfaceIrradiance} from '../src/lighting/surface-light-sample.mjs';
import {SpriteLightingCache,tintSpritePixels,litSpriteColor,SPRITE_LIGHT_CACHE_BYTES,SPRITE_LIGHT_FRAME_PIXELS} from '../src/sprite-lighting-cache.mjs';

test('sprite irradiance is neutral without a descriptor and local lights expire without residue',()=>{
  const position=[0,0,0],environment={ambient:[.42,.42,.42]};
  const lights={emitters:[{position:[0,1,0],radius:3,radiance:[3,1,.1]}]};
  assert.deepEqual(sampleSurfaceIrradiance(position),[1,1,1]);
  const lit=sampleSurfaceIrradiance(position,environment,lights);
  assert.ok(lit[0]>lit[1]&&lit[1]>lit[2]);
  assert.deepEqual(sampleSurfaceIrradiance([4,0,0],environment,lights),environment.ambient);
  assert.deepEqual(sampleSurfaceIrradiance(position,environment,null),environment.ambient);
  assert.deepEqual(position,[0,0,0]);
});
test('linear sprite tint preserves neutral bytes and alpha, including transparent edge pixels',()=>{
  const pixels=Uint8ClampedArray.from({length:1024},(_,i)=>i%256);
  assert.deepEqual(tintSpritePixels(pixels,[1,1,1]),pixels);
  const dark=tintSpritePixels(pixels,[.42,.42,.42]);
  for(let i=0;i<pixels.length;i++)assert.ok(i%4===3?dark[i]===pixels[i]:dark[i]<=pixels[i]);
  assert.equal(litSpriteColor('#37466e',[1,1,1]),'#37466e');
});
function fixture(){
  let reads=0,allocations=0;
  const factory=(w,h)=>{
    allocations++;
    const context={drawImage(){},getImageData(){reads++;return {data:new Uint8ClampedArray(w*h*4).fill(127)};},
      createImageData(){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};
    return {getContext:()=>context};
  };
  const draws=[],ctx={drawImage:(...args)=>draws.push(args)};
  return {cache:new SpriteLightingCache(factory),ctx,draws,counts:()=>({reads,allocations})};
}
test('sprite cache reuses crops/tints, bounds cold work and preserves destination rectangles',()=>{
  const {cache,ctx,draws,counts}=fixture(),image={},sprite={x:0,y:0,w:128,h:255},rect=[1,2,64,128];
  cache.beginFrame();cache.draw(ctx,image,sprite,rect,[.42,.42,.42]);
  const first=counts();cache.draw(ctx,image,sprite,rect,[.42,.42,.42]);
  assert.deepEqual(counts(),first);assert.deepEqual(draws.at(-1).slice(-4),rect);
  cache.draw(ctx,image,{...sprite,x:128},rect,[.42,.42,.42]);
  assert.equal(draws.at(-1)[0],image); // cold budget exhausted: no unbounded readback
  assert.ok(cache.statistics.framePixels<=SPRITE_LIGHT_FRAME_PIXELS);
  for(let i=0;i<100;i++){
    cache.beginFrame();cache.draw(ctx,image,sprite,rect,[i/25,.42,.42]);
    assert.ok(cache.statistics.bytes<=SPRITE_LIGHT_CACHE_BYTES);
    assert.ok(cache.statistics.entries<=48);
    assert.ok(cache.statistics.framePixels<=SPRITE_LIGHT_FRAME_PIXELS);
  }
  assert.equal(counts().reads,1);
  cache.clear();assert.equal(cache.statistics.bytes,0);assert.equal(cache.statistics.entries,0);
});
