import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph,
  createHuntExpeditionRecipe,composeHuntExpeditionPlan
} from '../src/world-generation/index.mjs';
import {toVoxelTerrainDefinition} from '../src/world-generation/voxel-terrain-adapter.mjs';
import {planHuntRiverCorridor} from '../src/world-generation/hunt-river-corridor-plan.mjs';
import {prepareHuntRiverEarthwork,composeHuntRiverEarthworkGraph}
  from '../src/world-generation/hunt-river-earthwork.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {HuntStreamedFluid} from '../src/fluid/hunt-streamed-fluid.mjs';
import {HuntFluidSave} from '../src/fluid/hunt-fluid-save.mjs';

const identity='connected-hunt-fixture-v1';
function setup(){
  const entry=generateWorldSite(createWorldSiteRecipe({
    seed:7,kind:'wet-forest',river:'water',huntRole:'arrival',chunkEdge:32
  }));
  const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'preview-expedition',
    kind:'wet-forest',seed:7,chunkEdge:32
  }));
  const original=generateAuthoredHuntTerrainGraph(entry,plan);
  const id=original.layout.links.find(l=>[l.fromId,l.toId].includes('region-entry')&&
    [l.fromId,l.toId].includes('region-woodland-trail'))?.id;
  assert.ok(id);
  const corridor=planHuntRiverCorridor(original,id);
  const earthwork=prepareHuntRiverEarthwork(original,corridor,toVoxelTerrainDefinition);
  const graph=composeHuntRiverEarthworkGraph(original,earthwork,toVoxelTerrainDefinition);
  const ids=[earthwork.bands[0].id,earthwork.bands[2].id,id];
  const loader=new V2ExternalTerrainLoader(graph.initialTerrain(ids),{microSurfaceCapacity:2048});
  while(!loader.progress.done)loader.loadStep(4096);
  return {graph,earthwork,ids,loader};
}

test('the real native Hunt graph publishes a wet 8m link and one outer source/sink',()=>{
  const {graph,earthwork,ids,loader}=setup();
  try{
    assert.equal(graph.fluidSeams.length,2);
    assert.equal(earthwork.bands.length,3);
    const {port,world}=loader.terrain;
    for(const band of earthwork.bands){
      const authored=new Map(band.fluidLayout.riverChannels[0].floor
        .map(cell=>[cell.x+','+cell.z,cell.y]));
      for(const p of earthwork.points.filter(point=>point.bandId===band.id)){
        const y=authored.get(p.x+','+p.z);
        assert.ok(Number.isSafeInteger(y),
          'every physical river corridor cell must have a native WorldGen bed');
        assert.equal(port.materialAt(p.x,y-1,p.z),3,
          'the real lower Voxel floor must remain stone, including a shallow ford');
        assert.equal(port.materialAt(p.x,y,p.z),0,
          'the corresponding native fluid cell must be actual air');
      }
    }
    const host=new HuntStreamedFluid({graph,terrain:port,identity});
    try{
      assert.equal(host.syncResident(ids),3);
      assert.equal(host.seamLinks,2);
      const checkpoint=host.exportCheckpoint();
      const states=new Map(checkpoint.regions.map(r=>[r.id,r.state]));
      assert.equal(states.get(earthwork.bands[0].id).sources.length>0,true);
      assert.equal(states.get(earthwork.bands[0].id).outlets.length,0);
      assert.equal(states.get(earthwork.linkId).sources.length,0);
      assert.equal(states.get(earthwork.linkId).outlets.length,0);
      assert.equal(states.get(earthwork.bands[2].id).sources.length,0);
      assert.equal(states.get(earthwork.bands[2].id).outlets.length>0,true);
      let transferred=0;
      for(let i=0;i<320;i++){
        const result=host.step({budget:96});
        assert.ok(result.processed+result.seamInspected<=96);
        transferred+=result.seamTransferred;
      }
      assert.ok(transferred>0,
        'Water V2 must physically travel across a true adjacent Voxel band face');
      assert.ok(host.totalDepth>0);
      assert.ok(host.snapshotSurface().cells.some(cell=>
        cell.x>=graph.link(earthwork.linkId).bounds.minX&&
        cell.x<=graph.link(earthwork.linkId).bounds.maxX&&
        cell.z>=graph.link(earthwork.linkId).bounds.minZ&&
        cell.z<=graph.link(earthwork.linkId).bounds.maxZ));
      const before=host.exportCheckpoint();
      assert.equal(host.evict(earthwork.linkId),true);
      assert.equal(host.syncResident(ids.filter(x=>x!==earthwork.linkId)),0);
      const during=host.exportCheckpoint();
      assert.deepEqual(during.regions.find(r=>r.id===earthwork.linkId).state,
        before.regions.find(r=>r.id===earthwork.linkId).state,
        'eviction must retain exactly the same wet and airborne link volume');
      assert.equal(host.syncResident(ids),1);
      assert.deepEqual(host.exportCheckpoint().regions.find(r=>r.id===earthwork.linkId),
        before.regions.find(r=>r.id===earthwork.linkId));
    }finally{
      host.dispose();
    }
    assert.ok(world.revision>0);
  }finally{
    loader.unload();
  }
});

test('both wet regions, the connector, and the seam cursor survive browser storage',()=>{
  const {graph,ids,loader}=setup();
  try{
    const first=new HuntStreamedFluid({graph,terrain:loader.terrain.port,identity});
    first.syncResident(ids);
    for(let i=0;i<35;i++)first.step({budget:96});
    const raw=new Map();
    const storage={
      getItem:k=>raw.get(k)??null,
      setItem:(k,v)=>raw.set(k,v)
    };
    const save=new HuntFluidSave(storage,identity);
    assert.equal(save.saveFrom(first),true);
    const snapshot=first.exportCheckpoint();
    assert.equal(snapshot.seamState?.linkIds.length,2);
    first.dispose();
    const second=new HuntStreamedFluid({graph,terrain:loader.terrain.port,identity});
    new HuntFluidSave(storage,identity).restoreInto(second);
    assert.equal(second.syncResident(ids),3);
    assert.deepEqual(second.exportCheckpoint().seamState,snapshot.seamState);
    assert.deepEqual(second.exportCheckpoint().regions,snapshot.regions);
    second.dispose();
  }finally{
    loader.unload();
  }
});
