import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {wetForestRegionProfile} from '../src/world-generation/wet-forest-region-profile.mjs';

const roles=['arrival','exploration','horde','investigation','discovery','flank','extraction'];
const recipe={regionId:'test-region',siteId:'test-site',encounterId:'test-hunt',
  kind:'wet-forest',seed:7,chunkEdge:32,lateralPorts:['west','east']};

test('H08-03: World Map role changes physical geography without changing biome or ports',()=>{
  for(const seed of [7,8,19]){
    const signatures=new Set();
    const landmarks=new Set();
    for(const huntRole of roles){
      const input=createWorldSiteRecipe({...recipe,seed,huntRole});
      const a=generateWorldSite(input),b=generateWorldSite(input);
      assert.equal(a.hash,b.hash);
      assert.deepEqual(a.definition,b.definition);
      assert.equal(a.recipe.kind,'wet-forest');
      assert.equal(a.recipe.huntRole,huntRole);
      assert.equal(a.layout.topology.reachable,true);
      assert.ok(a.layout.roadGrades.maximumGradeTenths<=5);
      assert.ok(a.layout.microSurface.tileCount<=384);
      assert.equal(a.layout.combatSpaces[0].radius,huntRole==='horde'?8:7);
      const signature=JSON.stringify(a.definition.runs);
      signatures.add(signature);
      landmarks.add(a.layout.landmarks[0].kind);
      const profile=wetForestRegionProfile(huntRole,seed);
      assert.ok(Number.isFinite(profile.relief(-12,7)));
      assert.equal(Math.abs(a.layout.features.find(f=>f.id==='wetland').x),Math.abs(profile.wetX));
    }
    assert.equal(signatures.size,roles.length);
    assert.equal(landmarks.size,roles.length);
  }
});

test('H08-03: role-aware graph preserves initial geography and reciprocal link identity',()=>{
  const entry=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',
    regionId:'starter-region',siteId:'preview-wet-forest',encounterId:'preview-001',
    seed:7,chunkEdge:32}));
  const graph=generateAuthoredHuntTerrainGraph(entry);
  assert.equal(graph.region(graph.layout.entryRegionId).sourceHash,entry.hash);
  for(const region of graph.layout.regions){
    if(region.id===graph.layout.entryRegionId)continue;
    const expected=generateWorldSite(createWorldSiteRecipe({...entry.recipe,
      regionId:region.id,siteId:'preview-'+region.id,huntRole:region.role,
      lateralPorts:region.ports.map(p=>p.direction).filter(d=>d==='east'||d==='west')}));
    assert.equal(graph.region(region.id).sourceHash,expected.hash);
  }
  for(const link of graph.layout.links){
    const seam=graph.link(link.id);
    assert.equal(seam.fromId,link.fromId);
    assert.equal(seam.toId,link.toId);
    assert.ok(seam.maximumRouteGradeTenths<=5);
  }
  assert.throws(()=>createWorldSiteRecipe({...recipe,huntRole:'unknown'}),/Invalid authored Hunt region role/);
  assert.throws(()=>createWorldSiteRecipe({...recipe,kind:'mountain-pass',lateralPorts:[],huntRole:'horde'}),/Invalid authored Hunt region role/);
});
