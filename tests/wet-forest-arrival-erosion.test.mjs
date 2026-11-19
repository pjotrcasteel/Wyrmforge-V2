import test from 'node:test';
import assert from 'node:assert/strict';
import {forestArrivalRelief} from '../src/world-generation/map-kinds.mjs';
import {createWorldSiteRecipe,WORLD_GENERATOR_VERSION}
  from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph}
  from '../src/world-generation/index.mjs';

// Regress the *physical* source of the brown rectangular geometry, not a
// shader colour or a same-scene shadow toggle. Old binary relief stepped
// 4.6 metres in less than 10 cm along the fissure wall.
test('seeded entry fissure is deep but its physical boundary is continuously eroded',()=>{
  for(const seed of [7,19,42,101]){
    for(let zi=0;zi<=24;zi++){
      const z=-19+zi*.3;
      for(let xi=0;xi<=72;xi++){
        const x=-12+xi*.1;
        const a=forestArrivalRelief(seed,x,z);
        const east=forestArrivalRelief(seed,x+.1,z);
        const south=forestArrivalRelief(seed,x,z+.1);
        assert.ok([a,east,south].every(Number.isFinite));
        assert.ok(Math.abs(east-a)<.65,
          'sharp binary fissure wall along x in seed '+seed+' at '+x+','+z);
        assert.ok(Math.abs(south-a)<.65,
          'sharp square fissure end along z in seed '+seed+' at '+x+','+z);
      }
    }
    const cut=Math.min(...[-10,-9,-8,-7].map(x=>forestArrivalRelief(seed,x,-15)));
    const wall=Math.max(...[8,9,10,11].map(x=>forestArrivalRelief(seed,x,-9)));
    assert.ok(cut<=-4.35,'do not flatten the true 4.6m stone fissure');
    assert.ok(wall>=5.5,'do not flatten the true tall eastern escarpment');
    assert.ok(Math.abs(forestArrivalRelief(seed,-8,-19))<.1,
      'fissure ends must feather back to natural ground');
    assert.equal(forestArrivalRelief(seed,-8,-15),
      forestArrivalRelief(seed,-8,-15),'world geometry is deterministic');
  }
});

test('actual seed-7 Hunt uses shallow soil over deep stone, while routes remain playable',()=>{
  for(const seed of [7,19,42]){
    const site=generateWorldSite(createWorldSiteRecipe({
      kind:'wet-forest',seed,regionId:'starter-region',
      siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:32
    }));
    const same=generateWorldSite(site.recipe);
    assert.equal(site.hash,same.hash,'geology stays deterministic');
    assert.equal(site.layout.topology.reachable,true);
    assert.ok(site.layout.roadGrades.maximumGradeTenths<=5);
    assert.equal(site.layout.geology.soilDepth,1);
    assert.equal(site.layout.geology.rockFaceThreshold,2);
    const graph=generateAuthoredHuntTerrainGraph(site);
    assert.equal(graph.region(graph.layout.entryRegionId).sourceHash,site.hash);
    let physicalStone=0,thickDirt=0;
    for(let z=-18;z<=-11;z++)for(let x=-12;x<=-5;x++){
      const column=site.definition.runs.filter(run=>
        run.z===z&&run.x<=x&&x<run.x+run.length);
      if(column.some(run=>run.material===3))physicalStone++;
      const dirt=column.filter(run=>run.material===2);
      if(dirt.length>1)thickDirt++;
    }
    assert.ok(physicalStone>20,'rock beneath the eroded fissure must remain solid');
    assert.equal(thickDirt,0,
      'forest fissure must not expose thick rectangular brown dirt sandwiches');
  }
  assert.equal(WORLD_GENERATOR_VERSION,'worldgen-v2.7.19');
});
