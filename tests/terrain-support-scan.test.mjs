import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {scanTerrainSupport} from '../src/terrain-support-scan.mjs';

const options={cohesive:new Set([3]),anchors:new Set([4]),isKnown:()=>true};

for(const chunkEdge of [16,32]){
  test('removed support reveals one cohesive cluster across a negative seam · '+chunkEdge,()=>{
    const world=new VoxelWorld({chunkEdge});
    world.set(-1,0,0,4);
    world.set(-1,1,0,3);
    world.set(-1,2,0,3);
    world.set(0,2,0,3);
    world.set(-2,1,0,3);
    world.set(-2,0,0,4);
    const cut={x:-1,y:1,z:0};
    const adjacent={x:0,y:1,z:0};
    assert.equal(scanTerrainSupport(world,[cut,adjacent],options).candidates.length,0);
    world.set(-1,1,0,0);
    const revision=world.revision;
    const result=scanTerrainSupport(world,[cut,adjacent],options);
    assert.equal(result.status,'complete');
    assert.deepEqual(result.candidates.map(cluster=>cluster.cells),[[
      {x:-1,y:2,z:0,material:3},{x:0,y:2,z:0,material:3}
    ]]);
    assert.deepEqual(result,scanTerrainSupport(world,[adjacent,cut,cut],options));
    assert.equal(world.revision,revision);
    assert.equal(world.get(0,2,0),3);
  });
}

test('unloaded neighbors and exhausted budgets cannot publish uncertain candidates',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-1;x<=10;x++)world.set(x,2,0,3);
  const cut={x:-1,y:1,z:0};
  const partial=scanTerrainSupport(world,[cut],{...options,isKnown:x=>x<0});
  assert.equal(partial.status,'partial-coverage');
  assert.deepEqual(partial.candidates,[]);
  const exhausted=scanTerrainSupport(world,[cut],{...options,maxReads:16});
  assert.equal(exhausted.status,'budget-exhausted');
  assert.equal(exhausted.reads,16);
  assert.deepEqual(exhausted.candidates,[]);
  const oversized=scanTerrainSupport(world,[cut],{...options,maxExtent:6});
  assert.equal(oversized.oversized,1);
  assert.deepEqual(oversized.candidates,[]);
});

test('a scan invalidated by a terrain revision publishes no candidates',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  world.set(0,2,0,3);
  const result=scanTerrainSupport(world,[{x:0,y:1,z:0}],{
    ...options,isKnown:(x,y,z)=>{
      if(x===0&&y===2&&z===0)world.set(20,5,20,3);
      return true;
    }
  });
  assert.equal(result.status,'stale');
  assert.ok(world.revision>result.worldRevision);
  assert.deepEqual(result.candidates,[]);
});
