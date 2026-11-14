import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateConnectedHuntStart,generateConnectedHuntMainRoute} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {HuntMainRouteResidency} from '../src/hunt-main-route-residency.mjs';
import {spawnTerrainActor,actorOverlapsTerrain} from '../src/terrain-actor.mjs';
import {stepHuntExplorer,HUNT_FIXED_STEP} from '../src/hunt-play-runtime.mjs';

test('H08-02B: live route policy streams both ways and retains real edited terrain',()=>{
  const entry=generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    kind:'wet-forest',seed:7,chunkEdge:32
  }));
  const start=generateConnectedHuntStart(entry);
  const {route,bands}=generateConnectedHuntMainRoute(entry,start);
  assert.equal(bands.length,5);
  const loader=new V2ExternalTerrainLoader(start.definition,{microSurfaceCapacity:2048});
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const {world,port}=loader.terrain;
    const stream=new HuntMainRouteResidency(world,bands);
    const mid=i=>(bands[i].minZ+bands[i].maxZ+1)/2;
    const settle=(z,respawn=false)=>{
      for(let n=0;n<12;n++){
        const job=stream.next(z,{respawn});
        if(!job||job.action==='respawn')return job;
        stream.begin(job);
        assert.equal(stream.next(z),null);
        assert.ok(stream.bounds(z,route.footprint));
        while(stream.metrics.transition.phase==='writing'){
          const previous=stream.metrics.transition.operations;
          const progress=stream.step(512);
          assert.ok(progress.operations-previous<=512);
          assert.ok(stream.bounds(z,route.footprint));
        }
        assert.ok(stream.dirtyChunks.size>0);
        assert.ok(!stream.metrics.residentIds.includes(job.id));
        stream.publish();
        assert.ok(stream.metrics.residentIds.length<=3);
      }
      assert.fail('streaming policy did not settle');
    };
    const hit=port.raycast({origin:[5.5,30,-16.5],direction:[0,-1,0],maxDistance:64});
    assert.ok(hit);
    assert.ok(port.apply({id:'live-route-crater',type:'carve-crater',...hit.cell,
      radius:2.3,depth:2,expectedRevision:world.revision}).removedVoxels>0);
    const journal=port.exportJournal();
    const cross=(southIndex,direction)=>{
      const seam=route.seams[southIndex];
      const from=direction<0?seam.maxZ+1.5:seam.minZ-1.5;
      const to=direction<0?seam.minZ-1.5:seam.maxZ+1.5;
      let actor=spawnTerrainActor(world,{x:.5,z:from,searchTopY:30,maxSearchDistance:64});
      assert.ok(actor?.grounded);
      for(let i=0;i<240;i++){
        actor=stepHuntExplorer(world,actor,stream.bounds(actor.z,route.footprint),
          {moveZ:direction},HUNT_FIXED_STEP);
        assert.ok(!actor.error,JSON.stringify(actor));
        assert.equal(actorOverlapsTerrain(world,actor),false);
        if(direction<0?actor.z<=to:actor.z>=to)return;
      }
      assert.fail('Could not cross physical join '+southIndex+' in direction '+direction+' at '+JSON.stringify(actor));
    };
    for(let i=0;i<4;i++){
      settle(mid(i));
      cross(i,-1);
    }
    settle(mid(4));
    assert.ok(stream.metrics.residentIds.includes(bands[4].id));
    assert.ok(!stream.metrics.residentIds.includes(bands[0].id));
    for(let i=4;i>0;i--){
      settle(mid(i));
      cross(i-1,1);
    }
    settle(mid(0));
    assert.ok(stream.metrics.residentIds.includes(bands[0].id));
    assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
    assert.deepEqual(port.exportJournal(),journal);
    assert.equal(stream.metrics.peakResident,3);
    assert.ok(stream.metrics.evictions>=4);
    assert.equal(loader.terrain.world,world);
    assert.equal(loader.terrain.port,port);
    for(let i=0;i<4;i++)settle(mid(i));
    settle(mid(4));
    assert.equal(settle(mid(4),true).action,'respawn');
    assert.ok(stream.metrics.residentIds.includes(bands[0].id));
    settle(mid(0));
    assert.ok(stream.metrics.residentIds.includes(bands[1].id));
    assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
  }finally{loader.unload();}
});
