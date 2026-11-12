import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, VoxelWorld } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import { createReplayCheckpoint, restoreReplayCheckpoint } from '../src/replay-checkpoint.mjs';
import {
  TERRAIN_PORT_SCHEMA, TERRAIN_CHANGE_SCHEMA, TERRAIN_CONSUMERS,
  MAX_TERRAIN_CONSUMERS, V2TerrainPort
} from '../src/terrain-integration-port.mjs';
import {
  TERRAIN_PROBE_SCHEMA, attachTerrainConsumerProbes
} from '../src/terrain-consumer-probes.mjs';

function setup(scene='arch',edge=32,epoch=1) {
  const world=createScene(scene,7,{chunkEdge:edge});
  const ledger=new TerrainEditLedger(world);
  const port=new V2TerrainPort(world,ledger,{epoch});
  return {world,ledger,port};
}

test('V2 port is a read-only terrain/query boundary over one ledger, not another world', () => {
  for(const edge of [16,32]){
    const {world,port}=setup('arch',edge);
    assert.equal(port.schema,TERRAIN_PORT_SCHEMA);
    assert.equal(port.chunkEdge,edge);
    assert.equal(port.revision,world.revision);
    assert.equal(port.materialAt(5,5,2),3);
    assert.equal(port.materialAt(60,20,60),0);
    assert.equal(port.damageAt(5,5,2),0);
    assert.equal(port.actorOverlaps({x:0.5,y:2.00001,z:2.5}),false);
    const hit=port.raycast({origin:[5.5,12,2.5],direction:[0,-1,0],maxDistance:30});
    assert.equal(hit.cell.x,5);
    assert.equal(hit.cell.z,2);
    assert.equal(hit.material,3);
    const original=port.materialAt(5,5,2);
    const chunk=port.chunkSnapshot(0,0,0);
    assert.ok(chunk?.data instanceof Uint8Array);
    chunk.data.fill(0);
    assert.equal(port.materialAt(5,5,2),original,'snapshot must be immutable-by-copy');
    const snap=port.snapshots();
    snap[0].data.fill(0);
    assert.equal(port.materialAt(5,5,2),original,'world remains authority');
    assert.equal(typeof port.set,'undefined');
    port.dispose();
    assert.throws(()=>port.materialAt(5,5,2),/disposed/);
    assert.throws(()=>port.apply({}),/disposed/);
  }
});

test('all six V2-only consumers observe the same ordered accepted edits', () => {
  for(const edge of [16,32]){
    const {world,ledger,port}=setup('arch',edge,5);
    const probes=attachTerrainConsumerProbes(port);
    assert.deepEqual(TERRAIN_CONSUMERS,
      ['gameplay','physics','lighting','vfx','audio','navigation']);
    const messages=[];
    port.subscribe('gameplay',message=>messages.push(message));

    const originalRevision=world.revision;
    const partial={id:'pulse-1',type:'damage-sphere',
      x:5,y:5,z:2,radius:.6,power:1,expectedRevision:originalRevision,
      expectedEditRevision:0};
    const first=port.apply(partial);
    assert.equal(first.status,'accepted');
    assert.equal(first.damagedVoxels,1);
    assert.equal(first.removedVoxels,0);
    assert.equal(world.revision,originalRevision);
    assert.equal(port.damageAt(5,5,2),1);

    const second=port.apply({...partial,id:'pulse-2',
      expectedEditRevision:port.editRevision});
    assert.equal(second.damagedVoxels,1);
    assert.equal(second.removedVoxels,0);
    const third=port.apply({...partial,id:'pulse-3',
      expectedEditRevision:port.editRevision});
    assert.equal(third.removedVoxels,1);
    assert.equal(port.materialAt(5,5,2),0);
    assert.equal(ledger.editRevision,3);
    assert.equal(world.revision,originalRevision+1);

    assert.deepEqual(messages.map(x=>x.sequence),[1,2,3]);
    assert.ok(messages.every(x=>x.schema===TERRAIN_CHANGE_SCHEMA &&
      x.epoch===5 && x.status==='accepted'));
    assert.equal(messages[0].damageChanged,true);
    assert.equal(messages[0].geometryChanged,false);
    assert.equal(messages[0].changedBounds,null);
    assert.equal(messages[2].damageChanged,false);
    assert.equal(messages[2].geometryChanged,true);
    assert.deepEqual(messages[2].changedBounds,
      {min:{x:5,y:5,z:2},max:{x:5,y:5,z:2}});
    assert.ok(messages[2].dirtyChunks.length>0);
    assert.ok(Object.isFrozen(messages[2]));
    assert.ok(Object.isFrozen(messages[2].dirtyChunks));
    assert.ok(Object.isFrozen(messages[2].changedBounds.min));
    assert.deepEqual(structuredClone(messages[2]),
      JSON.parse(JSON.stringify(messages[2])));

    const proof=probes.report();
    assert.equal(proof.schema,TERRAIN_PROBE_SCHEMA);
    for(const kind of TERRAIN_CONSUMERS) {
      assert.equal(proof.consumers[kind].events,3);
      assert.equal(proof.consumers[kind].geometryEvents,1);
      assert.equal(proof.consumers[kind].damageEvents,2);
      assert.equal(proof.consumers[kind].lastSequence,3);
      assert.equal(proof.consumers[kind].epoch,5);
    }
    assert.equal(port.metrics().published,3);
    assert.equal(port.metrics().delivered,21);
    assert.equal(port.metrics().listenerFailures,0);
    probes.dispose();
    port.dispose();
  }
});

