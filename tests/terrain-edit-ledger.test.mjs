import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { carveDemoSphere, demoCarveTarget } from '../src/demo-carve.mjs';
import {
  TerrainEditLedger, TERRAIN_EDIT_SCHEMA, V2_BEDROCK_MATERIAL,
  MAX_RECORDED_EDITS
} from '../src/terrain-edit-ledger.mjs';

const sphere = (id, target, expectedRevision) => ({
  id, type:'carve-sphere', ...target, expectedRevision
});

test('ordered sphere edit reproduces previous V2 carving and dirty footprint', () => {
  for (const edge of [16,32]) {
    for (const scene of ['flat','hill','cliff','arch']) {
      const world = createScene(scene,7,{chunkEdge:edge});
      const comparison = createScene(scene,7,{chunkEdge:edge});
      const target = demoCarveTarget(scene);
      const oldDirty = new Set();
      const expectedRemoved = carveDemoSphere(comparison,target,{dirtyChunks:oldDirty});
      const ledger = new TerrainEditLedger(world);
      const priorRevision = world.revision;
      const result = ledger.apply(sphere('demo-1',target,priorRevision));
      assert.equal(result.status,'accepted');
      assert.equal(result.schema,TERRAIN_EDIT_SCHEMA);
      assert.equal(result.removedVoxels,expectedRemoved);
      assert.equal(result.worldRevision-priorRevision,expectedRemoved);
      assert.deepEqual(result.dirtyChunks,[...oldDirty].sort());
      assert.ok(result.changedBounds);
      assert.equal(ledger.recordedEdits,1);
      assert.deepEqual(world.snapshots(),comparison.snapshots());
    }
  }
});

test('same edit ID with same payload never mutates terrain twice', () => {
  const world=createScene('hill',7,{chunkEdge:32});
  const ledger=new TerrainEditLedger(world);
  const command=sphere('hit-0001',demoCarveTarget('hill'),world.revision);
  const first=ledger.apply(command);
  const before=world.snapshots();
  const second=ledger.apply({...command});
  assert.equal(second.status,'duplicate');
  assert.equal(second.removedVoxels,0);
  assert.deepEqual(second.dirtyChunks,[]);
  assert.equal(second.changedBounds,null);
  assert.equal(second.originalWorldRevision,first.worldRevision);
  assert.deepEqual(world.snapshots(),before);
  assert.equal(ledger.recordedEdits,1);
});

test('command ID reused for different parameters is rejected even if revision is stale', () => {
  const world=createScene('flat');
  const ledger=new TerrainEditLedger(world);
  const first=sphere('one',{x:0,y:1,z:0,radius:1.5},world.revision);
  ledger.apply(first);
  const before=world.snapshots();
  assert.throws(()=>ledger.apply({...first,x:1}),/Edit ID conflict/);
  assert.deepEqual(world.snapshots(),before);
});

test('expected revision prevents stale edits, without touching authoritative voxels', () => {
  const world=createScene('hill');
  const ledger=new TerrainEditLedger(world);
  const prior=world.revision;
  world.set(1,2,3,0);
  const before=world.snapshots();
  assert.throws(()=>ledger.apply(sphere('stale',demoCarveTarget('hill'),prior)),/Stale terrain edit/);
  assert.equal(ledger.recordedEdits,0);
  assert.deepEqual(world.snapshots(),before);
});

test('protected V2 bedrock stays solid but stone and soil are removed', () => {
  for (const edge of [16,32]) {
    const world=new VoxelWorld({chunkEdge:edge});
    world.set(0,0,0,V2_BEDROCK_MATERIAL);
    world.set(1,0,0,3);
    world.set(0,1,0,2);
    const ledger=new TerrainEditLedger(world);
    const result=ledger.apply(sphere('bedrock',{x:0,y:0,z:0,radius:2}));
    assert.equal(result.removedVoxels,2);
    assert.equal(world.get(0,0,0),V2_BEDROCK_MATERIAL);
    assert.equal(world.get(1,0,0),0);
    assert.equal(world.get(0,1,0),0);
    assert.deepEqual(result.changedBounds,
      { min:{x:0,y:0,z:0}, max:{x:1,y:1,z:0} });
  }
});

test('two separate damage commands replay to the same canonical world', () => {
  for (const edge of [16,32]) {
    const commands=[
      sphere('hit-a',{x:-4,y:3,z:0,radius:3.5}),
      sphere('hit-b',{x:5,y:3,z:1,radius:3.5})
    ];
    function replay() {
      const world=createScene('hill',7,{chunkEdge:edge});
      const ledger=new TerrainEditLedger(world);
      return { world, results:commands.map(command=>ledger.apply(command)) };
    }
    const first=replay(), second=replay();
    assert.deepEqual(first.world.snapshots(),second.world.snapshots());
    assert.deepEqual(first.results,second.results);
    assert.equal(first.world.revision,second.world.revision);
    assert.ok(first.results.every(r=>r.removedVoxels>0));
  }
});

test('zero-change edit is accepted once and never invalidates mesh chunks', () => {
  const world=new VoxelWorld({chunkEdge:16});
  const ledger=new TerrainEditLedger(world);
  const first=ledger.apply(sphere('empty',{x:0,y:0,z:0,radius:1.5}));
  assert.equal(first.status,'accepted');
  assert.equal(first.removedVoxels,0);
  assert.deepEqual(first.dirtyChunks,[]);
  assert.equal(first.changedBounds,null);
  assert.equal(first.worldRevision,0);
  assert.equal(ledger.apply(sphere('empty',{x:0,y:0,z:0,radius:1.5})).status,'duplicate');
});

test('commands are validated and rejected before mutating the world', () => {
  const world=new VoxelWorld();
  world.set(0,0,0,1);
  const ledger=new TerrainEditLedger(world);
  const invalid=[
    sphere('x',{x:0.5,y:0,z:0,radius:1}),
    sphere('x',{x:0,y:0,z:0,radius:Infinity}),
    sphere('x',{x:0,y:0,z:0,radius:9}),
    sphere('x',{x:Number.MAX_SAFE_INTEGER,y:0,z:0,radius:2}),
    sphere('x',{x:0,y:0,z:0,radius:2},-1),
    sphere('bad id',{x:0,y:0,z:0,radius:1}),
    {id:'x',type:'unknown',x:0,y:0,z:0,radius:1}
  ];
  const before=world.snapshots();
  for(const command of invalid) assert.throws(()=>ledger.apply(command));
  assert.deepEqual(world.snapshots(),before);
  assert.equal(ledger.recordedEdits,0);
});

test('history is explicitly bounded instead of silently forgetting command IDs', () => {
  const world=new VoxelWorld();
  const ledger=new TerrainEditLedger(world);
  for(let i=0;i<MAX_RECORDED_EDITS;i++){
    assert.equal(ledger.apply(sphere(`noop-${i}`,{x:0,y:0,z:0,radius:.5})).status,'accepted');
  }
  assert.equal(ledger.recordedEdits,MAX_RECORDED_EDITS);
  assert.throws(()=>ledger.apply(sphere('overflow',{x:0,y:0,z:0,radius:.5})),RangeError);
  assert.equal(ledger.apply(sphere('noop-0',{x:0,y:0,z:0,radius:.5})).status,'duplicate');
});
