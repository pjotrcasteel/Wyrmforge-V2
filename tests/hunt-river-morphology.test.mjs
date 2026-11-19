import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {
  generateWorldSite,generateAuthoredHuntTerrainGraph
} from '../src/world-generation/index.mjs';
import {toVoxelTerrainDefinition} from '../src/world-generation/voxel-terrain-adapter.mjs';
import {planHuntRiverCorridor} from '../src/world-generation/hunt-river-corridor-plan.mjs';
import {
  prepareHuntRiverEarthwork,composeHuntRiverEarthworkGraph
} from '../src/world-generation/hunt-river-earthwork.mjs';
import {
  HUNT_RIVER_MORPHOLOGY_SCHEMA,MAX_RIVER_BANK_MICRO_TILES,
  excludeHuntRiverPlacements
} from '../src/world-generation/hunt-river-morphology.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {createFluidTerrainFloorQuery}
  from '../src/fluid/worldgen-fluid-adapter.mjs';

const key=(x,z)=>x+','+z;
function fixture(){
  const entry=generateWorldSite(createWorldSiteRecipe({
    seed:7,kind:'wet-forest',river:'water',huntRole:'arrival',chunkEdge:32
  }));
  const graph=generateAuthoredHuntTerrainGraph(entry);
  const link=graph.layout.links.find(l=>
    [l.fromId,l.toId].includes('region-entry')&&
    [l.fromId,l.toId].includes('region-woodland-trail'));
  assert.ok(link);
  const proposal=planHuntRiverCorridor(graph,link.id);
  assert.ok(proposal);
  const earthwork=prepareHuntRiverEarthwork(graph,proposal,toVoxelTerrainDefinition);
  const waterGraph=composeHuntRiverEarthworkGraph(
    graph,earthwork,toVoxelTerrainDefinition);
  return {graph,link,proposal,earthwork,waterGraph};
}
function load(earthwork){
  const definitions=earthwork.bands;
  const loader=new V2ExternalTerrainLoader(toVoxelTerrainDefinition({
    siteId:'wat16-real-voxel-proof',seed:7,chunkEdge:32,
    runs:definitions.flatMap(b=>b.definition.runs),
    surfaceTiles:definitions.flatMap(b=>b.definition.surfaceTiles??[])
  }),{microSurfaceCapacity:2048});
  while(!loader.progress.done)loader.loadStep(4096);
  return loader;
}

test('WAT-16: native one-metre connector becomes an authored multi-column wet ribbon',()=>{
  const {graph,proposal,earthwork}=fixture();
  const loader=load(earthwork);
  try{
    const {port}=loader.terrain;
    const original=new Set(proposal.points.map(p=>key(p.x,p.z)));
    const widened=earthwork.bands.flatMap(b=>{
      const region=graph.materialize(b.id);
      const authored=new Set(region.fluidLayout?.riverChannels?.[0]?.floor
        .map(c=>key(c.x,c.z))??[]);
      return b.fluidLayout.riverChannels[0].floor.filter(c=>
        !authored.has(key(c.x,c.z))&&!original.has(key(c.x,c.z)))
        .map(c=>({id:b.id,...c}));
    });
    assert.ok(widened.length>=20,
      'at least 20 new physical wet columns must widen the 1m corridor');
    const stats=earthwork.bands.reduce((sum,b)=>
      sum+b.earthwork.lateralWetCells,0);
    assert.equal(stats,widened.length,
      'each new blue surface must correspond to exactly one real stone/air Voxel column');
    for(const band of earthwork.bands){
      const query=createFluidTerrainFloorQuery(
        band.fluidLayout.footprint,port);
      const originalIds=new Set(graph.materialize(band.id).fluidLayout?.
        riverChannels?.[0]?.floor.map(c=>key(c.x,c.z))??[]);
      for(const cell of band.fluidLayout.riverChannels[0].floor){
        assert.equal(port.materialAt(cell.x,cell.y-1,cell.z),3,
          'native stone under river '+key(cell.x,cell.z));
        assert.equal(port.materialAt(cell.x,cell.y,cell.z),0,
          'real liquid requires genuine native Voxel air '+key(cell.x,cell.z));
        assert.equal(query(cell.x,cell.z),cell.y);
      }
      const latest=band.fluidLayout.riverChannels[0].floor.filter(cell=>
        !originalIds.has(key(cell.x,cell.z)));
      const plannedExtra=proposal.points.filter(point=>point.bandId===band.id&&
        !originalIds.has(key(point.x,point.z))).length;
      assert.equal(latest.length,
        plannedExtra+band.earthwork.lateralWetCells,
        'new water footprint must match truly added corridor and lateral Voxel cells');
    }
  }finally{
    loader.unload();
  }
});

