import test from 'node:test';
import assert from 'node:assert/strict';
import {createScene} from '../src/voxel-world.mjs';
import {TerrainEditLedger} from '../src/terrain-edit-ledger.mjs';
import {fissureSites,applyFissureStage,FISSURE_STAGE_TIMES_MS} from '../src/ambush-fissure-fixture.mjs';

test('fissure fixture has 18 distinct sites and bounded 0.7-second stage schedule',()=>{
  const sites=fissureSites();
  assert.equal(sites.length,18);
  assert.equal(new Set(sites.map(s=>s.x+','+s.z)).size,18);
  assert.deepEqual(FISSURE_STAGE_TIMES_MS,[0,245,490]);
  assert.equal(fissureSites(15).length,15);
  assert.equal(fissureSites(20).length,20);
  assert.throws(()=>fissureSites(21),RangeError);
});

test('three synchronous fissure stages remove actual voxels deterministically',()=>{
  function run(){
    const world=createScene('hunt-load',7,{chunkEdge:32});
    const ledger=new TerrainEditLedger(world);
    const stages=[0,1,2].map(stage=>applyFissureStage(world,ledger,stage));
    return {stages,revision:world.revision,journal:ledger.exportJournal()};
  }
  const first=run();
  assert.equal(first.stages.length,3);
  assert.ok(first.stages.every(stage=>stage.accepted===18));
  assert.ok(first.stages.every(stage=>stage.removedVoxels>0));
  assert.equal(first.journal.commands.length,54);
  assert.deepEqual(first,run());
});
