import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntInvestigation} from '../src/hunt-investigation.mjs';

test('findings require a nearby resident site and survive reload for the same world',()=>{
  const regions=[{id:'ruins',opportunities:[
    {id:'clue',kind:'investigation-location',at:{x:5,z:0}}
  ]},{id:'grove',opportunities:[
    {id:'cache',kind:'optional-discovery',at:{x:10,z:0}}
  ]}];
  const saved=new Map();
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const terrain={revision:1,raycast:()=>({point:{y:5}})};
  const hunt=new HuntInvestigation(regions,7,0,storage);
  hunt.update(['ruins'],terrain);
  assert.deepEqual(hunt.markers.map(marker=>marker.id),['clue']);
  assert.equal(hunt.interact({x:10,y:5,z:0}),null);
  assert.equal(hunt.interact({x:5,y:2,z:0}),null);
  assert.match(hunt.interact({x:5,y:5,z:0}),/Fresh ash/);
  assert.equal(hunt.nearby({x:5,y:5,z:0}).action,'Read ruins clue');
  hunt.update(['grove'],terrain);
  assert.match(hunt.interact({x:10,y:5,z:0}),/sealed cache/);
  assert.deepEqual(new HuntInvestigation(regions,7,0,storage).findings,['cache','clue']);
  assert.deepEqual(new HuntInvestigation(regions,8,0,storage).findings,[]);
});

test('Buried Grove exposes a grounded cache that stays collected after reload',async()=>{
  const {createWorldSiteRecipe}=await import('../src/world-generation/site-recipe.mjs');
  const {generateWorldSite,generateAuthoredHuntTerrainGraph}=await import('../src/world-generation/index.mjs');
  const {V2ExternalTerrainLoader}=await import('../src/external-terrain-loader.mjs');
  const recipe=createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:32,seed:7});
  const graph=generateAuthoredHuntTerrainGraph(generateWorldSite(recipe));
  const regionId='region-buried-grove';
  const loader=new V2ExternalTerrainLoader(graph.region(regionId).definition);
  const saved=new Map();
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  try{
    while(!loader.progress.done)loader.loadStep(4096);
    const hunt=new HuntInvestigation(graph.layout.regions,7,0,storage);
    hunt.update([regionId],loader.terrain.port);
    const [cache]=hunt.markers;
    assert.equal(cache.action,'Search cache');
    const approach={x:cache.x+2.5,y:cache.y-1.25,z:cache.z};
    assert.equal(hunt.nearby(approach).action,'Search cache');
    assert.match(hunt.interact(approach),/sealed cache/);
    const restored=new HuntInvestigation(graph.layout.regions,7,0,storage);
    restored.update([regionId],loader.terrain.port);
    assert.deepEqual(restored.findings,[cache.id]);
    assert.equal(restored.nearby(cache).action,'Read cache finding');
    assert.match(restored.interact(cache),/sealed cache/);
    assert.deepEqual(restored.findings,[cache.id]);
  }finally{loader.unload();}
});
