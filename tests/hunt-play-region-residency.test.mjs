import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateConnectedHuntStart,generateConnectedHuntContinuation} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader,V2ExternalTerrainAppend} from '../src/external-terrain-loader.mjs';
import {V2TerrainBandResidency} from '../src/terrain-band-residency.mjs';

function physicalSnapshot(world) {
  return {chunks:world.snapshots().map(({id,data})=>({id,data})),micro:world.microSurfaceTiles()};
}

function finish(job) {
  let frames=0;
  while(!job.progress.done) {
    const previous=job.progress.operations;
    job.step(512);
    assert.ok(job.progress.operations-previous<=512);
    assert.ok(++frames<300);
  }
  assert.ok(job.dirtyChunks.size>0);
}

test('H08-02B: unload the actual authored entry and restore its edited geometry in the same world',()=>{
  const entry=generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    kind:'wet-forest',seed:7,chunkEdge:32
  }));
  const start=generateConnectedHuntStart(entry);
  const next=generateConnectedHuntContinuation(entry,start);
  const capacity=Math.max(1024,start.definition.surfaceTiles.length+next.definition.surfaceTiles.length);
  const loader=new V2ExternalTerrainLoader(start.definition,{microSurfaceCapacity:capacity});
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const {world,port}=loader.terrain;
    const append=new V2ExternalTerrainAppend(world,next.definition,{previousMinZ:start.footprint.minZ});
    while(!append.progress.done)append.step(512);

    const hit=port.raycast({origin:[5.5,30,-16.5],direction:[0,-1,0],maxDistance:64});
    assert.ok(hit);
    assert.ok(hit.cell.z>=entry.layout.footprint.minZ);
    const result=port.apply({id:'entry-crater',type:'carve-crater',
      ...hit.cell,radius:2.3,depth:2,expectedRevision:world.revision});
    assert.ok(result.removedVoxels>0);
    const journal=port.exportJournal();
    const before=physicalSnapshot(world);
    const bytes=world.allocatedVoxelBytes;
    const band=new V2TerrainBandResidency(world,entry.definition);
    assert.throws(()=>band.beginReload(),/not evicted/);
    for(let cycle=0;cycle<2;cycle++) {
      band.beginEviction();
      assert.throws(()=>band.dirtyChunks,/incomplete/);
      assert.throws(()=>band.beginEviction(),/not resident/);
      assert.throws(()=>band.step(0),/budget/);
      finish(band);
      assert.equal(band.progress.phase,'evicted');
      assert.ok(band.progress.removedCells>0);
      assert.ok(world.allocatedVoxelBytes<bytes);
      for(const run of entry.definition.runs) {
        for(let x=run.x;x<run.x+run.length;x++)assert.equal(world.get(x,run.y,run.z),0);
      }
      assert.ok(world.microSurfaceTiles().every(tile=>tile.z<entry.layout.footprint.minZ));
      for(const run of next.definition.runs)assert.equal(world.get(run.x,run.y,run.z),run.material);
      assert.deepEqual(port.exportJournal(),journal);
      band.beginReload();
      finish(band);
      assert.equal(band.progress.phase,'resident');
      assert.equal(band.progress.removedCells,0);
      assert.deepEqual(physicalSnapshot(world),before);
      assert.equal(world.get(hit.cell.x,hit.cell.y,hit.cell.z),0);
      assert.equal(loader.terrain.world,world);
      assert.equal(loader.terrain.port,port);
      assert.deepEqual(port.exportJournal(),journal);
    }
  } finally {loader.unload();}
});
