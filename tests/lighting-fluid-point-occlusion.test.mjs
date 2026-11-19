import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {raycastTerrain} from '../src/terrain-raycast.mjs';
import {defineLightSet} from '../src/lighting/light-contract.mjs';
import {PointLightVisibility,POINT_VISIBILITY_FLOATS,POINT_VISIBILITY_RAY_BUDGET,
  samplePointVisibility,writePointVisibility}
  from '../src/lighting/point-light-visibility.mjs';
import {FLUID_FRAGMENT_GLSL,HuntFluidSurfaceRenderer}
  from '../src/fluid/hunt-fluid-surface-renderer.mjs';
import {LOCAL_FIELD_LIGHTING_GLSL} from '../src/lighting/local-field-shader.mjs';

const spell=revision=>defineLightSet({epoch:1,revision,emitters:[{
  id:'fireball',position:[.5,2.5,.5],radius:8,radiance:[3,1,.25]
}]});
const port=world=>({epoch:1,revision:world.revision,raycast:ray=>raycastTerrain(world,ray)});
const complete=(transport,lights)=>{
  let field=null;
  for(let i=0;i<8;i++){
    field=transport.update(lights);
    assert.ok(transport.statistics.frameRays<=POINT_VISIBILITY_RAY_BUDGET);
    if(field.ready)return field;
  }
  throw new Error('Point visibility exceeded bounded per-frame work');
};
test('terrain and Water V2 shaders use the exact same generic physical point-light visibility',()=>{
  assert.match(LOCAL_FIELD_LIGHTING_GLSL,/transientIrradiance/);
  assert.match(FLUID_FRAGMENT_GLSL,/transientIrradiance\(surface,vWorld\)/);
  assert.match(FLUID_FRAGMENT_GLSL,/uniform bool uPointVisibilityEnabled/);
  assert.match(FLUID_FRAGMENT_GLSL,/uniform float uPointVisibilityDistances\[48\]/);
  assert.match(FLUID_FRAGMENT_GLSL,/pointLightVisibility\(i,point,uTransientPositions\[i\]\.xyz\)/);
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(host,/pointVisibility:pointOcclusionEnabled\?playPointVisibility:null/);
  assert.match(host,/transientLights:localLightingEnabled\?playSpellLights:null,\s*pointVisibility:pointOcclusionEnabled\?playPointVisibility:null/);
  const renderer=readFileSync(new URL('../src/fluid/hunt-fluid-surface-renderer.mjs',import.meta.url),'utf8');
  assert.match(renderer,/writePointVisibility\(\s*pointVisibility,transientLights,this\.\#pointVisibilityUpload\)/);
  assert.match(renderer,/gl\.uniform1i\(u\.pointVisibilityEnabled,visible\?1:0\)/);
  assert.match(renderer,/if\(visible\)gl\.uniform1fv\(u\.pointVisibilityDistances,this\.\#pointVisibilityUpload\)/);
  assert.equal(typeof HuntFluidSurfaceRenderer,'function');
});
test('real physical cliff occludes one Fireball identically for water, foam and terrain',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let y=1;y<=4;y++)for(let z=-2;z<=2;z++)world.set(3,y,z,3);
  const lights=spell(world.revision),transport=new PointLightVisibility(port(world));
  const field=complete(transport,lights);
  const upload=new Float32Array(POINT_VISIBILITY_FLOATS);
  assert.equal(writePointVisibility(field,lights,upload),true);
  assert.deepEqual([...upload],[...field.distances]);
  assert.ok(samplePointVisibility(field,0,[5.5,2.2,.5])<.1,
    'water/foam physically behind the cliff receives no spell light');
  assert.ok(samplePointVisibility(field,0,[1.5,2.2,.5])>.95,
    'the real same-side receiver retains Fireball illumination');
  assert.equal(upload.byteLength,192,'Water reuses the existing 48-float field, not new ray work');
  assert.equal(transport.statistics.retainedBytes,192);
});
test('destruction reopens light without mutating fluid state or holding stale blockers',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let y=1;y<=4;y++)for(let z=-2;z<=2;z++)world.set(3,y,z,3);
  const transport=new PointLightVisibility(port(world));
  const blocked=complete(transport,spell(world.revision));
  assert.ok(samplePointVisibility(blocked,0,[5.5,2.2,.5])<.1);
  for(let y=1;y<=4;y++)for(let z=-2;z<=2;z++)world.set(3,y,z,0);
  const lights=spell(world.revision),opened=complete(transport,lights);
  assert.ok(samplePointVisibility(opened,0,[5.5,2.2,.5])>.9);
  assert.equal(writePointVisibility(blocked,lights,new Float32Array(POINT_VISIBILITY_FLOATS)),false,
    'a fluid draw may never upload an old terrain revision');
  assert.equal(writePointVisibility(opened,lights,new Float32Array(POINT_VISIBILITY_FLOATS)),true);
});
test('partial or expired visibility fields preserve unoccluded bounded fallback',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const first=spell(world.revision).emitters[0];
  const lights=defineLightSet({epoch:1,revision:world.revision,emitters:[
    first,{id:'second-fireball',position:[-3,2.5,.5],radius:6,radiance:[2,.5,.1]}
  ]});
  const transport=new PointLightVisibility(port(world));
  const pending=transport.update(lights);
  assert.equal(pending.ready,false,'two lights require two bounded 24-ray passes');
  const upload=new Float32Array(POINT_VISIBILITY_FLOATS);
  assert.equal(writePointVisibility(pending,lights,upload),false);
  assert.ok(upload.every(x=>x===0),'disabled path does not leak previous sectors');
  const completeField=complete(transport,lights);
  assert.equal(writePointVisibility(completeField,lights,upload),true);
  const expired=defineLightSet({epoch:1,revision:world.revision,emitters:[]});
  assert.equal(writePointVisibility(completeField,expired,upload),false);
  assert.ok(upload.every(x=>x===0),'expired lights clear the upload');
});
