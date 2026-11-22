import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite, createDefaultWorldGeneratorV2 } from '../src/world-generation/index.mjs';
import { MapKindRegistry } from '../src/world-generation/map-kinds.mjs';
import {
  gradeEscapeRoutes,rasterizeEscapeRoute
} from '../src/world-generation/escape-route-geometry.mjs';
import {
  specifyEscapeRoutes, ESCAPE_ROUTE_AUDIT_SCHEMA
} from '../src/world-generation/escape-route-specification.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';

const kinds=['wet-forest','forest-highland','mountain-pass'];
const index=(radius,x,z)=>(z+radius)*radius*2+(x+radius);
const recipe=(kind,seed=7,chunkEdge=16)=>createWorldSiteRecipe({
  kind,seed,chunkEdge,siteId:'escape-test-'+kind,
  regionId:'combat-region',encounterId:'horde-escape'
});

test('three authored map-kind Strategies create geographically different traversable escape loops',()=>{
  const styles=new Set();
  const routePatterns=new Set();
  for(const kind of kinds)for(const seed of [7,19,101,267]) {
    const site=generateWorldSite(recipe(kind,seed));
    const audit=site.layout.escapeAudit;
    assert.equal(audit.schema,ESCAPE_ROUTE_AUDIT_SCHEMA);
    assert.equal(audit.ready,true);
    assert.equal(audit.routeCount,2);
    assert.equal(site.layout.escapeRoutes.length,2);
    assert.deepEqual(audit.routes.map(route=>route.side),['west','east']);
    assert.ok(audit.uniqueInteriorCells>=60);
    assert.ok(audit.routes.every(route=>route.cells>=35 && route.maxStep<=1));
    assert.ok(site.layout.topology.reachable);
    assert.ok(site.layout.encounter.ready,'no escape change may break the fighting floor');
    assert.ok(site.layout.encounter.combatSpaces[0].walkableCells>100);
    for(const route of site.layout.escapeRoutes) {
      const path=rasterizeEscapeRoute(route.nodes);
      assert.equal(route.nodes[0].z,15);
      assert.equal(route.nodes.at(-1).z,-15);
      assert.ok(path.length>=35);
      styles.add(route.style);
    }
    if(seed===7) routePatterns.add(JSON.stringify(site.layout.escapeRoutes));
    assert.equal(site.hash,generateWorldSite(recipe(kind,seed)).hash);
  }
  assert.equal(styles.size,3,'forest, foothills and mountains need different escape identities');
  assert.equal(routePatterns.size,3,'map kinds may not simply recolor identical detour geometry');
});

test('canonical Voxel V2 handoff includes two walkable paths even across 16/32 chunk boundaries',()=>{
  for(const kind of kinds)for(const edge of [16,32]) {
    const site=generateWorldSite(recipe(kind,7,edge));
    const loader=new V2ExternalTerrainLoader(site.definition);
    try {
      let steps=0;
      while(!loader.progress.done) {
        loader.loadStep(2048);
        if(++steps>300) throw new Error('Loader stalled');
      }
      const world=loader.terrain.world;
      const surface=(x,z)=>{
        for(let y=30;y>=-3;y--)if(world.get(x,y,z)!==0)return y;
        throw new Error('Missing generated solid surface');
      };
      for(const route of site.layout.escapeRoutes) {
        const path=rasterizeEscapeRoute(route.nodes);
        let previous=null;
        for(const point of path) {
          const actual=surface(point.x,point.z);
          if(previous!==null) {
            assert.ok(Math.abs(actual-previous)<=1,
              kind+' '+route.id+' contains an impossible gameplay step');
          }
          previous=actual;
        }
      }
      assert.ok(world.chunkCount>4);
    } finally {
      loader.unload();
    }
  }
});

