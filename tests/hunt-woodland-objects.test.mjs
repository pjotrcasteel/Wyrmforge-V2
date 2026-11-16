import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {V2TerrainPort} from '../src/terrain-integration-port.mjs';
import {TerrainEditLedger} from '../src/terrain-edit-ledger.mjs';
import {HuntWoodlandObjects} from '../src/hunt-woodland-objects.mjs';

test('grounded trunks stop both approaches, preserve canopy clearance and evict with the region',()=>{
  const tree={kind:'tree',id:'trunk-1',position:{x:0,y:5,z:0},scale:1,seed:7};
  const objects=new HuntWoodlandObjects({placement:()=>({placements:[tree]})});
  const terrain={raycast:()=>({point:{y:5}})};
  objects.update(['entry'],terrain);
  const first=[...objects.regions][0][0];
  assert.ok(Math.abs(objects.limitTravel({x:-2,y:5,z:0},'x',4)-1.48999)<1e-9);
  assert.ok(Math.abs(objects.limitTravel({x:0,y:5,z:2},'z',-4)+1.48999)<1e-9);
  assert.equal(objects.limitTravel({x:-2,y:5,z:1},'x',4),4);
  assert.equal(objects.limitTravel({x:-2,y:7,z:0},'x',4),4);
  objects.update([],terrain);
  assert.equal(objects.limitTravel({x:-2,y:5,z:0},'x',4),4);
  objects.update(['entry'],terrain);
  assert.deepEqual([...objects.regions][0][0],first);
});

test('grounded logs use a long narrow footprint and fall back to rock on steep ground',()=>{
  const placements=[{kind:'boulder',id:'reserved',position:{x:0,y:5,z:0},
    scale:1,seed:0,footprint:{radius:.85}}];
  const objects=new HuntWoodlandObjects({placement:()=>({placements})});
  objects.update(['entry'],{raycast:()=>({point:{y:5}})});
  const log=[...objects.regions][0][0];
  assert.equal(log.kind,'log');
  const end=objects.limitTravel({x:-2,y:5,z:0},'x',4);
  const side=objects.limitTravel({x:0,y:5,z:-2},'z',4);
  assert.ok(end<side&&side<2);
  objects.update([],null);
  objects.update(['entry'],{raycast:({origin})=>({point:{y:origin[0]===0?5:4}})});
  assert.equal([...objects.regions][0][0].kind,'boulder');
});

test('the large oak blocks a side approach at the root base without making its canopy solid',()=>{
  const tree={kind:'tree',id:'oak',position:{x:0,y:5,z:0},scale:1,
    seed:4<<8,footprint:{radius:.46}};
  const objects=new HuntWoodlandObjects({placement:()=>({placements:[tree]})});
  objects.update(['entry'],{raycast:()=>({point:{y:5}})});
  const [oak]=[...objects.regions][0];
  assert.match(oak.sprite.name,/^tree\.oak_l\./);
  assert.equal(oak.radius,.46);
  assert.ok(objects.limitTravel({x:-2,y:5,z:.65},'x',4)<2);
  assert.equal(objects.limitTravel({x:-2,y:5,z:.9},'x',4),4);
});

test('removing root support replaces the trunk and reconstructs the fallen log after eviction',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let z=-4;z<=4;z++)for(let x=-4;x<=4;x++){
    world.set(x,0,z,4);
    for(let y=1;y<=3;y++)world.set(x,y,z,1);
  }
  const terrain=new V2TerrainPort(world,new TerrainEditLedger(world));
  const tree={kind:'tree',id:'edited-trunk',position:{x:.5,y:4,z:.5},
    scale:1,seed:7,footprint:{radius:.46}};
  const objects=new HuntWoodlandObjects({placement:()=>({placements:[tree]})});
  objects.update(['entry'],terrain);
  assert.ok(objects.limitTravel({x:-1,y:4,z:.5},'x',3)<3);
  const result=terrain.apply({id:'root-crater',type:'carve-crater',x:0,y:3,z:0,radius:2.3,depth:2});
  assert.ok(result.removedVoxels>0);
  objects.terrainChanged(result.changedBounds,terrain);
  const [fallen]=[...objects.regions][0];
  assert.equal(fallen.id,tree.id);
  assert.equal(fallen.kind,'log');
  assert.ok(fallen.y<tree.position.y-.5);
  assert.equal(objects.limitTravel({x:-1,y:4,z:.5},'x',3),3);
  assert.ok(objects.limitTravel({x:-1,y:fallen.y,z:.5},'x',3)<3);
  objects.update([],terrain);
  objects.update(['entry'],terrain);
  assert.deepEqual([...objects.regions][0],[fallen]);
});