test('WAT-16: sparse 10cm REAL dry-bank microsteps taper into the water',()=>{
  const {earthwork,graph}=fixture();
  let micro=0;
  for(const band of earthwork.bands){
    const original=graph.materialize(band.id).definition.surfaceTiles??[];
    const old=new Map(original.map(t=>[t.x+','+t.y+','+t.z,t]));
    const wet=new Set(band.fluidLayout.riverChannels[0].floor.map(c=>key(c.x,c.z)));
    const proposed=band.definition.surfaceTiles??[];
    const added=proposed.filter(tile=>{
      const prior=old.get(tile.x+','+tile.y+','+tile.z);
      return !prior||tile.levels.some((height,i)=>height!==prior.levels[i]);
    });
    assert.equal(added.length,band.earthwork.bankMicroTiles);
    assert.ok(added.length<=MAX_RIVER_BANK_MICRO_TILES);
    micro+=added.length;
    for(const tile of added){
      assert.ok(!wet.has(key(tile.x,tile.z)),
        'the micro shoulder is SOLID dry terrain, never a fake water cap');
      assert.equal(tile.levels.length,100);
      assert.ok(tile.levels.some(level=>level>=5&&level<=9),
        'the physical shoreline must contain submeter heights');
      assert.ok(tile.levels.every(level=>
        Number.isSafeInteger(level)&&level>=0&&level<=10));
      const prior=old.get(tile.x+','+tile.y+','+tile.z);
      for(let i=0;i<tile.levels.length;i++){
        if(tile.levels[i]===0){
          assert.equal(prior?.levels[i],0,
            'sculpting stone must preserve pre-existing empty microcells, never create a new hole');
        }
      }
      const neighbor=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>
        wet.has(key(tile.x+dx,tile.z+dz)));
      assert.ok(neighbor,'micro shoreline must touch a REAL wet voxel');
    }
  }
  assert.ok(micro>=12,
    'several real dry banks should receive sparse 10cm micro-voxel tapering');
});

test('WAT-16: woodland placement has no physical tree/prop footprint in the river',()=>{
  const {graph,waterGraph,earthwork}=fixture();
  for(const region of earthwork.bands.filter(b=>b.kind==='region')){
    const source=graph.placement(region.id);
    const updated=waterGraph.placement(region.id);
    assert.equal(updated.schema,source.schema);
    assert.ok(updated.placements.length<=source.placements.length);
    assert.ok(updated.placements.every(item=>source.placements.some(p=>p.id===item.id)),
      'surviving props preserve stable WorldGen IDs and original positions');
    const wet=region.fluidLayout.riverChannels[0].floor;
    for(const item of updated.placements){
      const {x,z}=item.position,radius=item.footprint?.radius??0;
      for(const cell of wet){
        const dx=Math.max(0,Math.abs(x-(cell.x+.5))-.5);
        const dz=Math.max(0,Math.abs(z-(cell.z+.5))-.5);
        assert.ok(dx*dx+dz*dz>=(radius+.35)**2,
          'tree/prop collider cannot overlap wet river or shoreline: '+item.id);
      }
    }
  }
  const channel={floor:[{x:0,z:0,y:2},{x:0,z:1,y:2}]};
  const old=Object.freeze({schema:'placement.v1',placements:Object.freeze([
    {id:'water-tree',position:{x:.5,z:.5},footprint:{radius:.5}},
    {id:'shore-boulder',position:{x:1.1,z:.5},footprint:{radius:.4}},
    {id:'dry-tree',position:{x:12,z:12},footprint:{radius:.4}}
  ])});
  const out=excludeHuntRiverPlacements(old,channel);
  assert.deepEqual(out.placements.map(p=>p.id),['dry-tree']);
  assert.equal(out.excludedForRiver,2);
  assert.equal(old.placements.length,3,'source WorldGen placement stays immutable');
});
