import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntExtraction} from '../src/hunt-extraction.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';

test('the grounded terminal gate requires the ruins clue and saves extraction once',()=>{
  const world=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:32,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(world);
  const region=graph.layout.regions.find(entry=>entry.role==='extraction');
  const loader=new V2ExternalTerrainLoader(graph.region(region.id).definition);
  const inventory=new Set();
  const saved=new Map();
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  try{
    while(!loader.progress.done)loader.loadStep(4096);
    const gate=new HuntExtraction(region,inventory,7,0,storage);
    gate.update([region.id],loader.terrain.port);
    const foot=gate.ground;
    assert.ok(foot);
    assert.equal(gate.extract(foot),false);
    inventory.add('region-buried-grove-opportunity');
    assert.equal(gate.eligible,false);
    inventory.add('region-forgotten-ruins-opportunity');
    assert.equal(gate.extract({...foot,z:foot.z+5}),false);
    gate.update([],loader.terrain.port);
    assert.equal(gate.extract(foot),false);
    gate.update([region.id],loader.terrain.port);
    assert.equal(gate.extract(foot),true);
    assert.equal(gate.extract(foot),false);
    assert.equal(new HuntExtraction(region,inventory,7,0,storage).completed,true);
    assert.equal(new HuntExtraction(region,inventory,8,0,storage).completed,false);
  }finally{loader.unload();}
});
