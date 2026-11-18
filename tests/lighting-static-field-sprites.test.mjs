import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleStaticFieldIrradiance}
  from '../src/lighting/static-field-sample.mjs';
import {sampleSurfaceIrradiance}
  from '../src/lighting/surface-light-sample.mjs';
import {LocalLightField}
  from '../src/lighting/local-light-field.mjs';
import {MOLTEN_PRESENTATION}
  from '../src/materials/molten-presentation.mjs';
import {LOCAL_FIELD_LIGHTING_GLSL}
  from '../src/lighting/local-field-shader.mjs';
import {assembleVoxelFragmentShader}
  from '../src/webgl-voxel-view.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {raycastTerrain} from '../src/terrain-raycast.mjs';

const dark={ambient:[.4,.4,.4]};
function descriptor({
  emission=[1,.31,.055],energy=1,topY=2,sourceY=2,side=0
}={}){
  const data=new Float32Array(24*24*4);
  for(let i=0;i<24*24;i++){
    const o=i*4;
    data[o]=topY;data[o+1]=sourceY;data[o+2]=energy;data[o+3]=1+side;
  }
  return {schema:'wyrmforge.local-light-field.v2',epoch:1,revision:1,
    origin:[-12,-12],size:[24,24],hasEmission:true,
    emission,data};
}
function completed(field,args){
  let steps=0;
  for(;steps<96;steps++){
    const work=field.update({...args,now:0});
    assert.ok(work.processed<=24);
    assert.ok(work.visibilityRays<=24);
    if(field.snapshot&&!field.pending&&field.snapshot.epoch===args.epoch&&
        field.snapshot.revision===args.revision)return field.snapshot;
  }
  throw new Error('Could not publish bounded field');
}
test('static field CPU relighting uses exactly the same emission colour as terrain shader',()=>{
  const field=descriptor(),point=[.5,2,.5];
  const light=sampleStaticFieldIrradiance(point,field);
  const expected=1.65*Math.pow(2,-.4*.35);
  assert.ok(Math.abs(light[0]-expected)<1e-5);
  assert.ok(Math.abs(light[1]-expected*.31)<1e-5);
  assert.ok(Math.abs(light[2]-expected*.055)<1e-5);
  const sprite=sampleSurfaceIrradiance(point,dark,null,[0,1,0],null,field);
  assert.ok(sprite.every((v,i)=>Math.abs(v-dark.ambient[i]-light[i])<1e-12));
  const other=descriptor({emission:[.06,.25,1]});
  const blue=sampleStaticFieldIrradiance(point,other);
  assert.ok(blue[2]>blue[0],'arbitrary materials, no lava-specific light path');
  const glsl=assembleVoxelFragmentShader(LOCAL_FIELD_LIGHTING_GLSL);
  assert.match(glsl,/uniform vec3 uLightingEmissionColor/);
  assert.match(glsl,/vec3 emission=uLightingEmissionColor/);
  assert.doesNotMatch(glsl,/MOLTEN_PRESENTATION/);
});
test('upper and lower physical receivers affect sprites by the same elevation rule',()=>{
  const field=descriptor({energy:0,side:1,topY:3,sourceY:2});
  assert.equal(sampleStaticFieldIrradiance([.5,3.5,.5],field)[0],0);
  assert.ok(sampleStaticFieldIrradiance([.5,1.5,.5],field)[0]>0,
    'cliff-side/lower sprite sample remains lit');
});
test('empty, stale, exterior, unoccupied or invalid fields fall back to ambient',()=>{
  const location=[.5,2,.5];
  assert.deepEqual(sampleSurfaceIrradiance(location,dark),dark.ambient);
  assert.deepEqual(sampleSurfaceIrradiance(location,dark,null,[0,1,0],null,null),dark.ambient);
  assert.deepEqual(sampleStaticFieldIrradiance([30,2,30],descriptor()),[0,0,0]);
  const empty=descriptor();empty.hasEmission=false;
  assert.deepEqual(sampleStaticFieldIrradiance(location,empty),[0,0,0]);
  const stale=descriptor();stale.schema='unknown';
  assert.deepEqual(sampleStaticFieldIrradiance(location,stale),[0,0,0]);
  const hole=descriptor();hole.data[((12*24+12)*4)+3]=0;
  assert.deepEqual(sampleStaticFieldIrradiance(location,hole),[0,0,0]);
});
test('real Voxel wall blocks lava warmth on sprites, then opens after demolition',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)world.set(x,1,z,3);
  for(let y=2;y<=6;y++)for(let z=-2;z<=2;z++)world.set(1,y,z,3);
  const raycast=ray=>raycastTerrain(world,ray);
  const sampler=new LocalLightField((x,z,y)=>raycast({
    origin:[x,y+16,z],direction:[0,-1,0],maxDistance:32
  })?.point.y??NaN,{geometry:{raycast}});
  const input={epoch:1,revision:world.revision,center:{x:0,y:2,z:0},
    emissionCells:[{x:0,z:0,surfaceY:2,energy:1}],
    emissionColor:[...MOLTEN_PRESENTATION.emission]};
  const blocked=completed(sampler,input);
  assert.deepEqual(sampleStaticFieldIrradiance([2.5,2.1,.5],blocked),[0,0,0]);
  assert.ok(sampleStaticFieldIrradiance([-.5,2.1,.5],blocked)[0]>0);
  for(let y=2;y<=6;y++)for(let z=-2;z<=2;z++)world.set(1,y,z,0);
  const opened=completed(sampler,{...input,revision:world.revision});
  assert.ok(sampleStaticFieldIrradiance([2.5,2.1,.5],opened)[0]>0);
  assert.notEqual(opened,blocked);
});
test('emissive field material change invalidates snapshots without changing Voxel authority',()=>{
  const sampler=new LocalLightField(()=>2);
  const input={epoch:1,revision:0,center:{x:0,y:2,z:0},
    emissionCells:[{x:0,z:0,surfaceY:2,energy:1}],
    emissionColor:[1,.3,.05]};
  const warm=completed(sampler,input);
  assert.deepEqual(warm.emission,[1,.3,.05]);
  sampler.update({...input,emissionColor:[0,.4,1]});
  const changed=completed(sampler,{...input,emissionColor:[0,.4,1]});
  assert.deepEqual(changed.emission,[0,.4,1]);
  assert.notEqual(changed,warm);
  assert.throws(()=>sampler.update({...input,emissionColor:[NaN,1,1]}),TypeError);
});
