import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateLateralHuntConnector,composeAuthoredHuntLayout,
  createHuntExpeditionRecipe,composeHuntExpeditionPlan} from '../src/world-generation/index.mjs';
import {toVoxelTerrainDefinition} from '../src/world-generation/voxel-terrain-adapter.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {spawnTerrainActor,actorOverlapsTerrain} from '../src/terrain-actor.mjs';
import {stepHuntExplorer,HUNT_FIXED_STEP} from '../src/hunt-play-runtime.mjs';

function setup(seed){
  const recipe=createWorldSiteRecipe({regionId:'starter-region',siteId:'preview-wet-forest',
    encounterId:'preview-001',kind:'wet-forest',seed,chunkEdge:32});
  const entry=generateWorldSite(recipe);
  const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'preview-expedition',kind:'wet-forest',seed,chunkEdge:32
  }));
  const layout=composeAuthoredHuntLayout(plan,entry);
  const make=region=>generateWorldSite(createWorldSiteRecipe({...recipe,
    regionId:region.id,siteId:'preview-'+region.id}));
  const links=layout.links.filter(l=>['east','west'].includes(l.fromPort.direction));
  return {layout,make,links};
}

test('native lateral graph links create deterministic bounded seams with no source overlap',()=>{
  for(const seed of [7,8,19,101]) {
    const {layout,make,links}=setup(seed);
    for(const link of links){
      const endpoints=layout.regions.filter(r=>[link.fromId,link.toId].includes(r.id))
        .sort((a,b)=>a.offsetX-b.offsetX);
      const [west,east]=endpoints.map(make);
      const seam=generateLateralHuntConnector(layout,link.id,west,east);
      assert.deepEqual(seam,generateLateralHuntConnector(layout,link.id,west,east));
      assert.equal(seam.westId,endpoints[0].id);
      assert.equal(seam.eastId,endpoints[1].id);
      assert.ok(seam.maximumRouteGradeTenths<=5);
      for(const run of seam.definition.runs){
        assert.ok(run.x>=link.bounds.minX&&run.x+run.length-1<=link.bounds.maxX);
        assert.ok(run.z>=link.bounds.minZ&&run.z<=link.bounds.maxZ);
      }
      for(const tile of seam.definition.surfaceTiles??[]){
        assert.ok(tile.x>=link.bounds.minX&&tile.x<=link.bounds.maxX);
        assert.ok(tile.z>=link.bounds.minZ&&tile.z<=link.bounds.maxZ);
      }
    }
  }
});

test('real actor crosses woodland lateral seams in both directions on native voxels',()=>{
  const {layout,make,links}=setup(7);
  for(const link of links.filter(l=>[l.fromId,l.toId].includes('region-woodland-trail'))){
    const endpoints=layout.regions.filter(r=>[link.fromId,link.toId].includes(r.id))
      .sort((a,b)=>a.offsetX-b.offsetX);
    const [west,east]=endpoints.map(make);
    const seam=generateLateralHuntConnector(layout,link.id,west,east);
    const translate=(items,r)=>items.map(v=>({...v,x:v.x+r.offsetX,z:v.z+r.offsetZ}));
    const definition=toVoxelTerrainDefinition({siteId:'lateral-crossing-test',seed:7,chunkEdge:32,
      runs:[...translate(west.definition.runs,endpoints[0]),...seam.definition.runs,
        ...translate(east.definition.runs,endpoints[1])],
      surfaceTiles:[...translate(west.definition.surfaceTiles,endpoints[0]),...(seam.definition.surfaceTiles??[]),
        ...translate(east.definition.surfaceTiles,endpoints[1])]});
    const loader=new V2ExternalTerrainLoader(definition,{microSurfaceCapacity:2048});
    try{
      while(!loader.progress.done)loader.loadStep(4096);
      const {world}=loader.terrain;
      const bounds={minX:endpoints[0].bounds.minX,maxX:endpoints[1].bounds.maxX,
        minZ:link.bounds.minZ,maxZ:link.bounds.maxZ};
      const {minX,maxX}=link.bounds;
      const z=endpoints[0].offsetZ+.5;
      for(const direction of [-1,1]){
        const from=direction>0?minX-.5:maxX+1.5;
        const to=direction>0?maxX+1.5:minX-.5;
        let actor=spawnTerrainActor(world,{x:from,z,searchTopY:30,maxSearchDistance:64});
        assert.ok(actor?.grounded);
        for(let i=0;i<250;i++){
          actor=stepHuntExplorer(world,actor,bounds,{moveX:direction},HUNT_FIXED_STEP);
          assert.ok(!actor.error,JSON.stringify(actor));
          assert.equal(actorOverlapsTerrain(world,actor),false);
          if(direction>0?actor.x>=to:actor.x<=to)break;
        }
        assert.ok(direction>0?actor.x>=to:actor.x<=to,
          'Lateral seam blocked: '+link.id+' '+direction+' '+JSON.stringify(actor));
      }
    }finally{loader.unload();}
  }
});
