import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph,
  composeHuntExpeditionPlan,createHuntExpeditionRecipe
} from '../src/world-generation/index.mjs';
import {toVoxelTerrainDefinition} from '../src/world-generation/voxel-terrain-adapter.mjs';
import {planHuntRiverCorridor} from '../src/world-generation/hunt-river-corridor-plan.mjs';
import {
  prepareHuntRiverEarthwork,HUNT_RIVER_EARTHWORK_SCHEMA
} from '../src/world-generation/hunt-river-earthwork.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {createFluidTerrainFloorQuery} from '../src/fluid/worldgen-fluid-adapter.mjs';

function fixture(){
  const entry=generateWorldSite(createWorldSiteRecipe({
    seed:7,kind:'wet-forest',river:'water',huntRole:'arrival',chunkEdge:32
  }));
  const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    journeyId:'fire-tier-one',huntId:'preview-expedition',
    kind:'wet-forest',seed:7,chunkEdge:32
  }));
  const graph=generateAuthoredHuntTerrainGraph(entry,plan);
  const link=graph.layout.links.find(l=>
    [l.fromId,l.toId].includes('region-entry')&&
    [l.fromId,l.toId].includes('region-woodland-trail'));
  const proposal=planHuntRiverCorridor(graph,link.id);
  assert.ok(proposal);
  return {graph,proposal,link};
}

function load(bands){
  const definition=toVoxelTerrainDefinition({
    siteId:'water-native-graph-proof',seed:7,chunkEdge:32,
    runs:bands.flatMap(b=>b.definition.runs),
    surfaceTiles:bands.flatMap(b=>b.definition.surfaceTiles??[])
  });
  const loader=new V2ExternalTerrainLoader(definition,{microSurfaceCapacity:8192});
  while(!loader.progress.done)loader.loadStep(4096);
  return loader;
}

test('WorldGen materializes a real physical stone riverbed through the 8m link',()=>{
  const {graph,proposal,link}=fixture();
  const earthwork=prepareHuntRiverEarthwork(graph,proposal,toVoxelTerrainDefinition);
  assert.equal(earthwork.schema,HUNT_RIVER_EARTHWORK_SCHEMA);
  assert.equal(earthwork.status,'native-voxel-definitions-prepared');
  assert.equal(earthwork.bands.length,3);
  assert.deepEqual(earthwork.bands.map(b=>b.id),
    [link.fromId,link.id,link.toId]);
  assert.ok(earthwork.bands.every(b=>b.earthwork.cellCount>0));
  assert.ok(earthwork.bands.find(b=>b.id===link.id).earthwork.cellCount>=8);
  assert.ok(earthwork.bands.find(b=>b.id==='region-woodland-trail').earthwork.cellCount>8,
    'the 32m inland gap must be physically changed, not only the connector');

  const loader=load(earthwork.bands);
  try{
    const {port,world}=loader.terrain;
    const touched=new Set(proposal.points.map(p=>p.x+','+p.z));
    assert.equal(touched.size,earthwork.bands.reduce((n,b)=>n+b.earthwork.cellCount,0));
    for(const point of proposal.points){
      assert.equal(port.materialAt(point.x,earthwork.bedFloorY-1,point.z),3,
        'actual WorldGen/Voxel stone bed is required at '+point.x+','+point.z);
      assert.equal(port.materialAt(point.x,earthwork.bedFloorY,point.z),0,
        'actual upper voxel must be AIR after earthwork at '+point.x+','+point.z);
    }
    for(const band of earthwork.bands){
      const query=createFluidTerrainFloorQuery(band.fluidLayout.footprint,port);
      for(const point of proposal.points.filter(p=>p.bandId===band.id)){
        assert.equal(query(point.x,point.z),earthwork.bedFloorY,
          'Water V2 reads the actual newly authored bed, not a fake floor');
      }
    }
    // The terrain remains a real game Voxel world after the authored cut.
    assert.ok(world.revision>0);
  }finally{
    loader.unload();
  }
});

test('earthwork leaves every column outside the proposed bed exactly unchanged',()=>{
  const {graph,proposal}=fixture();
  const earthwork=prepareHuntRiverEarthwork(graph,proposal,toVoxelTerrainDefinition);
  const originals=earthwork.bands.map(b=>graph.materialize(b.id));
  const originalLoader=load(originals),editedLoader=load(earthwork.bands);
  try{
    const old=originalLoader.terrain.port,updated=editedLoader.terrain.port;
    const touched=new Set(proposal.points.map(p=>p.x+','+p.z));
    for(const band of earthwork.bands){
      for(let z=band.bounds.minZ;z<=band.bounds.maxZ;z+=3){
        for(let x=band.bounds.minX;x<=band.bounds.maxX;x+=3){
          if(touched.has(x+','+z))continue;
          for(let y=0;y<=12;y++){
            assert.equal(updated.materialAt(x,y,z),old.materialAt(x,y,z),
              'non-water native Voxel terrain must not change: '+x+','+y+','+z);
          }
        }
      }
    }
  }finally{
    originalLoader.unload();
    editedLoader.unload();
  }
});

test('invalid source identity or unsafe earthwork is never silently accepted',()=>{
  const {graph,proposal}=fixture();
  assert.throws(()=>prepareHuntRiverEarthwork(graph,{
    ...proposal,linkId:'invented-link'
  },toVoxelTerrainDefinition),/link identity mismatch/);
  assert.throws(()=>prepareHuntRiverEarthwork(graph,proposal,toVoxelTerrainDefinition,{
    maxCutMetres:0
  }),/bounded unapplied/);
  assert.throws(()=>prepareHuntRiverEarthwork(graph,{
    ...proposal,status:'native-voxel-definitions-prepared'
  },toVoxelTerrainDefinition),/bounded unapplied/);
});
