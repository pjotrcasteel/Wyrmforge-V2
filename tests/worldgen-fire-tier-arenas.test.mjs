import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';
import { composeVolcanicTerrain } from '../src/world-generation/volcanic-terrain-grammar.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';

const kinds=['scorched-approach','mini-boss-arena','wyrm-lair'];
const recipe=(kind,seed=7,corruption=0.9)=>createWorldSiteRecipe({
  regionId:'starter-region',siteId:'preview-'+kind,
  encounterId:'preview-001',kind,seed,corruption,chunkEdge:16
});

test('miniboss and Wyrm are different dedicated site types, not a corruption threshold',()=>{
  const approach=generateWorldSite(recipe('scorched-approach',7,1));
  const mini=generateWorldSite(recipe('mini-boss-arena',7,0));
  const wyrm=generateWorldSite(recipe('wyrm-lair',7,0));
  assert.equal(approach.layout.dedicatedArena,null);
  assert.equal(mini.layout.dedicatedArena.kind,'mini-boss');
  assert.equal(wyrm.layout.dedicatedArena.kind,'wyrm');
  assert.equal(mini.layout.dedicatedArena.floorRadius,7);
  assert.equal(wyrm.layout.dedicatedArena.floorRadius,8);
  assert.ok(mini.layout.dedicatedArena.raisedQuadrants>=2);
  assert.ok(wyrm.layout.dedicatedArena.raisedQuadrants>=2);
  assert.notEqual(mini.layout.dedicatedArena.center.y,
    wyrm.layout.dedicatedArena.center.y);
  assert.notDeepEqual(mini.definition.runs,wyrm.definition.runs);
  for(const site of [mini,wyrm]) {
    assert.equal(site.layout.dedicatedArena.ready,true);
    assert.equal(site.layout.encounter.ready,true);
    assert.equal(site.layout.topology.reachable,true);
    assert.equal(site.layout.roadGrades.maximumGradeTenths<=5);
    assert.ok(site.layout.dedicatedArena.usableFloorCells>=75);
    assert.equal(site.layout.volcanicTerrain.lavaSimulationImplemented,false);
  }
});

test('authored Fire-tier sites preserve routes and physical topology across seeds',()=>{
  for(const kind of kinds)for(const seed of [7,19,101,267]) {
    const first=generateWorldSite(recipe(kind,seed));
    const second=generateWorldSite(recipe(kind,seed));
    assert.equal(first.generatorVersion,'worldgen-v2.7.1');
    assert.equal(first.hash,second.hash);
    assert.deepEqual(first.definition,second.definition);
    assert.ok(first.layout.topology.reachable);
    assert.ok(first.layout.encounter.ready);
    assert.ok(first.layout.roads.ready);
    assert.ok(first.layout.roadGrades.maximumGradeTenths<=5);
    assert.equal(first.layout.volcanicTerrain.schema,'wyrmforge.volcanic-terrain.v1');
    assert.ok(first.layout.volcanicTerrain.fissureCells>0,
      kind+' seed '+seed+' should create physical cuts outside required routes');
    assert.ok(first.layout.volcanicTerrain.physicalFissures.length>=1);
    if(kind==='wyrm-lair') {
      assert.ok(first.layout.volcanicTerrain.lavaFallAnchors.length>=1);
    }
    const loader=new V2ExternalTerrainLoader(first.definition);
    try {
      while(!loader.progress.done)loader.loadStep(4096);
      const world=loader.terrain.world;
      for(const fall of first.layout.volcanicTerrain.lavaFallAnchors) {
        assert.ok(fall.rimY-fall.footY>=3);
        assert.equal(fall.simulation,'unimplemented');
        assert.notEqual(world.get(fall.x,fall.rimY-1,fall.z),0,
          'a lava fall anchor requires a real solid cliff above it');
      }
      assert.ok(world.chunkCount>1);
    } finally {loader.unload();}
  }
});

test('volcanic fissures cut actual stone but cannot carve a mandatory fight floor',()=>{
  const radius=20;
  const heights=new Int16Array(40*40).fill(8);
  const surfaces=new Uint8Array(40*40).fill(3);
  const plan={
    recipe:{radius,corruption:1},
    volcanicTerrain:{stage:'lair'},
    routes:[{
      id:'entry-to-exit',width:2,
      roadProfile:{kind:'basalt',material:3,nominalCutFraction:0.2},
      nodes:[{x:0,z:18},{x:0,z:-18}]
    }],
    escapeRoutes:[],flowLinks:[],
    combatSpaces:[{id:'boss-fighting-floor',x:0,z:0,radius:8}],
    clearings:[{id:'boss-clearing',x:0,z:0,radius:5}],
    approaches:[],
    landmarks:[]
  };
  const result=composeVolcanicTerrain({plan,seed:7,heights,surfaces});
  assert.ok(result.fissureCells>=1);
  const i=(x,z)=>(z+20)*40+x+20;
  assert.equal(heights[i(0,0)],8,'the full boss floor must remain intact');
  assert.equal(heights[i(0,14)],8,'the mandatory entry must remain intact');
  const cut=[...heights].filter(height=>height<8).length;
  assert.equal(cut,result.fissureCells);
  assert.ok(cut>0);
  assert.ok([...surfaces].every(material=>material===3));
});
