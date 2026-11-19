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
    for(const band of earthwork.bands){
      const query=createFluidTerrainFloorQuery(band.fluidLayout.footprint,port);
      const channel=new Map(band.fluidLayout.riverChannels[0].floor
        .map(cell=>[cell.x+','+cell.z,cell]));
      for(const point of proposal.points.filter(p=>p.bandId===band.id)){
        const y=channel.get(point.x+','+point.z)?.y;
        assert.ok(Number.isSafeInteger(y));
        assert.ok(y===earthwork.bedFloorY||y===earthwork.bedFloorY+1,
          'physical crossing is either recessed stream or authored 1m shallow ford');
        assert.equal(port.materialAt(point.x,y-1,point.z),3,
          'true WorldGen/Voxel stone bed required at '+point.x+','+point.z+
          ' raw='+rawAt(earthwork.bands,point.x,y-1,point.z));
        assert.equal(port.materialAt(point.x,y,point.z),0,
          'actual upper voxel must be AIR after river earthwork');
        assert.equal(query(point.x,point.z),y,
          'Water V2 must read the real native Voxel bed, including the ford');
      }
    }
    // The terrain remains a real game Voxel world after the authored cut.
    assert.ok(world.revision>0);
  }finally{
    loader.unload();
  }
});

test('earthwork leaves every column outside the river and explicit dry terraces unchanged',()=>{
  const {graph,proposal}=fixture();
  const earthwork=prepareHuntRiverEarthwork(graph,proposal,toVoxelTerrainDefinition);
  const originals=earthwork.bands.map(b=>graph.materialize(b.id));
  const originalLoader=load(originals),editedLoader=load(earthwork.bands);
  try{
    const old=originalLoader.terrain.port,updated=editedLoader.terrain.port;
    const touched=new Set([
      ...proposal.points.map(p=>p.x+','+p.z),
      ...earthwork.bands.flatMap(b=>b.fluidLayout.riverChannels[0].floor
        .map(cell=>cell.x+','+cell.z)),
      ...earthwork.bands.flatMap(b=>b.earthwork.bankTerraceColumns
        .map(cell=>cell.x+','+cell.z))
    ]);
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

test('WAT-01: dry native shelves touch water but retain stone until a real Fireball opens them',()=>{
  const {graph,proposal}=fixture();
  const earthwork=prepareHuntRiverEarthwork(graph,proposal,toVoxelTerrainDefinition);
  const loader=load(earthwork.bands);
  try{
    const {port}=loader.terrain;
    const shelves=earthwork.bands.flatMap(b=>b.earthwork.bankTerraceColumns
      .map(cell=>({...cell,bandId:b.id})));
    assert.ok(shelves.length>0,
      'the authored wet forest must contain physical 2m-Fireball-breachable banks');
    for(const band of earthwork.bands){
      const wet=new Map(band.fluidLayout.riverChannels[0].floor.map(c=>
        [c.x+','+c.z,c]));
      const query=createFluidTerrainFloorQuery(band.fluidLayout.footprint,port);
      for(const shelf of band.earthwork.bankTerraceColumns){
        assert.equal(wet.has(shelf.x+','+shelf.z),false,
          'lowered shelves must stay DRY, not turn into invented river columns');
        assert.equal(query(shelf.x,shelf.z),shelf.floorY,
          'native Voxel stone must match the authored shelf top');
        assert.equal(port.materialAt(shelf.x,shelf.floorY-1,shelf.z),3);
        assert.equal(port.materialAt(shelf.x,shelf.floorY,shelf.z),0);
        const neighbor=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>{
          const cell=wet.get((shelf.x+dx)+','+(shelf.z+dz));
          return cell && shelf.floorY===cell.y+1;
        });
        assert.ok(neighbor,'a dry lowered bank must touch a true water channel face');
      }
    }
  }finally{
    loader.unload();
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


test('the entire authored river, not just its connector, is visibly recessed in physical Voxel terrain',()=>{
  const {graph,proposal}=fixture();
  const prepared=prepareHuntRiverEarthwork(graph,proposal,toVoxelTerrainDefinition);
  const loader=load(prepared.bands);
  try{
    const port=loader.terrain.port;
    const routeKeys=new Set(proposal.points.map(p=>p.x+','+p.z));
    let existingCells=0,offRouteCells=0;
    for(const band of prepared.bands){
      const old=graph.materialize(band.id);
      const oldFloor=old.fluidLayout?.riverChannels?.[0]?.floor??[];
      const revised=new Map(band.fluidLayout.riverChannels[0].floor
        .map(cell=>[cell.x+','+cell.z,cell]));
      assert.ok(band.earthwork.recessedCells>0,
        'each resident band must contain actual stone/air river excavation');
      const fords=new Set(band.earthwork.fordCells);
      for(const cell of oldFloor){
        existingCells++;
        const id=cell.x+','+cell.z;
        const now=revised.get(id);
        assert.ok(now,'original riverbed must not disappear from the connected river');
        const shallowFord=fords.has(id);
        if(shallowFord){
          assert.ok(now.y<=cell.y,
            'the physical shallow ford must not rise above the original stone: '+id);
        }else{
          assert.ok(now.y<=cell.y-1,
            'ordinary riverbed must be cut at least 1m deeper at '+id);
        }
        assert.equal(port.materialAt(cell.x,now.y-1,cell.z),3,
          'true Voxel stone, not a blue water decal, must support '+id);
        assert.equal(port.materialAt(cell.x,now.y,cell.z),0,
          'the former grass-level water column must be open air at '+id);
        if(!shallowFord){
          assert.ok(now.y+.4<=cell.y-.6+1e-6,
            '40cm initial water must sit >=60cm below the original bed surface');
          if(!routeKeys.has(id))offRouteCells++;
        }
      }
    }
    assert.ok(existingCells>20,'the full real river, not a connector-only strip, must be audited');
    assert.ok(offRouteCells>10,'previously shallow non-ford river reaches must be recessed');
  }finally{
    loader.unload();
  }
});
