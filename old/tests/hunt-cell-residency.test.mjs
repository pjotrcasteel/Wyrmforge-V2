import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntCellCatalog,HuntCellResidency} from '../src/hunt-cell-residency.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {HuntWoodlandObjects} from '../src/hunt-woodland-objects.mjs';
import {HuntWoodlandDamage} from '../src/hunt-woodland-damage.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';

for(const seed of [7,19,42]){
  test('cell preview streams the authored main trail and preserves a saved crater on return · seed '+seed,()=>{
    const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
      siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed}));
    const graph=generateAuthoredHuntTerrainGraph(site);
    const catalog=new HuntCellCatalog(graph);
    while(!catalog.done)catalog.step();
    const initialIds=['region-entry','region-woodland-trail'];
    initialIds.push(graph.layout.links.find(link=>[link.fromId,link.toId].every(id=>initialIds.includes(id))).id);
    const removedCells=new Set();
    const loader=new V2ExternalTerrainLoader(graph.initialTerrain(initialIds),{microSurfaceCapacity:2048,removedCells});
    try{
      while(!loader.progress.done)loader.loadStep(512);
      const {world,port}=loader.terrain;
      const residency=new HuntCellResidency(world,graph,catalog,initialIds,
        {entry:site.layout.topology.entry,removedCells});
      const hit=port.raycast({origin:[.5,32,10.5],direction:[0,-1,0],maxDistance:42});
      const result=port.apply({id:'entry-crater',type:'carve-crater',...hit.cell,radius:2.3,depth:2},
        {captureRemovedCells:true});
      assert.ok(result.removedCells.length);
      for(const id of result.removedCells)removedCells.add(id);
      for(const z of [12,-16,-48,-72,-96,-120,-144,-168,-192,-208,-140,-96,-48,12]){
        const view={width:378,height:403,scale:16,camera:'hunt',panX:0,panY:-(z*.77-5*.64)*16};
        const actor={x:.5,y:5,z};
        for(let n=0;n<200;n++){
          const ticket=residency.next(actor,{view,prepareEncounter:true});
          if(!ticket)break;
          residency.begin(ticket);
          while(residency.metrics.transition.phase==='writing')residency.step(512);
          residency.publish();
          assert.ok(residency.metrics.residentCellIds.length<=96);
        }
        assert.ok(residency.covers(view),'published viewport at z='+z);
        assert.ok(residency.publishedAt(actor.x,z),'published physical trail at z='+z);
        if(z===-208)assert.equal(residency.publishedAt(hit.cell.x,hit.cell.z),false,'entry crater leaves residency');
        if(z===-96)assert.ok(residency.encounterReady('region-horde-crossing'));
      }
      assert.ok(residency.metrics.evictions>0);
      assert.ok(residency.publishedAt(hit.cell.x,hit.cell.z),'entry crater returns to residency');
      assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
    }finally{loader.unload();}
  });
}

test('seed 7 preserves a cracked boulder, cleared collision and a crater through a streamed round trip',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const catalog=new HuntCellCatalog(graph);
  while(!catalog.done)catalog.step();
  const ids=['region-entry','region-woodland-trail','link-region-entry-region-woodland-trail'];
  const removedCells=new Set(),records=new Map();
  const storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  const loader=new V2ExternalTerrainLoader(graph.initialTerrain(ids),{microSurfaceCapacity:2048,removedCells});
  try{
    while(!loader.progress.done)loader.loadStep(512);
    const {world,port}=loader.terrain;
    const residency=new HuntCellResidency(world,graph,catalog,ids,{entry:site.layout.topology.entry,removedCells});
    const newObjects=()=>new HuntWoodlandObjects(graph,new HuntWoodlandDamage(storage,'seed-7-mixed'));
    const objects=newObjects();
    const coverage={key:id=>residency.propRegionKey(id),has:(x,z)=>residency.publishedAt(x,z)};
    const settle=z=>{
      const view={width:402,height:604,scale:16,camera:'hunt',panX:0,panY:-(z*.77-5*.64)*16};
      for(let i=0;i<200;i++){
        const ticket=residency.next({x:.5,y:5,z},{view});
        if(!ticket)break;
        residency.begin(ticket);
        while(residency.metrics.transition.phase==='writing')residency.step(512);
        residency.publish();
        assert.ok(residency.metrics.residentCellIds.length<=96);
      }
      assert.ok(residency.covers(view));
      objects.update(residency.metrics.residentRegions,port,coverage);
    };
    const rock=()=>[...objects.regions].flat().find(prop=>prop.kind==='boulder'&&prop.x===-5.5&&prop.z===-3.5);
    settle(0);
    const original=rock();
    assert.ok(original);
    assert.equal(objects.hitProp(original.id,port,coverage.has).hits,1);
    const ground=port.raycast({origin:[.5,32,10.5],direction:[0,-1,0],maxDistance:42});
    const edit=port.apply({id:'mixed-crater',type:'carve-crater',...ground.cell,radius:2.3,depth:2},
      {captureRemovedCells:true});
    assert.ok(edit.removedVoxels>0);
    for(const id of edit.removedCells)removedCells.add(id);
    objects.terrainChanged(edit.changedBounds,port,coverage.has);
    for(const z of [-48,-96,-144,-208])settle(z);
    assert.equal(rock(),undefined);
    assert.equal(coverage.has(ground.cell.x,ground.cell.z),false);
    for(const z of [-144,-96,-48,0])settle(z);
    assert.ok(rock()?.damaged);
    assert.equal(world.get(ground.cell.x,ground.cell.y,ground.cell.z),0);
    const point={x:original.x,y:original.y,z:original.z};
    assert.ok(objects.overlapsActor(point));
    assert.equal(objects.hitProp(original.id,port,coverage.has).hits,2);
    assert.equal(objects.overlapsActor(point),false);
    const reloaded=newObjects();
    reloaded.update(['region-entry'],port,coverage);
    assert.ok(![...reloaded.regions].flat().some(prop=>prop.id===original.id));
    assert.equal(world.get(ground.cell.x,ground.cell.y,ground.cell.z),0);
  }finally{loader.unload();}
});

