import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntLocalNavigation,AI_LOCAL_NAV_MAX_QUERIES_PER_STEP}
  from '../src/ai/local-navigation.mjs';
import {HuntAISpatialPort} from '../src/hunt-ai-spatial-port.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {spawnTerrainActor} from '../src/terrain-actor.mjs';
import {locomotionFor} from '../src/encounter/enemy-locomotion.mjs';

const frame=(navigation,frame,terrainRevision=0,epoch=1,objectsRevision=0)=>
  navigation.beginFrame({frame,terrainRevision,epoch,objectsRevision});
const hollow=locomotionFor('hollowed');

test('AI uses sampled sight, not unsampled exact player positions; revisions resense',()=>{
  const navigation=new HuntLocalNavigation();
  const enemy={x:0,y:1,z:0};
  const first={x:4,y:1,z:0},moving={x:7,y:1,z:0};
  let visible=true,queries=0,probes=0;
  const port={
    visible:()=>{queries++;return visible;},
    canMove:()=>{probes++;return false;}
  };
  frame(navigation,0);
  assert.deepEqual(navigation.seek(0,enemy,first,port,hollow).target,first);
  assert.equal(queries,1);
  frame(navigation,1);
  assert.deepEqual(navigation.seek(0,enemy,moving,port,hollow).target,first,
    'unsampled frames must not reveal the new exact player position');
  assert.equal(queries,1);
  visible=false;
  frame(navigation,2,1);
  assert.deepEqual(navigation.seek(0,enemy,moving,port,hollow).target,first,
    'previous confirmed position is remembered when sight is blocked');
  assert.equal(queries,2,'voxel edit immediately invalidates sight cache');
  assert.ok(probes<=1);
  frame(navigation,3,1,2);
  const lost=navigation.seek(0,enemy,{x:40,y:1,z:0},port,hollow);
  assert.equal(lost.target,null,'new world epoch must clear previous enemy memory');
  assert.equal(navigation.statistics.tracked,1);
});

test('AI navigation budgets at most three spatial queries per fixed step for ten agents',()=>{
  const navigation=new HuntLocalNavigation();
  const enemy={x:0,y:1,z:0},player={x:6,y:1,z:0};
  const port={visible:()=>true,canMove:()=>true};
  for(let tick=0;tick<42;tick++){
    frame(navigation,tick);
    for(let slot=0;slot<10;slot++){
      navigation.seek(slot,enemy,player,port,hollow);
    }
    assert.ok(navigation.statistics.peakQueriesPerStep<=
      AI_LOCAL_NAV_MAX_QUERIES_PER_STEP);
  }
  assert.equal(navigation.statistics.tracked,10);
  assert.ok(navigation.statistics.queries>10);
  navigation.clear();
  assert.equal(navigation.statistics.tracked,0);
});

test('actual Voxel line of sight changes on destruction and object collider revisions',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-7;x<=7;x++)for(let z=-3;z<=3;z++)world.set(x,0,z,3);
  for(let y=1;y<=3;y++)world.set(0,y,0,3);
  const enemy=spawnTerrainActor(world,{x:-2.5,z:.5});
  const player=spawnTerrainActor(world,{x:4.5,z:.5});
  assert.ok(enemy?.grounded&&player?.grounded);
  const port=new HuntAISpatialPort();
  port.bind(world,null,()=>true);
  assert.equal(port.visible(enemy,player),false);
  for(let y=1;y<=3;y++)world.set(0,y,0,0);
  assert.equal(port.visible(enemy,player),true,'destroyed wall clears authoritative LOS');
  const props={physicalRevision:1,shapes:[{
    id:'test-tree',min:[1,1,0],max:[2,3,1]
  }],physicalOccluders(){return this.shapes;}};
  port.bind(world,props,()=>true);
  assert.equal(port.visible(enemy,player),false);
  props.shapes=[];
  props.physicalRevision++;
  assert.equal(port.visible(enemy,player),true,'removed tree must invalidate cached LOS');
});

test('local candidate preview is rejected at physical walls and region bounds',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)world.set(x,0,z,3);
  for(let y=1;y<=3;y++)world.set(1,y,0,3);
  const enemy=spawnTerrainActor(world,{x:.5,z:.5});
  const port=new HuntAISpatialPort();
  port.bind(world,null,()=>true);
  assert.equal(port.canMove(enemy,1,0,hollow),false);
  assert.equal(port.canMove(enemy,-1,0,hollow),true);
  port.bind(world,null,(x)=>x>=.5);
  assert.equal(port.canMove(enemy,-1,0,hollow),false,
    'navigation must honor published footprint limits');
});
