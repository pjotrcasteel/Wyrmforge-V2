import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import { projectVoxel } from '../src/camera-presets.mjs';
import { terrainRayFromScreen, raycastTerrain } from '../src/terrain-raycast.mjs';
import { applyTerrainSpellHit } from '../src/hunt-terrain-impact.mjs';

test('signed 3D DDA ray hits closest solid cell, including a negative chunk seam', () => {
  const world=new VoxelWorld({chunkEdge:16});
  world.set(-17,0,0,3);
  world.set(-16,0,0,2);
  world.set(-15,0,0,1);
  const hit=raycastTerrain(world,{
    origin:[-20.5,0.5,0.5], direction:[1,0,0],maxDistance:12
  });
  assert.deepEqual(hit.cell,{x:-17,y:0,z:0});
  assert.equal(hit.material,3);
  assert.equal(hit.normal.x,-1);
  assert.ok(Math.abs(hit.distance-3.5)<1e-8);
  assert.equal(hit.worldRevision,world.revision);
});

test('rays pass through truly empty cave and intersect far wall', () => {
  const world=new VoxelWorld({chunkEdge:16});
  world.set(0,0,0,2);
  world.set(0,0,4,3);
  const hit=raycastTerrain(world,{
    origin:[0.5,0.5,1.5], direction:[0,0,1],maxDistance:10
  });
  assert.deepEqual(hit.cell,{x:0,y:0,z:4});
  assert.equal(hit.distance,2.5);
  assert.deepEqual(hit.normal,{x:0,y:0,z:-1});
});

test('DDA hit from within a solid voxel has zero distance and no entry normal', () => {
  const world=new VoxelWorld();
  world.set(0,0,0,3);
  const hit=raycastTerrain(world,{
    origin:[0.1,0.2,0.3],direction:[0,-1,0],maxDistance:2
  });
  assert.equal(hit.distance,0);
  assert.equal(hit.normal,null);
});

test('bounded ray query never finds a voxel outside specified reach', () => {
  const world=new VoxelWorld();
  world.set(0,0,10,3);
  assert.equal(raycastTerrain(world,{
    origin:[0.5,0.5,0.5],direction:[0,0,1],maxDistance:5
  }),null);
  assert.throws(()=>raycastTerrain(world,{
    origin:[0,0,0],direction:[0,0,0]
  }),RangeError);
  assert.throws(()=>raycastTerrain(world,{
    origin:[0,0,0],direction:[1,0,0],maxDistance:257
  }),RangeError);
  assert.throws(()=>raycastTerrain(world,{
    origin:[Infinity,0,0],direction:[1,0,0]
  }),TypeError);
});

test('Hunt camera screen picking hits projected top surfaces after pan/zoom', () => {
  for (const [width,height,scale,panX,panY] of [
    [800,600,12,0,0], [402,250,8,-20,30], [900,500,24,100,-90]
  ]) {
    const world=new VoxelWorld({chunkEdge:16});
    world.set(2,3,1,3);
    const pixel=projectVoxel(2.5,3.99,1.5,{
      width,height,scale,panX,panY,camera:'hunt'
    });
    const ray=terrainRayFromScreen({
      x:pixel.x,y:pixel.y,width,height,scale,panX,panY,camera:'hunt'
    });
    const hit=raycastTerrain(world,ray);
    assert.ok(hit,'projected terrain point must be pickable');
    assert.deepEqual(hit.cell,{x:2,y:3,z:1});
  }
});

test('inspection camera inversion uses its own basis and also targets voxel geometry', () => {
  const world=new VoxelWorld({chunkEdge:32});
  world.set(-2,7,4,2);
  const view={width:800,height:600,scale:13,panX:22,panY:-15,camera:'inspection'};
  const point=projectVoxel(-1.5,7.5,4.5,view);
  const hit=raycastTerrain(world,terrainRayFromScreen({x:point.x,y:point.y,...view}));
  assert.ok(hit);
  assert.deepEqual(hit.cell,{x:-2,y:7,z:4});
});

test('Hunt spell impact queries terrain, respects material resistance and returns dirty chunks', () => {
  const world=new VoxelWorld({chunkEdge:16});
  world.set(0,0,0,2);
  world.set(0,-1,0,3);
  const ledger=new TerrainEditLedger(world);
  const ray={origin:[0.5,2,0.5],direction:[0,-1,0],maxDistance:8};
  const first=applyTerrainSpellHit(world,ledger,{id:'fire-1',ray,radius:1.1});
  assert.equal(first.status,'accepted');
  assert.deepEqual(first.hit.cell,{x:0,y:0,z:0});
  assert.equal(first.removedVoxels,0);
  assert.equal(first.damagedVoxels,1);
  assert.deepEqual(first.dirtyChunks,[]);
  const second=applyTerrainSpellHit(world,ledger,{id:'fire-2',ray,radius:1.1});
  assert.equal(second.removedVoxels,1);
  assert.ok(second.dirtyChunks.length>0);
  assert.equal(world.get(0,0,0),0);
  assert.equal(ledger.recordedEdits,2);
  const third=applyTerrainSpellHit(world,ledger,{id:'fire-3',ray,radius:0.6});
  assert.deepEqual(third.hit.cell,{x:0,y:-1,z:0});
  assert.equal(third.damagedVoxels,1);
  assert.equal(world.get(0,-1,0),3);
});

test('miss and stale manually supplied hit do not write to authoritative world', () => {
  const world=new VoxelWorld();
  const ledger=new TerrainEditLedger(world);
  const miss=applyTerrainSpellHit(world,ledger,{
    id:'miss',ray:{origin:[0,3,0],direction:[0,1,0],maxDistance:8}
  });
  assert.equal(miss.status,'miss');
  assert.equal(ledger.recordedEdits,0);
  world.set(0,0,0,1);
  const hit=raycastTerrain(world,{origin:[.5,2,.5],direction:[0,-1,0],maxDistance:8});
  world.set(0,0,0,0);
  assert.throws(()=>applyTerrainSpellHit(world,ledger,{
    id:'stale',hit,radius:1
  }),/Stale or invalid voxel impact/);
  assert.equal(ledger.recordedEdits,0);
});

test('bedrock never breaks from high-power spell, no chunk update is scheduled', () => {
  const world=new VoxelWorld();
  world.set(0,0,0,4);
  const ledger=new TerrainEditLedger(world);
  const impact=applyTerrainSpellHit(world,ledger,{
    id:'bedrock',ray:{origin:[.5,2,.5],direction:[0,-1,0],maxDistance:6},
    radius:1.1,power:8
  });
  assert.equal(impact.status,'accepted');
  assert.equal(impact.removedVoxels,0);
  assert.deepEqual(impact.dirtyChunks,[]);
  assert.equal(world.get(0,0,0),4);
});
