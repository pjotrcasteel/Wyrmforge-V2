import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalLightField,LIGHT_FIELD_WORK,LIGHT_FIELD_SCHEMA}
  from '../src/lighting/local-light-field.mjs';
import {LOCAL_FIELD_LIGHTING_GLSL} from '../src/lighting/local-field-shader.mjs';
import {assembleVoxelFragmentShader} from '../src/webgl-voxel-view.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {raycastTerrain} from '../src/terrain-raycast.mjs';

const input={epoch:1,revision:0,center:{x:0,y:2,z:0},now:0};
function complete(field,args=input){
  for(let i=0;i<96;i++){
    const step=field.update(args);
    assert.ok(step.processed<=LIGHT_FIELD_WORK);
    assert.ok(step.queries<=LIGHT_FIELD_WORK);
    assert.ok(step.visibilityRays<=LIGHT_FIELD_WORK);
    if(field.snapshot&&!field.pending&&field.snapshot.epoch===args.epoch&&
        field.snapshot.revision===args.revision)return field.snapshot;
  }
  throw new Error('Bounded field failed to publish in 96 frames');
}
function voxelFloor(){
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-13;x<=13;x++)for(let z=-13;z<=13;z++)world.set(x,1,z,3);
  return world;
}
function physicalField(world){
  const port={raycast:ray=>raycastTerrain(world,ray)};
  return new LocalLightField((x,z,y)=>port.raycast({
    origin:[x,y+16,z],direction:[0,-1,0],maxDistance:32
  })?.point.y??NaN,{geometry:port});
}
const emitted=(x=0,z=0,surfaceY=2.2)=>[{x,z,surfaceY,energy:1}];
const irradiance=(field,x,z,channel=2)=>
  field.data[((z-field.origin[1])*24+x-field.origin[0])*4+channel];

test('emission field is finite, 24x24 and retains heights across no-edit refreshes',()=>{
  let heightQueries=0;
  const field=new LocalLightField(()=>{heightQueries++;return 2;});
  const snapshot=complete(field);
  assert.equal(snapshot.schema,LIGHT_FIELD_SCHEMA);
  assert.equal(heightQueries,576);
  assert.deepEqual(snapshot.origin,[-12,-12]);
  assert.equal(snapshot.data.byteLength,9216);
  assert.ok(snapshot.data.every(Number.isFinite));
  assert.equal(field.update({...input,now:100}).processed,0);
  for(let i=0;i<24;i++)field.update({...input,now:600});
  assert.equal(heightQueries,576,'no terrain edit means no new height queries');
});
test('static emissive cells fade by distance but physical Voxel wall blocks illumination',()=>{
  const world=voxelFloor();
  for(let z=-2;z<=2;z++)for(let y=2;y<=8;y++)world.set(1,y,z,3);
  const field=physicalField(world);
  const args={...input,revision:world.revision,emissionCells:emitted()};
  const lit=complete(field,args);
  assert.ok(irradiance(lit,0,0)>irradiance(lit,-2,0));
  assert.equal(irradiance(lit,3,0),0,'intervening solid wall must block static light');
  assert.equal(irradiance(lit,-5,0),0,'local spill remains bounded');
  assert.ok(lit.geometryAware);
  assert.ok(lit.visibilityRays>0);
  // Destroy the wall using the actual world, not a synthetic height lookup.
  for(let z=-2;z<=2;z++)for(let y=2;y<=8;y++)world.set(1,y,z,0);
  const after=complete(field,{...args,revision:world.revision});
  assert.ok(irradiance(after,3,0)>0,'opening a real passage restores light');
});
test('non-emissive sources never brighten surfaces, independently of material kind',()=>{
  const field=new LocalLightField(()=>2);
  const empty=complete(field,{...input,emissionCells:[]});
  assert.ok(empty.data.every((n,i)=>i%4!==2||n===0));
  assert.equal(empty.hasEmission,false);
});
test('world epoch and terrain revision discard stale geometry and heights',()=>{
  let y=2;
  const field=new LocalLightField(()=>y);
  complete(field);
  y=0;
  field.update({...input,revision:1});
  assert.equal(field.snapshot,null);
  const changed=complete(field,{...input,revision:1});
  assert.equal(changed.data[0],0,'revision change must not reuse stale heights');
  field.update({...input,epoch:2,revision:1});
  assert.equal(field.snapshot,null);
  const empty=complete(new LocalLightField(()=>NaN));
  assert.ok(empty.data.every(Number.isFinite));
  assert.equal(empty.data[3],0);
});
test('WebGL local field uses the shared evaluated context and two physical elevations',()=>{
  const shader=assembleVoxelFragmentShader(LOCAL_FIELD_LIGHTING_GLSL);
  assert.match(shader,/if\(!uLightingFieldEnabled\)return base/);
  assert.match(shader,/surface\.albedo\*staticFieldIrradiance\(point\)/);
  assert.match(shader,/sideEnergy/);
  assert.match(shader,/topEnergy/);
  assert.match(shader,/topY-point\.y/);
});
test('walking to the next 6m window preserves previous field until new one is ready',()=>{
  const field=new LocalLightField(()=>2);
  const previous=complete(field);
  field.update({...input,center:{x:6,y:2,z:0}});
  assert.equal(field.snapshot,previous);
  const moved=complete(field,{...input,center:{x:6,y:2,z:0}});
  assert.deepEqual(moved.origin,[-6,-12]);
  assert.notEqual(moved,previous);
});
test('a real elevated cliff receives source-facing side spill without leaking onto its top',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-12;x<=13;x++)for(let z=-12;z<=13;z++)world.set(x,-1,z,3);
  for(let z=-1;z<=1;z++)for(let y=0;y<=5;y++)world.set(0,y,z,3);
  const field=physicalField(world);
  const args={...input,revision:world.revision,
    emissionCells:emitted(1,0,.4)};
  const lit=complete(field,args);
  const top=irradiance(lit,0,0,2),side=irradiance(lit,0,0,3)-1;
  assert.ok(side>0,'source-facing physical wall has visible side band');
  assert.ok(side>top,'steep bank top is more obstructed than its exposed side');
  assert.equal(lit.data.byteLength,9216,'two receiver bands reuse the original GPU texture');
});
test('collider revisions and explicit fallback rebuild without per-pixel raymarching',()=>{
  const world=voxelFloor(),field=physicalField(world);
  const args={...input,revision:world.revision,emissionCells:emitted()};
  const first=complete(field,args);
  const unshadowed=complete(field,{...args,occlusionEnabled:false});
  assert.equal(unshadowed.geometryAware,false);
  const changed=complete(field,{...args,occluders:{
    schema:'wyrmforge.light-occluders.v1',revision:3,
    entries:[{id:'building',min:[1,0,-1],max:[2,5,2]}]}});
  assert.ok(changed.geometryAware);
  assert.notEqual(changed,first);
  assert.equal(irradiance(changed,3,0),0);
});
