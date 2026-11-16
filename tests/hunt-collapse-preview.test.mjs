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

for(const trigger of ['control','fireball','region seam Fireball','mixed terrain Fireball','deferred mixed terrain Fireball','large mixed terrain Fireball','two-layer mixed terrain Fireball','long-span mixed terrain Fireball','shaped terrain Fireball'])test(
  'actual seed 7 Hunt settles, streams and reloads the shelf after '+trigger,()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const shaped=trigger==='shaped terrain Fireball';
  const longSpan=trigger==='long-span mixed terrain Fireball';
  const twoLayer=longSpan||trigger==='two-layer mixed terrain Fireball';
  const large=twoLayer||trigger==='large mixed terrain Fireball';
  const deferred=large||shaped||trigger==='deferred mixed terrain Fireball';
  const mixed=deferred||trigger==='mixed terrain Fireball';
  const seam=mixed||trigger==='region seam Fireball';
  const entry=seam?REGION_COLLAPSE_ENTRY:site.layout.topology.entry;
  const support=seam?REGION_COLLAPSE_SUPPORT:{x:5,y:6,z:10};
  const supportKey=[support.x,support.y,support.z].join(',');
  const sampleX=seam?4:2,sampleZ=seam?-21:10,shelfY=seam?9:8;
  const sampleMaterial=mixed?1:3;
  const initialIds=['region-entry','region-woodland-trail','link-region-entry-region-woodland-trail'];
  const records=new Map(),storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  function load(identity='gravity-preview'){
    const save=new HuntTerrainSave(storage,identity);
    const scaffold=seam?huntRegionCollapseScaffold(graph.layout,save,{mixed,large,layers:twoLayer?2:1,longSpan,shaped}):huntCollapseScaffold(save);
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
      {fixture:!seam,guidedSupport:seam?support:undefined,mixedTerrain:mixed,foundationY:catalog.height.minY,preserveMicroSurfaces:shaped});
    return {loader,world,port,residency,save,preview};
  }
  const live=load();
  const {world,port,preview,residency,save}=live;
  const entries=[];
  const residentIds=residency.metrics.residentCellIds;
  const record=(command,edit)=>entries.push(recordHuntTerrainEdit(residentIds,command,edit));
  const digest=terrain=>replayDataDigest({
    chunks:terrain.snapshots().map(chunk=>[chunk.id,Array.from(chunk.data)]),
    microSurfaces:terrain.microSurfaceTiles()
  });
  try{
    assert.equal(world.get(sampleX,shelfY,sampleZ),sampleMaterial);
    const sourceShape=world.microSurfaceTile(sampleX,shelfY,sampleZ);
    if(shaped)assert.equal(sourceShape?.length,100);
    if(trigger==='control'){
      const {command,edit,dirtyChunks}=preview.release();
      assert.ok(dirtyChunks.length);
      record(command,edit);
    }else{
      const nearby={id:'nearby-crater',type:'carve-crater',x:0,y:4,z:10,radius:2.3,depth:2};
      const unrelated=port.apply(nearby,{captureRemovedCells:true});
      record(nearby,unrelated);
      assert.ok(unrelated.removedVoxels>0);
      assert.deepEqual(preview.acceptImpact(unrelated,{defer:deferred}),[]);
      if(deferred){
        for(let frame=0;frame<100&&preview.checkingSupport;frame++)preview.stepSupportScan(96);
        assert.equal(preview.outcomes.length,0);
        assert.equal(save.removedCells.has(unrelated.removedCells[0]),true);
      }else save.commit(unrelated.removedCells);
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
      if(deferred){
        const revision=world.revision;
        assert.deepEqual(preview.acceptImpact(impact,{defer:true}),[]);
        assert.equal(preview.phase,'checking-support');
        assert.equal(preview.canAcceptImpact,false);
        const unfinished=exportHuntTerrainEdits(entries,preview.outcomes).at(-1);
        assert.equal(unfinished.collapse.landed,null);
        assert.deepEqual(preview.stepSupportScan(1),[]);
        assert.equal(world.revision,revision);
        for(let frame=0;frame<100&&preview.checkingSupport;frame++)preview.stepSupportScan(longSpan?192:96);
        assert.equal(preview.checkingSupport,false);
        if(longSpan)assert.ok(preview.supportReport.slices<=11);
      }else assert.ok(preview.acceptImpact(impact).length);
      assert.equal(save.removedCells.has(supportKey),false);
    }
    assert.equal(preview.phase,'falling');
    const pending=exportHuntTerrainEdits(entries,preview.outcomes).at(-1);
    assert.equal(pending.collapse.landed,null);
    assert.throws(()=>replayHuntTerrainEdit(port,residentIds,pending,{collapse:preview}),/settled collapse/);
    preview.tick([]);
    assert.equal(preview.renderCells.length,longSpan?209:twoLayer?145:large?73:seam?7:trigger==='control'?8:9);
    assert.equal(world.get(sampleX,shelfY,sampleZ),0);
    assert.equal(preview.protectedIds.length,longSpan?8:large?6:seam?2:1);
    if(seam)assert.deepEqual([...new Set(preview.protectedIds.map(id=>id.split(':cell:')[0]))].sort(),
      longSpan?[initialIds[2],initialIds[0],initialIds[1]]:[initialIds[2],initialIds[0]].sort());
    const blocker={x:sampleX+.5,y:seam?6:5,z:sampleZ+.5};
    for(let i=0;i<120&&preview.phase==='falling';i++)preview.tick([blocker]);
    assert.equal(preview.phase,'actor-blocked');
    assert.equal(preview.replay.landed,null);
    for(let i=0;i<120;i++)preview.tick([]);
    assert.equal(preview.phase,'settled');
    if(twoLayer)assert.equal(save.additions.length,longSpan?209:145);
    if(mixed)assert.deepEqual([...new Set(save.additions.map(cell=>cell.material))].sort(),[1,2,3]);
    assert.deepEqual(preview.renderCells,[]);
    assert.equal(preview.supportTarget({camera:'hunt'}),null);
    assert.deepEqual(preview.protectedIds,[]);
    assert.equal(save.removedCells.has(supportKey),true);
    const landingY=seam?7:trigger==='control'?5:6;
    assert.equal(world.get(sampleX,landingY,sampleZ),sampleMaterial);
    if(shaped){
      assert.deepEqual(world.microSurfaceTile(sampleX,landingY,sampleZ),sourceShape);
      assert.deepEqual(preview.replay.landed.find(cell=>cell.levels)?.levels,Array.from(sourceShape));
    }
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
    if(shaped)assert.deepEqual(world.microSurfaceTile(sampleX,landingY,sampleZ),sourceShape);
    assert.equal(world.get(sampleX,landingY,sampleZ),sampleMaterial);
    const restored=load();
    try{
      assert.equal(restored.preview.phase,'settled');
      assert.equal(restored.world.get(sampleX,shelfY,sampleZ),0);
      assert.equal(restored.world.get(sampleX,landingY,sampleZ),sampleMaterial);
      if(shaped)assert.deepEqual(restored.world.microSurfaceTile(sampleX,landingY,sampleZ),sourceShape);
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

test('collapse capacity counts live rubble rather than every prior landing',()=>{
  const world=new VoxelWorld();
  for(const x of [0,1,8,9]){
    world.set(x,0,0,4);
    world.set(x,4,0,3);
  }
  world.set(0,3,0,3);
  world.set(8,3,0,3);
  const save=new HuntTerrainSave(null,'live-rubble-capacity');
  const ballast=Array.from({length:254},(_,x)=>({owner:'ballast',x:x+64,y:1,z:0,material:3}));
  assert.equal(save.commitCollapse([],[...ballast,{owner:'terrain',x:0,y:4,z:0,material:3}]),false);
  const preview=new HuntCollapsePreview(world,null,{
    publishedAt:()=>true,ownerAt:()=>'terrain',trackAddedCells:()=>{}
  },save,{fixture:false});
  const impact=(sequence,removed)=>{
    for(const [x,y,z] of removed)world.set(x,y,z,0);
    assert.ok(preview.acceptImpact({
      editRevision:sequence,removedCells:removed.map(cell=>cell.join(','))
    }).length);
    for(let tick=0;tick<120&&preview.holdsFixture;tick++)preview.tick([]);
    assert.equal(preview.phase,'settled-unsaved');
    assert.equal(save.additions.length,256);
  };
  impact(1,[[0,3,0]]);
  impact(2,[[0,1,0],[1,1,0],[8,3,0]]);
  assert.deepEqual(save.additions.filter(cell=>cell.owner==='terrain').map(cell=>cell.x),[8,9]);
});

test('a proven cluster can settle while a separate component touches unloaded terrain',()=>{
  const world=new VoxelWorld();
  for(const x of [0,5]){
    world.set(x,0,0,4);
    world.set(x,3,0,3);
  }
  const save=new HuntTerrainSave(null,'partial-coverage');
  let clock=0;
  const preview=new HuntCollapsePreview(world,null,{
    publishedAt:x=>x<6,ownerAt:()=>'terrain',trackAddedCells:()=>{}
  },save,{fixture:false,mixedTerrain:true,now:()=>{
    clock+=.5;
    return clock;
  }});

  preview.acceptImpact({editRevision:1,removedCells:['0,2,0','5,2,0']},{defer:true});
  for(let frame=0;frame<20&&preview.checkingSupport;frame++){
    clock+=16;
    preview.stepSupportScan(8);
  }
  const {slices,scanWorkMs,scanElapsedMs,maxSliceMs}=preview.supportReport;
  assert.ok(slices>1);
  assert.equal(scanWorkMs,(slices+1)*.5);
  assert.equal(scanElapsedMs,16*slices+(2*slices+1)*.5);
  assert.equal(maxSliceMs,.5);
  assert.equal(preview.supportReport.scanStatus,'partial-coverage');
  assert.equal(preview.supportReport.candidates,1);
  assert.equal(preview.supportReport.status,'detached');
  assert.equal(world.get(0,3,0),0);
  assert.equal(world.get(5,3,0),3);
  for(let tick=0;tick<120&&preview.holdsFixture;tick++)preview.tick([]);
  assert.equal(world.get(0,1,0),3);
  assert.equal(world.get(5,3,0),3);
});

for(const {length,wide} of [{length:24,wide:true},{length:25,wide:true},{length:24,wide:false}])test(
  'deferred collapse checks the '+(wide?'extended':'legacy')+' extent limit at '+length+' voxels',()=>{
  const world=new VoxelWorld();
  for(let x=0;x<length;x++){
    world.set(x,0,0,4);
    world.set(x,3,0,1+x%3);
  }
  const save=new HuntTerrainSave(null,'long-span');
  const preview=new HuntCollapsePreview(world,null,{
    publishedAt:()=>true,ownerAt:x=>x<16?'left':'right',trackAddedCells:()=>{}
  },save,{fixture:false,mixedTerrain:true});

  preview.acceptImpact({editRevision:1,removedCells:['0,2,0']},{defer:true,wide});
  for(let frame=0;frame<100&&preview.checkingSupport;frame++)preview.stepSupportScan(96);
  assert.ok(preview.supportReport.slices>1);
  if(length===25||!wide){
    assert.equal(preview.supportReport.status,'component-too-large');
    assert.equal(preview.supportReport.oversizedComponents,1);
    assert.equal(world.get(0,3,0),1);
    assert.equal(world.get(length-1,3,0),1+(length-1)%3);
    return;
  }

  assert.equal(preview.supportReport.status,'detached');
  assert.deepEqual(preview.protectedIds,['left','right']);
  assert.equal(preview.replay.wide,true);
  for(let tick=0;tick<120&&preview.holdsFixture;tick++)preview.tick([]);
  assert.equal(save.additions.length,24);
  for(let x=0;x<length;x++)assert.equal(world.get(x,1,0),1+x%3);
});

test('a live support scan yields to both its elapsed work target and its operation cap',()=>{
  const world=new VoxelWorld();
  for(let x=0;x<20;x++){
    world.set(x,0,0,4);
    world.set(x,3,0,3);
  }
  const run=clockStep=>{
    let clock=0;
    const preview=new HuntCollapsePreview(world,null,{
      publishedAt:()=>true,ownerAt:()=>'terrain',trackAddedCells:()=>{}
    },new HuntTerrainSave(null,'scan-budget'),{fixture:false,mixedTerrain:true,now:()=>(clock+=clockStep)});
    preview.acceptImpact({editRevision:1,removedCells:['0,2,0']},{defer:true});
    preview.stepSupportScan(64,{workBudgetMs:2});
    return preview;
  };

  const slow=run(2);
  const fast=run(0);
  assert.equal(slow.checkingSupport,true);
  assert.equal(fast.checkingSupport,true);
  assert.equal(slow.supportReport.slices,1);
  assert.equal(fast.supportReport.slices,1);
  assert.ok(slow.supportReport.scannedPositions<=32);
  assert.ok(fast.supportReport.scannedPositions>slow.supportReport.scannedPositions);
  assert.ok(fast.supportReport.scannedPositions<=64);
  assert.equal(world.get(0,3,0),3);

  for(let frame=0;frame<30&&fast.checkingSupport;frame++)fast.stepSupportScan(64,{workBudgetMs:2});
  assert.equal(fast.supportReport.status,'detached');
});
