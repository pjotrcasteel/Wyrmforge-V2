import test from 'node:test';
import assert from 'node:assert/strict';
import { composeRoadBoundaryAprons } from '../src/world-generation/road-boundary-apron.mjs';
import { selectRoadCell } from '../src/world-generation/road-footprint.mjs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';

const kinds=['wet-forest','forest-highland','mountain-pass'];
const seeds=[7,19,101,267];
const halfMetre=5;
const entrance={x:0,z:19},exit={x:0,z:-20};
const key=point=>point.x+','+point.z;

test('road boundary apron joins authored road endpoints to actual site edges and painted shoulders',()=>{
  const road={id:'entry-to-exit',width:2,
    roadProfile:{kind:'dirt',material:2,nominalCutFraction:0.1},
    nodes:[{x:0,z:18},{x:-2,z:10},{x:1,z:2},{x:3,z:-7},{x:0,z:-18}]};
  const routes=[road];
  const unchanged=JSON.stringify(routes);
  const aprons=composeRoadBoundaryAprons({radius:20,routes});
  assert.equal(aprons.length,2);
  const entry=aprons.find(apron=>apron.end==='entry');
  const departure=aprons.find(apron=>apron.end==='exit');
  assert.deepEqual(entry.boundary,entrance);
  assert.deepEqual(departure.boundary,exit);
  assert.ok(entry.shoulders.length>=3);
  assert.ok(departure.shoulders.length>=2);
  for(const apron of aprons) {
    assert.equal(apron.routeId,road.id);
    assert.equal(apron.schema,'wyrmforge.road-boundary-apron.v1');
    for(const pair of apron.shoulders) {
      for(const point of pair.nodes) {
        assert.equal(selectRoadCell(point.x,point.z,routes)?.route,road,
          'no apron segment may cut or grade the surrounding grass');
        assert.ok(point.x>=-20 && point.x<20);
        assert.ok(point.z>=-20 && point.z<20);
      }
    }
  }
  assert.equal(JSON.stringify(routes),unchanged,'authored map kind remains immutable');
});

test('an already edge-reaching road never produces a zero-length extension',()=>{
  const routes=[{
    id:'already-on-border',width:2,
    roadProfile:{kind:'dirt',material:2,nominalCutFraction:0.1},
    nodes:[{x:0,z:19},{x:0,z:0},{x:0,z:-20}]
  }];
  assert.deepEqual(composeRoadBoundaryAprons({radius:20,routes}),[]);
});

test('all three map kinds grade and physically render entrance and exit to the map edge',()=>{
  for(const kind of kinds)for(const seed of seeds) {
    // Identical recipe IDs to the real iPhone viewer, not a synthetic fixture.
    const generated=generateWorldSite(createWorldSiteRecipe({
      regionId:'starter-region',siteId:'preview-'+kind,
      encounterId:'preview-001',kind,seed,chunkEdge:16
    }));
    const road=generated.layout.routes.find(r=>r.id==='entry-to-exit');
    const grades=generated.layout.roadGrades;
    assert.equal(generated.generatorVersion,'worldgen-v2.6.1');
    assert.ok(grades.maximumGradeTenths<=halfMetre);
    assert.equal(grades.boundaryAprons.length,2);
    assert.deepEqual(grades.boundaryAprons.find(a=>a.end==='entry').boundary,
      entrance);
    assert.deepEqual(grades.boundaryAprons.find(a=>a.end==='exit').boundary,
      exit);
    const centers=new Map(grades.centers.map(point=>[key(point),point.topTenths]));
    for(const point of [entrance,exit,{x:0,z:18},{x:0,z:-19},
      {x:-1,z:19},{x:1,z:19}]) {
      assert.ok(centers.has(key(point)),kind+' seed '+seed+
        ' must grade the entire painted entry/exit throat: '+key(point));
      assert.equal(selectRoadCell(point.x,point.z,generated.layout.routes)?.route.id,
        road.id,'apron must stay inside painted road');
    }
    for(const [a,b] of [
      [entrance,{x:0,z:18}], [exit,{x:0,z:-19}],
      [entrance,{x:-1,z:19}], [entrance,{x:1,z:19}],
      [{x:0,z:18},{x:-1,z:18}],[{x:0,z:18},{x:1,z:18}]
    ]) {
      assert.ok(centers.has(key(a)) && centers.has(key(b)));
      assert.ok(Math.abs(centers.get(key(a))-centers.get(key(b))<=halfMetre,
        kind+' seed '+seed+' has an oversized block lip at '+key(a)+
        ' / '+key(b));
    }
    const loader=new V2ExternalTerrainLoader(generated.definition);
    try {
      while(!loader.progress.done) loader.loadStep(4096);
      const {world}=loader.terrain;
      for(const point of [entrance,exit,{x:-1,z:19},{x:1,z:19}]) {
        const top=centers.get(key(point))/10;
        assert.equal(world.materialAtPoint(point.x+0.5,top-0.05,point.z+0.5),
          road.roadProfile.material,'physical road top must match brown/stone material');
        assert.equal(world.materialAtPoint(point.x+0.5,top+0.05,point.z+0.5),0,
          'no leftover 1m voxel face may remain above the visible 10cm apron');
      }
      assert.equal(generated.layout.escapeAudit.ready,true);
      assert.equal(generated.layout.combatFlow.ready,true);
      assert.equal(generated.layout.topology.reachable,true);
    } finally {loader.unload();}
  }
});
