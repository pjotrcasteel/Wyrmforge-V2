import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateConnectedHuntStart,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {HuntGraphResidency} from '../src/hunt-graph-residency.mjs';
import {actorOverlapsTerrain} from '../src/terrain-actor.mjs';
import {analyzeCharacterReachability} from '../src/character-reachability.mjs';
import {DEFAULT_TRAVERSAL_PROFILE} from '../src/character-traversal-policy.mjs';
import {spawnHuntExplorer,stepHuntExplorer,HUNT_FIXED_STEP,HUNT_WALK_SPEED} from '../src/hunt-play-runtime.mjs';

// The diagnostic navigation audit supplies waypoints only. Actual movement
// still goes through normal fixed-step controls, collision and graph residency.
// GPU publication is represented by an explicit acknowledgement after writes.
for(const seed of [7,8,19])test('H08-02B: uninterrupted branching loop and retained entry crater, seed '+seed, t=>{
  const entry=generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    kind:'wet-forest',seed,chunkEdge:32}));
  const graph=generateAuthoredHuntTerrainGraph(entry);
  const start=generateConnectedHuntStart(entry);
  const initial=start.sites.map(s=>s.id);
  initial.push(graph.layout.links.find(l=>initial.includes(l.fromId)&&initial.includes(l.toId)).id);
  const loader=new V2ExternalTerrainLoader(graph.initialTerrain(initial),{microSurfaceCapacity:2048});
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const {world,port}=loader.terrain;
    const stream=new HuntGraphResidency(world,graph,initial);
    const regions=graph.layout.regions;
    const bounds={minX:Math.min(...regions.map(r=>r.bounds.minX)),maxX:Math.max(...regions.map(r=>r.bounds.maxX)),
      minZ:Math.min(...regions.map(r=>r.bounds.minZ)),maxZ:Math.max(...regions.map(r=>r.bounds.maxZ))};
    const region=id=>regions.find(r=>r.id===id);
    const home=region(graph.layout.entryRegionId);
    let actor=spawnHuntExplorer(world,{bounds:home.bounds,origin:{x:0,z:0}},
      {direction:'south',at:entry.layout.topology.entry});
    assert.ok(actor?.grounded);
    const hit=port.raycast({origin:[5.5,30,-16.5],direction:[0,-1,0],maxDistance:64});
    assert.ok(hit);
    assert.ok(port.apply({id:'continuous-entry-crater',type:'carve-crater',...hit.cell,
      radius:2.3,depth:2,expectedRevision:world.revision}).removedVoxels>0);
    const journal=port.exportJournal();
    let ticks=0,metres=0,streamWrites=0;
    const frame=(moveX=0,moveZ=0)=>{
      const before=actor;
      actor=stepHuntExplorer(world,actor,bounds,stream.constrainInput(actor,{moveX,moveZ}),HUNT_FIXED_STEP);
      assert.ok(!actor.error,JSON.stringify(actor));
      assert.equal(actorOverlapsTerrain(world,actor),false);
      const moved=Math.hypot(actor.x-before.x,actor.z-before.z);
      assert.ok(moved<=HUNT_WALK_SPEED*HUNT_FIXED_STEP+.0001,'no relocation');
      metres+=moved;ticks++;
      if(!stream.metrics.transition){
        const job=stream.next(actor);
        if(job)stream.begin(job);
      }
      if(stream.metrics.transition?.phase==='writing'){
        const previous=stream.metrics.transition.operations;
        const progress=stream.step(512);
        assert.ok(progress.operations-previous<=512);
        streamWrites++;
      }
      if(stream.metrics.transition?.phase==='awaiting-mesh'){
        assert.ok(!stream.metrics.residentIds.includes(stream.metrics.transition.id));
        stream.publish();
      }
      assert.ok(stream.metrics.residentRegions.length<=3);
      assert.ok(stream.metrics.residentLinks.length<=2);
      assert.ok(stream.storageMetrics.definitions<=5,'evicted authored definitions were not released');
      assert.ok(stream.metrics.residentIds.includes(stream.location(actor.x,actor.z)));
    };
    const walk=(x,z,label)=>{
      for(let n=0;n<1200;n++){
        const dx=x-actor.x,dz=z-actor.z;
        if(Math.hypot(dx,dz)<.025&&actor.grounded)return;
        const scale=HUNT_WALK_SPEED*HUNT_FIXED_STEP;
        const length=Math.hypot(dx,dz);
        const divisor=Math.max(scale,length);
        frame(dx/divisor,dz/divisor);
      }
      assert.fail(label+' target '+x+','+z+' actor '+JSON.stringify(actor));
    };
    const interior=(r,x,z)=>{
      const inner={minX:r.bounds.minX+1,maxX:r.bounds.maxX-1,
        minZ:r.bounds.minZ+1,maxZ:r.bounds.maxZ-1,minY:-3,maxY:30};
      const start={x:Math.floor(actor.x),z:Math.floor(actor.z)};
      const target={x:Math.floor(x),z:Math.floor(z)};
      const audit=analyzeCharacterReachability({terrain:port,bounds:inner,start,targets:[target],
        profile:{...DEFAULT_TRAVERSAL_PROFILE,maxNavigableDrop:.55}});
      const path=audit.routeTo(target.x,target.z);
      assert.ok(path,'No physical reversible interior path in '+r.id+' from '+JSON.stringify(start)+' to '+JSON.stringify(target));
      for(const cell of path)walk(cell.x+.5,cell.z+.5,r.id);
    };
    const itinerary=['region-entry','region-woodland-trail','region-buried-grove',
      'region-western-shelf','region-horde-crossing','region-eastern-gully',
      'region-eastern-overlook','region-forgotten-ruins','region-extraction',
      'region-forgotten-ruins','region-horde-crossing','region-woodland-trail','region-entry'];
    for(let i=1;i<itinerary.length;i++){
      const from=region(itinerary[i-1]),to=region(itinerary[i]);
      assert.equal(stream.location(actor.x,actor.z),from.id);
      const exit=from.ports.find(p=>p.peerRegionId===to.id);
      const arrival=to.ports.find(p=>p.peerRegionId===from.id);
      assert.ok(exit&&arrival);
      const dx=Math.sign(to.offsetX-from.offsetX),dz=Math.sign(to.offsetZ-from.offsetZ);
      interior(from,exit.at.x-dx*3+.5,exit.at.z-dz*3+.5);
      walk(arrival.at.x+dx*3+.5,arrival.at.z+dz*3+.5,from.id+' -> '+to.id);
      assert.equal(stream.location(actor.x,actor.z),to.id);
      if(to.id==='region-extraction')assert.ok(!stream.metrics.residentRegions.includes(home.id));
    }
    interior(home,entry.layout.topology.entry.x+.5,entry.layout.topology.entry.z+.5);
    assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
    assert.deepEqual(port.exportJournal(),journal);
    assert.equal(loader.terrain.world,world);
    assert.ok(metres>400);
    assert.ok(stream.metrics.registered>stream.storageMetrics.definitions);
    assert.ok(stream.storageMetrics.definitions<=5);
    assert.ok(stream.metrics.evictions>0&&streamWrites>0);
    t.diagnostic(JSON.stringify({ticks,metres,streamWrites,...stream.metrics}));
  }finally{loader.unload();}
});
