import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {scanTerrainSupport} from '../src/terrain-support-scan.mjs';
import {TerrainClusterHandoff} from '../src/terrain-cluster-handoff.mjs';

const options={cohesive:new Set([3]),anchors:new Set([4]),isKnown:()=>true};
const scan=(world,x=0,config=options)=>scanTerrainSupport(world,[{x,y:1,z:0}],config).candidates[0];

test('handoff removes seam voxels before exposing one immutable cluster',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world);
  world.set(-1,2,0,3);
  world.set(0,2,0,3);
  const candidate=scan(world);
  assert.ok(Object.isFrozen(candidate.cells[0]));
  assert.equal(handoff.detach({...candidate}).status,'stale-candidate');
  const result=handoff.detach(candidate);
  assert.equal(result.status,'detached');
  assert.deepEqual(handoff.bodies,[result.body]);
  assert.equal(result.body.cells.length,2);
  assert.equal(world.get(-1,2,0),0);
  assert.equal(world.get(0,2,0),0);
  assert.ok(result.dirtyChunks.includes('-1,0,0'));
  assert.ok(result.dirtyChunks.includes('0,0,-1'));
  assert.equal(handoff.detach(candidate).status,'stale-candidate');
});

test('foreign and stale candidates leave terrain and Physics unchanged',()=>{
  const first=new VoxelWorld({chunkEdge:16}),second=new VoxelWorld({chunkEdge:16});
  for(const world of [first,second])world.set(0,2,0,3);
  const candidate=scan(first);
  const handoff=new TerrainClusterHandoff(second);
  assert.equal(handoff.detach(candidate).status,'stale-candidate');
  const old=scan(second);
  second.set(8,10,0,3);
  assert.equal(handoff.detach(old).status,'stale-candidate');
  assert.equal(second.get(0,2,0),3);
  assert.deepEqual(handoff.bodies,[]);
});

test('bedrock and a full cluster registry leave terrain intact',()=>{
  const world=new VoxelWorld({chunkEdge:32});
  const handoff=new TerrainClusterHandoff(world);
  world.set(0,2,0,4);
  const bedrock=scan(world,0,{...options,cohesive:new Set([4]),anchors:new Set()});
  assert.equal(handoff.detach(bedrock).status,'ineligible-terrain');
  assert.equal(world.get(0,2,0),4);
  for(let x=2;x<=18;x+=2){
    world.set(x,2,0,3);
    const result=handoff.detach(scan(world,x));
    assert.equal(result.status,x===18?'capacity':'detached');
  }
  assert.equal(handoff.bodies.length,8);
  assert.equal(world.get(18,2,0),3);
});

test('one partial surface rejects the entire cluster without discarding microvoxels',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world);
  world.set(0,2,0,3);
  world.set(1,2,0,3);
  world.setMicroSurfaceTile(1,2,0,Array(100).fill(5));
  const revision=world.revision;
  assert.equal(handoff.detach(scan(world)).status,'ineligible-terrain');
  assert.equal(world.revision,revision);
  assert.equal(world.get(0,2,0),3);
  assert.equal(world.microSurfaceTile(1,2,0)[0],5);
  assert.deepEqual(handoff.bodies,[]);
});
