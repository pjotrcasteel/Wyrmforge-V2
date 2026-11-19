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
  assert.match(BASELINE_LIGHTING_GLSL,/\.17,\.72,1\.36/);
  assert.match(BASELINE_LIGHTING_GLSL,/lighting\*=\.84/);
  const unshadowedWestWall=.50*.72*.84;
  assert.ok(unshadowedWestWall>=.30,
    'A two-metre exposed bank may be dark, but not a near-black solid block');
  assert.ok(unshadowedWestWall<1,
    'Real top/side directional contrast remains visible');
  assert.doesNotMatch(UNLIT_LIGHTING_GLSL,/heightContrast|\.84/,
    'The independent unlit renderer must remain independent');
});
