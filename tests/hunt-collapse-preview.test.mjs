import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {HuntCellCatalog,HuntCellResidency,huntSavedAdditions} from '../src/hunt-cell-residency.mjs';
import {HuntTerrainSave} from '../src/hunt-terrain-save.mjs';
import {HuntCollapsePreview,huntCollapseScaffold} from '../src/hunt-collapse-preview.mjs';

test('actual seed 7 Hunt releases, settles, streams out and reloads the preview',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const initialIds=['region-entry','region-woodland-trail','link-region-entry-region-woodland-trail'];
  const records=new Map(),storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  function load(){
    const save=new HuntTerrainSave(storage,'gravity-preview');
    const addedCells=huntSavedAdditions(graph.layout,[...save.additions,...huntCollapseScaffold(save)]);
    const loader=new V2ExternalTerrainLoader(graph.initialTerrain(initialIds),{
      microSurfaceCapacity:2048,removedCells:save.removedCells,addedCells});
    while(!loader.progress.done)loader.loadStep(512);
    const {world,port}=loader.terrain;
    const catalog=new HuntCellCatalog(graph);
    while(!catalog.done)catalog.step();
    const residency=new HuntCellResidency(world,graph,catalog,initialIds,
      {removedCells:save.removedCells,entry:site.layout.topology.entry,addedCells});
    return {loader,world,residency,preview:new HuntCollapsePreview(world,port,residency,save)};
  }
  const live=load();
  const {world,preview,residency}=live;
  try{
    assert.equal(world.get(2,8,10),3);
    assert.ok(preview.release().length);
    assert.equal(preview.phase,'falling');
    assert.equal(world.get(2,8,10),0);
    assert.equal(preview.protectedIds.length,1);
    for(let i=0;i<120;i++)preview.tick([]);
    assert.equal(preview.phase,'settled');
    assert.deepEqual(preview.protectedIds,[]);
    assert.equal(world.get(2,5,10),3);
    const streamTo=z=>{
      const view={width:402,height:604,scale:16,camera:'hunt',panX:0,panY:-(z*.77-5*.64)*16};
      for(let n=0;n<200;n++){
        const ticket=residency.next({x:.5,y:5,z},{view});
        if(!ticket)return;
        residency.begin(ticket);
        while(residency.metrics.transition.phase==='writing')residency.step(512);
        residency.publish();
      }
      assert.fail('residency did not settle');
    };
    streamTo(-144);
    assert.equal(world.get(2,5,10),0);
    streamTo(12);
    assert.equal(world.get(2,5,10),3);
    const restored=load();
    try{
      assert.equal(restored.preview.phase,'settled');
      assert.equal(restored.world.get(2,8,10),0);
      assert.equal(restored.world.get(2,5,10),3);
    }finally{restored.loader.unload();}
  }finally{live.loader.unload();}
});
