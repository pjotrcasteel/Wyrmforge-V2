import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite, createDefaultWorldGeneratorV2 } from '../src/world-generation/index.mjs';
import { MapKindRegistry } from '../src/world-generation/map-kinds.mjs';
import { composeRoadSurfaces } from '../src/world-generation/road-surface-geometry.mjs';
import { specifyRoadSurfaces } from '../src/world-generation/road-surface-specification.mjs';
import { classifySurfaceStrata } from '../src/world-generation/terrain-strata.mjs';
import { rasterizeEscapeRoute } from '../src/world-generation/escape-route-geometry.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';

const kinds=['wet-forest','forest-highland','mountain-pass'];
const index=(radius,x,z)=>(z+radius)*radius*2+x+radius;
const recipe=(kind,seed=7,chunkEdge=16)=>createWorldSiteRecipe({
  kind,seed,chunkEdge,siteId:'road-'+kind,
  regionId:'road-region',encounterId:'horde-road'
});
function load(definition) {
  const loader=new V2ExternalTerrainLoader(definition);
  let steps=0;
  while(!loader.progress.done) {
    loader.loadStep(2048);
    if(++steps>300)throw new Error('Road test loader stalled');
  }
  return loader;
}
function surface(world,x,z) {
  for(let y=30;y>=-3;y--)if(world.get(x,y,z)!==0) {
    return {y,material:world.get(x,y,z)};
  }
  throw new Error('Expected solid road terrain');
}

test('Roads remain continuous through the actual combat arena across biome kinds and seeds',()=>{
  const nominalFractions=[0.1,0.2,0.3];
  for(const [k,kind] of kinds.entries())for(const seed of [7,19,101,267]) {
    const generated=generateWorldSite(recipe(kind,seed));
    const {roads,routes,geology}=generated.layout;
    assert.equal(generated.generatorVersion,'worldgen-v2.5.0');
    assert.equal(roads.schema,'wyrmforge.road-surface-audit.v1');
    assert.equal(roads.ready,true);
    assert.equal(roads.throughArena,true);
    assert.equal(roads.routes.length,2);
    assert.ok(roads.profiledCells>10);
    assert.ok(roads.paintedCells>roads.profiledCells);
    assert.equal(roads.physicalCutVoxels,0);
    assert.ok(roads.routes[0].combatCells>=8);
    assert.ok(roads.routes.every(item=>item.continuous &&
      item.materialCells===item.pathCells && item.maxStep<=1));
    assert.equal(routes[0].roadProfile.nominalCutFraction,nominalFractions[k]);
    assert.equal(routes[0].roadProfile.material,kind==='mountain-pass'?3:2);
    assert.equal(roads.routes[0].currentPhysicalCutVoxels,0);
    assert.equal(roads.routes[0].visualCutTenths,k+1);
    assert.equal(geology.continuousBedrockBelowStone,true);
    assert.equal(geology.soilDepth,kind==='mountain-pass'?1:2);
    assert.equal(generated.hash,generateWorldSite(recipe(kind,seed)).hash);
    assert.ok(generated.layout.escapeAudit.ready);
    assert.ok(generated.layout.combatFlow.ready);
    assert.ok(generated.layout.encounter.ready);
    assert.ok(generated.layout.topology.reachable);
  }
});

test('real voxel terrain contains an uninterrupted dirt/stone road through both sides of each arena',()=>{
  for(const kind of kinds)for(const edge of [16,32]) {
    const generated=generateWorldSite(recipe(kind,7,edge));
    const loader=load(generated.definition);
    try {
      const {world}=loader.terrain;
      const road=generated.layout.routes.find(route=>route.id==='entry-to-exit');
      const path=rasterizeEscapeRoute(road.nodes);
      let insideArena=0,previous=null;
      for(const point of path) {
        const top=surface(world,point.x,point.z);
        assert.equal(top.material,road.roadProfile.material,
          'The physical main road must not turn to grass inside the arena');
        if(previous!==null) assert.ok(Math.abs(top.y-previous.y)<=1);
        previous=top;
        if(Math.hypot(point.x-1,point.z-2)<=7)insideArena++;
      }
      assert.ok(insideArena>=8);
      assert.equal(loader.terrain.ledger.editRevision,0);
      assert.ok(world.chunkCount>4);
    } finally {
      loader.unload();
    }
  }
});

