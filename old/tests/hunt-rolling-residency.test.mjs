import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateConnectedHuntStart,generateConnectedHuntContinuation,
  activateConnectedHuntContinuation} from '../src/world-generation/index.mjs';
import {toVoxelTerrainDefinition} from '../src/world-generation/voxel-terrain-adapter.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {V2TerrainResidencySet} from '../src/terrain-residency-set.mjs';

test('H08-02B: all authored main-route regions load and revisit with max three resident bands',()=>{
  const entry=generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    kind:'wet-forest',seed:7,chunkEdge:32
  }));
  let route=generateConnectedHuntStart(entry);
  const loader=new V2ExternalTerrainLoader(route.definition,{microSurfaceCapacity:2048});
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const {world,port}=loader.terrain;
    const initial={...route.definition,siteId:'second-band',
      runs:route.definition.runs.filter(r=>r.z<entry.layout.footprint.minZ),
      surfaceTiles:route.definition.surfaceTiles.filter(t=>t.z<entry.layout.footprint.minZ)};
    const bands=new V2TerrainResidencySet(world);
    bands.register(route.sites[0].id,entry.definition,{resident:true});
    bands.register(route.sites[1].id,toVoxelTerrainDefinition(initial),{resident:true});
    const definitions=new Map([[route.sites[0].id,entry.definition],[route.sites[1].id,initial]]);
    const pristine=new Map();
    const edited=new Map();
    for(let i=2;i<5;i++) {
      const next=generateConnectedHuntContinuation(entry,route);
      bands.register(next.site.id,next.definition);
      definitions.set(next.site.id,next.definition);
      route=activateConnectedHuntContinuation(route,next);
    }
    const ids=route.sites.map(s=>s.id);
    const finish=(id,action,protectedIds=[])=>{
      bands.begin(id,action,{protectedIds});
      assert.throws(()=>bands.begin(id,action),/already running/);
      assert.throws(()=>bands.publish(),/incomplete/);
      while(bands.metrics.transition.phase==='writing'){
        const before=bands.metrics.transition.operations;
        const step=bands.step(512);
        assert.ok(step.operations-before<=512);
      }
      assert.ok(bands.dirtyChunks.size>0);
      assert.ok(!bands.residentIds.includes(id));
      bands.publish(); // Test stand-in for real worker/GPU acknowledgement.
      assert.equal(bands.residentIds.includes(id),action==='load');
      assert.ok(bands.residentIds.length<=3);
      assert.ok(world.microSurfaceCount<=2048);
    };
    const snapshot=id=>{
      const definition=definitions.get(id);
      const data=[];
      for(const r of definition.runs)
        for(let x=r.x;x<r.x+r.length;x++)data.push(world.get(x,r.y,r.z));
      const micro=world.microSurfaceTiles().filter(t=>definition.runs.some(r=>
        r.y===t.y&&r.z===t.z&&t.x>=r.x&&t.x<r.x+r.length));
      return {data,micro};
    };
    const crater=id=>{
      const site=route.sites.find(s=>s.id===id);
      const hit=port.raycast({origin:[5.5,30,site.minZ+10.5],direction:[0,-1,0],maxDistance:64});
      assert.ok(hit);
      pristine.set(id,snapshot(id));
      const result=port.apply({id:'crater-'+id,type:'carve-crater',...hit.cell,
        radius:2.3,depth:2,expectedRevision:world.revision});
      assert.ok(result.removedVoxels>0);
      edited.set(id,snapshot(id));
      assert.notDeepEqual(edited.get(id),pristine.get(id));
    };
    crater(ids[0]);
    finish(ids[2],'load');
    assert.throws(()=>bands.begin(ids[3],'load'),/limit/);
    assert.throws(()=>bands.begin(ids[0],'evict',{protectedIds:[ids[0]]}),/protected/);
    finish(ids[0],'evict',[ids[1],ids[2]]);
    finish(ids[3],'load');
    crater(ids[3]);
    finish(ids[1],'evict',[ids[2],ids[3]]);
    finish(ids[4],'load');
    crater(ids[4]);
    const journal=port.exportJournal();
    finish(ids[4],'evict',[ids[2],ids[3]]);
    finish(ids[1],'load');
    finish(ids[3],'evict',[ids[1],ids[2]]);
    finish(ids[0],'load');
    assert.deepEqual(snapshot(ids[0]),edited.get(ids[0]));
    finish(ids[0],'evict',[ids[1],ids[2]]);
    finish(ids[3],'load');
    assert.deepEqual(snapshot(ids[3]),edited.get(ids[3]));
    finish(ids[1],'evict',[ids[2],ids[3]]);
    finish(ids[4],'load');
    assert.deepEqual(snapshot(ids[4]),edited.get(ids[4]));
    assert.equal(bands.metrics.peakResident,3);
    assert.deepEqual(port.exportJournal(),journal);
    assert.equal(loader.terrain.world,world);
    assert.equal(loader.terrain.port,port);
  } finally {loader.unload();}
});
