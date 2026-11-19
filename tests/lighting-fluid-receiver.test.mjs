import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STATIC_FIELD_EMISSION_GLSL} from '../src/lighting/static-field-shader.mjs';
import {sampleStaticFieldIrradiance} from '../src/lighting/static-field-sample.mjs';
import {LOCAL_FIELD_LIGHTING_GLSL} from '../src/lighting/local-field-shader.mjs';
import {FLUID_VERTEX_GLSL,FLUID_FRAGMENT_GLSL}
  from '../src/fluid/hunt-fluid-surface-renderer.mjs';

function field({emission=[.08,.35,1],topY=3,sourceY=2,top=1,side=.5}={}){
  const data=new Float32Array(24*24*4);
  for(let i=0;i<24*24;i++){
    data[i*4]=topY;
    data[i*4+1]=sourceY;
    data[i*4+2]=top;
    data[i*4+3]=1+side;
  }
  return {schema:'wyrmforge.local-light-field.v2',hasEmission:true,
    epoch:1,revision:2,origin:[-12,-12],size:[24,24],emission,data};
}
test('terrain and every Water V2 surface consume one generic physical static emitter',()=>{
  assert.ok(LOCAL_FIELD_LIGHTING_GLSL.includes(STATIC_FIELD_EMISSION_GLSL),
    'WebGL terrain must import the identical Lighting evaluation');
  assert.ok(FLUID_VERTEX_GLSL.includes(STATIC_FIELD_EMISSION_GLSL),
    'Water V2 caps, sides, foam, falls and parcels share the same Lighting function');
  assert.match(FLUID_VERTEX_GLSL,/vStaticIrradiance=staticFieldIrradiance\(world\)/);
  assert.match(FLUID_FRAGMENT_GLSL,/albedo\*\(uLightingAmbient\+vStaticIrradiance\)/);
  // Molten Materials may fetch ONE bounded crust texel. The generic
  // 4-sample static Lighting field must still be vertex-only, never
  // evaluated in every water ripple/foam or lava fragment.
  assert.doesNotMatch(FLUID_FRAGMENT_GLSL,
    /staticFieldIrradiance\s*\(|lightingColumn|texelFetch\s*\(\s*uLightingField/,
    'static light-field sampling must remain vertex-only');
  assert.match(FLUID_FRAGMENT_GLSL,/texelFetch\(uLavaCrustAtlas,pixel,0\)/,
    'the single molten material atlas lookup is not a lighting-field fetch');
  assert.match(STATIC_FIELD_EMISSION_GLSL,/topEnergy/);
  assert.match(STATIC_FIELD_EMISSION_GLSL,/sideEnergy/);
  assert.match(STATIC_FIELD_EMISSION_GLSL,/topY-point\.y/);
  assert.doesNotMatch(STATIC_FIELD_EMISSION_GLSL,/water|lava|tree|building|sprite/i,
    'Lighting is generic: the caller owns material labels');
});
test('published colour, terrain occlusion and receiver height are respected',()=>{
  const blue=field(),lit=sampleStaticFieldIrradiance([.5,2.2,.5],blue);
  assert.ok(lit[2]>lit[1]&&lit[1]>lit[0],
    'any Materials-defined emission can illuminate fluid receivers');
  const high=field({top:0,side:1,topY:3});
  assert.equal(sampleStaticFieldIrradiance([.5,3.6,.5],high)[0],0);
  assert.ok(sampleStaticFieldIrradiance([.5,1.7,.5],high)[0]>0,
    'lower waterfall and cliff-side receivers can be lit');
  const blocked=field();
  blocked.data[(12*24+12)*4+3]=0;
  assert.deepEqual(sampleStaticFieldIrradiance([.5,2.2,.5],blocked),[0,0,0]);
  assert.deepEqual(sampleStaticFieldIrradiance([40,2.2,40],blue),[0,0,0]);
  blue.hasEmission=false;
  assert.deepEqual(sampleStaticFieldIrradiance([.5,2.2,.5],blue),[0,0,0]);
  assert.equal(blue.data.byteLength,9216,'one fixed 24x24 RGBA32F upload is 9 KiB');
});
test('self-emissive lava retains its authored palette; neutral water remains exact',()=>{
  assert.match(FLUID_FRAGMENT_GLSL,/if\(uLava>\.5\)/);
  assert.match(FLUID_FRAGMENT_GLSL,/albedo\*mix\(vec3\(1\.0\),uLightingAmbient,\.18\)/);
  assert.match(FLUID_FRAGMENT_GLSL,/uLava>\.5\|\|length\(vStaticIrradiance\)/);
  assert.match(FLUID_FRAGMENT_GLSL,/outColor=vec4\(litFluidColor\(foam\)/);
  assert.match(FLUID_FRAGMENT_GLSL,/outColor=vec4\(litFluidColor\(drop\)/);
  assert.match(FLUID_FRAGMENT_GLSL,/outColor=vec4\(litFluidColor\(color\)/);
});
test('real Hunt sends exactly the terrain field to the fluid renderer with independent opt-out',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const renderer=readFileSync(new URL('../src/fluid/hunt-fluid-surface-renderer.mjs',import.meta.url),'utf8');
  assert.match(host,/playVisibleLightingField=lightingField;/);
  assert.match(host,/lightingField,transientLights:playSpellLights/);
  assert.match(host,/lightingField:fluidEmissionEnabled\?lightingField:null/);
  assert.match(host,/playQuery\.get\('fluidEmission'\)!=='off'/);
  assert.match(host,/gpuBytes:playFluidVisual\?\.stats\.lightingTextureBytes/);
  assert.match(renderer,/if\(this\.\#lightingSource!==field\)/,
    'reuse the same texture until a new completed field is published');
  assert.match(renderer,/this\.\#releaseLightingTexture\(\)/,
    'release the field on reset and dispose');
  assert.match(renderer,/lightingTextureBytes:this\.\#lightingTexture\?24\*24\*4\*4:0/);
});
