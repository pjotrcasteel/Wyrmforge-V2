import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateConnectedHuntStart,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {HuntGraphResidency} from '../src/hunt-graph-residency.mjs';
import {spawnTerrainActor,actorOverlapsTerrain} from '../src/terrain-actor.mjs';
import {stepHuntExplorer,HUNT_FIXED_STEP} from '../src/hunt-play-runtime.mjs';

test('H08-02B: bounded graph residency follows a branching loop and retains entry edits',()=>{
  const entry=generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    kind:'wet-forest',seed:7,chunkEdge:32}));
  const start=generateConnectedHuntStart(entry);
  const graph=generateAuthoredHuntTerrainGraph(entry);
  const initial=start.sites.map(s=>s.id);
  initial.push(graph.layout.links.find(l=>initial.includes(l.fromId)&&initial.includes(l.toId)).id);
  const loader=new V2ExternalTerrainLoader(graph.initialTerrain(initial),{microSurfaceCapacity:2048});
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const {world,port}=loader.terrain;
    const stream=new HuntGraphResidency(world,graph,initial);
    const bounds={minX:Math.min(...graph.layout.regions.map(r=>r.bounds.minX)),
      maxX:Math.max(...graph.layout.regions.map(r=>r.bounds.maxX)),
      minZ:Math.min(...graph.layout.regions.map(r=>r.bounds.minZ)),
      maxZ:Math.max(...graph.layout.regions.map(r=>r.bounds.maxZ))};
    const region=id=>graph.layout.regions.find(r=>r.id===id);
    const settle=(actor)=>{
      for(let n=0;n<16;n++){
        const job=stream.next(actor);
        if(!job)return;
        stream.begin(job);
        assert.ok(!stream.metrics.residentIds.includes(job.id));
        assert.equal(stream.next(actor),null);
        while(stream.metrics.transition.phase==='writing'){
          const before=stream.metrics.transition.operations;
          const step=stream.step(512);
          assert.ok(step.operations-before<=512);
        }
        assert.ok(stream.dirtyChunks.size>0);
        assert.ok(!stream.metrics.residentIds.includes(job.id));
        stream.publish();
        assert.ok(stream.metrics.residentRegions.length<=3);
        assert.ok(stream.metrics.residentLinks.length<=2);
      }
      assert.fail('Graph policy did not settle');
    };
    const hit=port.raycast({origin:[5.5,30,-16.5],direction:[0,-1,0],maxDistance:64});
    assert.ok(hit);
    assert.ok(port.apply({id:'graph-entry-crater',type:'carve-crater',...hit.cell,
      radius:2.3,depth:2,expectedRevision:world.revision}).removedVoxels>0);
    const journal=port.exportJournal();
    const entryRegion=region(graph.layout.entryRegionId);
    const blocked=stream.constrainInput({x:entryRegion.bounds.minX+.66,z:entryRegion.offsetZ+.5},{moveX:-1,moveZ:0});
    assert.equal(blocked.moveX,0);
    const route=['region-entry','region-woodland-trail','region-buried-grove',
      'region-western-shelf','region-horde-crossing','region-forgotten-ruins',
      'region-extraction','region-forgotten-ruins','region-horde-crossing',
      'region-woodland-trail','region-entry'];
    for(let i=1;i<route.length;i++){
      const from=region(route[i-1]),to=region(route[i]);
      assert.ok(from&&to);
      const link=graph.layout.links.find(l=>[l.fromId,l.toId].includes(from.id)&&[l.fromId,l.toId].includes(to.id));
      assert.ok(link,from.id+' to '+to.id);
      const dx=Math.sign(to.offsetX-from.offsetX),dz=Math.sign(to.offsetZ-from.offsetZ);
      const x=dx>0?from.bounds.maxX-2.5:dx<0?from.bounds.minX+3.5:from.offsetX+.5;
      const z=dz>0?from.bounds.maxZ-2.5:dz<0?from.bounds.minZ+3.5:from.offsetZ+.5;
      // Position the test actor at each interior approach; this verifies
      // live policy and physical crossings, not uninterrupted interior walks.
      settle({x,z});
      assert.ok(stream.metrics.residentIds.includes(link.id),link.id);
      assert.ok(stream.metrics.residentRegions.includes(to.id),to.id);
      let actor=spawnTerrainActor(world,{x,z,searchTopY:30,maxSearchDistance:64});
      assert.ok(actor?.grounded,from.id);
      for(let n=0;n<400;n++){
        const input=stream.constrainInput(actor,{moveX:dx,moveZ:dz});
        actor=stepHuntExplorer(world,actor,bounds,input,HUNT_FIXED_STEP);
        assert.ok(!actor.error,link.id+' '+JSON.stringify(actor));
        assert.equal(actorOverlapsTerrain(world,actor),false);
        if(stream.location(actor.x,actor.z)===to.id)break;
      }
      assert.equal(stream.location(actor.x,actor.z),to.id,link.id+' '+JSON.stringify(actor));
      if(to.id==='region-extraction')assert.ok(!stream.metrics.residentRegions.includes(entryRegion.id));
    }
    assert.ok(stream.metrics.evictions>0);
    assert.equal(stream.metrics.peakRegions,3);
    assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
    assert.deepEqual(port.exportJournal(),journal);
    assert.equal(loader.terrain.world,world);
    assert.equal(loader.terrain.port,port);
  } finally {loader.unload();}
});
