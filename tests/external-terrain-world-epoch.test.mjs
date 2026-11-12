import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { V2TerrainEpochClock } from '../src/terrain-world-epoch.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { createExternalSiteFixture } from '../src/diagnostics/external-site-fixture.mjs';
import {
  createExternalTerrainCheckpoint, V2ExternalTerrainReplaySession
} from '../src/external-terrain-checkpoint.mjs';
import { worldDigest } from '../src/replay-checkpoint.mjs';

function load(epoch,chunkEdge) {
  const loader=new V2ExternalTerrainLoader(createExternalSiteFixture({chunkEdge}),{epoch});
  while(!loader.progress.done) loader.loadStep(192);
  return loader;
}

function change(loader,id) {
  const {world,port}=loader.terrain;
  const seen=[];
  const unsubscribe=port.subscribe('lighting',event=>seen.push(event));
  const result=port.apply({
    id,type:'carve-sphere',x:0,y:6,z:0,radius:2.3,
    expectedRevision:world.revision
  });
  assert.equal(result.status,'accepted');
  assert.ok(result.removedVoxels>0);
  unsubscribe();
  assert.equal(seen.length,1);
  return seen[0];
}

test('distinct external world activations have unique event epochs even with identical voxel revisions',()=>{
  for(const chunkEdge of [16,32]) {
    const epochs=new V2TerrainEpochClock();
    const a=load(epochs.next(),chunkEdge);
    const b=load(epochs.next(),chunkEdge);
    assert.equal(a.terrain.world.revision,b.terrain.world.revision);
    assert.equal(worldDigest(a.terrain.world),worldDigest(b.terrain.world));
    const changeA=change(a,'identical-edit');
    const changeB=change(b,'identical-edit');
    assert.equal(changeA.sequence,1);
    assert.equal(changeB.sequence,1);
    assert.equal(changeA.worldRevision,changeB.worldRevision);
    assert.equal(changeA.epoch,1);
    assert.equal(changeB.epoch,2);
    assert.notEqual(changeA.epoch,changeB.epoch);
    assert.deepEqual(createExternalTerrainCheckpoint(a),
      createExternalTerrainCheckpoint(b),
      'portable saves must not contain the transient runtime epoch');
    const oldPort=a.terrain.port;
    a.unload();
    assert.throws(()=>oldPort.materialAt(0,6,0),/disposed/);
    assert.equal(b.terrain.port.epoch,2);
    b.unload();
  }
});

test('checkpoint replay adopts a new host epoch but preserves all saved geometry and damage',()=>{
  for(const chunkEdge of [16,32]) {
    const epochs=new V2TerrainEpochClock(10);
    const original=load(epochs.next(),chunkEdge);
    const initial=change(original,'original-impact');
    const checkpoint=JSON.parse(JSON.stringify(createExternalTerrainCheckpoint(original)));
    const restore=new V2ExternalTerrainReplaySession(checkpoint,{epoch:epochs.next()});
    assert.throws(()=>restore.terrain,/not verified/);
    while(!restore.progress.done) restore.step({maxCells:192,maxEdits:1});
    assert.equal(original.terrain.port.epoch,11);
    assert.equal(restore.terrain.port.epoch,12);
    assert.equal(restore.terrain.port.editRevision,original.terrain.port.editRevision);
    assert.equal(restore.terrain.world.revision,original.terrain.world.revision);
    assert.equal(worldDigest(restore.terrain.world),worldDigest(original.terrain.world));
    assert.equal(initial.epoch,11);
    assert.equal(Object.hasOwn(checkpoint,'epoch'),false);
    assert.equal(Object.hasOwn(checkpoint.source,'epoch'),false);

    const next=change(restore,'post-restore-impact');
    // Same surface is already gone, so create a distinct second edit separately below.
    assert.equal(next.epoch,12);
    restore.unload();
    original.unload();
  }
});

test('world epoch clock rejects invalid values and never silently wraps',()=>{
  for(const invalid of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,'1']) {
    assert.throws(()=>new V2TerrainEpochClock(invalid),RangeError);
  }
  const clock=new V2TerrainEpochClock(Number.MAX_SAFE_INTEGER-2);
  assert.equal(clock.next(),Number.MAX_SAFE_INTEGER-1);
  assert.equal(clock.next(),Number.MAX_SAFE_INTEGER);
  assert.throws(()=>clock.next(),RangeError);
  assert.equal(clock.current,Number.MAX_SAFE_INTEGER);
});

test('external loader and replay reject invalid runtime epochs before exposing terrain',()=>{
  const definition=createExternalSiteFixture();
  for(const invalid of [0,-2,1.25,NaN,Infinity]) {
    assert.throws(()=>new V2ExternalTerrainLoader(definition,{epoch:invalid}),RangeError);
  }
  const source=load(1,32);
  const checkpoint=createExternalTerrainCheckpoint(source);
  for(const invalid of [0,-1,1.5,Infinity]) {
    assert.throws(()=>new V2ExternalTerrainReplaySession(checkpoint,{epoch:invalid}),RangeError);
  }
  source.unload();
});

test('browser host assigns a new runtime epoch on site reset and checkpoint restoration',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(host,/const terrainEpochs=new V2TerrainEpochClock\(\)/);
  assert.match(host,/new V2ExternalTerrainLoader\(createExternalSiteFixture\(\{/);
  assert.match(host,/\}\),\{epoch:terrainEpochs\.next\(\)\}\)/);
  assert.match(host,/new V2ExternalTerrainReplaySession\(savedCheckpoint,\s*\{epoch:terrainEpochs\.next\(\)\}\)/);
  assert.match(host,/active\.port\.epoch/);
});
