import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createWorldSiteRecipe, validateWorldSiteRecipe,
  WORLD_SITE_RECIPE_SCHEMA
} from '../src/world-generation/site-recipe.mjs';
import {
  MapKindRegistry, MAP_KIND_IDS, siteNoise
} from '../src/world-generation/map-kinds.mjs';
import { SitePlanBuilder } from '../src/world-generation/site-plan-builder.mjs';
import { specifySiteTopology } from '../src/world-generation/site-topology-specification.mjs';
import { WorldGeneratorV2 } from '../src/world-generation/world-generator.mjs';
import {
  createDefaultWorldGeneratorV2, generateWorldSite
} from '../src/world-generation/index.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { worldDigest } from '../src/replay-checkpoint.mjs';

function recipe(kind='wet-forest',seed=7,chunkEdge=16) {
  return createWorldSiteRecipe({
    kind,seed,chunkEdge,siteId:'test-site-'+kind,
    regionId:'starter-region',encounterId:'hunt-test',worldRevision:2,
    corruption:kind==='wet-forest'?0:0.3
  });
}
function load(definition,step=4096) {
  const loader=new V2ExternalTerrainLoader(definition);
  let steps=0;
  while(!loader.progress.done) {
    loader.loadStep(step);
    if(++steps>300) throw new Error('Site loader made no bounded progress');
  }
  return loader;
}
function topAt(world,x,z) {
  for(let y=30;y>=-3;y--)if(world.get(x,y,z)!==0) return y;
  return null;
}

test('World Generation is a separate engine with injected Strategy, Builder, Specification and Adapter',()=>{
  const generator=createDefaultWorldGeneratorV2();
  assert.deepEqual(generator.kinds,MAP_KIND_IDS);
  for(const kind of MAP_KIND_IDS) {
    const result=generator.generate(recipe(kind));
    assert.equal(result.schema,'wyrmforge.generated-site.v2');
    assert.equal(result.recipe.schema,WORLD_SITE_RECIPE_SCHEMA);
    assert.equal(result.definition.schema,'voxel-v2.terrain-initialization.v1');
    assert.equal(result.definition.generatorVersion,result.generatorVersion);
    assert.equal(result.definition.siteId,result.recipe.siteId);
    assert.equal(result.layout.topology.reachable,true);
    assert.equal(result.layout.topology.entry.z,18);
    assert.equal(result.layout.topology.exit.z,-18);
    assert.ok(result.layout.topology.walkableFromEntry>100);
    assert.ok(result.layout.routes.length>=2);
    assert.ok(result.layout.clearings.length>=2);
    assert.equal(result.layout.landmarks.length,1);
    assert.ok(result.definition.totalCells>5000);
    assert.equal(result.totalCells,result.definition.totalCells);
    assert.match(result.hash,/^wg2-[0-9a-f]{8}$/);
    assert.equal(Object.isFrozen(result),true);
  }
});

test('same site, seed and revision give identical canonical runs, topology and hash',()=>{
  for(const kind of MAP_KIND_IDS)for(const pitch of [16,32]) {
    const input=recipe(kind,77,pitch);
    const generator=createDefaultWorldGeneratorV2();
    const first=generator.generate(input);
    const second=generateWorldSite({...input});
    assert.deepEqual(first,second);
    assert.equal(JSON.stringify(first),JSON.stringify(second));
    assert.deepEqual(first.definition.runs,second.definition.runs);
    const loader=load(first.definition,997);
    const other=load(second.definition,4096);
    assert.equal(worldDigest(loader.terrain.world),worldDigest(other.terrain.world));
    loader.unload();
    other.unload();
  }
});

test('different seeds change the real geometry within one authored map-kind identity',()=>{
  for(const kind of MAP_KIND_IDS) {
    const first=generateWorldSite(recipe(kind,1));
    const second=generateWorldSite(recipe(kind,2));
    assert.notEqual(first.hash,second.hash);
    assert.notDeepEqual(first.definition.runs,second.definition.runs);
    assert.deepEqual(first.layout.routes,second.layout.routes,
      'geographical promise and exits cannot move when a seed changes');
    assert.equal(first.layout.landmarks[0].kind,second.layout.landmarks[0].kind);
  }
});