test('an encounter waiting further up the trail leaves directional prefetch active',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const catalog=new HuntCellCatalog(graph);
  while(!catalog.done)catalog.step();
  const initialIds=['region-entry','region-woodland-trail','link-region-entry-region-woodland-trail'];
  const loader=new V2ExternalTerrainLoader(graph.initialTerrain(initialIds),{microSurfaceCapacity:2048});
  try{
    while(!loader.progress.done)loader.loadStep(512);
    const residency=new HuntCellResidency(loader.terrain.world,graph,catalog,initialIds,
      {entry:site.layout.topology.entry});
    const actor={x:.5,y:5,z:-26};
    const view={width:402,height:604,scale:16,camera:'hunt',panX:0,panY:-(actor.z*.77-5*.64)*16};
    assert.ok(residency.covers(view));
    const ticket=residency.next(actor,{view,prepareEncounter:true,movement:{moveZ:-1}});
    assert.equal(ticket?.action,'load');
    assert.match(ticket.id,/^link-region-horde-crossing-region-woodland-trail:/);
  }finally{loader.unload();}
});

test('active ambush prefetch covers the eastern dodge at the iPhone viewport and cell cap',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const catalog=new HuntCellCatalog(graph);
  while(!catalog.done)catalog.step();
  const initialIds=['region-entry','region-woodland-trail','link-region-entry-region-woodland-trail'];
  const loader=new V2ExternalTerrainLoader(graph.initialTerrain(initialIds),{microSurfaceCapacity:2048});
  try{
    while(!loader.progress.done)loader.loadStep(512);
    const residency=new HuntCellResidency(loader.terrain.world,graph,catalog,initialIds,
      {entry:site.layout.topology.entry});
    const z=-105.14,y=5;
    const viewport=x=>({width:402,height:604,scale:16,camera:'hunt',
      panX:Math.round(-x*16),panY:Math.round((.01*604)-(z*.77-(y+.85)*.64)*16)});
    const prepare={x:.5,y,z};
    const readyView=viewport(prepare.x);
    function publish(){
      while(residency.metrics.transition.phase==='writing')residency.step(512);
      residency.publish();
      assert.ok(residency.metrics.residentCellIds.length<=96);
    }
    for(let n=0;n<200;n++){
      const ticket=residency.next(prepare,{view:readyView,prepareEncounter:true});
      if(!ticket)break;
      residency.begin(ticket);
      publish();
    }
    assert.ok(residency.covers(readyView));
    assert.ok(residency.encounterReady('region-horde-crossing'));
    assert.equal(residency.next(prepare,{view:readyView,holdEncounterResidency:true}),null);
    let displayedView=readyView;
    for(let frame=0;frame<145;frame++){
      const x=.5+frame*5.2/60;
      const view=viewport(x);
      if(frame%3===0){
        if(residency.metrics.transition)publish();
        const ticket=residency.next({x,y,z},{view,displayedView,
          holdEncounterResidency:true,movement:{moveX:1}});
        if(ticket){
          assert.ok(ticket.action!=='evict'||!ticket.id.startsWith('region-horde-crossing:'));
          residency.begin(ticket);
        }
      }
      assert.ok(residency.covers(view),'unpublished terrain at frame '+frame+' and x='+x);
      displayedView=view;
    }
  }finally{loader.unload();}
});
