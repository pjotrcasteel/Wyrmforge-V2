import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LAVA_CRUST_FLOW_GLSL} from '../src/materials/lava-crust-flow.mjs';
import {
  FLUID_FRAGMENT_GLSL,FLUID_VERTEX_GLSL
} from '../src/fluid/hunt-fluid-surface-renderer.mjs';
import {MOLTEN_PRESENTATION} from '../src/materials/molten-presentation.mjs';

test('LAVA-02: native molten material uses grounded dark plates, hot cracks and slow real downstream motion',()=>{
  assert.match(LAVA_CRUST_FLOW_GLSL,/nativeLavaCrust/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/actualFlow/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/floor\(world\.xz\*8\.0\)/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/floor\(seconds\*\.55\)/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/lavaCrustBand\(p\)/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/FIRE_LAVA_CRUST/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/bool fracture/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/one stable direction|ONE/i);
  assert.match(LAVA_CRUST_FLOW_GLSL,/vec3 blackBasalt=/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/bool fall/);
  assert.match(LAVA_CRUST_FLOW_GLSL,/bool splash/);
  assert.doesNotMatch(LAVA_CRUST_FLOW_GLSL,/\bsin\s*\(|\bcos\s*\(|labNoise|soilHash/,
    'avoid random per-pixel trigonometric noise in weak mobile WebGL');
  assert.ok(MOLTEN_PRESENTATION.emission[0]>0);
});

test('LAVA-02: lava exits before water motif sampling and keeps actual fluid face visibility',()=>{
  const molten=FLUID_FRAGMENT_GLSL.indexOf('if(uLava>.5){');
  const water=FLUID_FRAGMENT_GLSL.indexOf('ivec2 moving=');
  assert.ok(molten>0&&water>molten,
    'the fast lava branch must not pay for every water ripple lookup');
  assert.match(FLUID_FRAGMENT_GLSL,/nativeLavaCrust\(vWorld,vFlow,uLavaChannelFlow/);
  assert.match(FLUID_FRAGMENT_GLSL,/uniform vec2 uLavaChannelFlow/);
  assert.match(FLUID_FRAGMENT_GLSL,/if\(vFaceMode==4&&uRibbonEnabled<\.5\)discard/);
  assert.match(FLUID_FRAGMENT_GLSL,/if\(vFaceMode==6&&uParcelsEnabled<\.5\)discard/);
  assert.match(FLUID_VERTEX_GLSL,/dot\(world,uCameraDepth\)-uDepthOrigin/);
  const renderer=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(renderer,/playFluidVisual\?\.update\(state,\(x,z\)=>fluid\.sample\(x,z\)\)/);
  assert.match(renderer,/terrainChannelLayer\(playLightingLiquid,playLava\)/,
    'do not reintroduce a fake duplicate lava face over native wet cells');
});

test('LAVA-02: 50-source reference index is versioned alongside visual correction',()=>{
  const report=readFileSync(new URL('../docs/research/lava-v2-50-source-field-study.md',
    import.meta.url),'utf8');
  const urls=[...report.matchAll(/^\d{2}\. \[[^\]]+\]\((https:\/\/[^)]+)\)/gm)]
    .map(match=>match[1]);
  assert.equal(urls.length,50);
  assert.equal(new Set(urls).size,50);
  assert.match(report,/iPhone Safari build/);
});
