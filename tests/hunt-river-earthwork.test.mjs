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
import {spawnTerrainActor,actorOverlapsTerrain} from '../src/terrain-actor.mjs';
import {stepHuntExplorer,HUNT_FIXED_STEP} from '../src/hunt-play-runtime.mjs';

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
  const loader=new V2ExternalTerrainLoader(definition,{microSurfaceCapacity:2048});
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
    const rawAt=(bands,x,y,z)=>bands.flatMap(b=>b.definition.runs)
      .find(run=>run.y===y&&run.z===z&&x>=run.x&&x<run.x+run.length)?.material??0;
    assert.equal(touched.size,earthwork.bands.reduce((n,b)=>n+b.earthwork.cellCount,0));
    for(const point of proposal.points){
      assert.equal(port.materialAt(point.x,earthwork.bedFloorY-1,point.z),3,
        'actual WorldGen/Voxel stone bed is required at '+point.x+','+point.z+
        ' raw='+rawAt(earthwork.bands,point.x,earthwork.bedFloorY-1,point.z));
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
              'non-water native Voxel terrain must not change: '+x+','+y+','+z+
              ' (outside planned bed)');
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


test('the Voxel actor can still cross the carved connector in both directions',()=>{
  const {graph,proposal,link}=fixture();
  const earthwork=prepareHuntRiverEarthwork(graph,proposal,toVoxelTerrainDefinition);
  const loader=load(earthwork.bands);
  try{
    const {world}=loader.terrain;
    const a=graph.region(link.fromId),b=graph.region(link.toId);
    const bounds={
      minX:Math.min(a.bounds.minX,b.bounds.minX),
      maxX:Math.max(a.bounds.maxX,b.bounds.maxX),
      minZ:Math.min(a.bounds.minZ,b.bounds.minZ),
      maxZ:Math.max(a.bounds.maxZ,b.bounds.maxZ)
    };
    const horizontal=['east','west'].includes(link.fromPort.direction);
    const min=horizontal?link.bounds.minX:link.bounds.minZ;
    const max=horizontal?link.bounds.maxX:link.bounds.maxZ;
    const cross=horizontal?(link.bounds.minZ+link.bounds.maxZ+1)/2+.5:
      (link.bounds.minX+link.bounds.maxX+1)/2+.5;
    for(const direction of [-1,1]){
      const from=direction>0?min-.5:max+1.5;
      const to=direction>0?max+1.5:min-.5;
      let actor=spawnTerrainActor(world,{
        x:horizontal?from:cross,z:horizontal?cross:from,
        searchTopY:30,maxSearchDistance:64
      });
      assert.ok(actor?.grounded,'river preparation cannot bury the player at the port');
      for(let i=0;i<250;i++){
        actor=stepHuntExplorer(world,actor,bounds,horizontal?
          {moveX:direction}:{moveZ:direction},HUNT_FIXED_STEP);
        assert.ok(!actor.error);
        assert.equal(actorOverlapsTerrain(world,actor),false);
        const position=horizontal?actor.x:actor.z;
        if(direction>0?position>=to:position<=to)break;
      }
      const position=horizontal?actor.x:actor.z;
      assert.ok(direction>0?position>=to:position<=to,
        'the newly authored riverbed must not block the real traversal corridor');
    }
  }finally{
    loader.unload();
  }
});
