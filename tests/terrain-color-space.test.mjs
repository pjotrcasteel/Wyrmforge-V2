import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  srgbToLinear, linearToSrgb, shadeSrgb, terrainColorTransferGlsl,
  SRGB_DECODE_THRESHOLD, SRGB_ENCODE_THRESHOLD
} from '../src/terrain-color-space.mjs';
import { createReferenceTerrainPixels } from '../src/terrain-reference-tiles.mjs';

const shaderHost=readFileSync(new URL('../src/webgl-voxel-view.mjs',import.meta.url),'utf8');
const cache=readFileSync(new URL('../src/terrain-gpu-texture-cache.mjs',import.meta.url),'utf8');
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('sRGB transfer handles black, white, threshold edges and full-range round trips',()=>{
  close(srgbToLinear(0),0);
  close(linearToSrgb(0),0);
  close(srgbToLinear(1),1);
  close(linearToSrgb(1),1);
  assert.equal(SRGB_DECODE_THRESHOLD,0.04045);
  assert.equal(SRGB_ENCODE_THRESHOLD,0.0031308);
  close(srgbToLinear(0.04045),0.04045/12.92,1e-9);
  close(linearToSrgb(0.0031308),0.0031308*12.92,1e-9);
  for(let encoded=0;encoded<=255;encoded++) {
    const srgb=encoded/255;
    close(linearToSrgb(srgbToLinear(srgb)),srgb,2e-7);
  }
  for(const bad of [-1,1.01,NaN,Infinity,-Infinity,undefined]) {
    assert.throws(()=>srgbToLinear(bad),RangeError);
    assert.throws(()=>linearToSrgb(bad),RangeError);
  }
});

test('the reference grass palette must remain visibly green after the sRGB round trip',()=>{
  const grass=createReferenceTerrainPixels('grass',64);
  const middle=((32*64)+32)*4;
  const rgb=[grass[middle],grass[middle+1],grass[middle+2]];
  const displayed=rgb.map(value=>Math.round(255*shadeSrgb(value/255,1)));
  assert.deepEqual(displayed,rgb,'lighting=1 must preserve the authored sRGB pixel');
  const misinterpreted=rgb.map(value=>Math.round(255*srgbToLinear(value/255)));
  assert.ok(displayed[1]>misinterpreted[1]*2,
    'directly presenting linearized sRGB is visibly much darker on the canvas');
  assert.ok(displayed[1]>50,'the grass reference should not be near black');
});

test('lighting operates in linear space and preserves relative surface brightness',()=>{
  const color=[65,93,39].map(value=>value/255);
  const full=color.map(value=>shadeSrgb(value,1));
  const half=color.map(value=>shadeSrgb(value,0.5));
  const quarter=color.map(value=>shadeSrgb(value,0.25));
  for(let i=0;i<color.length;i++) {
    close(full[i],color[i]);
    assert.ok(quarter[i]<half[i] && half[i]<full[i]);
    assert.ok(half[i] > full[i]*0.5,
      'half linear light must not halve sRGB pixel values');
  }
  assert.deepEqual(color.map(value=>shadeSrgb(value,0)),[0,0,0]);
  assert.throws(()=>shadeSrgb(color[0],-0.1),RangeError);
  assert.throws(()=>shadeSrgb(color[0],Infinity),RangeError);
});

test('shader treats GPU sRGB texture samples as already linear, but decodes procedural fallbacks',()=>{
  const generated=terrainColorTransferGlsl();
  assert.match(generated,/vec3 srgbToLinearColor\(vec3 color\)/);
  assert.match(generated,/vec3 linearToSrgbColor\(vec3 color\)/);
  assert.match(generated,/0\.04045/);
  assert.match(generated,/0\.0031308/);
  assert.match(shaderHost,/import \{ terrainColorTransferGlsl \} from '\.\/terrain-color-space\.mjs'/);
  assert.match(shaderHost,/\$\{terrainColorTransferGlsl\(\)\}/);
  assert.match(shaderHost,/vec3 linearAlbedo = layer >= 0\.0 \? albedo : srgbToLinearColor\(albedo\)/);
  assert.match(shaderHost,/outColor = vec4\(linearToSrgbColor\(linearAlbedo \* lighting\), 1\.0\)/);
  assert.doesNotMatch(shaderHost,/outColor = vec4\(albedo \* lighting, 1\.0\)/);
  assert.match(cache,/entry\.channel === 'albedo' \? gl\.SRGB8_ALPHA8 : gl\.RGBA8/,
    'only color imagery uses hardware sRGB decoding; normal and ORM remain raw');
});

test('transfer shader is independent of terrain IDs, camera and dynamic lighting',()=>{
  const glsl=terrainColorTransferGlsl();
  assert.doesNotMatch(glsl,/uniform|sampler|discard|gl_FragCoord|texture\(/);
  assert.doesNotMatch(glsl,/uCamera|uLight|vWorld|vMaterial/);
});
