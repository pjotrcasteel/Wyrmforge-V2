import test from 'node:test';
import assert from 'node:assert/strict';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {V2TerrainResidencySet} from '../src/terrain-residency-set.mjs';
import {recordHuntTerrainEdit,replayHuntTerrainEdit} from '../src/hunt-terrain-replay.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {replayDataDigest} from '../src/replay-checkpoint.mjs';

function occupancyDigest(world){
  return replayDataDigest({
    chunks:world.snapshots().map(chunk=>[chunk.id,Array.from(chunk.data)]),
    tiles:world.microSurfaceTiles()
  });
}

test('a Fireball crossing a trail seam replays after both sides stream out and back in',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:16,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const entry=graph.layout.entryRegionId;
  const trail='region-woodland-trail';
  const link=graph.layout.links.find(l=>[l.fromId,l.toId].includes(entry)&&[l.fromId,l.toId].includes(trail));
  const ids=[entry,trail,link.id];
  function run(budget,replay=null){
    const loader=new V2ExternalTerrainLoader(graph.initialTerrain(ids),{microSurfaceCapacity:2048});
    try{
      while(!loader.progress.done)loader.loadStep(budget);
      const {world,port}=loader.terrain;
      const set=new V2TerrainResidencySet(world,{residentLimit:3});
      for(const id of ids){
        const regenerate=()=>graph.materialize(id).definition;
        set.register(id,regenerate(),{resident:true,regenerate});
      }
      const hit=port.raycast({origin:[.5,32,link.bounds.maxZ+.5],direction:[0,-1,0],maxDistance:42});
      assert.ok(hit);
      const command={id:'seam-fireball',type:'carve-crater',...hit.cell,radius:2.3,depth:2,
        expectedRevision:port.revision};
      const rightBefore=port.raycast({origin:[.5,32,link.bounds.maxZ+1.5],direction:[0,-1,0],maxDistance:42});
      if(replay)assert.throws(()=>replayHuntTerrainEdit(port,[entry,trail],replay),/neighborhood/);
      const result=replay?replayHuntTerrainEdit(port,set.residentIds,replay):port.apply(command);
      assert.equal(result.status,'accepted');
      assert.ok(result.removedVoxels>0);
      const rightAfter=port.raycast({origin:[.5,32,link.bounds.maxZ+1.5],direction:[0,-1,0],maxDistance:42});
      assert.ok(rightAfter.point.y<rightBefore.point.y,'the edit crosses the seam');
      const record=recordHuntTerrainEdit(set.residentIds,command,result);
      const expected=occupancyDigest(world);
      const transition=(id,action)=>{
        set.begin(id,action);
        while(set.metrics.transition.phase==='writing')set.step(budget);
        assert.ok(set.dirtyChunks.size);
        assert.ok(!set.residentIds.includes(id));
        set.publish();
      };
      for(const id of [link.id,entry])transition(id,'evict');
      for(const id of [entry,link.id])transition(id,'load');
      assert.equal(occupancyDigest(world),expected);
      return {record,expected};
    }finally{loader.unload();}
  }
  const first=run(512);
  const restored=run(192,JSON.parse(JSON.stringify(first.record)));
  assert.equal(restored.expected,first.expected);
});
