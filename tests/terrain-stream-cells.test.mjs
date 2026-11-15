import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainStreamCellBuilder} from '../src/terrain-stream-cells.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {V2TerrainBandResidency} from '../src/terrain-band-residency.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';

const source={
  schema:'voxel-v2.terrain-initialization.v2',siteId:'seam',generatorVersion:'test',
  seed:7,chunkEdge:16,
  runs:[{x:-10,y:0,z:-1,length:20,material:1},{x:-2,y:1,z:0,length:4,material:2}],
  surfaceTiles:[{x:-1,y:0,z:-1,levels:Array(100).fill(7)}]
};

function partition(budget){
  const builder=new TerrainStreamCellBuilder(source);
  assert.throws(()=>builder.cells,/still being prepared/);
  while(!builder.done)assert.ok(builder.step(budget).parts<=budget);
  return builder.cells;
}

test('independent 8 m cells reconstruct the same geometry across negative boundaries',()=>{
  const cells=partition(1);
  assert.deepEqual(cells,partition(16));
  assert.equal(cells.length,6);
  const expected=new V2ExternalTerrainLoader(source);
  while(!expected.progress.done)expected.loadStep(8);
  const world=new VoxelWorld({chunkEdge:16});
  for(const cell of cells.reverse()){
    const resident=new V2TerrainBandResidency(world,cell.definition,{resident:false});
    resident.beginReload();
    while(!resident.progress.done)resident.step(2);
  }
  const occupancy=w=>w.snapshots().map(s=>[s.id,s.data]);
  assert.deepEqual(occupancy(world),occupancy(expected.terrain.world));
  assert.deepEqual(world.microSurfaceTiles(),expected.terrain.world.microSurfaceTiles());
  expected.unload();
});

test('loading and evicting adjacent streaming cells leaves the shared storage chunk intact',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const east=partition(2).filter(cell=>cell.bounds.minZ===-8&&cell.bounds.minX>=0);
  const bands=east.map(cell=>new V2TerrainBandResidency(world,cell.definition,{resident:false}));
  for(const band of bands){
    band.beginReload();
    while(!band.progress.done)band.step(1);
  }
  assert.equal(world.get(1,0,-1),1);
  assert.equal(world.get(8,0,-1),1);
  bands[1].beginEviction();
  while(!bands[1].progress.done)bands[1].step(1);
  assert.equal(world.get(1,0,-1),1);
  assert.equal(world.get(8,0,-1),0);
});