test('duplicate, invalid and stale edits never generate phantom engine effects', () => {
  const {world,port}=setup();
  const events=[];
  port.subscribe('vfx',change=>events.push(change));
  const edit={id:'first',type:'carve-sphere',
    x:5,y:5,z:2,radius:1.1,
    expectedRevision:world.revision,expectedEditRevision:0};
  assert.equal(port.apply(edit).status,'accepted');
  const revision=world.revision,eventsBefore=events.length;
  const second=port.apply(edit);
  assert.equal(second.status,'duplicate');
  assert.equal(events.length,eventsBefore);
  assert.equal(world.revision,revision);
  assert.throws(()=>port.apply({...edit,id:'stale'}),/Stale terrain edit/);
  assert.throws(()=>port.apply({...edit,radius:2}),/ID conflict/);
  assert.equal(events.length,eventsBefore);
  assert.equal(port.metrics().published,1);
});

test('synchronous consumer failure is isolated and subsequent consumer still receives edit', () => {
  const {world,port}=setup();
  const calls=[];
  port.subscribe('lighting',()=>{ throw new Error('GPU unavailable'); });
  port.subscribe('physics',()=>calls.push('physics'));
  const before=world.revision;
  const event=port.apply({id:'failure-test',type:'carve-sphere',
    x:5,y:5,z:2,radius:1.1,expectedRevision:world.revision});
  assert.ok(event.removedVoxels>0);
  assert.equal(world.revision,before+event.removedVoxels);
  assert.deepEqual(calls,['physics']);
  assert.equal(port.metrics().listenerFailures,1);
  assert.deepEqual(port.metrics().lastFailure,
    {kind:'lighting',message:'GPU unavailable'});
});

test('callbacks cannot initiate nested writes or silently reorder emitted events', () => {
  const {world,port}=setup();
  const events=[];
  port.subscribe('audio',()=>port.apply({id:'nested',type:'carve-sphere',
    x:0,y:2,z:0,radius:1.1}));
  port.subscribe('physics',change=>events.push(change.sequence));
  port.apply({id:'first',type:'carve-sphere',x:5,y:5,z:2,radius:1.1});
  assert.deepEqual(events,[1]);
  assert.equal(port.metrics().listenerFailures,1);
  assert.match(port.metrics().lastFailure.message,/Nested terrain command/);
  assert.equal(port.recordedEdits,1);
  assert.equal(world.revision,port.revision);
});

