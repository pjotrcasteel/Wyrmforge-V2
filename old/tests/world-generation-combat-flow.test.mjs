import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import {
  generateWorldSite, createDefaultWorldGeneratorV2
} from '../src/world-generation/index.mjs';
import { MapKindRegistry } from '../src/world-generation/map-kinds.mjs';
import { rasterizeEscapeRoute } from '../src/world-generation/escape-route-geometry.mjs';
import {
  composeCombatFlow
} from '../src/world-generation/combat-flow-geometry.mjs';
import {
  specifyCombatFlow, COMBAT_FLOW_SCHEMA
} from '../src/world-generation/combat-flow-specification.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';

const kinds=['wet-forest','forest-highland','mountain-pass'];
const seeds=[7,19,101,267];
const input=(kind,seed=7,chunkEdge=16)=>createWorldSiteRecipe({
  kind,seed,chunkEdge,regionId:'flow-region',
  siteId:'flow-'+kind,encounterId:'flow-test'
});
const index=(r,x,z)=>(z+r)*2*r+x+r;

test('each authored kind produces two distinct accessible maneuver spaces and wide paths',()=>{
  const identities=new Set(),layouts=new Set();
  for(const kind of kinds)for(const seed of seeds) {
    const generated=generateWorldSite(input(kind,seed));
    const {combatFlow,maneuverPockets,flowLinks}=generated.layout;
    assert.equal(combatFlow.schema,COMBAT_FLOW_SCHEMA);
    assert.equal(combatFlow.ready,true);
    assert.equal(combatFlow.pocketCount,2);
    assert.equal(combatFlow.linkCount,2);
    assert.equal(maneuverPockets.length,2);
    assert.equal(flowLinks.length,2);
    assert.ok(combatFlow.wideCells>=60);
    assert.equal(new Set(maneuverPockets.map(p=>p.kind)).size,2);
    assert.ok(combatFlow.pockets.every(p=>p.walkableCells/p.floorCells>=0.9));
    assert.ok(combatFlow.links.every(link=>
      link.minimumSideNeighbors>=3 && link.maxStep<=1 &&
      link.width>=2 && link.wideCells>=25));
    assert.equal(generated.layout.encounter.ready,true);
    assert.equal(generated.layout.escapeAudit.ready,true);
    assert.equal(generated.layout.topology.reachable,true);
    assert.equal(generated.hash,generateWorldSite(input(kind,seed)).hash);
    identities.add(kind+':'+maneuverPockets.map(p=>p.kind).join(','));
    if(seed===7)layouts.add(JSON.stringify(maneuverPockets)+JSON.stringify(flowLinks));
  }
  assert.equal(identities.size,3,'each biome needs its own tactical layout identity');
  assert.equal(layouts.size,3,'the maps must not merely reskin identical pockets');
});

test('actual Voxel V2 output preserves broad links and walkable pockets for both chunk pitches',()=>{
  for(const kind of kinds)for(const edge of [16,32]) {
    const generated=generateWorldSite(input(kind,7,edge));
    const loader=new V2ExternalTerrainLoader(generated.definition);
    try {
      let iterations=0;
      while(!loader.progress.done) {
        loader.loadStep(2048);
        if(++iterations>300)throw new Error('Terrain loader stalled');
      }
      const world=loader.terrain.world;
      const surface=(x,z)=>{
        for(let y=30;y>=-3;y--)if(world.get(x,y,z)!==0)return y;
        throw new Error('Expected a real terrain column');
      };
      for(const pocket of generated.layout.maneuverPockets) {
        const target=surface(pocket.x,pocket.z);
        let walkable=0;
        for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++) {
          if(Math.hypot(dx,dz)>2)continue;
          if(Math.abs(surface(pocket.x+dx,pocket.z+dz)-target)<=1)walkable++;
        }
        assert.ok(walkable>=12,'a real accessible pocket must exist, not metadata');
      }
      for(const link of generated.layout.flowLinks) {
        let previous=null;
        for(const p of rasterizeEscapeRoute(link.nodes)) {
          const actual=surface(p.x,p.z);
          if(previous!==null) assert.ok(Math.abs(actual-previous)<=1,
            kind+' has an impassable real circulation step: '+link.id);
          previous=actual;
          let width=0;
          for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            if(Math.abs(surface(p.x+dx,p.z+dz)-actual)<=1)width++;
          }
          assert.ok(width>=3,'a corridor must have usable sideways movement');
        }
      }
      assert.ok(world.chunkCount>4);
    } finally {
      loader.unload();
    }
  }
});

