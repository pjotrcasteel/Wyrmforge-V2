import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {
  generateWorldSite,generateAuthoredHuntTerrainGraph,
  composeHuntExpeditionPlan,createHuntExpeditionRecipe
} from '../src/world-generation/index.mjs';
import {containsHuntLandform} from '../src/world-generation/hunt-landform-footprint.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {createWorldGenFluidEngine} from '../src/fluid/worldgen-fluid-adapter.mjs';

const key=({x,z})=>x+','+z;

function streamedRiver(seed){
  const entry=generateWorldSite(createWorldSiteRecipe({
    seed,kind:'wet-forest',river:'water',huntRole:'arrival',chunkEdge:32
  }));
  const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'preview-expedition',
    kind:'wet-forest',seed,chunkEdge:32
  }));
  return {entry,graph:generateAuthoredHuntTerrainGraph(entry,plan)};
}

test('authored 40m Hunt river keeps the existing region footprint',()=>{
  const {entry,graph}=streamedRiver(7);
  assert.equal(entry.recipe.radius,20);
  assert.equal(entry.layout.footprint.maxX-entry.layout.footprint.minX+1,40);
  assert.equal(entry.layout.riverChannels?.length,1);
  assert.ok(entry.layout.riverChannels[0].floor.length>=12);

  const standalone=generateWorldSite(createWorldSiteRecipe({
    seed:7,kind:'wet-forest',river:'water',chunkEdge:32
  }));
  assert.equal(standalone.recipe.radius,28,
    'standalone river-preview area remains wider than the streamed region');
  assert.equal(graph.layout.regions[0].bounds.maxX-graph.layout.regions[0].bounds.minX+1,40);
});

test('streamed river descriptor is exactly the surviving WorldGen bed at world coordinates',()=>{
  const {entry,graph}=streamedRiver(19);
  const entryId=graph.layout.entryRegionId;
  const region=graph.layout.regions.find(item=>item.id===entryId);
  const band=graph.region(entryId);
  const river=band.fluidLayout?.riverChannels?.[0];
  assert.ok(river,'actual region must publish an authored Water V2 channel');
  assert.equal(river.kind,'water');
  assert.ok(river.nodes.length>=2);
  assert.ok(river.floor.length>=12);
  assert.deepEqual(band.fluidLayout.footprint,{
    minX:band.bounds.minX,maxX:band.bounds.maxX,
    minZ:band.bounds.minZ,maxZ:band.bounds.maxZ,
    minY:entry.layout.footprint.minY,maxY:entry.layout.footprint.maxY
  });
  const source=new Set(entry.layout.riverChannels[0].floor.map(key));
  for(const cell of river.floor){
    assert.ok(containsHuntLandform(region,cell.x,cell.z),
      'water cannot be created outside real published Voxel landform');
    assert.ok(source.has((cell.x-region.offsetX)+','+(cell.z-region.offsetZ)),
      'water is only translated from its original authored WorldGen source');
  }
  assert.deepEqual([river.from.x,river.from.z],[river.nodes[0].x,river.nodes[0].z]);
  assert.deepEqual([river.to.x,river.to.z],[river.nodes.at(-1).x,river.nodes.at(-1).z]);
  assert.deepEqual(graph.materialize(entryId).fluidLayout,band.fluidLayout);

  const loader=new V2ExternalTerrainLoader(band.definition,{microSurfaceCapacity:2048});
  while(!loader.progress.done)loader.loadStep(192);
  try{
    const {world,port}=loader.terrain;
    const before=world.revision;
    const {fluid}=createWorldGenFluidEngine(band.fluidLayout,port);
    assert.equal(fluid.kind,'water');
    assert.ok(fluid.wetCount>=12);
    for(const cell of river.floor){
      assert.equal(fluid.sample(cell.x,cell.z).floorY,cell.y,
        'Water must read authoritative world floor rather than a second heightfield');
    }
    for(let i=0;i<40;i++)assert.ok(fluid.step({budget:96}).processed<=96);
    assert.equal(world.revision,before,'fluid may not mutate native Voxel terrain');
  }finally{
    loader.unload();
  }
});

test('default dry Hunt and non-Hunt river contracts remain unchanged',()=>{
  const plain=generateWorldSite(createWorldSiteRecipe({kind:'wet-forest',seed:7,chunkEdge:32}));
  const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'preview-expedition',kind:'wet-forest',seed:7,chunkEdge:32
  }));
  assert.equal(generateAuthoredHuntTerrainGraph(plain,plan).region('region-entry').fluidLayout,null);
  assert.equal(createWorldSiteRecipe({kind:'wet-forest',river:'water'}).radius,28);
  assert.equal(createWorldSiteRecipe({kind:'wet-forest',river:'water',huntRole:'arrival'}).radius,20);
  assert.throws(()=>createWorldSiteRecipe({
    kind:'wet-forest',river:'water',huntRole:'arrival',radius:28
  }),/site extent/);
});
