import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASELINE_LIGHTING_GLSL,UNLIT_LIGHTING_GLSL
} from '../src/lighting/baseline-lighting.mjs';

test('Hunt vertical terrain faces stay readable without painting fake black pits',()=>{
  // Same shader profile as the Play Hunt high-contrast camera. A downward
  // facing side of a 2m forest bank must not lose most of its incoming light
  // twice (height floor * wall penalty), before actual shadows are applied.
  assert.match(BASELINE_LIGHTING_GLSL,/heightContrast/);
  assert.match(BASELINE_LIGHTING_GLSL,/\.40,\.61,1\.60/);
  assert.match(BASELINE_LIGHTING_GLSL,/lighting\*=\.76/);
  const unshadowedWestWall=.50*.61*.76;
  assert.ok(unshadowedWestWall>=.23,
    'The darkest unoccluded west wall must remain readable, not a black panel');
  const highGrassTop=1.60;
  const lowGrassTop=.61;
  assert.ok(highGrassTop/lowGrassTop>2.5,
    'Upper grass ledges must have markedly greater light than the lower ground');
  assert.ok(highGrassTop/unshadowedWestWall>4,
    'The top-to-cliff contrast must read as real physical terrain elevation');
  assert.doesNotMatch(UNLIT_LIGHTING_GLSL,/heightContrast|\.76/,
    'The independent unlit renderer must remain independent');
});
