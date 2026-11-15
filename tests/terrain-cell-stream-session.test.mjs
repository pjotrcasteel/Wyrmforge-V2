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
