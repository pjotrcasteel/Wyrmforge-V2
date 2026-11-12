import test from 'node:test';
import assert from 'node:assert/strict';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { createExternalSiteFixture } from '../src/diagnostics/external-site-fixture.mjs';
import { worldDigest, damageDigest } from '../src/replay-checkpoint.mjs';
import {
  EXTERNAL_TERRAIN_CHECKPOINT_SCHEMA, MAX_EXTERNAL_CHECKPOINT_EDITS,
  V2ExternalTerrainReplaySession, createExternalTerrainCheckpoint
} from '../src/external-terrain-checkpoint.mjs';

function loaded(chunkEdge=32) {
  const loader=new V2ExternalTerrainLoader(createExternalSiteFixture({chunkEdge}));
  while(!loader.progress.done) loader.loadStep(192);
  return loader;
}

function withEdits(chunkEdge=32) {
  const loader=loaded(chunkEdge);
  const {port,world}=loader.terrain;
  const command=(id,type,values)=>port.apply({
    id,type,...values,expectedRevision:world.revision,
    expectedEditRevision:port.editRevision
  });
  const damage={x:4,y:2,z:0,radius:.6,power:1};
  const first=command('partial-stone','damage-sphere',damage);
  assert.equal(first.status,'accepted');
  assert.equal(first.removedVoxels,0);
  assert.equal(port.damageAt(4,2,0),1);
  const breach=command('breach-roof','carve-sphere',{
    x:0,y:6,z:0,radius:2.3
  });
  assert.ok(breach.removedVoxels>0);
  const third=command('partial-stone-next','damage-sphere',damage);
  assert.equal(third.status,'accepted');
  return loader;
}

function restoreAll(checkpoint,maxCells=192,maxEdits=1) {
  const restore=new V2ExternalTerrainReplaySession(checkpoint);
  while(!restore.progress.done) restore.step({maxCells,maxEdits});
  return restore;
}

test('external site survives JSON checkpoint and staged replay at both chunk pitches',()=>{
  for(const chunkEdge of [16,32]) {
    const original=withEdits(chunkEdge);
    const checkpoint=createExternalTerrainCheckpoint(original);
    assert.equal(checkpoint.schema,EXTERNAL_TERRAIN_CHECKPOINT_SCHEMA);
    assert.equal(checkpoint.source.chunkEdge,chunkEdge);
    assert.equal(checkpoint.editRevision,3);
    assert.ok(checkpoint.pendingDamageCells>0);
    const serialized=JSON.parse(JSON.stringify(checkpoint));

    const replay=new V2ExternalTerrainReplaySession(serialized);
    assert.throws(()=>replay.terrain,/not verified/);
    assert.equal(replay.step({maxCells:5,maxEdits:1}).done,false);
    assert.throws(()=>replay.terrain,/not verified/);
    while(!replay.progress.done) replay.step({maxCells:192,maxEdits:1});
    const restored=replay.terrain;
    assert.deepEqual(restored.world.snapshots(),original.terrain.world.snapshots());
    assert.deepEqual(restored.ledger.exportDamage(),original.terrain.ledger.exportDamage());
    assert.deepEqual(restored.ledger.exportJournal(),original.terrain.ledger.exportJournal());
    assert.equal(worldDigest(restored.world),worldDigest(original.terrain.world));
    assert.equal(damageDigest(restored.ledger),damageDigest(original.terrain.ledger));
    assert.equal(restored.port.metrics().published,0,'replay should not emit fake live events');
    assert.equal(restored.port.editRevision,3);
    assert.equal(restored.port.materialAt(0,6,0),0);
    assert.equal(restored.port.damageAt(4,2,0),2);
    assert.equal(replay.step().done,true,'completed replay cannot reapply commands');
    replay.unload();
    original.unload();
  }
});

test('restored source preserves stable site and distinct future command stream',()=>{
  const original=withEdits();
  const checkpoint=createExternalTerrainCheckpoint(original);
  const replay=restoreAll(checkpoint);
  assert.equal(replay.terrain.source.siteId,checkpoint.source.siteId);
  assert.equal(replay.terrain.source.generatorVersion,checkpoint.source.generatorVersion);
  const {port,world}=replay.terrain;
  const notified=[];
  const unsubscribe=port.subscribe('physics',row=>notified.push(row));
  const result=port.apply({
    id:'new-command-after-reload',type:'carve-sphere',x:2,y:6,z:0,radius:.6,
    expectedRevision:world.revision,expectedEditRevision:3
  });
  assert.equal(result.status,'accepted');
  assert.equal(notified.length,1,'only new edits publish to listeners');
  assert.equal(result.editRevision,4);
  unsubscribe();
  replay.unload();
  original.unload();
});

