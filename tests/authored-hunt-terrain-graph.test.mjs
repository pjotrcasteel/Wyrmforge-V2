import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,
  generateAuthoredHuntTerrainGraph,createHuntExpeditionRecipe,composeHuntExpeditionPlan} from '../src/world-generation/index.mjs';
import {toVoxelTerrainDefinition} from '../src/world-generation/voxel-terrain-adapter.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {spawnTerrainActor,actorOverlapsTerrain} from '../src/terrain-actor.mjs';
import {stepHuntExplorer,HUNT_FIXED_STEP} from '../src/hunt-play-runtime.mjs';

function setup(seed,scope='standard'){
  const entry=generateWorldSite(createWorldSiteRecipe({
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    kind:'wet-forest',seed,chunkEdge:32}));
  const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'preview-expedition',kind:'wet-forest',seed,chunkEdge:32,scope}));
  return {entry,plan,graph:generateAuthoredHuntTerrainGraph(entry,plan)};
}

function auditDefinition(band){
  const b=band.bounds;
  for(const r of band.definition.runs){
    assert.ok(r.x>=b.minX&&r.x+r.length-1<=b.maxX,band.id);
    assert.ok(r.z>=b.minZ&&r.z<=b.maxZ,band.id);
  }
  for(const t of band.definition.surfaceTiles??[]){
    assert.ok(t.x>=b.minX&&t.x<=b.maxX&&t.z>=b.minZ&&t.z<=b.maxZ,band.id);
  }
}

test('every planned region and connection has a separate deterministic native terrain definition',()=>{
  for(const [seed,scope] of [[7,'standard'],[8,'extended'],[19,'standard']]){
    const {graph,plan}=setup(seed,scope);
    for(const region of graph.layout.regions){
      const band=graph.materialize(region.id);
      auditDefinition(band);
      assert.equal(band.role,region.role);
      assert.deepEqual(band,graph.region(region.id));
    }
    for(const link of graph.layout.links){
      const band=graph.materialize(link.id);
      auditDefinition(band);
      assert.ok(band.maximumRouteGradeTenths<=5,link.id);
      assert.deepEqual(band,graph.link(link.id));
    }
    assert.equal(graph.layout.links.length,plan.links.length);
    // All loops and alternatives survived the physical composition contract.
    assert.ok(graph.layout.links.length>=graph.layout.regions.length);
    assert.throws(()=>graph.materialize('missing'),/Unknown authored graph/);
  }
});

test('graph region geometry matches its native port-aware source, preserving the entry',()=>{
  const {entry,graph}=setup(7);
  for(const region of graph.layout.regions){
    const source=region.id===graph.layout.entryRegionId?entry:
      generateWorldSite(createWorldSiteRecipe({...entry.recipe,
        regionId:region.id,siteId:'preview-'+region.id,huntRole:region.role,
        lateralPorts:region.ports.map(p=>p.direction).filter(d=>d==='east'||d==='west')}));
    const band=graph.region(region.id);
    const translate=items=>items.map(item=>({...item,x:item.x+region.offsetX,z:item.z+region.offsetZ}));
    assert.equal(band.sourceHash,source.hash);
    assert.deepEqual(band.definition.runs,translate(source.definition.runs));
    assert.deepEqual(band.definition.surfaceTiles??[],translate(source.definition.surfaceTiles??[]));
  }
});

test('each physical graph seam can be crossed both ways by the actual voxel actor',()=>{
  const {graph}=setup(7);
  for(const link of graph.layout.links){
    const a=graph.region(link.fromId),b=graph.region(link.toId),seam=graph.link(link.id);
    const definition=toVoxelTerrainDefinition({siteId:'graph-seam-test',seed:7,chunkEdge:32,
      runs:[...a.definition.runs,...b.definition.runs,...seam.definition.runs],
      surfaceTiles:[...(a.definition.surfaceTiles??[]),...(b.definition.surfaceTiles??[]),
        ...(seam.definition.surfaceTiles??[])]});
    const loader=new V2ExternalTerrainLoader(definition,{microSurfaceCapacity:2048});
    try {
      while(!loader.progress.done)loader.loadStep(4096);
      const {world}=loader.terrain;
      const bounds={minX:Math.min(a.bounds.minX,b.bounds.minX),maxX:Math.max(a.bounds.maxX,b.bounds.maxX),
        minZ:Math.min(a.bounds.minZ,b.bounds.minZ),maxZ:Math.max(a.bounds.maxZ,b.bounds.maxZ)};
      const horizontal=['east','west'].includes(link.fromPort.direction);
      const min=horizontal?seam.bounds.minX:seam.bounds.minZ;
      const max=horizontal?seam.bounds.maxX:seam.bounds.maxZ;
      const cross=horizontal?(seam.bounds.minZ+seam.bounds.maxZ+1)/2+.5:
        (seam.bounds.minX+seam.bounds.maxX+1)/2+.5;
      for(const direction of [-1,1]){
        const from=direction>0?min-.5:max+1.5;
        const to=direction>0?max+1.5:min-.5;
        let actor=spawnTerrainActor(world,{x:horizontal?from:cross,z:horizontal?cross:from,
          searchTopY:30,maxSearchDistance:64});
        assert.ok(actor?.grounded,link.id);
        for(let i=0;i<250;i++){
          actor=stepHuntExplorer(world,actor,bounds,horizontal?{moveX:direction}:{moveZ:direction},HUNT_FIXED_STEP);
          assert.ok(!actor.error,link.id+' '+JSON.stringify(actor));
          assert.equal(actorOverlapsTerrain(world,actor),false);
          const pos=horizontal?actor.x:actor.z;
          if(direction>0?pos>=to:pos<=to)break;
        }
        const pos=horizontal?actor.x:actor.z;
        assert.ok(direction>0?pos>=to:pos<=to,link.id+' direction '+direction+' '+JSON.stringify(actor));
      }
    } finally {loader.unload();}
  }
});
