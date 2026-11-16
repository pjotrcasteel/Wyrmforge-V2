import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainCollapseFixture} from '../src/terrain-collapse-fixture.mjs';
import {replayDataDigest} from '../src/replay-checkpoint.mjs';

const worldDigest=world=>replayDataDigest(world.snapshots().map(chunk=>[chunk.id,[...chunk.data]]));

test('controlled collapse moves real stone, settles and restores the same occupancy',()=>{
  const fixture=new TerrainCollapseFixture();
  assert.equal(fixture.world.get(-3,5,-1),3);
  assert.ok(fixture.removeSupport());
  assert.equal(fixture.removeSupport(),false);
  assert.equal(fixture.world.get(-3,5,-1),0);
  assert.equal(fixture.world.get(0,6,0),0);
  for(let i=0;i<24;i++)fixture.tick();
  assert.equal(fixture.phase,'falling');
  assert.ok(fixture.bodies[0].offsetY<0);
  for(let i=0;i<100;i++)fixture.tick();
  assert.equal(fixture.phase,'settled');
  assert.equal(fixture.settled.cells.length,16);
  assert.equal(fixture.world.get(0,1,0),3);
  assert.deepEqual(fixture.bodies,[]);
  const restored=TerrainCollapseFixture.restore(JSON.parse(JSON.stringify(fixture.save)));
  assert.equal(restored.phase,'settled');
  assert.equal(worldDigest(restored.world),worldDigest(fixture.world));
  assert.equal(TerrainCollapseFixture.restore({...fixture.save,offsetY:-4}),null);
});

test('the controlled falling shelf pauses above the actor and settles after they move clear',()=>{
  const fixture=new TerrainCollapseFixture();
  for(let i=0;i<48;i++)fixture.tick({moveZ:-1});
  assert.ok(fixture.actor.z<.1&&fixture.actor.z>-.1);
  assert.ok(fixture.removeSupport());
  for(let i=0;i<90;i++)fixture.tick();
  assert.equal(fixture.phase,'actor-blocked');
  assert.equal(fixture.world.get(0,1,0),0);
  for(let i=0;i<90;i++)fixture.tick({moveZ:1});
  assert.equal(fixture.phase,'settled');
  assert.equal(fixture.world.get(0,1,0),3);
  assert.equal(fixture.actor.error,null);
});
