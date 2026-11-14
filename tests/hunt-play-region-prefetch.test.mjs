import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite,generateConnectedHuntStart,generateConnectedHuntContinuation,
  activateConnectedHuntContinuation,connectedHuntLocation } from '../src/world-generation/index.mjs';
import { V2ExternalTerrainLoader,V2ExternalTerrainAppend } from '../src/external-terrain-loader.mjs';
import { spawnTerrainActor,actorOverlapsTerrain } from '../src/terrain-actor.mjs';
import { stepHuntExplorer,HUNT_FIXED_STEP } from '../src/hunt-play-runtime.mjs';

test('H08-02B: bounded authored third site streams into the same edited physical world',()=>{
  const authored=generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    kind:'wet-forest',seed:7,chunkEdge:32
  }));
  const start=generateConnectedHuntStart(authored);
  const next=generateConnectedHuntContinuation(authored,start);
  assert.deepEqual(next,generateConnectedHuntContinuation(authored,start));
  assert.equal(next.footprint.maxZ-next.footprint.minZ+1,136);
  assert.equal(next.site.id,'region-horde-crossing');
  assert.ok(next.definition.runs.every(run=>run.z<start.footprint.minZ));
  const capacity=start.definition.surfaceTiles.length+next.definition.surfaceTiles.length;
  assert.ok(capacity>1024 && capacity<=2048);
  const loader=new V2ExternalTerrainLoader(start.definition,{microSurfaceCapacity:capacity});
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const {world,port}=loader.terrain;
    const hit=port.raycast({origin:[5.5,30,-16.5],direction:[0,-1,0],maxDistance:64});
    assert.ok(hit);
    const edit=port.apply({id:'prefetch-retained-crater',type:'carve-crater',
      ...hit.cell,radius:2.3,depth:2,expectedRevision:world.revision});
    assert.ok(edit.removedVoxels>0);
    const journal=port.exportJournal();
    const append=new V2ExternalTerrainAppend(world,next.definition,{previousMinZ:start.footprint.minZ});
    assert.throws(()=>append.dirtyChunks,/incomplete/);
    let frames=0;
    while(!append.progress.done){
      const before=append.progress.loadedCells;
      append.step(512);
      assert.ok(append.progress.loadedCells-before<=512);
      assert.ok(++frames<200);
    }
    assert.ok(append.dirtyChunks.size>0 && append.dirtyChunks.size<=128);
    assert.equal(loader.terrain.world,world);
    assert.equal(loader.terrain.port,port);
    assert.deepEqual(port.exportJournal(),journal);
    assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
    const expanded=activateConnectedHuntContinuation(start,next);
    assert.equal(expanded.sites.length,3);
    assert.equal(expanded.eviction,false);
    let actor=spawnTerrainActor(world,{x:.5,z:start.footprint.minZ+3.5,searchTopY:30,maxSearchDistance:64});
    assert.ok(actor?.grounded);
    const initialZ=actor.z;
    const walk=(direction,target)=>{
      for(let n=0;n<450;n++){
        actor=stepHuntExplorer(world,actor,expanded.footprint,{moveZ:direction},HUNT_FIXED_STEP);
        assert.ok(!actor.error);
        assert.equal(actorOverlapsTerrain(world,actor),false);
        if(direction<0?actor.z<=target:actor.z>=target)return;
      }
      assert.fail('Could not cross streamed seam: '+JSON.stringify(actor));
    };
    walk(-1,next.site.maxZ-1.5);
    assert.equal(connectedHuntLocation(expanded,actor.z),next.site.id);
    walk(1,initialZ);
    assert.equal(connectedHuntLocation(expanded,actor.z),start.sites[1].id);
    assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
    assert.ok(world.microSurfaceCount<=capacity);
    assert.equal(world.microSurfaceCapacity,capacity);
  }finally{loader.unload();}
});

test('Play Hunt publishes the extended bounds only after worker and GPU readiness',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.ok(host.includes('new V2ExternalTerrainAppend(active.world,'));
  assert.ok(host.includes('playStream.writer.step(512)'));
  assert.ok(host.includes("playStream.phase==='meshing' && !pendingEdit && !renderer.pendingUploads"));
  assert.ok(host.includes('activateConnectedHuntContinuation(playConnected,playStream.continuation)'));
  assert.ok(host.includes('playConnected?.footprint??generatedSite.layout.footprint,input'));
});
