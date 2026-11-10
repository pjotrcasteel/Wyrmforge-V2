import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, VoxelWorld } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import { applyDemoBurst } from '../src/demo-burst.mjs';
import {
  REPLAY_CHECKPOINT_SCHEMA, createReplayCheckpoint,
  restoreReplayCheckpoint, worldDigest, damageDigest
} from '../src/replay-checkpoint.mjs';

function damage(id, location, ledger) {
  return { id, type:'damage-sphere', ...location, power:1,
    expectedRevision:ledger.worldRevisionForTest,
    expectedEditRevision:ledger.editRevision };
}
const hit = { x:0,y:3,z:0,radius:4.65 };

test('all four V2 scenes at 16³/32³ round-trip a JSON replay including partial damage', () => {
  for (const chunkEdge of [16,32]) {
    for (const scene of ['flat','hill','cliff','arch']) {
      const world=createScene(scene,7,{chunkEdge});
      const ledger=new TerrainEditLedger(world);
      const center=scene==='arch'
        ? {x:5,y:5,z:2,radius:3.5} : hit;
      ledger.apply({id:'partial-1',type:'damage-sphere',...center,power:1,
        expectedRevision:world.revision,expectedEditRevision:0});
      ledger.apply({id:'partial-2',type:'damage-sphere',...center,power:1,
        expectedRevision:world.revision,expectedEditRevision:1});
      const checkpoint=createReplayCheckpoint({scene,seed:7,world,ledger});
      assert.equal(checkpoint.schema,REPLAY_CHECKPOINT_SCHEMA);
      const json=JSON.parse(JSON.stringify(checkpoint));
      const restored=restoreReplayCheckpoint(json);
      assert.deepEqual(restored.world.snapshots(),world.snapshots());
      assert.deepEqual(restored.ledger.exportDamage(),ledger.exportDamage());
      assert.deepEqual(restored.ledger.exportJournal(),ledger.exportJournal());
      assert.equal(worldDigest(restored.world),worldDigest(world));
      assert.equal(damageDigest(restored.ledger),damageDigest(ledger));
      assert.equal(restored.ledger.editRevision,2);
    }
  }
});