test('grading fixes genuinely steep detours without changing the generated world outside corridors',()=>{
  const radius=20;
  const grid=new Int16Array(40*40);
  for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
    grid[index(radius,x,z)]=z<0?14:4;
  }
  const original=grid.slice();
  const west={
    id:'west-detour',side:'west',style:'test-terrace',width:2,
    nodes:[{x:0,z:15},{x:-10,z:10},{x:-10,z:-10},{x:0,z:-15}]
  };
  const east={
    id:'east-detour',side:'east',style:'test-terrace',width:2,
    nodes:[{x:0,z:15},{x:10,z:10},{x:10,z:-10},{x:0,z:-15}]
  };
  const floor={id:'center',x:0,z:0,radius:6};
  assert.throws(()=>specifyEscapeRoutes({
    radius,heights:grid,escapeRoutes:[west,east],combatSpaces:[floor]
  }),/impassable/);
  const result=gradeEscapeRoutes({radius,heights:grid,escapeRoutes:[west,east]});
  assert.equal(result.routes,2);
  assert.ok(result.cells>60);
  const validated=specifyEscapeRoutes({
    radius,heights:grid,escapeRoutes:[west,east],combatSpaces:[floor]
  });
  assert.equal(validated.ready,true);
  assert.equal(grid[index(radius,0,15)],original[index(radius,0,15)]);
  assert.equal(grid[index(radius,0,-15)],original[index(radius,0,-15)]);
  assert.equal(grid[index(radius,19,19)],original[index(radius,19,19)]);
  assert.equal(grid[index(radius,-19,-19)],original[index(radius,-19,-19)]);
});

test('unplanned and invalid escape routes are rejected before a world is adapted',()=>{
  const radius=20,heights=new Int16Array(40*40);
  assert.equal(specifyEscapeRoutes({radius,heights}).routeCount,0,
    'an explicitly custom Strategy can opt out of horde escape rules');
  const a={id:'west',side:'west',style:'woodland-loop',
    nodes:[{x:0,z:15},{x:-11,z:0},{x:0,z:-15}]};
  const b={id:'east',side:'east',style:'woodland-loop',
    nodes:[{x:0,z:15},{x:11,z:0},{x:0,z:-15}]};
  assert.equal(specifyEscapeRoutes({
    radius,heights,escapeRoutes:[a,b],
    combatSpaces:[{id:'central',x:0,z:0,radius:6}]
  }).routeCount,2);
  assert.throws(()=>specifyEscapeRoutes({
    radius,heights,escapeRoutes:[a]
  }),/east and west/);
  assert.throws(()=>specifyEscapeRoutes({
    radius,heights,escapeRoutes:[a,{...b,nodes:[...b.nodes.slice(0,-1),{x:2,z:-15}]}]
  }),/share entry and rejoin anchors/);
  assert.throws(()=>rasterizeEscapeRoute([{x:1,z:1},{x:1,z:1}]),/zero-length/);
});

test('replacing the generator Strategy still works without bypassing the terrain adapter',()=>{
  const registry=new MapKindRegistry([]);
  registry.register({kind:'lake-arena',compose(builder) {
    builder.setTerrain({elevation:()=>4,exposedStone:0.95});
    builder.addRoute('entry-to-exit',[{x:0,z:18},{x:0,z:-18}],2);
    builder.addClearing({id:'center',x:0,z:0,radius:5});
    builder.addLandmark({id:'tower',kind:'tower',x:8,z:0,clearance:2});
    // Other map kinds are not forced into a horde-layout implementation.
  }});
  const result=createDefaultWorldGeneratorV2({registry}).generate(recipe('lake-arena'));
  assert.equal(result.layout.escapeAudit.ready,true);
  assert.equal(result.layout.escapeAudit.routeCount,0);
  assert.equal(result.definition.schema,'voxel-v2.terrain-initialization.v1');
});

test('escape grading and Specification have no renderer, physics, enemy or Voxel dependencies',()=>{
  for(const name of [
    'escape-route-geometry.mjs','escape-route-specification.mjs'
  ]) {
    const src=readFileSync(new URL('../src/world-generation/'+name,import.meta.url),'utf8');
    assert.doesNotMatch(src,/from ['"][^'"]*(?:webgl|voxel-world|physics|enemy|world-objects)/);
    assert.doesNotMatch(src,/Math\.random\(/);
  }
});
