// WAT-15a — actual authored Hunt graph, real Voxel edits and physics,
// Water V2 with lifecycle: no substitute terrain/world or direct solver edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {
  generateWorldSite,generateConnectedHuntStart,generateAuthoredHuntTerrainGraph
} from '../src/world-generation/index.mjs';
import {toVoxelTerrainDefinition} from '../src/world-generation/voxel-terrain-adapter.mjs';
import {planHuntRiverCorridor} from '../src/world-generation/hunt-river-corridor-plan.mjs';
import {
  prepareHuntRiverEarthwork,composeHuntRiverEarthworkGraph
} from '../src/world-generation/hunt-river-earthwork.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {HuntGraphResidency} from '../src/hunt-graph-residency.mjs';
import {HuntStreamedFluid} from '../src/fluid/hunt-streamed-fluid.mjs';
import {HuntFluidSave} from '../src/fluid/hunt-fluid-save.mjs';
import {HuntTerrainSave} from '../src/hunt-terrain-save.mjs';
import {containsHuntLandform} from '../src/world-generation/hunt-landform-footprint.mjs';
import {analyzeCharacterReachability} from '../src/character-reachability.mjs';
import {DEFAULT_TRAVERSAL_PROFILE} from '../src/character-traversal-policy.mjs';
import {actorOverlapsTerrain} from '../src/terrain-actor.mjs';
import {
  spawnHuntExplorer,stepHuntExplorer,HUNT_FIXED_STEP,HUNT_WALK_SPEED
} from '../src/hunt-play-runtime.mjs';

const IDENTITY='wat15a-river-seed7-v1';
const key=(x,z)=>x+','+z;
const memory=()=>{
  const map=new Map();
  return {getItem:id=>map.get(id)??null,setItem:(id,value)=>map.set(id,value)};
};
function setup(storage){
  const entry=generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    kind:'wet-forest',seed:7,chunkEdge:32,river:'water',huntRole:'arrival'
  }));
  const base=generateAuthoredHuntTerrainGraph(entry);
  const start=generateConnectedHuntStart(entry);
  const ids=start.sites.map(s=>s.id);
  const link=base.layout.links.find(l=>ids.includes(l.fromId)&&ids.includes(l.toId));
  assert.ok(link);
  ids.push(link.id);
  const plan=planHuntRiverCorridor(base,link.id);
  assert.ok(plan);
  const earthwork=prepareHuntRiverEarthwork(base,plan,toVoxelTerrainDefinition);
  const graph=composeHuntRiverEarthworkGraph(base,earthwork,toVoxelTerrainDefinition);
  const terrainSave=new HuntTerrainSave(storage,IDENTITY);
  const fluidSave=new HuntFluidSave(storage,IDENTITY);
  assert.notEqual(terrainSave.status,'unreadable');
  assert.notEqual(fluidSave.status,'unreadable');
  const loader=new V2ExternalTerrainLoader(graph.initialTerrain(ids),{
    microSurfaceCapacity:2048,removedCells:terrainSave.removedCells
  });
  while(!loader.progress.done)loader.loadStep(4096);
  const {world,port}=loader.terrain;
  const stream=new HuntGraphResidency(world,graph,ids,{
    removedCells:terrainSave.removedCells
  });
  const fluid=new HuntStreamedFluid({graph,terrain:port,identity:IDENTITY});
  fluidSave.restoreInto(fluid);
  fluid.syncResident(stream.metrics.residentIds);
  return {graph,plan,earthwork,entry,ids,loader,world,port,stream,fluid,terrainSave,fluidSave};
}

function findBank(state){
  const {port,graph,fluid}=state;
  const channel=graph.region('region-entry').fluidLayout.riverChannels[0];
  const channelCells=new Set(channel.floor.map(cell=>key(cell.x,cell.z)));
  const sampled=channel.floor.filter(cell=>fluid.sample(cell.x,cell.z)?.depth>0);
  for(const cell of sampled){
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=cell.x+dx,z=cell.z+dz;
      if(channelCells.has(key(x,z))||fluid.sample(x,z)?.depth>0)continue;
      const hit=port.raycast({
        origin:[x+.5,30,z+.5],direction:[0,-1,0],maxDistance:80
      });
      if(hit&&Math.abs(hit.cell.y+1-cell.y)<=3){
        return {hit,shore:{x,z},river:cell};
      }
    }
  }
  throw new Error('No authentic dry voxel river bank adjacent to connected wet channel');
}

function wetBeyond(state,authored){
  return state.fluid.snapshotSurface().cells.filter(cell=>cell.depth>0&&
    !authored.has(key(cell.x,cell.z))).map(cell=>key(cell.x,cell.z));
}