test('geometry and Specification reject narrow, blocked or unconnected corridors',()=>{
  const radius=20;
  const heights=new Int16Array(40*40).fill(4);
  const hub={id:'center',x:0,z:0,radius:7};
  const pockets=[
    {id:'a',kind:'grove',x:-10,z:9,radius:4},
    {id:'b',kind:'ridge',x:10,z:-9,radius:4}
  ];
  const links=[
    {id:'a-link',kind:'grove',pocketId:'a',width:2,
      nodes:[{x:0,z:0},{x:-5,z:5},{x:-10,z:9}]},
    {id:'b-link',kind:'ridge',pocketId:'b',width:3,
      nodes:[{x:0,z:0},{x:5,z:-5},{x:10,z:-9}]}
  ];
  const spec={radius,heights,combatSpaces:[hub],
    maneuverPockets:pockets,flowLinks:links};
  assert.equal(specifyCombatFlow(spec).ready,true);
  assert.throws(()=>specifyCombatFlow({
    ...spec,flowLinks:[{...links[0],width:1},links[1]]
  }),/wide terrain circulation/);
  const obstructed=heights.slice();
  obstructed[index(radius,-6,5)]=20;
  obstructed[index(radius,-6,4)]=20;
  obstructed[index(radius,-6,6)]=20;
  assert.throws(()=>specifyCombatFlow({...spec,heights:obstructed}),
    /impassable rise|too narrow/);
  assert.throws(()=>specifyCombatFlow({
    ...spec,flowLinks:[links[0]]
  }),/distinct maneuver pockets/);
  assert.throws(()=>specifyCombatFlow({
    ...spec,maneuverPockets:[pockets[0],{...pockets[1],kind:'grove'}]
  }),/same combat identity/);
  const shaped=heights.slice();
  const audit=composeCombatFlow({...spec,heights:shaped});
  assert.equal(audit.pockets,2);
  assert.equal(audit.links,2);
  assert.equal(specifyCombatFlow({...spec,heights:shaped}).ready,true);
});

test('custom Strategy can omit maneuver flow without altering generator, adapter or Voxel V2',()=>{
  const registry=new MapKindRegistry([]);
  registry.register({kind:'quiet-ruin',compose(builder) {
    builder.setTerrain({elevation:()=>4,exposedStone:0.9});
    builder.addRoute('entry-to-exit',[{x:0,z:18},{x:0,z:-18}],2);
    builder.addClearing({id:'clearing',x:0,z:0,radius:4});
    builder.addLandmark({id:'ruin',kind:'ruin',x:8,z:0,clearance:3});
  }});
  const generated=createDefaultWorldGeneratorV2({registry}).generate(input('quiet-ruin'));
  assert.equal(generated.layout.combatFlow.ready,true);
  assert.equal(generated.layout.combatFlow.pocketCount,0);
  assert.equal(generated.definition.schema,'voxel-v2.terrain-initialization.v1');
});

test('combat flow is separate from loot, spawns, runtime navigation and renderer',()=>{
  const modules=['combat-flow-geometry','combat-flow-specification'];
  for(const module of modules) {
    const source=readFileSync(new URL(
      '../src/world-generation/'+module+'.mjs',import.meta.url),'utf8');
    assert.doesNotMatch(source,/from ['"][^'"]*(?:voxel-world|webgl|enemy|loot|physics)/i);
    assert.doesNotMatch(source,/Math\.random\(/);
  }
});
