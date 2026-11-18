import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {raycastTerrain} from '../src/terrain-raycast.mjs';
import {HuntWoodlandObjects} from '../src/hunt-woodland-objects.mjs';
import {LightOccluderRegistry} from '../src/lighting/occluder-registry.mjs';
import {defineLightSet} from '../src/lighting/light-contract.mjs';
import {PointLightVisibility,POINT_VISIBILITY_FLOATS,writePointVisibility,
  samplePointVisibility} from '../src/lighting/point-light-visibility.mjs';
import {sampleSurfaceIrradiance} from '../src/lighting/surface-light-sample.mjs';
import {LOCAL_FIELD_LIGHTING_GLSL} from '../src/lighting/local-field-shader.mjs';
import {assembleVoxelFragmentShader} from '../src/webgl-voxel-view.mjs';
function completed(world,light,occluders){
  const controller=new PointLightVisibility({epoch:1,revision:world.revision,
    raycast:ray=>raycastTerrain(world,ray)});
  let field;
  for(let i=0;i<5;i++)field=controller.update(light,occluders);
  assert.ok(field.ready);
  return field;
}
const source=()=>defineLightSet({epoch:1,revision:1,
  emitters:[{id:'light.source',position:[.5,2.5,.5],radius:8,radiance:[6,1,.1]}]});
test('both CPU sprites and assembled WebGL shader share generic visibility attenuation',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let y=1;y<=4;y++)for(let z=-3;z<=3;z++)world.set(3,y,z,3);
  const lights=source(),visibility=completed(world,lights);
  const pos=[6,2,.5],environment={ambient:[.42,.42,.42]};
  const exposed=sampleSurfaceIrradiance(pos,environment,lights);
  const occluded=sampleSurfaceIrradiance(pos,environment,lights,[0,1,0],visibility);
  assert.ok(exposed[0]>environment.ambient[0]);
  assert.ok(occluded[0]<exposed[0]*.5);
  assert.equal(samplePointVisibility(visibility,0,pos),0);
  const glsl=assembleVoxelFragmentShader(LOCAL_FIELD_LIGHTING_GLSL);
  assert.match(glsl,/uniform float uPointVisibilityDistances\[48\]/);
  assert.match(glsl,/pointLightVisibility\(i,point,uTransientPositions\[i\].xyz\)/);
});
test('uniform upload only accepts a completed matching light/terrain snapshot',()=>{
  const world=new VoxelWorld({chunkEdge:16}),lights=source(),field=completed(world,lights);
  const dest=new Float32Array(POINT_VISIBILITY_FLOATS);
  assert.equal(writePointVisibility(field,lights,dest),true);
  assert.deepEqual([...dest],[...field.distances]);
  const changed=defineLightSet({epoch:2,revision:1,emitters:lights.emitters});
  assert.equal(writePointVisibility(field,changed,dest),false);
  assert.ok(dest.every(v=>v===0));
  assert.equal(writePointVisibility(null,lights,dest),false);
});
test('registry auto-composes new building and tree providers through identical collider API',()=>{
  const scene=new LightOccluderRegistry();
  const tree={physicalRevision:1,physicalOccluders:()=>[
    {id:'tree.trunk',min:[2,0,-2],max:[2.8,4,3]}]};
  const building={physicalRevision:8,physicalOccluders:()=>[
    {id:'building.stone',min:[4,0,-2],max:[5.5,6,3]}]};
  const unregTree=scene.register(tree),unregBuilding=scene.register(building);
  const snapshot=scene.snapshot({x:1,z:0});
  assert.equal(snapshot.entries.length,2);
  const world=new VoxelWorld(),occluded=completed(world,source(),snapshot);
  assert.ok(samplePointVisibility(occluded,0,[7,2,.5])<.1);
  unregTree();const one=scene.snapshot();
  assert.equal(one.entries.length,1);
  assert.notEqual(one.revision,snapshot.revision);
  unregBuilding();assert.equal(scene.snapshot().entries.length,0);
});
test('resident physical objects expose generic collider bounds, independent of art kind',()=>{
  const graph={placement:()=>({placements:[{
    kind:'boulder',id:'rock.1',seed:0,variant:'boulder',scale:1,
    position:{x:0,y:5,z:0},footprint:{radius:.5}
  }]})};
  const objects=new HuntWoodlandObjects(graph);
  const terrain={raycast:()=>({point:{x:0,y:5,z:0}})};
  objects.update(['a'],terrain);
  const shapes=objects.physicalOccluders({x:0,z:0});
  assert.equal(shapes[0].id,'rock.1');
  assert.ok(shapes[0].max[1]>shapes[0].min[1]);
  const rev=objects.physicalRevision;
  objects.update([],terrain);
  assert.ok(objects.physicalRevision>rev);
  assert.equal(objects.physicalOccluders().length,0);
});
test('unsupported providers, arbitrary negative geometry and excessive shapes are bounded',()=>{
  const scene=new LightOccluderRegistry();
  assert.throws(()=>scene.register({physicalOccluders:()=>[]}),TypeError);
  const unsubscribe=scene.register({physicalRevision:1,physicalOccluders:()=>Array.from(
    {length:100},(_,i)=>({id:'shape.'+i,min:[i-50,-1,-1],max:[i-49,2,1]}))});
  assert.equal(scene.snapshot().entries.length,64);
  unsubscribe();
});
