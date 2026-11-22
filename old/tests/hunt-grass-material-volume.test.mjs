import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {huntGrassMaterialVolume} from '../src/hunt-grass-material-volume.mjs';

test('the Hunt shoulder map tracks exposed materials and elevations after an edit',()=>{
  const world=new VoxelWorld();
  world.set(-1,3,-2,1);
  world.set(-1,2,-2,2);
  world.set(0,3,-2,2);
  world.set(1,5,-2,3);
  const read=()=>{
    const volume=huntGrassMaterialVolume(world,0,0,-3,6);
    assert.deepEqual(volume.size,[40,3,40]);
    return x=>volume.data[18*120+20+x];
  };
  const before=read();
  assert.equal(before(-1),29);
  assert.equal(before(0),30);
  assert.equal(before(1),39);
  assert.equal(before(2),0);
  world.set(-1,3,-2,0);
  assert.equal(read()(-1),26);
});

test('root shade follows only live trunks on their own grass level',()=>{
  const world=new VoxelWorld();
  world.set(0,3,0,1);
  world.set(1,3,0,2);
  world.set(0,7,1,1);
  const tree={x:.5,y:4,z:.5,scale:1,sprite:{}};
  const shade=(regions,x,z)=>huntGrassMaterialVolume(world,0,0,-3,8,regions)
    .data[(20+z)*120+60+x];
  assert.equal(shade([[tree]],0,0),255);
  assert.equal(shade([[tree]],1,0),0);
  assert.equal(shade([[tree]],0,1),0);
  assert.equal(shade([],0,0),0);
});

test('cut depth follows the saved cut and only shows when the removed cells are exposed',()=>{
  const world=new VoxelWorld();
  world.set(0,1,0,3);
  world.set(1,2,0,2);
  world.set(2,3,0,1);
  const removals=new Set(['0,2,0','0,3,0','1,3,0','2,2,0']);
  const cut=x=>huntGrassMaterialVolume(world,0,0,-3,6,[],removals).data[20*120+100+x];
  assert.equal(cut(0),170);
  assert.equal(cut(1),85);
  assert.equal(cut(2),0);
  world.set(0,3,0,3);
  assert.equal(cut(0),0);
});