test('world revision participates in determinism without mutating Voxel V2',()=>{
  const original=recipe();
  const first=generateWorldSite(original);
  const second=generateWorldSite({...original,worldRevision:3});
  assert.notEqual(first.hash,second.hash);
  assert.notDeepEqual(first.definition.runs,second.definition.runs);
  assert.equal(first.definition.siteId,second.definition.siteId);
});

test('all generated sites have actual layered 3D solids, negative chunk coordinates and a traversable route',()=>{
  for(const kind of MAP_KIND_IDS)for(const pitch of [16,32]) {
    const result=generateWorldSite(recipe(kind,7,pitch));
    const loader=load(result.definition,512);
    const {world,port,ledger}=loader.terrain;
    assert.ok(world.chunkIds().some(id=>id.startsWith('-1,')));
    assert.ok(world.chunkIds().some(id=>id.startsWith('0,')));
    assert.equal(ledger.editRevision,0);
    assert.ok(world.chunkCount>4);
    const route=result.layout.routes.find(item=>item.id==='entry-to-exit');
    for(const point of [...route.nodes,...result.layout.landmarks]) {
      const top=topAt(world,point.x,point.z);
      assert.ok(Number.isInteger(top));
      assert.ok(top>=0 && top<=30);
      assert.notEqual(world.get(point.x,top,point.z),0);
      assert.equal(world.get(point.x,top+1,point.z),0);
      assert.notEqual(port.materialAt(point.x,top,point.z),0);
      assert.notEqual(world.get(point.x,-3,point.z),0);
    }
    assert.equal(result.layout.topology.reachable,true);
    assert.ok(result.layout.topology.walkableFromEntry>100);
    loader.unload();
  }
});

test('wet forest, transition and mountains are deliberately different landforms',()=>{
  const low=generateWorldSite(recipe('wet-forest'));
  const transition=generateWorldSite(recipe('forest-highland'));
  const high=generateWorldSite(recipe('mountain-pass'));
  const heightRange=site=>{
    const floor=site.layout.footprint;
    return floor.maxY-floor.minY;
  };
  assert.ok(heightRange(high)>heightRange(low));
  assert.ok(heightRange(transition)>heightRange(low));
  assert.ok(low.layout.features.some(item=>item.kind==='water-basin'));
  assert.ok(transition.layout.features.some(item=>item.kind==='rocky-slope'));
  assert.ok(high.layout.features.some(item=>item.kind==='cliff'));
  assert.equal(new Set([low.hash,transition.hash,high.hash]).size,3);
  assert.notEqual(low.layout.landmarks[0].kind,high.layout.landmarks[0].kind);
});

test('new map kinds register via Strategy without modifying engine, terrain contract or adapter',()=>{
  const registry=new MapKindRegistry();
  registry.register({
    kind:'frost-basin',
    compose(builder,{seed}) {
      builder.setTerrain({
        elevation:(x,z)=>3+siteNoise(seed,x,z,9,12)*2,
        exposedStone:0.85
      });
      builder.addRoute('entry-to-exit',[{x:0,z:18},{x:0,z:0},{x:0,z:-18}],2);
      builder.addRoute('landmark-spur',[{x:0,z:0},{x:5,z:-4}],1);
      builder.addClearing({id:'glade',x:0,z:0,radius:5});
      builder.addLandmark({id:'frost-shrine',kind:'frost-shrine',x:0,z:0,clearance:3});
    }
  });
  const generated=createDefaultWorldGeneratorV2({registry}).generate(recipe('frost-basin'));
  assert.equal(generated.layout.topology.reachable,true);
  const loader=load(generated.definition);
  assert.ok(loader.terrain.world.chunkCount>1);
  loader.unload();
  assert.throws(()=>registry.register({kind:'frost-basin',compose(){}}),/already registered/);
  assert.throws(()=>createDefaultWorldGeneratorV2().generate(recipe('frost-basin')),/Unknown/);
});

