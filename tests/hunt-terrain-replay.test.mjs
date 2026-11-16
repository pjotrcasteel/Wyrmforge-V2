import test from 'node:test';
import assert from 'node:assert/strict';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {V2TerrainResidencySet} from '../src/terrain-residency-set.mjs';
import {exportHuntTerrainEdits,recordHuntTerrainEdit,replayHuntTerrainEdit} from '../src/hunt-terrain-replay.mjs';
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

for(const mixedTerrain of [false,true])test(
  `a ${mixedTerrain?'deferred mixed-material':'stone'} cluster survives eviction and restart across a stream and chunk seam`,async()=>{

  const {HuntTerrainSave}=await import('../src/hunt-terrain-save.mjs');
  const {TerrainStreamCellBuilder}=await import('../src/terrain-stream-cells.mjs');
  const {TerrainCellStreamSession}=await import('../src/terrain-cell-stream-session.mjs');
  const {HuntCollapsePreview}=await import('../src/hunt-collapse-preview.mjs');
  const records=new Map(),storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  const definition={schema:'voxel-v2.terrain-initialization.v1',siteId:'fall-seam',
    generatorVersion:'test',seed:7,chunkEdge:16,runs:[
      {x:-1,y:0,z:0,length:2,material:4},
      {x:-1,y:3,z:0,length:1,material:2},
      {x:-1,y:4,z:0,length:1,material:mixedTerrain?1:3},
      {x:0,y:4,z:0,length:1,material:3},
      {x:-1,y:0,z:4,length:2,material:4},
      {x:-1,y:1,z:4,length:2,material:4},
      {x:-1,y:2,z:4,length:2,material:2},
      {x:-1,y:3,z:4,length:2,material:3}
    ]};
  const builder=new TerrainStreamCellBuilder(definition);
  while(!builder.done)builder.step(1);
  const cells=builder.cells;
  const ids=cells.map(cell=>cell.id);
  const owner=x=>cells.find(({bounds})=>x>=bounds.minX&&x<bounds.maxX+1)?.id;
  const near={minX:-1,maxX:1,minZ:0,maxZ:1};
  const away={...near,minX:32,maxX:33};

  function open(budget,identity='fall-seam'){
    const save=new HuntTerrainSave(storage,identity);
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
    const ownerAt=(x,z)=>z>=0&&stream.metrics.residentIds.includes(owner(x))?owner(x):null;
    const collapse=new HuntCollapsePreview(world,port,{
      ownerAt,publishedAt:(x,z)=>z<0||Boolean(ownerAt(x,z)),
      trackAddedCells:(id,cells)=>stream.trackAddedCells(id,cells)
    },save,{fixture:false,mixedTerrain,foundationY:0});
    return {world,port,stream,save,move,collapse,close:()=>loader.unload()};
  }

  const live=open(3);
  let expected;
  try{
    const {world,port,stream,save,move,collapse}=live;
    const edits=[];
    const cut=(id,x,y,z)=>{
      const command={id,type:'carve-crater',x,y,z,radius:.9,depth:2};
      const result=port.apply(command,{captureRemovedCells:true});
      edits.push(recordHuntTerrainEdit(ids,command,result));
      return result;
    };

    const impact=edit=>{
      const dirty=collapse.acceptImpact(edit,{defer:mixedTerrain});
      if(!mixedTerrain)return dirty;
      assert.equal(collapse.checkingSupport,true);
      let scanned=[];
      for(let frame=0;frame<100&&collapse.checkingSupport;frame++){
        scanned=collapse.stepSupportScan(96);
      }
      assert.equal(collapse.checkingSupport,false);
      return scanned;
    };
    const supported=cut('supported-stone',-1,2,4);
    // The other half still sits on dirt, so the structure should stay put.
    assert.deepEqual(impact(supported),[]);
    if(!mixedTerrain)save.commit(supported.removedCells);
    assert.equal(world.get(-1,3,4),3);
    assert.equal(world.get(0,3,4),3);

    const dirty=impact(cut('seam-support',-1,3,0));
    assert.ok(dirty.includes('-1,0,0'));
    assert.ok(dirty.includes('0,0,0'));
    assert.equal(world.get(-1,4,0),0);
    assert.equal(world.get(0,4,0),0);
    assert.deepEqual(collapse.protectedIds,ids);
    move(away,collapse.protectedIds);
    assert.equal(stream.metrics.residentIds.length,2);
    const actor={x:0,y:1,z:.5};
    for(let step=0;step<120&&collapse.phase==='falling';step++)collapse.tick([actor]);
    assert.equal(collapse.phase,'actor-blocked');
    assert.equal(world.get(-1,1,0),0);
    assert.equal(world.get(0,1,0),0);
    for(let step=0;step<120&&collapse.holdsFixture;step++)collapse.tick([]);
    assert.equal(collapse.phase,'settled');
    assert.deepEqual(collapse.protectedIds,[]);
    assert.equal(collapse.collision.bodies.length,0);
    assert.deepEqual(save.additions.map(({owner})=>owner),ids);
    assert.equal(world.get(-1,1,0),mixedTerrain?1:3);
    assert.ok(impact(cut('remaining-support',0,2,4)).length);
    for(let step=0;step<120&&collapse.holdsFixture;step++)collapse.tick([]);
    assert.equal(collapse.phase,'settled');
    assert.deepEqual(collapse.outcomes.map(outcome=>outcome.sequence),[2,3]);
    expected=occupancyDigest(world);
    const replay=open(2,'replay-seam');
    try{
      const report=JSON.parse(JSON.stringify(exportHuntTerrainEdits(edits,collapse.outcomes)));
      assert.deepEqual(report.map(entry=>Boolean(entry.collapse)),[false,true,true]);
      for(const entry of report){
        replayHuntTerrainEdit(replay.port,ids,entry,{collapse:replay.collapse,save:replay.save});
      }
      assert.equal(occupancyDigest(replay.world),expected);
    }finally{replay.close();}
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
    assert.equal(restarted.save.additions.length,4);
  }finally{restarted.close();}
});