test('source and journal copies cannot be changed after replay session begins',()=>{
  const original=withEdits();
  const checkpoint=JSON.parse(JSON.stringify(createExternalTerrainCheckpoint(original)));
  const restore=new V2ExternalTerrainReplaySession(checkpoint);
  checkpoint.source.runs[0].material=255;
  checkpoint.source.runs.reverse();
  checkpoint.journal.commands[0].id='tampered-by-client';
  while(!restore.progress.done) restore.step({maxCells:192,maxEdits:2});
  assert.equal(worldDigest(restore.terrain.world),
    worldDigest(original.terrain.world));
  assert.equal(restore.terrain.ledger.exportJournal().commands[0].id,'partial-stone');
  restore.unload();
  original.unload();
});

test('invalid edit journal, modified source, or wrong metadata are rejected before allocating',()=>{
  const loader=withEdits();
  const checkpoint=createExternalTerrainCheckpoint(loader);
  const copy=()=>JSON.parse(JSON.stringify(checkpoint));
  const changedSource=copy();
  changedSource.source.runs[0].material=2;
  assert.throws(()=>new V2ExternalTerrainReplaySession(changedSource),/checksum mismatch/);
  const changedJournal=copy();
  changedJournal.journal.commands[0].id='changed-edit';
  assert.throws(()=>new V2ExternalTerrainReplaySession(changedJournal),/checksum mismatch/);
  const truncated=copy();
  truncated.journal.commands.pop();
  assert.throws(()=>new V2ExternalTerrainReplaySession(truncated),/Invalid or excessive/);
  const wrongSchema=copy();
  wrongSchema.schema='voxel-v1.replay';
  assert.throws(()=>new V2ExternalTerrainReplaySession(wrongSchema),/Unsupported/);
  const wrongGenerator=copy();
  wrongGenerator.source.generatorVersion='old-worldgen-v1';
  assert.throws(()=>new V2ExternalTerrainReplaySession(wrongGenerator),/checksum mismatch/);
  const tooMany=copy();
  tooMany.journal.commands=Array(MAX_EXTERNAL_CHECKPOINT_EDITS+1).fill({
    id:'x',type:'carve-sphere',x:0,y:0,z:0,radius:.6
  });
  tooMany.journal.editRevision=tooMany.journal.commands.length;
  tooMany.editRevision=tooMany.journal.commands.length;
  assert.throws(()=>new V2ExternalTerrainReplaySession(tooMany),/Invalid or excessive/);
  loader.unload();
});

test('a wrong world digest fails closed and cannot expose partially replayed terrain',()=>{
  const original=withEdits();
  const checkpoint=createExternalTerrainCheckpoint(original);
  checkpoint.checksums.world='0000000000000000';
  const restore=new V2ExternalTerrainReplaySession(checkpoint);
  assert.throws(()=>{
    while(!restore.progress.done) restore.step();
  },/replay mismatch/);
  assert.equal(restore.progress.closed,true);
  assert.throws(()=>restore.terrain,/closed/);
  assert.throws(()=>restore.step(),/closed/);
  original.unload();
});

test('portable replay is bounded, and original live authority survives aborted restore',()=>{
  const original=withEdits();
  const checkpoint=createExternalTerrainCheckpoint(original);
  const digest=worldDigest(original.terrain.world);
  const session=new V2ExternalTerrainReplaySession(checkpoint);
  for(const invalid of [{maxCells:0},{maxEdits:0},{maxEdits:9},{maxCells:4097}]) {
    assert.throws(()=>session.step(invalid),RangeError);
  }
  session.step({maxCells:10,maxEdits:1});
  session.unload();
  assert.equal(session.progress.done,false);
  assert.equal(session.progress.closed,true);
  assert.throws(()=>session.terrain,/closed/);
  assert.equal(worldDigest(original.terrain.world),digest,
    'abort never mutates the existing active voxel world');
  original.unload();
});

test('empty edit journal survives replay, and oversized snapshot exports fail',()=>{
  const original=loaded();
  const checkpoint=createExternalTerrainCheckpoint(original);
  assert.equal(checkpoint.editRevision,0);
  const restored=restoreAll(checkpoint);
  assert.equal(restored.terrain.ledger.editRevision,0);
  assert.equal(worldDigest(restored.terrain.world),worldDigest(original.terrain.world));
  restored.unload();
  original.unload();

  const huge={...checkpoint,extra:'x'.repeat(1024*1024)};
  assert.throws(()=>new V2ExternalTerrainReplaySession(huge),
    /1 MiB portable limit/);
});
