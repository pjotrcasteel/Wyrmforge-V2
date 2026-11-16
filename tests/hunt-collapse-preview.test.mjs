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
import {exportHuntTerrainEdits,recordHuntTerrainEdit,replayHuntTerrainEdit} from '../src/hunt-terrain-replay.mjs';
import {replayDataDigest} from '../src/replay-checkpoint.mjs';
import {huntRegionCollapseScaffold,REGION_COLLAPSE_ENTRY,REGION_COLLAPSE_SUPPORT} from '../src/diagnostics/hunt-region-collapse.mjs';
import {spawnHuntExplorer} from '../src/hunt-play-runtime.mjs';
import {HuntCollapsePreview,huntCollapseScaffold} from '../src/hunt-collapse-preview.mjs';

for(const trigger of ['control','fireball','region seam Fireball'])test(
  'actual seed 7 Hunt settles, streams and reloads the shelf after '+trigger,()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const seam=trigger==='region seam Fireball';
  const entry=seam?REGION_COLLAPSE_ENTRY:site.layout.topology.entry;
  const support=seam?REGION_COLLAPSE_SUPPORT:{x:5,y:6,z:10};
  const supportKey=[support.x,support.y,support.z].join(',');
  const sampleX=seam?4:2,sampleZ=seam?-21:10,shelfY=seam?9:8;
  const initialIds=['region-entry','region-woodland-trail','link-region-entry-region-woodland-trail'];
  const records=new Map(),storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  function load(identity='gravity-preview'){
    const save=new HuntTerrainSave(storage,identity);
    const scaffold=seam?huntRegionCollapseScaffold(graph.layout,save):huntCollapseScaffold(save);
    const addedCells=huntSavedAdditions(graph.layout,[...save.additions,...scaffold]);
    const loader=new V2ExternalTerrainLoader(graph.initialTerrain(initialIds),{
      microSurfaceCapacity:2048,removedCells:save.removedCells,addedCells});
    while(!loader.progress.done)loader.loadStep(512);
    const {world,port}=loader.terrain;
    const catalog=new HuntCellCatalog(graph);
    while(!catalog.done)catalog.step();
    const residency=new HuntCellResidency(world,graph,catalog,initialIds,
      {removedCells:save.removedCells,entry,addedCells});
    const preview=new HuntCollapsePreview(world,port,residency,save,
      {fixture:!seam,guidedSupport:seam?support:undefined});
    return {loader,world,port,residency,save,preview};
  }
  const live=load();
  const {world,port,preview,residency,save}=live;
  const entries=[];
  const residentIds=residency.metrics.residentCellIds;
  const record=(command,edit)=>entries.push(recordHuntTerrainEdit(residentIds,command,edit));
  const digest=terrain=>replayDataDigest(
    terrain.snapshots().map(chunk=>[chunk.id,Array.from(chunk.data)]));
  try{
    assert.equal(world.get(sampleX,shelfY,sampleZ),3);
    if(trigger==='control'){
      const {command,edit,dirtyChunks}=preview.release();
      assert.ok(dirtyChunks.length);
      record(command,edit);
    }else{
      const nearby={id:'nearby-crater',type:'carve-crater',x:0,y:4,z:10,radius:2.3,depth:2};
      const unrelated=port.apply(nearby,{captureRemovedCells:true});
      record(nearby,unrelated);
      save.commit(unrelated.removedCells);
      assert.ok(unrelated.removedVoxels>0);
      assert.deepEqual(preview.acceptImpact(unrelated),[]);
      assert.equal(preview.phase,'ready');
      const view={width:402,height:604,scale:16,camera:'hunt',panY:-100};
      if(seam){
        const arrival=graph.layout.regions[0];
        const spawn=spawnHuntExplorer(world,{bounds:arrival.bounds,origin:{x:0,z:0}},
          {direction:'south',at:entry});
        const focus=projectVoxel(spawn.x,spawn.y+.85,spawn.z,view);
        view.panX=Math.round(view.width/2-focus.x);
        view.panY+=Math.round(view.height*.51-focus.y);
        view.depthOrigin=focus.depth;
      }
      assert.equal(preview.supportTarget({...view,panY:-2000}),null);
      const {cast}=preview.supportTarget(view);
      assert.deepEqual(cast.target,{...support,radius:2.3,depth:2});
      const command={id:'aimed-fireball',type:'carve-crater',...cast.target,
        expectedRevision:cast.worldRevision};
      const impact=port.apply(command,{captureRemovedCells:true});
      record(command,impact);
      assert.ok(preview.acceptImpact(impact).length);
      assert.equal(save.removedCells.has(supportKey),false);
    }
    assert.equal(preview.phase,'falling');
    const pending=exportHuntTerrainEdits(entries,preview.outcomes).at(-1);
    assert.equal(pending.collapse.landed,null);
    assert.throws(()=>replayHuntTerrainEdit(port,residentIds,pending,{collapse:preview}),/settled collapse/);
    preview.tick([]);
    assert.equal(preview.renderCells.length,seam?7:trigger==='control'?8:9);
    assert.equal(world.get(sampleX,shelfY,sampleZ),0);
    assert.equal(preview.protectedIds.length,seam?2:1);
    if(seam)assert.deepEqual(preview.protectedIds.map(id=>id.split(':cell:')[0]).sort(),
      [initialIds[2],initialIds[0]].sort());
    const blocker={x:sampleX+.5,y:seam?6:5,z:sampleZ+.5};
    for(let i=0;i<120&&preview.phase==='falling';i++)preview.tick([blocker]);
    assert.equal(preview.phase,'actor-blocked');
    assert.equal(preview.replay.landed,null);
    for(let i=0;i<120;i++)preview.tick([]);
    assert.equal(preview.phase,'settled');
    assert.deepEqual(preview.renderCells,[]);
    assert.equal(preview.supportTarget({camera:'hunt'}),null);
    assert.deepEqual(preview.protectedIds,[]);
    assert.equal(save.removedCells.has(supportKey),true);
    const landingY=seam?7:trigger==='control'?5:6;
    assert.equal(world.get(sampleX,landingY,sampleZ),3);
    const recorded=JSON.parse(JSON.stringify(exportHuntTerrainEdits(entries,preview.outcomes)));
    const replayed=load('isolated-replay');
    try{
      const replayIds=replayed.residency.metrics.residentCellIds;
      for(const entry of recorded){
        replayHuntTerrainEdit(replayed.port,replayIds,entry,{collapse:replayed.preview,save:replayed.save});
      }
      assert.equal(digest(replayed.world),digest(world));
      assert.deepEqual(replayed.save.additions,save.additions);
    }finally{replayed.loader.unload();}
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
    assert.equal(world.get(sampleX,landingY,sampleZ),0);
    streamTo(seam?-34:12);
    assert.equal(world.get(sampleX,landingY,sampleZ),3);
    const restored=load();
    try{
      assert.equal(restored.preview.phase,'settled');
      assert.equal(restored.world.get(sampleX,shelfY,sampleZ),0);
      assert.equal(restored.world.get(sampleX,landingY,sampleZ),3);
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
