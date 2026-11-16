import test from 'node:test';
import assert from 'node:assert/strict';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {V2TerrainResidencySet} from '../src/terrain-residency-set.mjs';
import {recordHuntTerrainEdit,replayHuntTerrainEdit} from '../src/hunt-terrain-replay.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {replayDataDigest} from '../src/replay-checkpoint.mjs';

function occupancyDigest(world){
  return replayDataDigest({
    chunks:world.snapshots().map(chunk=>[chunk.id,Array.from(chunk.data)]),
    tiles:world.microSurfaceTiles()
  });
}

test('a Fireball crossing a trail seam replays after both sides stream out and back in',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const entry=graph.layout.entryRegionId;
  const trail='region-woodland-trail';
  const link=graph.layout.links.find(l=>[l.fromId,l.toId].includes(entry)&&[l.fromId,l.toId].includes(trail));
  const ids=[entry,trail,link.id];
  function run(budget,replay=null){
    const loader=new V2ExternalTerrainLoader(graph.initialTerrain(ids),{microSurfaceCapacity:2048});
    try{
      while(!loader.progress.done)loader.loadStep(budget);
      const {world,port}=loader.terrain;
      const set=new V2TerrainResidencySet(world,{residentLimit:3});
      for(const id of ids){
        const regenerate=()=>graph.materialize(id).definition;
        set.register(id,regenerate(),{resident:true,regenerate});
      }
      const hit=port.raycast({origin:[.5,32,link.bounds.maxZ+.5],direction:[0,-1,0],maxDistance:42});
      assert.ok(hit);
      const command={id:'seam-fireball',type:'carve-crater',...hit.cell,radius:2.3,depth:2,
        expectedRevision:port.revision};
      const rightBefore=port.raycast({origin:[.5,32,link.bounds.maxZ+1.5],direction:[0,-1,0],maxDistance:42});
      if(replay)assert.throws(()=>replayHuntTerrainEdit(port,[entry,trail],replay),/neighborhood/);
      const result=replay?replayHuntTerrainEdit(port,set.residentIds,replay):port.apply(command);
      assert.equal(result.status,'accepted');
      assert.ok(result.removedVoxels>0);
      const rightAfter=port.raycast({origin:[.5,32,link.bounds.maxZ+1.5],direction:[0,-1,0],maxDistance:42});
      assert.ok(rightAfter.point.y<rightBefore.point.y,'the edit crosses the seam');
      const record=recordHuntTerrainEdit(set.residentIds,command,result);
      const expected=occupancyDigest(world);
      const transition=(id,action)=>{
        set.begin(id,action);
        while(set.metrics.transition.phase==='writing')set.step(budget);
        assert.ok(set.dirtyChunks.size);
        assert.ok(!set.residentIds.includes(id));
        set.publish();
      };
      for(const id of [link.id,entry])transition(id,'evict');
      for(const id of [entry,link.id])transition(id,'load');
      assert.equal(occupancyDigest(world),expected);
      return {record,expected};
    }finally{loader.unload();}
  }
  const first=run(512);
  const restored=run(192,JSON.parse(JSON.stringify(first.record)));
  assert.equal(restored.expected,first.expected);
});

test('browser restore keeps exact removed cells on initial and later-streamed terrain',async()=>{
  const {HuntTerrainSave}=await import('../src/hunt-terrain-save.mjs');
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const entry=graph.layout.entryRegionId,trail='region-woodland-trail';
  const link=graph.layout.links.find(l=>[l.fromId,l.toId].includes(entry)&&[l.fromId,l.toId].includes(trail));
  const ids=[entry,trail,link.id];
  const later='region-horde-crossing';
  const map=new Map(),storage={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)};
  const definition=graph.initialTerrain(ids);
  const make=save=>{
    const loader=new V2ExternalTerrainLoader(definition,{microSurfaceCapacity:2048,removedCells:save.removedCells});
    while(!loader.progress.done)loader.loadStep(192);
    const set=new V2TerrainResidencySet(loader.terrain.world,{residentLimit:4,removedCells:save.removedCells});
    for(const id of [...ids,later])set.register(id,graph.materialize(id).definition,{resident:ids.includes(id)});
    set.begin(later,'load');
    while(set.metrics.transition.phase==='writing')set.step(512);
    set.publish();
    return loader;
  };
  const save=new HuntTerrainSave(storage,'seed7');
  const first=make(save);
  let expected;
  try{
    const {port,world}=first.terrain;
    for(const [i,z] of [link.bounds.maxZ+.5,-95.5].entries()){
      const hit=port.raycast({origin:[.5,32,z],direction:[0,-1,0],maxDistance:42});
      assert.ok(hit);
      const edit=port.apply({id:'save-'+i,type:'carve-crater',...hit.cell,radius:2.3,depth:2},
        {captureRemovedCells:true});
      assert.equal(edit.removedCells.length,edit.removedVoxels);
      save.commit(edit.removedCells);
    }
    assert.equal(save.status,'saved');
    expected=occupancyDigest(world);
  }finally{first.unload();}
  const restored=new HuntTerrainSave(storage,'seed7');
  const second=make(restored);
  try{
    assert.equal(occupancyDigest(second.terrain.world),expected);
    assert.equal(restored.removedCells.size,save.removedCells.size);
    assert.equal(new HuntTerrainSave(storage,'seed8').removedCells.size,0);
  }finally{second.unload();}
});

