import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMicroSurfaceTiles } from '../src/world-generation/micro-surface-grammar.mjs';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { raycastTerrain } from '../src/terrain-raycast.mjs';

function rockRim(options={}) {
  const radius=3,heights=new Int16Array(36),surfaces=new Uint8Array(36).fill(3);
  // Connected raised shelf, with an exposed west and north corner at 0,0.
  for(let z=0;z<3;z++)for(let x=0;x<3;x++)heights[(z+3)*6+x+3]=2;
  return composeMicroSurfaceTiles({radius,seed:7,heights,surfaces,
    routes:[],rockFaceThreshold:2,...options});
}

test('rock rims chip only elevated outlines and preserve solid interiors',()=>{
  const result=rockRim();
  const corner=result.tiles.find(t=>t.x===0&&t.z===0);
  assert.ok(corner);
  assert.ok(corner.levels[0]<10,'weathered convex corner is chipped');
  assert.equal(corner.levels[99],10,'shelf interior retains full height');
  assert.ok(new Set(corner.levels).size>=2,'rim tapers in microvoxel steps');
  assert.ok(result.tiles.every(t=>t.y===2),'lower floor is never depressed');
  assert.deepEqual(result,rockRim(),'seeded occupancy is reproducible');
  assert.ok(result.tileCount<=384);
});

test('rock rim rays hit the same microcells that define the visible silhouette',()=>{
  const tile=rockRim().tiles.find(t=>t.x===0&&t.z===0);
  const world=new VoxelWorld();
  world.set(0,1,0,3);world.set(0,2,0,3);
  world.setMicroSurfaceTile(0,2,0,tile.levels);
  for(const [x,z] of [[0,0],[2,2],[9,9]]) {
    const height=2+tile.levels[z*10+x]/10;
    const hit=raycastTerrain(world,{origin:[(x+0.5)/10,5,(z+0.5)/10],
      direction:[0,-1,0],maxDistance:10});
    assert.ok(Math.abs(hit.point.y-height)<0.0001);
    assert.equal(world.materialAtPoint((x+0.5)/10,height-0.05,(z+0.5)/10),3);
    assert.equal(world.materialAtPoint((x+0.5)/10,height+0.05,(z+0.5)/10),0);
  }
});

test('fluid floors excluded by WorldGen retain their authored height',()=>{
  assert.equal(rockRim({surfaceExclusions:new Set([21])}).tiles
    .some(t=>t.x===0&&t.z===0),false);
});


test('diagonal-only exposure refines a square corner without depressing its interior',()=>{
  const heights=new Int16Array(36).fill(2),surfaces=new Uint8Array(36).fill(3);
  heights[(1+3)*6+1+3]=0;
  const result=composeMicroSurfaceTiles({radius:3,seed:7,heights,surfaces,
    routes:[],rockFaceThreshold:2});
  const tile=result.tiles.find(t=>t.x===0&&t.z===0);
  assert.ok(tile,'diagonal corners are included even with no lower cardinal neighbor');
  assert.ok(tile.levels[99]<10);
  assert.equal(tile.levels[0],10);
});

import {rockRimCut} from '../src/world-generation/rock-rim-grammar.mjs';

test('coherent rim character crosses tile seams and varies between formations',()=>{
  const signatures=new Set();
  for(const seed of [7,19,101,267]) {
    for(let x=-5;x<5;x++) {
      const a=rockRimCut(seed,x,0,9,0,[[0,-1]]);
      const b=rockRimCut(seed,x+1,0,0,0,[[0,-1]]);
      assert.ok(Math.abs(a-b)<=1,'a tile boundary must not reset weathering');
      signatures.add(a);
    }
  }
  assert.ok(signatures.size>=3,'formations must have distinct rim depths');
});

test('seeded cliff exposure mixes intact stretches, light wear and occasional deep breaks',()=>{
  for(const seed of [7,19,101,267]) {
    let intact=0,light=0,deep=0;
    for(let z=-24;z<24;z++)for(let x=-24;x<24;x++) {
      const cut=rockRimCut(seed,x,z,5,0,[[0,-1]]);
      assert.equal(cut,rockRimCut(seed,x,z,5,0,[[0,-1]]));
      if(cut===0)intact++;
      else if(cut<=4)light++;
      else deep++;
    }
    assert.ok(intact>100,'some formations must retain intact faces');
    assert.ok(light>deep,'light weathering must outnumber deep breaks');
    assert.ok(deep>0,'occasional strongly weathered stretches remain');
    assert.ok(deep<2304/3,'deep breaks must not cover most cliff edges');
  }
});
