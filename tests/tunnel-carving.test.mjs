import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld,createScene } from '../src/voxel-world.mjs';
import {
  TerrainEditLedger,MAX_TUNNEL_LENGTH,MAX_TUNNEL_RADIUS,
  MAX_TUNNEL_SCAN_CELLS,V2_BEDROCK_MATERIAL
} from '../src/terrain-edit-ledger.mjs';
import { V2TerrainPort,TERRAIN_CHANGE_SCHEMA } from '../src/terrain-integration-port.mjs';
import { createReplayCheckpoint,restoreReplayCheckpoint,worldDigest } from '../src/replay-checkpoint.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { createTerrainMeshJob,processTerrainMeshJob } from '../src/terrain-mesh-protocol.mjs';
import { demoTunnelTarget } from '../src/demo-tunnel.mjs';

const tunnel=(id,other={})=>({
  id,type:'carve-tunnel',
  x:-6,y:0,z:0,toX:6,toY:0,toZ:0,radius:1.75,...other
});

function solidCube(edge=16) {
  const world=new VoxelWorld({chunkEdge:edge});
  for(let x=-10;x<=10;x++)for(let y=-4;y<=4;y++)
    for(let z=-4;z<=4;z++)world.set(x,y,z,3);
  return world;
}

test('one bounded tunnel passes through true 3D solid and both signed chunk seams', () => {
  assert.equal(MAX_TUNNEL_LENGTH,16);
  assert.equal(MAX_TUNNEL_RADIUS,3.5);
  assert.equal(MAX_TUNNEL_SCAN_CELLS,12000);
  for(const edge of [16,32]){
    const world=solidCube(edge);
    const ledger=new TerrainEditLedger(world);
    const originalRevision=world.revision;
    const result=ledger.apply(tunnel('drill'));
    assert.equal(result.status,'accepted');
    assert.ok(result.removedVoxels>12);
    assert.equal(result.worldRevision-originalRevision,result.removedVoxels);
    for(let x=-6;x<=6;x++)assert.equal(world.get(x,0,0),0);
    assert.equal(world.get(-9,0,0),3);
    assert.equal(world.get(9,0,0),3);
    assert.equal(world.get(0,4,0),3);
    assert.equal(result.changedBounds.min.x,-7);
    assert.equal(result.changedBounds.max.x,7);
    assert.ok(result.dirtyChunks.some(s=>s.startsWith('-1,')),
      'negative coordinate chunk is invalidated');
    assert.ok(result.dirtyChunks.some(s=>s.startsWith('0,')),
      'positive coordinate chunk is invalidated');
    assert.equal(ledger.recordedEdits,1);
    assert.equal(ledger.editRevision,1);
    assert.deepEqual(ledger.exportJournal().commands[0],{
      id:'drill',type:'carve-tunnel',x:-6,y:0,z:0,radius:1.75,
      toX:6,toY:0,toZ:0
    });
  }
});

test('diagonal 3D tunnel is continuous with rounded ends but leaves outside solids', () => {
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-8;x<=8;x++)for(let y=-8;y<=8;y++)
    for(let z=-8;z<=8;z++)world.set(x,y,z,3);
  const ledger=new TerrainEditLedger(world);
  const command={id:'diagonal',type:'carve-tunnel',
    x:-5,y:-5,z:-5,toX:5,toY:5,toZ:5,radius:1.8};
  // Exceeds 16-voxel diagonal length, so reject without altering terrain.
  const digest=worldDigest(world);
  assert.throws(()=>ledger.apply(command),/Tunnel endpoint/);
  assert.equal(worldDigest(world),digest);
  const valid={...command,toX:4,toY:4,toZ:4};
  const result=ledger.apply(valid);
  assert.ok(result.removedVoxels>20);
  for(let v=-5;v<=4;v++)assert.equal(world.get(v,v,v),0);
  assert.equal(world.get(6,-6,6),3);
  assert.equal(world.get(8,8,8),3);
  assert.equal(ledger.recordedEdits,1);
});

test('bedrock remains solid and tunnel removes nearby damage without duplicate geometry', () => {
  for(const edge of [16,32]){
    const world=new VoxelWorld({chunkEdge:edge});
    for(let x=-7;x<=7;x++) world.set(x,0,0,3);
    world.set(0,0,0,V2_BEDROCK_MATERIAL);
    const ledger=new TerrainEditLedger(world);
    const partial=ledger.apply({id:'partial',type:'damage-sphere',x:2,y:0,z:0,
      radius:.6,power:1});
    assert.equal(partial.damagedVoxels,1);
    assert.equal(ledger.damageAt(2,0,0),1);
    const result=ledger.apply(tunnel('tunnel', {radius:0.85}));
    assert.equal(world.get(0,0,0),V2_BEDROCK_MATERIAL);
    assert.equal(world.get(2,0,0),0);
    assert.equal(ledger.damageAt(2,0,0),0);
    assert.equal(ledger.pendingDamageCells,0);
    assert.ok(result.dirtyChunks.length>0);
    const before=worldDigest(world);
    const duplicate=ledger.apply(tunnel('tunnel', {radius:0.85}));
    assert.equal(duplicate.status,'duplicate');
    assert.deepEqual(duplicate.dirtyChunks,[]);
    assert.equal(worldDigest(world),before);
    assert.throws(()=>ledger.apply(tunnel('tunnel', {toX:5,radius:0.85})),
      /Edit ID conflict/);
  }
});

