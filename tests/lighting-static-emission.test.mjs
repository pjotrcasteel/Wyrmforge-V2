import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {raycastTerrain} from '../src/terrain-raycast.mjs';
import {nearestLightObstruction,lightSegmentVisible}
  from '../src/lighting/spatial-visibility.mjs';
import {collectEmissiveSurfaceCells,MAX_STATIC_EMISSIVE_CELLS}
  from '../src/hunt-surface-emission.mjs';

const geometry=world=>({raycast:options=>raycastTerrain(world,options)});
test('public Voxel geometry blocks an emissive segment until the wall is destroyed',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let y=0;y<=4;y++)for(let z=-1;z<=1;z++)world.set(2,y,z,3);
  const port=geometry(world),from=[.5,2.3,.5],behind=[5.5,2.3,.5];
  assert.equal(lightSegmentVisible(port,from,behind),false);
  assert.equal(lightSegmentVisible(port,from,[1.4,2.3,.5]),true);
  for(let y=0;y<=4;y++)for(let z=-1;z<=1;z++)world.set(2,y,z,0);
  assert.equal(lightSegmentVisible(port,from,behind),true);
});
test('generic building and tree AABBs are equivalent read-only blockers',()=>{
  const world=new VoxelWorld({chunkEdge:16}),port=geometry(world);
  const building={id:'building',min:[2,0,-2],max:[3,5,3]};
  const tree={id:'tree',min:[2,0,-2],max:[3,5,3]};
  const from=[.5,2.3,.5],to=[5.5,2.3,.5];
  assert.equal(lightSegmentVisible(port,from,to,[building]),false);
  assert.equal(lightSegmentVisible(port,from,to,[tree]),false);
  assert.equal(lightSegmentVisible(port,from,to),true);
});
test('adjacent emission cells do not waste physical raycasts',()=>{
  let count=0;
  const port={raycast:()=>{count++;return null;}};
  assert.equal(lightSegmentVisible(port,[.5,2,.5],[.55,2,.55]),true);
  assert.equal(count,0);
  assert.equal(nearestLightObstruction(port,[0,0,0],[1,0,0],2),2);
  assert.equal(count,1);
});
test('authored and live surface channels emit through the same generic adapter',()=>{
  const data=new Uint8Array(3*2*4);
  // Materials declares 255 emissive and 128 nonemissive. Lighting knows neither.
  data.set([11,0,0,255],0);
  data.set([12,0,0,128],4);
  data.set([10,0,0,255],16);
  const surface={origin:[-4,-2],size:[3,2],data};
  const cells=collectEmissiveSurfaceCells(surface,{heightOffset:8,energyByChannel:{255:1}});
  assert.deepEqual(cells.map(({x,z,surfaceY})=>[x,z,surfaceY]),
    [[-4,-2,3],[-3,-1,2]]);
  assert.equal(cells[0].energy,1);
  assert.ok(Object.isFrozen(cells[0]));
  assert.equal(collectEmissiveSurfaceCells(null).length,0);
  assert.equal(collectEmissiveSurfaceCells(surface,{heightOffset:8,energyByChannel:{128:0}}).length,0);
});
test('emissive adapter rejects unbounded or invalid published surface maps',()=>{
  const surface={origin:[0,0],size:[80,80],data:new Uint8Array(80*80*4)};
  for(let i=0;i<surface.data.length;i+=4)surface.data[i+3]=255;
  assert.throws(()=>collectEmissiveSurfaceCells(surface,{
    heightOffset:8,energyByChannel:{255:1}}),RangeError);
  assert.equal(MAX_STATIC_EMISSIVE_CELLS,4096);
  assert.throws(()=>collectEmissiveSurfaceCells({
    origin:[0,0],size:[2,2],data:new Uint8Array(2)
  },{energyByChannel:{255:1}}),TypeError);
});