test('road compositor preserves walkable voxel geometry and marks a fractional surface profile',()=>{
  const radius=20;
  const heights=new Int16Array(40*40).fill(10);
  const surfaces=new Uint8Array(40*40).fill(1);
  const profile={kind:'test-track',nominalCutFraction:0.2,
    material:2,cutVoxels:0};
  const routes=[{id:'entry-to-exit',width:2,roadProfile:profile,
    nodes:[{x:0,z:18},{x:0,z:-18}]}];
  const combatSpaces=[{id:'central-arena',x:0,z:0,radius:7}];
  const result=composeRoadSurfaces({radius,heights,surfaces,routes,combatSpaces});
  assert.equal(result.processedRoutes,1);
  assert.ok(result.combatRoadCells>=14);
  assert.ok(result.profiledCells>=35);
  assert.equal(result.physicalCutVoxels,0);
  assert.equal(heights[index(radius,0,0)],10,
    'surface adapter must not excavate an entire voxel from the road');
  assert.equal(heights[index(radius,3,0)],10,
    'surrounding shoulder retains the original collision surface');
  assert.equal(surfaces[index(radius,0,0)],2);
  assert.equal(surfaces[index(radius,0,-12)],2);
  const audit=specifyRoadSurfaces({
    radius,heights,surfaces,routes,combatSpaces,roadWork:result
  });
  assert.equal(audit.throughArena,true);
  assert.equal(audit.routes[0].maxStep,0);
  assert.equal(audit.routes[0].visualCutTenths,2);
  assert.equal(audit.routes[0].materialCells,audit.routes[0].pathCells);
  surfaces[index(radius,0,0)]=1;
  assert.throws(()=>specifyRoadSurfaces({
    radius,heights,surfaces,routes,combatSpaces,roadWork:result
  }),/visually stops/);
});

test('Mountain Pass rock outcrops never contain unsupported brown soil sandwiches',()=>{
  for(const seed of [7,19,101,267]) {
    const generated=generateWorldSite(recipe('mountain-pass',seed));
    const loader=load(generated.definition);
    try {
      const {world}=loader.terrain;
      let rockColumns=0;
      for(let z=-20;z<20;z++)for(let x=-20;x<20;x++) {
        const top=surface(world,x,z);
        if(top.material!==3) continue;
        rockColumns++;
        for(let depth=1;depth<=Math.min(6,top.y+3);depth++) {
          assert.equal(world.get(x,top.y-depth,z),3,
            'rock outcrop cannot have a brown soil layer beneath a stone cap');
        }
      }
      assert.ok(rockColumns>100,'mountain walls must remain stone-dominant');
      assert.ok(generated.layout.geology.stoneOutcrops>0);
    } finally {loader.unload();}
  }
});

test('geological Strategy controls rock-face treatment without switching on biome names',()=>{
  const radius=20;
  const heights=new Int16Array(1600).fill(5);
  const surfaces=new Uint8Array(1600).fill(1);
  heights[index(radius,1,0)]=11;
  const classified=classifySurfaceStrata({
    radius,heights,surfaces,
    terrain:{soilDepth:1,rockFaceThreshold:2}
  });
  assert.ok(classified.stoneOutcrops>=2);
  assert.equal(surfaces[index(radius,0,0)],3);
  assert.equal(surfaces[index(radius,1,0)],3);
  assert.equal(surfaces[index(radius,10,10)],1);
  assert.equal(classified.soilDepth,1);
  assert.throws(()=>classifySurfaceStrata({
    radius,heights,surfaces,terrain:{soilDepth:0,rockFaceThreshold:2}
  }),/geological/);
});

test('custom map kinds remain swappable and can omit the optional road profile',()=>{
  const registry=new MapKindRegistry([]);
  registry.register({kind:'island-test',compose(builder) {
    builder.setTerrain({elevation:()=>4,exposedStone:0.8,soilDepth:1});
    builder.addRoute('entry-to-exit',[{x:0,z:18},{x:0,z:-18}],2);
    builder.addClearing({id:'entry-glade',x:0,z:0,radius:5});
    builder.addLandmark({id:'island-shrine',kind:'island-shrine',
      x:6,z:0,clearance:2});
  }});
  const generated=createDefaultWorldGeneratorV2({registry}).generate(recipe('island-test'));
  assert.equal(generated.layout.roads.ready,true);
  assert.equal(generated.layout.roads.routes.length,0);
  assert.equal(generated.layout.geology.soilDepth,1);
  assert.equal(generated.definition.schema,'voxel-v2.terrain-initialization.v1');
});

test('road and geology components do not depend on VoxelWorld, WebGL, physics or loot',()=>{
  for(const module of [
    'road-surface-geometry','road-surface-specification','terrain-strata'
  ]) {
    const source=readFileSync(new URL(
      '../src/world-generation/'+module+'.mjs',import.meta.url),'utf8');
    assert.doesNotMatch(source,/from ['"][^'"]*(?:voxel-world|webgl|physics|enemy|loot)/);
    assert.doesNotMatch(source,/Math\.random\(/);
  }
});
