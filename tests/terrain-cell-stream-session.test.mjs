import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {TerrainStreamCellBuilder} from '../src/terrain-stream-cells.mjs';
import {TerrainCellStreamSession} from '../src/terrain-cell-stream-session.mjs';
import {buildExposedFaceMeshes} from '../src/exposed-face-mesher.mjs';

test('camera motion loads real Voxel cells through writes, meshing and upload acknowledgement',()=>{
  const builder=new TerrainStreamCellBuilder({schema:'voxel-v2.terrain-initialization.v1',
    siteId:'trail',generatorVersion:'test',seed:7,chunkEdge:16,
    runs:Array.from({length:8},(_,z)=>({x:-40,y:0,z,length:96,material:1}))});
  while(!builder.done)builder.step(8);
  const cells=builder.cells;
  const world=new VoxelWorld({chunkEdge:16});
  const stream=new TerrainCellStreamSession(world,cells,{limit:6,preload:8,retain:12});
  const view=x=>({minX:x-8,maxX:x+8,minZ:0,maxZ:7});
  let oldTicket;
  function settle(x){
    for(let i=0;i<30;i++){
      const {ticket}=stream.begin({view:view(x)});
      if(!ticket)return;
      assert.equal(stream.begin({view:view(x)}).reason,'transition-in-flight');
      assert.equal(stream.acknowledgeUpload(ticket),false);
      let work;
      do{
        work=stream.write(ticket,13);
        assert.ok(work);
      }while(work.dirtyChunks===null);
      assert.ok(!stream.metrics.residentIds.includes(ticket.id));
      if(oldTicket)assert.equal(stream.acknowledgeMeshes(oldTicket,work.dirtyChunks),false);
      assert.equal(stream.acknowledgeMeshes(ticket,[]),false);
      const meshes=buildExposedFaceMeshes(world,{chunkIds:work.dirtyChunks});
      assert.ok(Array.isArray(meshes));
      // A dirty chunk can legitimately have no triangles after eviction.
      assert.equal(stream.acknowledgeMeshes(ticket,work.dirtyChunks),true);
      assert.ok(!stream.metrics.residentIds.includes(ticket.id));
      assert.equal(stream.acknowledgeUpload(ticket),true);
      assert.equal(stream.metrics.residentIds.includes(ticket.id),ticket.action==='load');
      assert.ok(stream.metrics.residentIds.length<=6);
      oldTicket=ticket;
    }
    assert.fail('Streaming did not settle');
  }
  settle(-20);
  assert.equal(world.get(-20,0,0),1);
  world.set(-20,0,0,0);
  settle(28);
  assert.ok(stream.metrics.evictions>0);
  assert.equal(world.get(28,0,0),1);
  settle(-20);
  assert.equal(world.get(-20,0,0),0);
  assert.equal(world.get(-19,0,0),1);
});

test('viewport footprint covers projected corners at both elevations far from the world origin',async()=>{
  const {terrainViewFootprint}=await import('../src/terrain-view-footprint.mjs');
  const {projectVoxel}=await import('../src/camera-presets.mjs');
  const view={width:402,height:604,scale:16,panX:50,panY:2679,depthOrigin:1.02,camera:'hunt'};
  const bounds=terrainViewFootprint(view,{minY:0,maxY:10});
  assert.ok(bounds.minZ<-200&&bounds.maxZ>-200);
  const recentered=terrainViewFootprint({...view,depthOrigin:0},{minY:0,maxY:10});
  for(const key of Object.keys(bounds))assert.ok(Math.abs(bounds[key]-recentered[key])<1e-9);
  const px=[projectVoxel(bounds.minX,0,bounds.minZ,view),projectVoxel(bounds.maxX,10,bounds.maxZ,view)];
  assert.ok(Math.abs(px[0].x)<1e-9);
  assert.ok(Math.abs(px[1].x-view.width)<1e-9);
  assert.ok(Math.abs(px[0].y)<1e-9);
  assert.ok(Math.abs(px[1].y-view.height)<1e-9);
});

test('a settled cluster stays in its new cells across budgeted eviction and regeneration',async()=>{
  const {TerrainClusterHandoff}=await import('../src/terrain-cluster-handoff.mjs');
  const {TerrainClusterPhysics}=await import('../src/terrain-cluster-physics.mjs');
  const {scanTerrainSupport}=await import('../src/terrain-support-scan.mjs');
  const builder=new TerrainStreamCellBuilder({schema:'voxel-v2.terrain-initialization.v1',
    siteId:'collapse',generatorVersion:'test',seed:7,chunkEdge:16,runs:[
      {x:-1,y:0,z:0,length:2,material:4},
      {x:0,y:1,z:0,length:1,material:2},
      ...[1,2,3].map(y=>({x:-1,y,z:0,length:1,material:3})),
      {x:-1,y:4,z:0,length:2,material:3}
    ]});
  while(!builder.done)builder.step();
  const world=new VoxelWorld({chunkEdge:16});
  const cells=builder.cells;
  const stream=new TerrainCellStreamSession(world,cells,{limit:2,preload:0,retain:0});
  const here={minX:-1,maxX:1,minZ:0,maxZ:1};
  const away={minX:80,maxX:82,minZ:0,maxZ:1};
  function streamTo(view){
    for(let i=0;i<8;i++){
      const {ticket}=stream.begin({view});
      if(!ticket)return;
      let result;
      do{
        const before=result?.operations??0;
        result=stream.write(ticket,1);
        assert.ok(result.operations-before<=1);
      }while(!result.dirtyChunks);
      assert.equal(stream.acknowledgeMeshes(ticket,result.dirtyChunks),true);
      assert.equal(stream.acknowledgeUpload(ticket),true);
    }
    assert.fail('fixture did not settle');
  }
  streamTo(here);
  for(const y of [1,2,3])world.set(-1,y,0,0);
  world.set(0,1,0,0);
  const isKnown=()=>true;
  const {candidates}=scanTerrainSupport(world,[{x:-1,y:3,z:0}],{
    isKnown,cohesive:new Set([3]),anchors:new Set([4])
  });
  const handoff=new TerrainClusterHandoff(world);
  const detached=handoff.detach(candidates[0]);
  assert.equal(detached.status,'detached');
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown});
  for(let i=0;i<100;i++)physics.step();
  const settled=physics.settle(detached.body.id);
  assert.equal(settled.status,'settled');
  const [left,right]=cells;
  const [first,second]=settled.cells;
  assert.throws(()=>stream.trackAddedCells(right.id,[first]),/outside/);
  stream.trackAddedCells(left.id,[first]);
  stream.trackAddedCells(right.id,[second]);
  streamTo(away);
  assert.deepEqual(stream.metrics.residentIds,[]);
  assert.equal(world.chunkCount,0);
  streamTo(here);
  for(const x of [-1,0]){
    assert.equal(world.get(x,1,0),3);
    assert.equal(world.get(x,4,0),0);
  }
  world.set(0,1,0,0);
  streamTo(away);
  streamTo(here);
  assert.equal(world.get(0,1,0),0,'destroyed rubble does not restore authored dirt at the same coordinate');
  assert.equal(world.get(-1,1,0),3);
});
