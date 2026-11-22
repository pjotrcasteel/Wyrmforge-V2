import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {beginTerrainSupportScan,isCurrentTerrainSupportCandidate,scanTerrainSupport} from '../src/terrain-support-scan.mjs';

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

test('the terrain floor proves support without scanning the entire mixed ground mass',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-30;x<=30;x++){
    for(let z=-8;z<=8;z++){
      world.set(x,-3,z,3);
      world.set(x,-2,z,2);
      world.set(x,-1,z,1);
    }
  }
  world.set(-1,2,0,1);
  world.set(0,2,0,2);
  world.set(1,2,0,42);
  const mixed={...options,cohesive:new Set([1,2,3,42]),foundationY:-3,maxReads:120};
  const result=scanTerrainSupport(world,[{x:0,y:0,z:0},{x:0,y:1,z:0}],mixed);
  assert.equal(result.status,'complete');
  assert.deepEqual(result.candidates.map(candidate=>candidate.cells),[[
    {x:-1,y:2,z:0,material:1},{x:0,y:2,z:0,material:2},{x:1,y:2,z:0,material:42}
  ]]);
  assert.equal(world.get(0,-3,0),3);
});

test('stepped support scans retain progress and publish the synchronous proof',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-10;x<=10;x++)world.set(x,2,0,x%2?1:3);
  const removed=[{x:0,y:1,z:0}];
  const mixed={...options,cohesive:new Set([1,3]),maxExtent:32};
  const expect=scanTerrainSupport(world,removed,mixed);
  const job=beginTerrainSupportScan(world,removed,mixed);
  mixed.cohesive.clear();
  let result=job.step(7),frames=1;
  while(result.status==='scanning'){
    assert.deepEqual(result.candidates,[]);
    const previous=result.reads;
    assert.ok(frames++<100);
    result=job.step(7);
    assert.ok(result.reads-previous<=7);
  }
  assert.ok(frames>1);
  assert.deepEqual(result,expect);
  assert.equal(isCurrentTerrainSupportCandidate(world,result.candidates[0]),true);
});

test('a world mutation between slices invalidates the scan before it can publish',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  world.set(0,2,0,3);
  const job=beginTerrainSupportScan(world,[{x:0,y:1,z:0}],options);
  const pending=job.step(1);
  assert.equal(pending.status,'scanning');
  world.set(0,1,0,3);
  const stale=job.step(1);
  assert.equal(stale.status,'stale');
  assert.equal(stale.reads,pending.reads);
  assert.deepEqual(stale.candidates,[]);
});
