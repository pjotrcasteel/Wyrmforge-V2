import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';
import {
  sampleWorldInfluence,WORLD_INFLUENCE_SCHEMA
} from '../src/world-generation/world-influence-grammar.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { worldDigest } from '../src/replay-checkpoint.mjs';

const kinds=['wet-forest','forest-highland','mountain-pass'];
const recipe=(kind,seed,corruption)=>createWorldSiteRecipe({
  regionId:'starter-region',siteId:'preview-'+kind,
  encounterId:'preview-001',kind,seed,corruption,chunkEdge:16
});

test('Wyrm influence is a pure, bounded, geographically directed grammar',()=>{
  const args={radius:20,seed:7,corruption:0,x:0,z:-18};
  assert.deepEqual(sampleWorldInfluence(args),{
    strength:0,elevationShift:0,weatheredStone:false
  });
  const south=sampleWorldInfluence({...args,corruption:1,z:18});
  const north=sampleWorldInfluence({...args,corruption:1});
  assert.equal(south.strength,0);
  assert.ok(north.strength>0.4 && north.strength<=1);
  assert.deepEqual(north,sampleWorldInfluence({...args,corruption:1}));
  assert.ok(Number.isSafeInteger(north.elevationShift));
  for(const invalid of [
    {...args,corruption:1.01},{...args,corruption:-0.1},
    {...args,x:20},{...args,z:-21},{...args,seed:-1}
  ]) assert.throws(()=>sampleWorldInfluence(invalid),RangeError);
});

test('World Map corruption affects real terrain while leaving authored routes and biome identity stable',()=>{
  for(const kind of kinds)for(const seed of [7,19,101,267]) {
    const living=generateWorldSite(recipe(kind,seed,0));
    const weathered=generateWorldSite(recipe(kind,seed,1));
    assert.equal(living.generatorVersion,'worldgen-v2.7.0');
    assert.equal(weathered.generatorVersion,'worldgen-v2.7.0');
    assert.equal(weathered.layout.worldInfluence.schema,WORLD_INFLUENCE_SCHEMA);
    assert.equal(living.layout.worldInfluence.corruption,0);
    assert.equal(living.layout.worldInfluence.alteredNaturalCells,0);
    assert.equal(living.layout.worldInfluence.weatheredStoneCells,0);
    assert.ok(weathered.layout.worldInfluence.alteredNaturalCells>0,
      kind+' seed '+seed+' must change physical landforms');
    assert.ok(weathered.layout.worldInfluence.peakStrength>0.4);
    assert.notDeepEqual(weathered.definition.runs,living.definition.runs,
      'corruption must change real physical world occupancy/materials');
    assert.deepEqual(weathered.layout.routes,living.layout.routes);
    assert.deepEqual(weathered.layout.landmarks,living.layout.landmarks);
    assert.deepEqual(weathered.layout.combatSpaces,living.layout.combatSpaces);
    assert.ok(weathered.layout.topology.reachable);
    assert.ok(weathered.layout.escapeAudit.ready);
    assert.ok(weathered.layout.combatFlow.ready);
    assert.ok(weathered.layout.roadGrades.maximumGradeTenths<=5);
    assert.equal(weathered.hash,generateWorldSite(recipe(kind,seed,1)).hash);
    assert.notEqual(weathered.hash,living.hash);
  }
});

test('Wet Forest gains coherent exposed stone near the Wyrm, not on required road material',()=>{
  const site=generateWorldSite(recipe('wet-forest',7,1));
  assert.ok(site.layout.worldInfluence.weatheredStoneCells>0);
  assert.equal(site.layout.worldInfluence.hasFireSimulation,false);
  const loader=new V2ExternalTerrainLoader(site.definition);
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const world=loader.terrain.world;
    const untouched=generateWorldSite(recipe('wet-forest',7,0));
    const original=new V2ExternalTerrainLoader(untouched.definition);
    try {
      while(!original.progress.done)original.loadStep(4096);
      assert.notEqual(worldDigest(world),worldDigest(original.terrain.world),
        'the generated seed must change physical Voxel V2 state, not only its recipe hash');
    } finally {original.unload();}
    assert.ok(world.chunkCount>1);
  } finally {loader.unload();}
});