test('subscriptions are bounded and may unsubscribe during delivery without corruption', () => {
  const {port}=setup();
  let calls=0;
  const remove=port.subscribe('audio',()=>{calls++;remove()});
  const removers=Array.from({length:MAX_TERRAIN_CONSUMERS-1},
    ()=>port.subscribe('vfx',()=>{calls++}));
  assert.equal(port.metrics().subscribers,MAX_TERRAIN_CONSUMERS);
  assert.throws(()=>port.subscribe('vfx',()=>{}),RangeError);
  assert.throws(()=>port.subscribe('not-v2',()=>{}),TypeError);
  port.apply({id:'a',type:'carve-sphere',x:5,y:5,z:2,radius:1.1});
  port.apply({id:'b',type:'carve-sphere',x:-5,y:5,z:2,radius:1.1});
  assert.equal(calls,1+(MAX_TERRAIN_CONSUMERS-1)*2);
  remove();
  for(const fn of removers)fn();
  assert.equal(port.metrics().subscribers,0);
});

test('restoring a verified V2 replay starts a new port epoch without old subscribers', () => {
  const {world,port}=setup('hill',16,4);
  let oldEvents=0;
  port.subscribe('gameplay',()=>oldEvents++);
  port.apply({id:'a',type:'damage-sphere',x:0,y:3,z:0,
    radius:1.1,power:1});
  const cp=createReplayCheckpoint({scene:'hill',seed:7,world,ledger:port});
  const restored=restoreReplayCheckpoint(cp);
  port.dispose();
  const next=new V2TerrainPort(restored.world,restored.ledger,{epoch:5});
  const proof=attachTerrainConsumerProbes(next);
  assert.equal(next.editRevision,1);
  assert.equal(proof.report().consumers.physics.lastSequence,1);
  next.apply({id:'b',type:'damage-sphere',x:0,y:3,z:0,radius:1.1,
    power:1,expectedEditRevision:1});
  assert.equal(oldEvents,1);
  assert.equal(proof.report().consumers.physics.lastSequence,2);
  assert.equal(next.metrics().lastChange.epoch,5);
  assert.equal(next.metrics().lastChange.sequence,2);
  assert.equal(next.metrics().listenerFailures,0);
});

test('port rejects invalid constructor shape and async consumer safely', () => {
  const {world,ledger,port}=setup();
  assert.throws(()=>new V2TerrainPort(null,ledger),TypeError);
  assert.throws(()=>new V2TerrainPort(world,null),TypeError);
  assert.throws(()=>new V2TerrainPort(world,ledger,{epoch:0}),TypeError);
  const unrelatedWorld=createScene('arch',7,{chunkEdge:world.chunkEdge});
  assert.equal(unrelatedWorld.revision,world.revision);
  assert.throws(()=>new V2TerrainPort(unrelatedWorld,ledger),TypeError,
    'matching revision is not enough: ledger must be bound to the same world object');
  port.subscribe('audio',async()=>{throw Error('async unsupported')});
  const event=port.apply({id:'tiny',type:'carve-sphere',x:0,y:1,z:0,radius:.6});
  assert.equal(event.status,'accepted');
  assert.equal(port.metrics().listenerFailures,1);
  assert.match(port.metrics().lastFailure.message,/synchronous/);
});

test('V2 port offers deterministic read-only spawn recovery without derived mesh authority', () => {
  for(const edge of [16,32]) {
    const world=new VoxelWorld({chunkEdge:edge});
    for(let x=-2;x<=2;x++) {
      for(let z=-2;z<=2;z++) world.set(x,0,z,3);
    }
    world.set(0,1,0,3);
    world.set(0,2,0,3);
    const ledger=new TerrainEditLedger(world);
    const port=new V2TerrainPort(world,ledger);
    const source={x:.5,y:1+1e-5,z:.5};
    const revision=world.revision;
    const recovered=port.recoverActor(source,{horizontalRadius:1,verticalRange:3});
    assert.equal(recovered.x,-.5);
    assert.equal(recovered.y,1+1e-5);
    assert.equal(recovered.grounded,true);
    assert.equal(port.actorOverlaps(recovered),false);
    assert.equal(world.revision,revision);
    assert.equal(port.metrics().published,0);
    port.dispose();
    assert.throws(()=>port.recoverActor(source),/disposed/);
  }
});
