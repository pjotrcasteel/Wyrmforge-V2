import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {V2TerrainBandResidency} from '../src/terrain-band-residency.mjs';

const make=()=>({schema:'voxel-v2.terrain-initialization.v1',siteId:'test-band',
  generatorVersion:'test-v1',seed:7,chunkEdge:16,runs:[{x:0,y:0,z:0,length:2,material:1}]});

test('eviction discards authored definition and verifies regenerated identity before writes',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  world.set(0,0,0,1);
  world.set(1,0,0,1);
  world.set(0,0,0,0);
  let changed=false,calls=0;
  const band=new V2TerrainBandResidency(world,make(),{regenerate:()=>{
    calls++;
    const result=make();
    if(changed)result.runs[0].material=2;
    return result;
  }});
  band.beginEviction();
  while(!band.progress.done)band.step(1);
  assert.equal(band.retainedDefinition,null);
  assert.equal(band.progress.removedCells,1);
  const before=world.revision;
  changed=true;
  assert.throws(()=>band.beginReload(),/Regenerated terrain definition changed/);
  assert.equal(world.revision,before);
  assert.equal(band.retainedDefinition,null);
  changed=false;
  band.beginReload();
  while(!band.progress.done)band.step(1);
  assert.equal(calls,2);
  assert.equal(world.get(0,0,0),0);
  assert.equal(world.get(1,0,0),1);
  assert.equal(band.retainedDefinition.runs,1);
});
