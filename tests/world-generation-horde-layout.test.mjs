import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { MapKindRegistry } from '../src/world-generation/map-kinds.mjs';
import { generateWorldSite, createDefaultWorldGeneratorV2 } from '../src/world-generation/index.mjs';
import { specifyEncounterSpaces } from '../src/world-generation/encounter-space-specification.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';

const kinds=['wet-forest','forest-highland','mountain-pass'];
const recipe=(kind,seed=7,chunkEdge=16)=>createWorldSiteRecipe({
  kind,seed,chunkEdge,siteId:'horde-preview-'+kind,
  regionId:'horde-region',encounterId:'horde-test'
});

test('every carefully crafted map kind reserves actual kiting space and four enemy approach directions',()=>{
  for(const kind of kinds)for(const seed of [7,19,101,267]) {
    const site=generateWorldSite(recipe(kind,seed));
    assert.equal(site.layout.encounter.schema,'wyrmforge.encounter-space-audit.v1');
    assert.equal(site.layout.encounter.ready,true);
    assert.equal(site.layout.combatSpaces.length,1);
    assert.equal(site.layout.approaches.length,4);
    const audit=site.layout.encounter.combatSpaces[0];
    assert.equal(audit.ready,true);
    assert.equal(audit.ingressCount,4);
    assert.deepEqual(audit.ingressDirections,['east','north','south','west']);
    assert.ok(audit.floorCells>=100);
    assert.ok(audit.walkableCells/audit.floorCells>=0.8);
    assert.equal(site.layout.topology.reachable,true);
    assert.equal(site.layout.topology.entry.z,18);
    assert.equal(site.layout.topology.exit.z,-18);
    assert.ok(site.definition.totalCells>5000);
    const second=generateWorldSite(recipe(kind,seed));
    assert.deepEqual(site.layout.encounter,second.layout.encounter);
    assert.equal(site.hash,second.hash);
  }
});

test('a hidden discovery site is an actual buried terrain location, not a chest spawned by worldgen',()=>{
  for(const kind of kinds) {
    const result=generateWorldSite(recipe(kind));
    assert.equal(result.layout.discoveryCandidates.length,1);
    assert.equal(result.layout.encounter.buriedCandidates,1);
    const candidate=result.layout.discoveryCandidates[0];
    assert.equal(candidate.kind,'buried-cache');
    assert.equal(candidate.coverDepth,2);
    assert.equal(candidate.buriedY,candidate.surfaceY-candidate.coverDepth);
    assert.ok(!Object.hasOwn(candidate,'reward'));
    assert.ok(!Object.hasOwn(candidate,'chest'));
    const loader=new V2ExternalTerrainLoader(result.definition);
    try {
      let steps=0;
      while(!loader.progress.done) {
        loader.loadStep(1024);
        if(++steps>300) throw new Error('Loader hung');
      }
      const {world,port}=loader.terrain;
      assert.notEqual(world.get(candidate.x,candidate.surfaceY,candidate.z),0);
      assert.notEqual(world.get(candidate.x,candidate.buriedY,candidate.z),0);
      const revision=world.revision;
      const edit=port.apply({
        id:'excavate-horde-test',type:'carve-sphere',
        x:candidate.x,y:candidate.surfaceY,z:candidate.z,
        radius:2,expectedRevision:revision
      });
      assert.ok(edit.removedVoxels>0,'a player spell can excavate the site');
      assert.equal(world.get(candidate.x,candidate.surfaceY,candidate.z),0);
    } finally {
      loader.unload();
    }
  }
});

test('invalid horde geometries are rejected before the terrain adapter receives a site',()=>{
  const heights=new Int16Array(40*40);
  const sample={
    radius:20,heights,
    combatSpaces:[{id:'center',x:0,z:0,radius:6}],
    approaches:[
      {id:'north',x:0,z:-12,combatSpaceId:'center'},
      {id:'east',x:12,z:0,combatSpaceId:'center'}
    ]
  };
  assert.throws(()=>specifyEncounterSpaces(sample),/multiple enemy ingress/);
  const wrongDirections={
    ...sample,approaches:[
      {id:'one',x:12,z:0,combatSpaceId:'center'},
      {id:'two',x:13,z:1,combatSpaceId:'center'},
      {id:'three',x:14,z:2,combatSpaceId:'center'}
    ]
  };
  assert.throws(()=>specifyEncounterSpaces(wrongDirections),/too concentrated/);
  const steep=heights.slice();
  for(let z=-4;z<=4;z++)for(let x=-4;x<=4;x++)steep[(z+20)*40+x+20]=15;
  assert.throws(()=>specifyEncounterSpaces({
    ...sample,heights:steep,
    approaches:[...sample.approaches,{id:'west',x:-12,z:0,combatSpaceId:'center'}]
  }),/too steep/);
  assert.throws(()=>specifyEncounterSpaces({
    ...sample,approaches:[...sample.approaches,{id:'west',x:-12,z:0,combatSpaceId:'center'}],
    discoveryCandidates:[{id:'invalid',x:1,z:1,coverDepth:2}]
  }),/overlaps active combat/);
});

test('custom map-kind Strategy can declare its own combat footprint without adding engine switches',()=>{
  const registry=new MapKindRegistry();
  registry.register({kind:'battle-crater',compose(builder) {
    builder.setTerrain({elevation:()=>4,exposedStone:0.95});
    builder.addRoute('entry-to-exit',[{x:0,z:18},{x:0,z:-18}],2);
    builder.addClearing({id:'glade',x:0,z:0,radius:5});
    builder.addLandmark({id:'obelisk',kind:'obelisk',x:6,z:0,clearance:2});
    builder.addCombatSpace({id:'battle-floor',x:0,z:0,radius:6});
    for(const approach of [
      {id:'north',x:0,z:-13},{id:'west',x:-13,z:0},
      {id:'south',x:0,z:13},{id:'east',x:13,z:0}
    ]) builder.addApproach({...approach,width:3,combatSpaceId:'battle-floor'});
    builder.addDiscoveryCandidate({id:'secret',x:-11,z:-12,coverDepth:2});
  }});
  const site=createDefaultWorldGeneratorV2({registry}).generate(recipe('battle-crater'));
  assert.equal(site.layout.encounter.ready,true);
  assert.equal(site.layout.approaches.length,4);
  assert.equal(site.layout.discoveryCandidates.length,1);
});

test('encounter design and the potential chest site never import enemy, loot or voxel internals',()=>{
  for(const module of ['map-kinds','site-plan-builder','encounter-space-specification','world-generator']) {
    const code=readFileSync(new URL('../src/world-generation/'+module+'.mjs',import.meta.url),'utf8');
    assert.doesNotMatch(code,/from ['"][^'"]*(?:enemy|loot|chest|objects|voxel-world|webgl)/i);
    assert.doesNotMatch(code,/Math\.random\(/);
  }
});
