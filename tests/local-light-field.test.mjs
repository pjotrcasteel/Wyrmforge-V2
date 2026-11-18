import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalLightField,LIGHT_FIELD_WORK} from '../src/lighting/local-light-field.mjs';
import {LOCAL_FIELD_LIGHTING_GLSL} from '../src/lighting/local-field-shader.mjs';
import {assembleVoxelFragmentShader} from '../src/webgl-voxel-view.mjs';
const input={epoch:1,revision:0,center:{x:0,y:2,z:0},now:0};
function complete(field,args=input){
  for(let i=0;i<48;i++){
    const step=field.update(args);
    assert.ok(step.processed<=LIGHT_FIELD_WORK&&step.queries<=LIGHT_FIELD_WORK);
  }
  return field.snapshot;
}
test('local lighting is bounded, handles signed positions and caches unchanged physical heights',()=>{
  let queries=0;const field=new LocalLightField(()=>{queries++;return 2;});
  const snapshot=complete(field);
  assert.equal(queries,576);assert.deepEqual(snapshot.origin,[-12,-12]);
  assert.equal(snapshot.data.byteLength,9216);
  assert.ok(snapshot.data.every(Number.isFinite));
  assert.equal(field.update({...input,now:100}).processed,0);
  for(let i=0;i<24;i++)field.update({...input,now:600});
  assert.equal(queries,576,'liquid refresh must not raycast unchanged terrain');
});
test('lava irradiance uses actual wet sources, fades with distance and does not cross high ridges',()=>{
  const liquid={kind:'lava',cells:[{x:0,z:0,surfaceY:2.2,depth:4}]};
  const field=new LocalLightField((x)=>Math.floor(x)===1?9:2);
  const lit=complete(field,{...input,liquid});
  const energy=(x,z)=>lit.data[((z+12)*24+x+12)*4+2];
  assert.ok(energy(0,0)>energy(-2,0));
  assert.equal(energy(3,0),0,'intervening high rock blocks the local spill');
  assert.equal(energy(-5,0),0,'light radius is bounded');
  const water=complete(new LocalLightField(()=>2),{...input,liquid:{...liquid,kind:'water'}});
  assert.ok(water.data.every((n,i)=>i%4!==2||n===0));
});
test('terrain revision and world epoch changes discard stale light while rebuilding',()=>{
  let height=2;const field=new LocalLightField(()=>height);complete(field);
  height=0;field.update({...input,revision:1});assert.equal(field.snapshot,null);
  const changed=complete(field,{...input,revision:1});assert.equal(changed.data[0],0);
  field.update({...input,epoch:2,revision:1});assert.equal(field.snapshot,null);
  const empty=complete(new LocalLightField(()=>NaN));
  assert.ok(empty.data.every(Number.isFinite));assert.equal(empty.data[3],0);
});
test('local lighting is composed through the existing hook with a zero-effect fallback',()=>{
  const source=assembleVoxelFragmentShader(LOCAL_FIELD_LIGHTING_GLSL);
  assert.match(source,/if\(!uLightingFieldEnabled\)return base/);
  assert.match(source,/surface\.albedo\*emission\*warm/);
});

test('walking across a window boundary retains valid old lighting until the new window is ready',()=>{
  const field=new LocalLightField(()=>2);const previous=complete(field);
  field.update({...input,center:{x:6,y:2,z:0}});
  assert.equal(field.snapshot,previous);
  const moved=complete(field,{...input,center:{x:6,y:2,z:0}});
  assert.deepEqual(moved.origin,[-6,-12]);assert.notEqual(moved,previous);
});

test('tall bank tops do not extinguish illumination potential for the lower cliff face',()=>{
  const liquid={kind:'lava',cells:[{x:1,z:0,surfaceY:.4,depth:4}]};
  const lit=complete(new LocalLightField(x=>Math.floor(x)===0?6:0),{...input,liquid});
  const index=(12*24+12)*4;
  assert.ok(lit.data[index+2]>.75,'adjacent cliff can receive lava light at fragment height');
  assert.ok(Math.abs(lit.data[index+1]-.4)<.00001,'source height is retained for per-fragment falloff');
});