test('invalid recipes and malformed strategies are rejected without activating a terrain world',()=>{
  const valid=recipe();
  for(const invalid of [
    {...valid,seed:-1},{...valid,seed:2**32},
    {...valid,siteId:'../../escape'},{...valid,radius:200},
    {...valid,chunkEdge:24},{...valid,corruption:2},
    {...valid,worldRevision:-1},{...valid,schema:'voxel-v1'}
  ])assert.throws(()=>validateWorldSiteRecipe(invalid));
  const badRegistry=new MapKindRegistry([]);
  badRegistry.register({
    kind:'broken-site',
    compose(builder) {
      builder.setTerrain({elevation:()=>0,exposedStone:0.5});
      builder.addRoute('entry-to-exit',[{x:0,z:18},{x:0,z:-18}],2);
    }
  });
  assert.throws(()=>createDefaultWorldGeneratorV2({registry:badRegistry})
    .generate(recipe('broken-site')),/landmark/);
  assert.throws(()=>new WorldGeneratorV2({registry:{}}),/injected/);
});

test('Specification rejects a deliberately disconnected mandatory exit',()=>{
  const heights=new Int16Array(40*40);
  for(let z=0;z<40;z++)for(let x=0;x<40;x++) {
    if(z===20) heights[z*40+x]=20;
  }
  const routes=[{
    id:'entry-to-exit',
    nodes:[{x:0,z:18},{x:0,z:-18}]
  }];
  assert.throws(()=>specifySiteTopology({
    radius:20,heights,routes,landmarks:[{id:'refuge',x:1,z:-10}],
    clearings:[{id:'spawn',x:1,z:10}]
  }),/not navigable/);
});

test('world generator core has no imports of private voxel, renderer, physics, objects or V1',()=>{
  const core=[
    'site-recipe.mjs','map-kinds.mjs','site-plan-builder.mjs',
    'site-topology-specification.mjs','world-generator.mjs'
  ];
  for(const file of core) {
    const source=readFileSync(new URL('../src/world-generation/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/from ['"][^'"]*(?:voxel-world|webgl|terrain-edit-ledger|V1|Wyrmforge\/)/);
    assert.doesNotMatch(source,/Math\.random\(/);
  }
  const adapter=readFileSync(
    new URL('../src/world-generation/voxel-terrain-adapter.mjs',import.meta.url),'utf8');
  assert.match(adapter,/from '\.\.\/external-terrain-loader\.mjs'/);
  assert.doesNotMatch(adapter,/new VoxelWorld|\.set\(/);
});

test('injected Adapter can replace Voxel V2 without changing strategies or core generation',()=>{
  let adapted=0;
  const substitute=new WorldGeneratorV2({
    terrainAdapter:({siteId,seed,chunkEdge,runs})=>{
      adapted++;
      return Object.freeze({
        schema:'replaceable-terrain-engine.v1',siteId,seed,chunkEdge,
        originalRuns:runs.length
      });
    }
  });
  const output=substitute.generate(recipe('wet-forest'));
  assert.equal(output.definition.schema,'replaceable-terrain-engine.v1');
  assert.equal(output.definition.originalRuns>0,true);
  assert.equal(output.layout.topology.reachable,true);
  assert.equal(adapted,1);
  assert.throws(()=>new WorldGeneratorV2(),/output adapter/);
  // No internal voxel storage calls are needed by the generator.
  const core=readFileSync(new URL('../src/world-generation/world-generator.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(core,/from ['"][^'"]*(voxel-terrain-adapter|external-terrain-loader|voxel-world)/);
  const root=readFileSync(new URL('../src/world-generation/index.mjs',import.meta.url),'utf8');
  assert.match(root,/terrainAdapter:toVoxelTerrainDefinition/);
});
