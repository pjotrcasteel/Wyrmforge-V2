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
    assert.deepEqual(volume.size,[40,1,40]);
    return x=>volume.data[18*40+20+x];
  };
  const before=read();
  assert.equal(before(-1),29);
  assert.equal(before(0),30);
  assert.equal(before(1),39);
  assert.equal(before(2),0);
  world.set(-1,3,-2,0);
  assert.equal(read()(-1),26);
});