test('invalid or excessive tunnel is rejected before any world mutation', () => {
  const world=solidCube();
  const ledger=new TerrainEditLedger(world);
  const original=worldDigest(world);
  const errors=[
    tunnel('same',{toX:-6}),
    tunnel('too-long',{toX:18}),
    tunnel('too-wide',{radius:3.6}),
    tunnel('bad-coordinate',{toZ:0.5}),
    tunnel('overflow',{x:Number.MAX_SAFE_INTEGER,toX:Number.MAX_SAFE_INTEGER-1}),
    tunnel('radius-zero',{radius:0}),
    tunnel('power',{power:1}),
    {...tunnel('missing'),toY:undefined},
    tunnel('end-too-far',{toX:-6,toY:17})
  ];
  for(const command of errors) assert.throws(()=>ledger.apply(command));
  assert.equal(ledger.recordedEdits,0);
  assert.equal(worldDigest(world),original);
});

test('tunnel command replay and portable JSON reproduce exact committed voxel geometry', () => {
  for(const edge of [16,32]) for(const scene of ['flat','hill','cliff','arch']) {
    const world=createScene(scene,7,{chunkEdge:edge});
    const ledger=new TerrainEditLedger(world);
    const target=demoTunnelTarget(scene);
    const first=ledger.apply({id:'lab-hit-1',type:'carve-tunnel',...target,
      expectedRevision:world.revision,expectedEditRevision:ledger.editRevision});
    assert.ok(first.removedVoxels>0,`expected a destructive ${scene} tunnel`);
    const before=worldDigest(world);
    const cp=createReplayCheckpoint({scene,seed:7,world,ledger});
    const restored=restoreReplayCheckpoint(JSON.parse(JSON.stringify(cp)));
    assert.equal(worldDigest(restored.world),before);
    assert.deepEqual(restored.ledger.exportJournal(),ledger.exportJournal());
    assert.equal(restored.ledger.recordedEdits,1);
    assert.equal(restored.world.revision,world.revision);
  }
});

test('each carved tunnel emits exactly one ordered V2 event with local dirty chunks', () => {
  for(const edge of [16,32]){
    const world=createScene('cliff',7,{chunkEdge:edge});
    const ledger=new TerrainEditLedger(world);
    const port=new V2TerrainPort(world,ledger);
    const events=[];
    port.subscribe('physics',change=>events.push(change));
    port.subscribe('vfx',change=>events.push(change));
    const result=port.apply({id:'tunnel-1',type:'carve-tunnel',
      ...demoTunnelTarget('cliff'),expectedRevision:world.revision});
    assert.ok(result.removedVoxels>0);
    assert.equal(events.length,2);
    assert.equal(events[0],events[1]);
    assert.equal(events[0].schema,TERRAIN_CHANGE_SCHEMA);
    assert.equal(events[0].editType,'carve-tunnel');
    assert.equal(events[0].sequence,1);
    assert.equal(events[0].geometryChanged,true);
    assert.deepEqual(events[0].dirtyChunks,result.dirtyChunks);
    assert.deepEqual(events[0].changedBounds,result.changedBounds);
    assert.equal(port.metrics().published,1);
    assert.equal(port.metrics().delivered,2);
    assert.equal(port.apply({id:'tunnel-1',type:'carve-tunnel',
      ...demoTunnelTarget('cliff'),expectedRevision:result.worldRevision-
        result.removedVoxels}).status,'duplicate');
    assert.equal(port.metrics().published,1);
  }
});

test('localized worker and baseline meshing agree after a multi-chunk tunnel', () => {
  for(const edge of [16,32]) {
    const world=createScene('hill',7,{chunkEdge:edge});
    const ledger=new TerrainEditLedger(world);
    const change=ledger.apply({id:'tunnel-mesh',type:'carve-tunnel',
      ...demoTunnelTarget('hill')});
    assert.ok(change.dirtyChunks.length>0);
    const dirty=new Set(change.dirtyChunks);
    const expected=buildExposedFaceMeshes(world,{chunkIds:dirty});
    const job=createTerrainMeshJob(world,dirty,1);
    const result=processTerrainMeshJob(job);
    assert.equal(result.revision,world.revision);
    assert.deepEqual(result.meshes,expected);
  }
});
