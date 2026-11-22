import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import { applyDemoBurst } from '../src/demo-burst.mjs';
import { createReplayCheckpoint } from '../src/replay-checkpoint.mjs';
import {
  REPLAY_FILE_SCHEMA, MAX_REPLAY_FILE_BYTES, MAX_REPLAY_FILE_EDITS,
  createReplayFile, serializeReplayFile, parseReplayFile,
  importedReplayCounters
} from '../src/replay-file.mjs';

const damage = (id, ledger, world, x=0, y=3, z=0) => ({
  id, type:'damage-sphere', x, y, z, radius:3.5, power:1,
  expectedRevision:world.revision, expectedEditRevision:ledger.editRevision
});

test('portable file regenerates every V2 scene on 16³ and 32³ with precise partial damage', () => {
  for (const chunkEdge of [16,32]) {
    for (const scene of ['flat','hill','cliff','arch']) {
      const world=createScene(scene,7,{chunkEdge});
      const ledger=new TerrainEditLedger(world);
      const spot=scene==='arch' ? [5,5,2] : [0,3,0];
      ledger.apply(damage('lab-damage-1',ledger,world,...spot));
      ledger.apply(damage('lab-damage-2',ledger,world,...spot));
      const text=createReplayFile({scene,seed:7,world,ledger});
      assert.ok(text.includes(REPLAY_FILE_SCHEMA));
      assert.ok(new TextEncoder().encode(text).byteLength<=MAX_REPLAY_FILE_BYTES);
      const parsed=parseReplayFile(text);
      assert.deepEqual(parsed.restored.world.snapshots(),world.snapshots());
      assert.deepEqual(parsed.restored.ledger.exportDamage(),ledger.exportDamage());
      assert.deepEqual(parsed.restored.ledger.exportJournal(),ledger.exportJournal());
      assert.equal(parsed.counters.nextDamageId,2);
      assert.equal(parsed.restored.ledger.editRevision,2);
    }
  }
});

test('imported counters resume unique edit IDs even after reload on a new world', () => {
  const world=createScene('hill',7,{chunkEdge:32});
  const ledger=new TerrainEditLedger(world);
  ledger.apply({id:'lab-hit-8',type:'carve-sphere',
    x:0,y:3,z:0,radius:1.5,expectedRevision:world.revision});
  ledger.apply(damage('lab-damage-13',ledger,world));
  applyDemoBurst(world,ledger,{scene:'hill',runId:4});
  const text=createReplayFile({scene:'hill',seed:7,world,ledger});
  const result=parseReplayFile(text);
  assert.deepEqual(result.counters,{
    nextTerrainEditId:8,nextDamageId:13,nextBurstId:4
  });
  const original=ledger.exportJournal();
  result.restored.ledger.apply(damage('lab-damage-14',
    result.restored.ledger,result.restored.world));
  assert.equal(result.restored.ledger.recordedEdits,original.commands.length+1);
  assert.equal(ledger.recordedEdits,original.commands.length);
});

test('invalid files never mutate the running world or ledger', () => {
  const world=createScene('hill',7,{chunkEdge:16});
  const ledger=new TerrainEditLedger(world);
  ledger.apply(damage('lab-damage-1',ledger,world));
  const before=world.snapshots(), edits=ledger.exportJournal();
  const valid=createReplayFile({scene:'hill',seed:7,world,ledger});
  const copy=()=>JSON.parse(valid);
  const cases=[
    '{}','not json','{"schema":"voxel-v2.benchmark.v1"}',
    '{"schema":"voxel-v2.replay-file.v0"}',
    JSON.stringify({...copy(),schema:'voxel-v2.replay-file.v0'}),
    JSON.stringify({...copy(),checkpoint:{...copy().checkpoint,
      source:{...copy().checkpoint.source,sceneGenerator:'old'}}}),
    JSON.stringify({...copy(),checkpoint:{...copy().checkpoint,
      checksums:{...copy().checkpoint.checksums,damage:'0000000000000000'}}}),
    JSON.stringify({...copy(),checkpoint:{...copy().checkpoint,
      source:{...copy().checkpoint.source,seed:42}}})
  ];
  for(const payload of cases) {
    assert.throws(()=>parseReplayFile(payload));
    assert.deepEqual(world.snapshots(),before);
    assert.deepEqual(ledger.exportJournal(),edits);
  }
});

test('portable file size, command count and empty file are strictly bounded', () => {
  const world=createScene('flat',7);
  const ledger=new TerrainEditLedger(world);
  assert.equal(MAX_REPLAY_FILE_BYTES,256*1024);
  assert.equal(MAX_REPLAY_FILE_EDITS,128);
  assert.throws(()=>parseReplayFile(''),RangeError);
  assert.throws(()=>parseReplayFile(' '.repeat(MAX_REPLAY_FILE_BYTES+1)),RangeError);
  assert.throws(()=>parseReplayFile(null),TypeError);
  for(let i=0;i<=MAX_REPLAY_FILE_EDITS;i++) {
    ledger.apply({id:`no-op-${i}`,type:'carve-sphere',x:50,y:50,z:50,radius:0.5});
  }
  const checkpoint=createReplayCheckpoint({scene:'flat',seed:7,world,ledger});
  assert.throws(()=>serializeReplayFile(checkpoint),RangeError);
  const tooMany=JSON.stringify({schema:REPLAY_FILE_SCHEMA,checkpoint});
  assert.throws(()=>parseReplayFile(tooMany),RangeError);
});

test('file serialization validates checkpoints and rejects non-generator world edits', () => {
  const world=createScene('arch',7);
  const ledger=new TerrainEditLedger(world);
  const cp=createReplayCheckpoint({scene:'arch',seed:7,world,ledger});
  const baseline=serializeReplayFile(cp);
  assert.deepEqual(parseReplayFile(baseline).checkpoint,cp);
  const changed=JSON.parse(JSON.stringify(cp));
  changed.worldRevision += 1;
  assert.throws(()=>serializeReplayFile(changed),/replay mismatch/i);
  world.set(60,60,60,3);
  assert.throws(()=>createReplayFile({scene:'arch',seed:7,world,ledger}),/replay mismatch/i);
  assert.throws(()=>importedReplayCounters({}),TypeError);
});

test('portable JSON checksum catches a damaged or rewritten edit command', () => {
  const world=createScene('hill',7);
  const ledger=new TerrainEditLedger(world);
  ledger.apply(damage('lab-damage-1',ledger,world));
  const parsed=JSON.parse(createReplayFile({scene:'hill',seed:7,world,ledger}));
  parsed.checkpoint.journal.commands[0].power=8;
  assert.throws(()=>parseReplayFile(JSON.stringify(parsed)),/checksum mismatch/);
});
