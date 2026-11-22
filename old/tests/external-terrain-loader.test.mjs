import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRAIN_INITIALIZATION_SCHEMA, MAX_INITIAL_TERRAIN_STEP_CELLS,
  V2ExternalTerrainLoader, validateExternalTerrainDefinition
} from '../src/external-terrain-loader.mjs';
import { worldDigest } from '../src/replay-checkpoint.mjs';
import { actorOverlapsTerrain, spawnTerrainActor } from '../src/terrain-actor.mjs';

function definition(chunkEdge=16) {
  const runs=[];
  // Three real, signed-coordinate ground rows.
  for (const z of [-1,0,1]) {
    runs.push({x:-3,y:0,z,length:7,material:3});
  }
  // Actual elevated stone geometry with a through-passage beneath.
  runs.push({x:-2,y:4,z:0,length:5,material:3});
  for(const y of [1,2,3]) {
    runs.push({x:-2,y,z:0,length:1,material:3});
    runs.push({x:2,y,z:0,length:1,material:3});
  }
  return {
    schema:TERRAIN_INITIALIZATION_SCHEMA,siteId:'forest.site-001',
    generatorVersion:'worldgen-v2.0',seed:7,chunkEdge,runs
  };
}

function loadAll(input,step=9) {
  const loader=new V2ExternalTerrainLoader(input);
  while(!loader.progress.done) loader.loadStep(step);
  return loader;
}

test('external 3D input initializes incrementally and stays hidden until complete',()=>{
  for(const edge of [16,32]) {
    const source=definition(edge);
    const loader=new V2ExternalTerrainLoader(source);
    assert.equal(loader.progress.loadedCells,0);
    assert.throws(()=>loader.terrain,/not fully initialized/);
    assert.equal(loader.loadStep(2).loadedCells,2);
    assert.throws(()=>loader.terrain,/not fully initialized/);
    const total=source.runs.reduce((sum,run)=>sum+run.length,0);
    const done=loader.loadStep(4096);
    assert.equal(done.done,true);
    assert.equal(done.loadedCells,total);
    assert.equal(done.totalCells,total);
    assert.equal(loader.terrain.source.siteId,source.siteId);
    assert.equal(loader.terrain.source.generatorVersion,source.generatorVersion);
    assert.equal(loader.terrain.world.chunkEdge,edge);
    assert.equal(loader.terrain.port.chunkEdge,edge);
    assert.equal(loader.terrain.ledger.editRevision,0);
    assert.equal(loader.terrain.world.get(0,0,0),3);
    assert.equal(loader.terrain.world.get(0,4,0),3);
    assert.equal(loader.terrain.world.get(0,2,0),0,'the elevated roof is not a heightmap');
    assert.equal(loader.terrain.world.get(-2,2,0),3,'3D stone pillar is solid');
    assert.equal(loader.terrain.port.actorOverlaps({x:.5,y:1.00001,z:.5}),false);
    assert.equal(loader.terrain.world.get(0,10,0),0);
    assert.equal(loader.loadStep().loadedCells,total,'repeated steps after completion are inert');
    loader.unload();
  }
});

test('external terrain remains authoritative for V2 raycast, collision and destruction',()=>{
  for(const edge of [16,32]) {
    const loader=loadAll(definition(edge));
    const {port,world}=loader.terrain;
    const first=port.raycast({
      origin:[.5,8,.5],direction:[0,-1,0],maxDistance:12
    });
    assert.equal(first.cell.y,4,'ray hits elevated stone roof first');
    const observed=[];
    const release=port.subscribe('physics',change=>observed.push(change));
    const hit=port.apply({
      id:'roof-breach',type:'carve-sphere',x:0,y:4,z:0,radius:.7,
      expectedRevision:world.revision
    });
    assert.equal(hit.status,'accepted');
    assert.equal(hit.removedVoxels,1);
    assert.equal(port.materialAt(0,4,0),0);
    assert.equal(observed.length,1);
    assert.equal(observed[0].geometryChanged,true);
    const second=port.raycast({
      origin:[.5,8,.5],direction:[0,-1,0],maxDistance:12
    });
    assert.equal(second.cell.y,0,'ray now sees committed ground beneath the roof');
    release();
    loader.unload();
  }
});