test('a checkpoint with no committed voxel changes retains two partial stone hits', () => {
  // Authoritative scene must be the one serialized: create a fixture from the
  // V2 generator with a stone voxel at the arch support, not a custom world.
  const world=createScene('arch',7,{chunkEdge:32});
  const ledger=new TerrainEditLedger(world);
  const c={x:5,y:5,z:2,radius:0.6};
  const revision=world.revision;
  const first=ledger.apply({id:'stone-1',type:'damage-sphere',...c,power:1,
    expectedRevision:revision,expectedEditRevision:0});
  assert.equal(first.removedVoxels,0);
  assert.equal(ledger.damageAt(5,5,2),1);
  const snapshot=createReplayCheckpoint({scene:'arch',seed:7,world,ledger});
  assert.equal(snapshot.worldRevision,revision);
  assert.equal(snapshot.pendingDamageCells,1);
  const restored=restoreReplayCheckpoint(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(restored.world.get(5,5,2),3);
  assert.equal(restored.ledger.damageAt(5,5,2),1);
  const second=restored.ledger.apply({id:'stone-2',type:'damage-sphere',...c,power:1,
    expectedRevision:restored.world.revision,
    expectedEditRevision:restored.ledger.editRevision});
  assert.equal(second.removedVoxels,0);
  assert.equal(restored.ledger.damageAt(5,5,2),2);
  const third=restored.ledger.apply({id:'stone-3',type:'damage-sphere',...c,power:1,
    expectedRevision:restored.world.revision,
    expectedEditRevision:restored.ledger.editRevision});
  assert.equal(third.removedVoxels,1);
  assert.equal(restored.world.get(5,5,2),0);
});

test('replay retains edit ID deduplication and original revision guards', () => {
  const world=createScene('hill',7);
  const ledger=new TerrainEditLedger(world);
  const c={id:'first-damage',type:'damage-sphere',x:0,y:3,z:0,
    radius:1.1,power:1,expectedRevision:world.revision,expectedEditRevision:0};
  ledger.apply(c);
  const checkpoint=createReplayCheckpoint({scene:'hill',seed:7,world,ledger});
  const replay=restoreReplayCheckpoint(checkpoint);
  const copy=replay.ledger.apply(c);
  assert.equal(copy.status,'duplicate');
  assert.equal(copy.damagedVoxels,0);
  assert.equal(replay.ledger.editRevision,1);
  assert.throws(()=>replay.ledger.apply({...c,power:2}),/Edit ID conflict/);
  assert.throws(()=>replay.ledger.apply({...c,id:'different'}),/expected edit revision mismatch/);
});

test('replay mixed 3-hit burst then material pulse preserves exact damage and visible geometry', () => {
  for (const chunkEdge of [16,32]) {
    const world=createScene('hill',7,{chunkEdge});
    const ledger=new TerrainEditLedger(world);
    const burst=applyDemoBurst(world,ledger,{scene:'hill',runId:1});
    assert.equal(burst.impactCount,3);
    ledger.apply({id:'pulse-after-burst',type:'damage-sphere',
      x:10,y:1,z:10,radius:2.5,power:1,
      expectedRevision:world.revision,expectedEditRevision:ledger.editRevision});
    const cp=createReplayCheckpoint({scene:'hill',seed:7,world,ledger});
    const restored=restoreReplayCheckpoint(JSON.parse(JSON.stringify(cp)));
    assert.deepEqual(restored.world.snapshots(),world.snapshots());
    assert.deepEqual(restored.ledger.exportDamage(),ledger.exportDamage());
    assert.equal(restored.ledger.recordedEdits,4);
  }
});

test('checkpoint replays exactly after additional live edits; restored authority is independent', () => {
  const world=createScene('hill',7,{chunkEdge:32});
  const ledger=new TerrainEditLedger(world);
  ledger.apply({id:'original',type:'damage-sphere',...hit,power:1});
  const cp=createReplayCheckpoint({scene:'hill',seed:7,world,ledger});
  const savedDigest=cp.checksums.world, savedDamage=cp.checksums.damage;
  ledger.apply({id:'later',type:'damage-sphere',...hit,power:1});
  assert.notEqual(damageDigest(ledger),savedDamage);
  const restored=restoreReplayCheckpoint(cp);
  assert.equal(worldDigest(restored.world),savedDigest);
  assert.equal(damageDigest(restored.ledger),savedDamage);
  assert.equal(restored.ledger.recordedEdits,1);
  assert.equal(ledger.recordedEdits,2);
  assert.deepEqual(restored.ledger.exportJournal().commands.map(c=>c.id),['original']);
});

test('truncated, tampered, wrong-generator or wrong-seed checkpoints fail closed', () => {
  const world=createScene('hill',7);
  const ledger=new TerrainEditLedger(world);
  ledger.apply({id:'damage',type:'damage-sphere',...hit,power:1});
  const cp=createReplayCheckpoint({scene:'hill',seed:7,world,ledger});
  const copy=()=>JSON.parse(JSON.stringify(cp));
  const truncated=copy();
  truncated.journal.commands=[];
  assert.throws(()=>restoreReplayCheckpoint(truncated),/Unsupported or corrupt/);
  const modified=copy();
  modified.journal.commands[0].power=3;
  assert.throws(()=>restoreReplayCheckpoint(modified),/checksum mismatch/);
  const wrongSeed=copy();
  wrongSeed.source.seed=8;
  assert.throws(()=>restoreReplayCheckpoint(wrongSeed),/replay mismatch/i);
  const wrongGenerator=copy();
  wrongGenerator.source.sceneGenerator='v1';
  assert.throws(()=>restoreReplayCheckpoint(wrongGenerator),/Unsupported or corrupt/);
  const wrongChecksum=copy();
  wrongChecksum.checksums.world='0000000000000000';
  assert.throws(()=>restoreReplayCheckpoint(wrongChecksum),/replay mismatch/i);
  assert.equal(ledger.recordedEdits,1,'failed restores must not mutate live authority');
});

test('empty edit journal is a valid stable checkpoint', () => {
  const world=createScene('flat',7,{chunkEdge:16});
  const ledger=new TerrainEditLedger(world);
  const cp=createReplayCheckpoint({scene:'flat',seed:7,world,ledger});
  const restored=restoreReplayCheckpoint(cp);
  assert.equal(restored.ledger.editRevision,0);
  assert.equal(restored.ledger.pendingDamageCells,0);
  assert.deepEqual(restored.world.snapshots(),world.snapshots());
});

test('invalid source and non-generator terrain cannot pass exact replay checks', () => {
  const world=createScene('flat',7);
  const ledger=new TerrainEditLedger(world);
  world.set(100,100,100,3);
  const cp=createReplayCheckpoint({scene:'flat',seed:7,world,ledger});
  assert.throws(()=>restoreReplayCheckpoint(cp),/replay mismatch/i);
  for (const seed of [-1,0.2,4294967296]) {
    assert.throws(()=>createReplayCheckpoint({scene:'flat',seed,world,ledger}),TypeError);
  }
  assert.throws(()=>createReplayCheckpoint({scene:'bad',seed:7,world,ledger}),TypeError);
  assert.throws(()=>worldDigest(null),TypeError);
  assert.throws(()=>damageDigest(null),TypeError);
});