test('durable collapse delta restores initial and later-loaded settled cells without reviving the shelf',async()=>{
  const {HuntTerrainSave}=await import('../src/hunt-terrain-save.mjs');
  const {TerrainStreamCellBuilder}=await import('../src/terrain-stream-cells.mjs');
  const {TerrainCellStreamSession}=await import('../src/terrain-cell-stream-session.mjs');
  const storage=new Map();
  const browser={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  storage.set('wyrmforge.hunt-terrain.v1:collapse-test',JSON.stringify(['-1,3,0']));
  const definition={schema:'voxel-v2.terrain-initialization.v1',siteId:'collapse-test',
    generatorVersion:'test',seed:7,chunkEdge:16,runs:[
      {x:-1,y:0,z:0,length:2,material:4},
      {x:-1,y:1,z:0,length:2,material:2},
      {x:-1,y:4,z:0,length:2,material:3}
    ]};
  const builder=new TerrainStreamCellBuilder(definition);
  while(!builder.done)builder.step();
  const [left,right]=builder.cells;
  const save=new HuntTerrainSave(browser,'collapse-test');
  assert.ok(save.removedCells.has('-1,3,0'));
  assert.equal(save.commitCollapse(['-1,4,0','0,4,0'],[
    {owner:left.id,x:-1,y:1,z:0,material:3},
    {owner:right.id,x:0,y:1,z:0,material:3}
  ]),true);
  const restored=new HuntTerrainSave(browser,'collapse-test');
  const loader=new V2ExternalTerrainLoader(left.definition,{removedCells:restored.removedCells,
    addedCells:restored.additions.filter(cell=>cell.owner===left.id)});
  try{
    while(!loader.progress.done)loader.loadStep(1);
    const {world}=loader.terrain;
    assert.equal(world.get(-1,1,0),3);
    assert.equal(world.get(-1,4,0),0);
    const stream=new TerrainCellStreamSession(world,[left,right],{limit:2,preload:0,retain:0,
      removedCells:restored.removedCells,initialResidentIds:[left.id],addedCells:restored.additions});
    const {ticket}=stream.begin({view:{minX:-1,maxX:1,minZ:0,maxZ:1}});
    assert.equal(ticket.id,right.id);
    let result;
    do{result=stream.write(ticket,1);}while(!result.dirtyChunks);
    assert.equal(stream.acknowledgeMeshes(ticket,result.dirtyChunks),true);
    assert.equal(stream.acknowledgeUpload(ticket),true);
    assert.equal(world.get(0,1,0),3);
    assert.equal(world.get(0,4,0),0);
    restored.commit(['0,1,0']);
    const next=new HuntTerrainSave(browser,'collapse-test');
    assert.equal(next.additions.length,1);
    assert.ok(next.removedCells.has('0,1,0'));
  }finally{loader.unload();}
});

test('one falling cluster survives eviction and restart across a stream and chunk seam',async()=>{
  const {HuntTerrainSave}=await import('../src/hunt-terrain-save.mjs');
  const {TerrainStreamCellBuilder}=await import('../src/terrain-stream-cells.mjs');
  const {TerrainCellStreamSession}=await import('../src/terrain-cell-stream-session.mjs');
  const {TerrainClusterHandoff}=await import('../src/terrain-cluster-handoff.mjs');
  const {TerrainClusterPhysics}=await import('../src/terrain-cluster-physics.mjs');
  const {scanTerrainSupport}=await import('../src/terrain-support-scan.mjs');
  const records=new Map(),storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  const definition={schema:'voxel-v2.terrain-initialization.v1',siteId:'fall-seam',
    generatorVersion:'test',seed:7,chunkEdge:16,runs:[
      {x:-1,y:0,z:0,length:2,material:4},
      {x:-1,y:3,z:0,length:1,material:2},
      {x:-1,y:4,z:0,length:2,material:3}
    ]};
  const builder=new TerrainStreamCellBuilder(definition);
  while(!builder.done)builder.step(1);
  const cells=builder.cells;
  const ids=cells.map(cell=>cell.id);
  const owner=x=>cells.find(({bounds})=>x>=bounds.minX&&x<=bounds.maxX).id;
  const near={minX:-1,maxX:1,minZ:0,maxZ:1};
  const away={...near,minX:32,maxX:33};

  function open(budget){
    const save=new HuntTerrainSave(storage,'fall-seam');
    const loader=new V2ExternalTerrainLoader(definition,{removedCells:save.removedCells,addedCells:save.additions});
    while(!loader.progress.done)loader.loadStep(budget);
    const {world,port}=loader.terrain;
    const stream=new TerrainCellStreamSession(world,cells,{limit:2,preload:0,retain:0,
      initialResidentIds:ids,removedCells:save.removedCells,addedCells:save.additions});
    const move=(view,protectedIds=[])=>{
      for(let step=0;step<=cells.length;step++){
        const {ticket}=stream.begin({view,protectedIds});
        if(!ticket)return;
        let progress;
        do{progress=stream.write(ticket,budget);}while(!progress.dirtyChunks);
        assert.equal(stream.acknowledgeMeshes(ticket,progress.dirtyChunks),true);
        assert.equal(stream.acknowledgeUpload(ticket),true);
      }
      assert.fail('Unexpected number of residency transitions');
    };
    return {world,port,stream,save,move,close:()=>loader.unload()};
  }

  const live=open(3);
  let expected;
  try{
    const {world,port,stream,save,move}=live;
    const edit=port.apply({id:'seam-support',type:'carve-sphere',x:-1,y:3,z:0,radius:.9},
      {captureRemovedCells:true});
    const known=(x,y,z)=>z>=0?stream.metrics.residentIds.includes(owner(x)):true;
    const scan=scanTerrainSupport(world,[{x:-1,y:3,z:0}],{
      cohesive:new Set([3]),anchors:new Set([4]),isKnown:known
    });
    assert.equal(scan.status,'complete');
    assert.equal(scan.candidates.length,1);
    const handoff=new TerrainClusterHandoff(world);
    const detached=handoff.detach(scan.candidates[0]);
    assert.equal(detached.status,'detached');
    assert.ok(detached.dirtyChunks.includes('-1,0,0'));
    assert.ok(detached.dirtyChunks.includes('0,0,0'));
    assert.equal(world.get(-1,4,0),0);
    assert.equal(world.get(0,4,0),0);
    move(away,ids);
    assert.equal(stream.metrics.residentIds.length,2);
    const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
    for(let step=0;step<120;step++)physics.step();
    const [body]=physics.bodies;
    assert.equal(body.contact,'terrain');
    assert.equal(world.get(-1,1,0),0);
    assert.equal(world.get(0,1,0),0);
    assert.equal(physics.intersects({x:[-.2,.2],y:[1.2,1.8],z:[.2,.8]}),true);
    const landed=physics.settle(body.body.id,{actors:[]});
    assert.equal(landed.status,'settled');
    assert.equal(physics.bodies.length,0);
    const additions=landed.cells.map(cell=>({...cell,owner:owner(cell.x)}));
    assert.deepEqual(additions.map(({owner})=>owner),ids);
    for(const cell of additions)stream.trackAddedCells(cell.owner,[cell]);
    assert.equal(save.commitCollapse([...edit.removedCells,...body.body.cells.map(({x,y,z})=>[x,y,z].join(','))],
      additions),true);
    expected=occupancyDigest(world);
    move(away);
    assert.equal(stream.metrics.residentIds.length,0);
    assert.equal(world.get(-1,1,0),0);
    assert.equal(world.get(0,1,0),0);
    move(near);
    assert.equal(occupancyDigest(world),expected);
  }finally{live.close();}
  const restarted=open(1);
  try{
    assert.equal(occupancyDigest(restarted.world),expected);
    assert.equal(restarted.save.additions.length,2);
  }finally{restarted.close();}
});
