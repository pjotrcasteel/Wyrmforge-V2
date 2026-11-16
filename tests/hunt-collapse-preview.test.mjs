import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {HuntCellCatalog,HuntCellResidency,huntSavedAdditions} from '../src/hunt-cell-residency.mjs';
import {HuntTerrainSave} from '../src/hunt-terrain-save.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {projectVoxel} from '../src/camera-presets.mjs';
import {huntActorPixelOccluded} from '../src/diagnostics/hunt-actor-occlusion.mjs';
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
    preview.tick([]);
    assert.equal(preview.renderCells.length,8);
    assert.equal(world.get(2,8,10),0);
    assert.equal(preview.protectedIds.length,1);
    for(let i=0;i<120;i++)preview.tick([]);
    assert.equal(preview.phase,'settled');
    assert.deepEqual(preview.renderCells,[]);
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

test('foreground stone hides only the overlap with the upright Hunt actor',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const view={width:400,height:600,scale:16,camera:'hunt'};
  const behind={x:2.5,y:5,z:9.5};
  const front={...behind,z:12.5};
  const above={...behind,y:6,z:10.5};
  const occluded=(actor,height,movingCells=[])=>{
    const screen=projectVoxel(actor.x,actor.y+height,actor.z,view);
    return huntActorPixelOccluded(world,view,actor,screen.x,screen.y,10,movingCells);
  };
  world.set(2,5,10,3);
  assert.equal(occluded(behind,.2),true);
  assert.equal(occluded(behind,1.2),false);
  assert.equal(occluded(front,.2),false);
  assert.equal(occluded(above,.2),false);
  world.set(2,5,10,0);
  assert.equal(occluded(behind,.2),false);
  const falling=[{x:2,y:5.5,z:10}];
  assert.equal(occluded(behind,.2,falling),true);
  assert.equal(occluded(front,.2,falling),false);
});