test('same external site has identical authoritative hash independent of supplied run order',()=>{
  for(const edge of [16,32]) {
    const first=definition(edge);
    const reversed={...first,runs:[...first.runs].reverse()};
    const original=loadAll(first,1);
    const reordered=loadAll(reversed,4096);
    assert.deepEqual(reordered.terrain.world.snapshots(),original.terrain.world.snapshots());
    assert.equal(worldDigest(reordered.terrain.world),worldDigest(original.terrain.world));
    assert.equal(reordered.terrain.world.revision,original.terrain.world.revision);
    original.unload();
    reordered.unload();
  }
});

test('validated source is immutable-by-copy while a loader is staged',()=>{
  const source=definition();
  const loader=new V2ExternalTerrainLoader(source);
  source.runs[0].material=2;
  source.runs.reverse();
  source.siteId='tampered.site';
  loader.loadStep();
  assert.equal(loader.terrain.source.siteId,'forest.site-001');
  assert.equal(loader.terrain.world.get(0,0,-1),3);
  loader.unload();
});

test('rejects malformed and overlapping source runs before exposing a world',()=>{
  const base=definition();
  const invalid=[
    {...base,schema:'voxel-v1.legacy'},
    {...base,siteId:'../escape'},
    {...base,generatorVersion:''},
    {...base,seed:-1},
    {...base,seed:0x100000000},
    {...base,chunkEdge:8},
    {...base,runs:[]},
    {...base,runs:[{x:0,y:0,z:0,length:0,material:1}]},
    {...base,runs:[{x:0,y:0,z:0,length:257,material:1}]},
    {...base,runs:[{x:0,y:0,z:0,length:1,material:0}]},
    {...base,runs:[{x:0,y:0,z:0,length:1,material:256}]},
    {...base,runs:[{x:8192,y:0,z:0,length:2,material:1}]},
    {...base,runs:[{x:0,y:0,z:0,length:1.5,material:1}]},
    {...base,runs:[
      {x:0,y:0,z:0,length:5,material:2},
      {x:4,y:0,z:0,length:2,material:3}
    ]},
    {...base,runs:[
      {x:0,y:0,z:0,length:1,material:2},
      {x:0,y:0,z:0,length:1,material:2}
    ]}
  ];
  for(const candidate of invalid) {
    assert.throws(()=>new V2ExternalTerrainLoader(candidate),undefined,
      'invalid definition must fail during preflight');
  }
});

test('cell and span limits reject unbounded externally generated terrain',()=>{
  const base=definition();
  const many=Array.from({length:8193},(_,i)=>({
    x:0,y:i,z:0,length:1,material:3
  }));
  assert.throws(()=>validateExternalTerrainDefinition({...base,runs:many}),RangeError);
  const oversized=Array.from({length:4097},(_,i)=>({
    x:-128,y:i,z:0,length:256,material:3
  }));
  assert.throws(()=>validateExternalTerrainDefinition({...base,runs:oversized}),RangeError);
  const loader=new V2ExternalTerrainLoader(base);
  for(const maxCells of [0,-1,1.5,MAX_INITIAL_TERRAIN_STEP_CELLS+1]) {
    assert.throws(()=>loader.loadStep(maxCells),RangeError);
  }
  assert.equal(loader.progress.loadedCells,0);
  loader.unload();
});

test('unload clears allocated terrain, disposes subscriptions and blocks reactivation',()=>{
  const loader=loadAll(definition());
  const {world,port}=loader.terrain;
  assert.ok(world.chunkCount>0);
  const revision=world.revision;
  loader.unload();
  assert.equal(world.chunkCount,0);
  assert.ok(world.revision>revision);
  assert.equal(loader.progress.closed,true);
  assert.equal(loader.progress.done,false);
  assert.throws(()=>loader.terrain,/unloaded/);
  assert.throws(()=>loader.loadStep(),/unloaded/);
  assert.throws(()=>port.materialAt(0,0,0),/disposed/);
  loader.unload();
  assert.equal(world.chunkCount,0);
});

test('external terrain fixture includes signed chunk edges and stable safe standing room',()=>{
  for(const edge of [16,32]) {
    const d=definition(edge);
    d.runs.push({x:-edge,y:0,z:0,length:2,material:2});
    const loader=loadAll(d);
    assert.equal(loader.terrain.port.materialAt(-edge,0,0),2);
    assert.equal(loader.terrain.port.materialAt(-edge+1,0,0),2);
    const actor=spawnTerrainActor(loader.terrain.world,{
      x:.5,z:.5,searchTopY:3.8,maxSearchDistance:9
    });
    assert.ok(actor);
    assert.equal(actor.grounded,true);
    assert.equal(actorOverlapsTerrain(loader.terrain.world,actor),false);
    loader.unload();
  }
});
