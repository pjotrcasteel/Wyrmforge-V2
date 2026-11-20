import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntHorde} from '../src/hunt-horde.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {actorOverlapsTerrain,spawnTerrainActor} from '../src/terrain-actor.mjs';

test('Horde Crossing spawns grounded enemies, runs three bounded waves and records completion',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',regionId:'starter-region',
    siteId:'preview-wet-forest',encounterId:'preview-001',chunkEdge:32,seed:7}));
  const graph=generateAuthoredHuntTerrainGraph(site);
  const region=graph.layout.regions.find(entry=>entry.role==='horde');
  const loader=new V2ExternalTerrainLoader(graph.region(region.id).definition);
  try{
    while(!loader.progress.done)loader.loadStep(4096);
    const {world}=loader.terrain;
    const actor=spawnTerrainActor(world,{x:region.offsetX+.5,z:region.offsetZ+.5});
    const horde=new HuntHorde(region);
    const step=(position=actor,section=region.id)=>horde.step({world,actor:position,section,dt:1/60});
    step(actor,'region-woodland-trail');
    assert.equal(horde.report.phase,'waiting');
    step();
    assert.equal(horde.enemies.length,4);
    assert.ok(horde.enemies.every(enemy=>enemy.grounded&&!actorOverlapsTerrain(world,enemy)));
    const before=horde.enemies[0];
    for(let i=0;i<20;i++)step();
    assert.notDeepEqual(horde.enemies[0],before);
    assert.ok(horde.report.navigation.queries>0,'live Horde should sample real spatial LOS');
    assert.ok(horde.report.navigation.peakQueriesPerStep<=3,
      'ten active enemies must not exceed the spatial query budget');
    assert.ok(horde.enemies.every(enemy=>enemy.archetypeId==='hollowed'),
      'physical updates retain the creature locomotion identity');
    // Keep the stationary test fixture outside contact height once movement is verified.
    for(let i=0;i<1500;i++)step({...actor,y:actor.y+5});
    assert.equal(horde.report.phase,'complete');
    assert.equal(horde.report.spawned,21);
    assert.equal(horde.report.peakActive,10);
    assert.equal(horde.enemies.length,0);
  }finally{loader.unload();}
});
