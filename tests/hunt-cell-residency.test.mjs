import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntCellCatalog,HuntCellResidency} from '../src/hunt-cell-residency.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';

test('cell preview streams the authored main trail and preserves a saved crater on return',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
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
      if(z===-96)assert.ok(residency.encounterReady('region-horde-crossing'));
    }
    assert.ok(residency.metrics.evictions>0);
    assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
  }finally{loader.unload();}
});
