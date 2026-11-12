import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/voxel-world.mjs';
import {
  ACTOR_HEIGHT, ACTOR_HALF_WIDTH, actorHeadClearance,
  actorOverlapsTerrain, spawnTerrainActor
} from '../src/terrain-actor.mjs';
import { projectVoxel } from '../src/camera-presets.mjs';
import { projectActorDiagnostic } from '../src/diagnostics/actor-proxy.mjs';

const archSpawn={x:0.5,z:2.5,searchTopY:6};
const view={width:804,height:996,scale:16,panX:0,panY:0,camera:'hunt'};

test('iPhone Hunt proxy fits the physical actor: no fake 30px torso or floating head', () => {
  for(const chunkEdge of [16,32]) {
    const world=createScene('arch',7,{chunkEdge});
    const actor=spawnTerrainActor(world,archSpawn);
    const projected=projectActorDiagnostic(actor,view);
    assert.equal(projected.colliderHeight,ACTOR_HEIGHT);
    assert.equal(projected.colliderHalfWidth,ACTOR_HALF_WIDTH);
    assert.ok(Math.abs(projected.projectedHeight - (16*.64*1.6)) < 1e-9);
    assert.ok(projected.projectedHeight > 15 && projected.projectedHeight < 20,
      'Hunt proxy follows the new 16.4-pixel real collider, never a fake 30-pixel torso');
    assert.ok(Math.abs(projected.head.y-projected.head.radius-
      projected.top.y)<1e-9,'head never extends above actual world Y+height');
    assert.ok(Math.abs(projected.torso.y+projected.torso.height-
      projected.foot.y)<1e-9,'feet stay anchored to actual world position');
    assert.ok(projected.torso.y>=projected.top.y);
    assert.ok(projected.torso.height>0);
    assert.equal(projected.boxEdges.length,12);
    const top=projectVoxel(actor.x,actor.y+ACTOR_HEIGHT,actor.z,view);
    assert.deepEqual(projected.top,top);
  }
});

test('projected actor proxy remains physics-sized across Hunt and inspection camera zooms', () => {
  const world=createScene('arch',7,{chunkEdge:32});
  const actor=spawnTerrainActor(world,archSpawn);
  for(const camera of ['hunt','inspection']) {
    for(const scale of [8.8,16,25,40]) {
      const proxy=projectActorDiagnostic(actor,{...view,camera,scale,panX:-13,panY:19});
      assert.ok(proxy.projectedHeight>0);
      assert.ok(proxy.head.radius>0);
      assert.ok(proxy.head.y-proxy.head.radius>=proxy.top.y-1e-8);
      assert.ok(proxy.torso.y+proxy.torso.height<=proxy.foot.y+1e-8);
      assert.ok(proxy.torso.width>0);
      assert.ok(proxy.boxEdges.every(pair=>pair.length===2 &&
        pair.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))));
    }
  }
});

test('real arch shoulder has 1.4-voxel overhead clearance when the actor touches a pillar', () => {
  for(const chunkEdge of [16,32]) {
    const world=createScene('arch',7,{chunkEdge});
    for(const x of [4.72,-3.72]) {
      const actor={...spawnTerrainActor(world,archSpawn),x,z:2.5};
      assert.equal(actorOverlapsTerrain(world,actor),false);
      const roof=actorHeadClearance(world,actor);
      assert.equal(roof.blocked,true);
      assert.ok(Math.abs(roof.distance - (5-(2+ACTOR_HEIGHT)))<.001,
        'the shoulder begins at Y=5, the physical head ends at Y=3.6');
    }
  }
});

test('screen-overlap photo outside arch lane must not invent physical head collision', () => {
  for(const chunkEdge of [16,32]) {
    const world=createScene('arch',7,{chunkEdge});
    // Screenshot coordinate near the arch artwork, but Z=4.33 is
    // outside the actual Z=1..3 rock corridor.
    const actor={...spawnTerrainActor(world,archSpawn),x:3.47,z:4.33};
    assert.equal(actorOverlapsTerrain(world,actor),false);
    const physical=actorHeadClearance(world,actor);
    assert.equal(physical.blocked,false);
    assert.equal(physical.distance,16);
    const drawn=projectActorDiagnostic(actor,view);
    assert.ok(drawn.head.y-drawn.head.radius>=drawn.top.y-1e-9);
  }
});

test('roof clearance uses committed terrain immediately after removing an arch shoulder voxel', () => {
  for(const chunkEdge of [16,32]) {
    const world=createScene('arch',7,{chunkEdge});
    const actor={...spawnTerrainActor(world,archSpawn),x:4.72,z:2.5};
    assert.ok(Math.abs(actorHeadClearance(world,actor).distance-1.4)<.001);
    // Remove this shoulder (Y>=5) and roof directly above to prove the
    // query reads voxels and not stale renderer meshes.
    for(let y=5;y<=8;y++)world.set(4,y,2,0);
    const newClearance=actorHeadClearance(world,actor);
    assert.ok(newClearance.distance>1.4);
    assert.equal(actorOverlapsTerrain(world,actor),false);
  }
});

test('invalid diagnostic projections and headroom query are rejected', () => {
  const world=createScene('arch',7);
  const actor=spawnTerrainActor(world,archSpawn);
  assert.throws(()=>projectActorDiagnostic(actor,{...view,scale:0}),TypeError);
  assert.throws(()=>projectActorDiagnostic({...actor,x:Infinity},view),TypeError);
  assert.throws(()=>actorHeadClearance(world,actor,0),RangeError);
  assert.throws(()=>actorHeadClearance(world,actor,33),RangeError);
});
