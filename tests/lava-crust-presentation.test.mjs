import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LAVA_CRUST_FLOW_GLSL} from '../src/materials/lava-crust-flow.mjs';
import {
  buildLavaCrustAtlas,LAVA_CRUST_ATLAS_SIZE,LAVA_CRUST_ATLAS_BYTES
} from '../src/materials/lava-crust-atlas.mjs';
import {
  FLUID_FRAGMENT_GLSL,FLUID_VERTEX_GLSL
} from '../src/fluid/hunt-fluid-surface-renderer.mjs';
import {MOLTEN_PRESENTATION} from '../src/materials/molten-presentation.mjs';

test('LAVA-02: deterministic 256px dark rafts with rare hot cracks instead of orange carpet',()=>{
  const atlas=buildLavaCrustAtlas();
  assert.ok(atlas instanceof Uint8Array);
  assert.equal(LAVA_CRUST_ATLAS_SIZE,256);
  assert.equal(LAVA_CRUST_ATLAS_BYTES,256*256*4);
  assert.equal(atlas.length,LAVA_CRUST_ATLAS_BYTES);
  assert.ok(atlas.every((n,i)=>i%4!==3||n===255),
    'crust is one opaque material on an already physical wet face');
  let black=0,bright=0;
  for(let i=0;i<atlas.length;i+=4){
    const r=atlas[i],g=atlas[i+1],b=atlas[i+2];
    if(r<90&&g<90&&b<90)black++;
    if(r>165&&r>g*1.4&&g>b)bright++;
  }
  const total=atlas.length/4;
  assert.ok(black/total>.48&&black/total<.90,
    'field research: cooled basalt dominates, not an all-orange sheet');
  assert.ok(bright/total>.015&&bright/total<.25,
    'narrow glowing cracks are real visual accents rather than the whole pool');
  const repeated=buildLavaCrustAtlas();
  assert.deepEqual(atlas,repeated,'material atlas is seeded and replay deterministic');
  assert.ok(MOLTEN_PRESENTATION.emission[0]>0);
});

test('LAVA-02: actual molten caps sample one world-space atlas without 1m rotation',()=>{
  assert.match(LAVA_CRUST_FLOW_GLSL,/uniform sampler2D uLavaCrustAtlas/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/nativeLavaCrust/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/actualFlow/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/uniform|texelFetch/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/floor\(world\.xz\*10\.0-axis\*floor\(seconds\*\.55\)\)/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/uLavaCrustAtlas,pixel,0/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/vec3 hot=/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/bool falling/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/bool landing/);
  assert.doesNotMatch(LAVA_CRUST_FLOW_GLSL,/\bsin\s*\(|\bcos\s*\(|labNoise|soilHash/,
    'zero sine noise in the per-fragment molten pass on iOS');
  assert.match(FLUID_FRAGMENT_GLSL,/uLavaChannelFlow/);
});

test('LAVA-02: lava skips Water lookup, reuses one persistent GPU atlas and leaves Water untouched',()=>{
  const molten=FLUID_FRAGMENT_GLSL.indexOf('if(uLava>.5){');
  const water=FLUID_FRAGMENT_GLSL.indexOf('ivec2 moving=');
  assert.ok(molten>0&&water>molten,
    'molten branch must skip every water motif lookup');
  assert.match(FLUID_FRAGMENT_GLSL,/nativeLavaCrust\(vWorld,vFlow,uLavaChannelFlow/);
  assert.match(FLUID_FRAGMENT_GLSL,/if\(vFaceMode==4&&uRibbonEnabled<\.5\)discard/);
  assert.match(FLUID_FRAGMENT_GLSL,/if\(vFaceMode==6&&uParcelsEnabled<\.5\)discard/);
  assert.match(FLUID_VERTEX_GLSL,/dot\(world,uCameraDepth\)-uDepthOrigin/);
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(host,/playFluidVisual\?\.update\(state,\(x,z\)=>fluid\.sample\(x,z\)\)/);
  assert.match(host,/terrainChannelLayer\(playLightingLiquid,playLava\)/,
    'do not paint a second molten layer on top of dry rock');
});

test('LAVA-02: fifty reviewed geology references accompany the in-game correction',()=>{
  const report=readFileSync(new URL('../docs/research/lava-v2-50-source-field-study.md',
    import.meta.url),'utf8');
  const urls=[...report.matchAll(/^\d{2}\. \[[^\]]+\]\((https:\/\/[^)]+)\)/gm)]
    .map(match=>match[1]);
  assert.equal(urls.length,50);
  assert.equal(new Set(urls).size,50);
  assert.match(report,/iPhone Safari build/);
});