test('WAT-15a: a real connected-river Fireball survives graph eviction, revisit and full replay',t=>{
  const storage=memory();
  const s=setup(storage);
  const {graph,port,world,stream,fluid,terrainSave,fluidSave}=s;
  try{
    assert.equal(stream.metrics.residentIds.length,3);
    assert.equal(fluid.activeIds.length,3);
    const authored=new Set(s.earthwork.bands.flatMap(b=>
      b.fluidLayout.riverChannels.flatMap(ch=>ch.floor.map(cell=>key(cell.x,cell.z)))));
    for(let i=0;i<24;i++)fluid.step({budget:96});
    const bank=findBank(s);
    const oldWet=new Set(wetBeyond(s,authored));
    const target={...bank.hit.cell,radius:2.3,depth:2};
    const edit=port.apply({
      id:'wat15a-real-bank-fireball',type:'carve-crater',...target,
      expectedRevision:world.revision
    },{captureRemovedCells:true});
    assert.ok(edit.removedVoxels>0,'real Fireball must actually remove Voxel solids');
    assert.ok(Array.isArray(edit.removedCells)&&edit.removedCells.length>0);
    assert.equal(terrainSave.commit(edit.removedCells),true);
    for(let i=0;i<180;i++){
      const result=fluid.step({budget:96});
      assert.ok(result.processed+result.seamInspected<=96);
    }
    const newWet=wetBeyond(s,authored).filter(id=>!oldWet.has(id));
    assert.ok(newWet.length>0,
      'the physically carved bank must create newly wetted land beyond the authored river: '+
      JSON.stringify({bank,removed:edit.removedVoxels,wet:newWet.length}));
    assert.equal(world.get(target.x,target.y,target.z),0);
    const waterAtBreach=fluid.sample(bank.shore.x,bank.shore.z);
    assert.ok(waterAtBreach?.depth>0||newWet.length>0);
    assert.equal(fluidSave.saveFrom(fluid),true);
    const originalSaved=fluid.exportCheckpoint();
    const entryId=graph.layout.entryRegionId;
    const entrySnapshot=originalSaved.regions.find(r=>r.id===entryId);
    assert.ok(entrySnapshot);
    let entryEvicted=false,linkEvicted=false,revisited=false,physicsTicks=0;
    const regions=graph.layout.regions;
    const region=id=>regions.find(r=>r.id===id);
    const bounds={
      minX:Math.min(...regions.map(r=>r.bounds.minX)),
      maxX:Math.max(...regions.map(r=>r.bounds.maxX)),
      minZ:Math.min(...regions.map(r=>r.bounds.minZ)),
      maxZ:Math.max(...regions.map(r=>r.bounds.maxZ))
    };
    let actor=spawnHuntExplorer(world,{
      bounds:region(entryId).bounds,origin:{x:0,z:0}
    },{direction:'south',at:s.entry.layout.topology.entry});
    let entryDormant=null;
    const frame=(moveX=0,moveZ=0)=>{
      const before=actor;
      const allowed=stream.constrainInput(actor,{moveX,moveZ});
      actor=stepHuntExplorer(world,actor,bounds,allowed,HUNT_FIXED_STEP);
      assert.ok(!actor.error,JSON.stringify(actor));
      assert.equal(actorOverlapsTerrain(world,actor),false);
      const metres=Math.hypot(actor.x-before.x,actor.z-before.z);
      assert.ok(metres<=HUNT_WALK_SPEED*HUNT_FIXED_STEP+.0001,
        'native actor may never teleport between graph bands');
      physicsTicks++;
      fluid.step({budget:96});
      if(!stream.metrics.transition){
        const job=stream.next(actor,{movement:{moveX,moveZ}});
        if(job){
          if(job.action==='evict'){
            const current=fluid.exportCheckpoint().regions.find(r=>r.id===job.id);
            if(job.id===entryId){
              entryDormant=current;
              entryEvicted=true;
            }
            if(job.id===s.earthwork.linkId)linkEvicted=true;
            fluid.evict(job.id); // Water authority snapshots BEFORE Voxel writes
            fluidSave.saveFrom(fluid);
          }
          stream.begin(job);
        }
      }
      if(stream.metrics.transition?.phase==='writing')stream.step(512);
      if(stream.metrics.transition?.phase==='awaiting-mesh'){
        stream.publish(); // explicit equivalent of browser's completed mesh fence
        const old=fluid.exportCheckpoint();
        const opened=fluid.syncResident(stream.metrics.residentIds);
        if(entryEvicted&&!revisited&&opened&&fluid.activeIds.includes(entryId)){
          const now=fluid.exportCheckpoint().regions.find(r=>r.id===entryId);
          assert.deepEqual(now.state,entryDormant.state,
            'revisited native Voxel band must restore exact prior physical water state');
          revisited=true;
        }
        assert.ok(fluid.activeIds.length<=5);
        assert.ok(stream.metrics.residentRegions.length<=3);
        assert.ok(stream.metrics.residentLinks.length<=2);
        assert.ok(fluid.totalDepth>=0);
        assert.ok(fluid.exportCheckpoint().regions.length<=48);
        assert.ok(fluidSave.saveFrom(fluid));
      }
    };
    const walk=(x,z,label)=>{
      for(let n=0;n<1200;n++){
        const dx=x-actor.x,dz=z-actor.z;
        if(Math.hypot(dx,dz)<.025&&actor.grounded)return;
        const scale=HUNT_WALK_SPEED*HUNT_FIXED_STEP;
        const length=Math.hypot(dx,dz);
        frame(dx/Math.max(scale,length),dz/Math.max(scale,length));
      }
      assert.fail('Physical traverse failed: '+label+' '+JSON.stringify(actor));
    };
    const interior=(r,x,z)=>{
      const inner={minX:r.bounds.minX+1,maxX:r.bounds.maxX-1,
        minZ:r.bounds.minZ+1,maxZ:r.bounds.maxZ-1,minY:-3,maxY:30};
      const start={x:Math.floor(actor.x),z:Math.floor(actor.z)};
      const goal={x:Math.floor(x),z:Math.floor(z)};
      const terrain={
        raycast:ray=>port.raycast(ray),
        sweepActor:(...args)=>port.sweepActor(...args),
        actorOverlaps:candidate=>[-.65,.65].some(dx=>[-.65,.65].some(dz=>
          !containsHuntLandform(r,candidate.x+dx,candidate.z+dz)))||
          port.actorOverlaps(candidate)
      };
      const audit=analyzeCharacterReachability({
        terrain,bounds:inner,start,targets:[goal],
        profile:{...DEFAULT_TRAVERSAL_PROFILE,maxNavigableDrop:.55}
      });
      const path=audit.routeTo(goal.x,goal.z);
      assert.ok(path,'No physically reversible route in '+r.id);
      for(const cell of path)walk(cell.x+.5,cell.z+.5,r.id);
    };
    const route=['region-entry','region-woodland-trail','region-buried-grove',
      'region-western-shelf','region-horde-crossing',
      'region-western-shelf','region-buried-grove','region-woodland-trail','region-entry'];
    for(let i=1;i<route.length;i++){
      const from=region(route[i-1]),to=region(route[i]);
      const exit=from.ports.find(p=>p.peerRegionId===to.id);
      const arrival=to.ports.find(p=>p.peerRegionId===from.id);
      assert.ok(exit&&arrival);
      const dx=Math.sign(to.offsetX-from.offsetX),dz=Math.sign(to.offsetZ-from.offsetZ);
      interior(from,exit.at.x-dx*3+.5,exit.at.z-dz*3+.5);
      walk(arrival.at.x+dx*3+.5,arrival.at.z+dz*3+.5,
        from.id+' -> '+to.id);
      assert.equal(stream.location(actor.x,actor.z),to.id);
    }
    assert.ok(entryEvicted,'the original edited river region must really evict');
    assert.ok(linkEvicted,'the physically wet 8m connector must really evict');
    assert.ok(revisited,'the edited river region must return through genuine graph load');
    assert.equal(world.get(target.x,target.y,target.z),0,
      'revisited terrain must preserve the actual Fireball removal');
    assert.ok(terrainSave.removedCells.has(key(target.x,target.y)+','+target.z));
    assert.equal(fluidSave.saveFrom(fluid),true);
    const finalCheckpoint=fluid.exportCheckpoint();
    fluid.dispose();
    s.loader.unload();

    // A brand-new Voxel authority + Water V2 engine rebuilt from actual
    // local storage, not an in-memory reset of the original world.
    const after=setup(storage);
    try{
      assert.equal(after.terrainSave.status,'ready' /* loaded old removal list */);
      assert.equal(after.fluidSave.hasCheckpoint,true);
      assert.equal(after.world.get(target.x,target.y,target.z),0);
      const resumed=after.fluid.exportCheckpoint();
      assert.deepEqual(resumed.seamState,finalCheckpoint.seamState);
      assert.deepEqual(resumed.regions,finalCheckpoint.regions);
      assert.equal(after.fluid.syncResident(after.stream.metrics.residentIds),0);
      assert.ok(after.fluid.snapshotSurface()?.cells.length>0);
      t.diagnostic(JSON.stringify({
        removed:edit.removedVoxels,newWetColumns:newWet.length,
        entryEvicted,linkEvicted,revisited,physicalActorSteps:physicsTicks,
        persistedRegions:resumed.regions.length,liveSeamTransfers:fluid.seamTransferred
      }));
    }finally{
      after.fluid.dispose();
      after.loader.unload();
    }
  }finally{
    // The main session may already have been disposed during full reload.
    try{fluid.dispose();}catch{}
    try{s.loader.unload();}catch{}
  }
});
