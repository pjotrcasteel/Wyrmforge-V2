import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import {
  TerrainEditLedger, MATERIAL_RESISTANCE, V2_BEDROCK_MATERIAL,
  MAX_PENDING_DAMAGE_CELLS
} from '../src/terrain-edit-ledger.mjs';

const pulse = (id, center, power = 1, expectedEditRevision) => ({
  id, type: 'damage-sphere', ...center, power, expectedEditRevision
});
const target = { x: 1, y: 0, z: 0, radius: 4 };

test('grass breaks on pulse one, dirt on two, stone on three, bedrock never', () => {
  for (const chunkEdge of [16,32]) {
    const world=new VoxelWorld({chunkEdge});
    world.set(0,0,0,1);
    world.set(1,0,0,2);
    world.set(2,0,0,3);
    world.set(3,0,0,V2_BEDROCK_MATERIAL);
    const ledger=new TerrainEditLedger(world);
    const first=ledger.apply(pulse('pulse-1',target,1,0));
    assert.equal(first.removedVoxels,1);
    assert.equal(first.damagedVoxels,2);
    assert.equal(first.pendingDamageCells,2);
    assert.equal(first.editRevision,1);
    assert.equal(world.get(0,0,0),0);
    assert.equal(world.get(1,0,0),2);
    assert.equal(ledger.damageAt(1,0,0),1);
    assert.equal(ledger.damageAt(2,0,0),1);
    assert.equal(world.get(3,0,0),4);

    const second=ledger.apply(pulse('pulse-2',target,1,1));
    assert.equal(second.removedVoxels,1);
    assert.equal(second.damagedVoxels,1);
    assert.equal(world.get(1,0,0),0);
    assert.equal(ledger.damageAt(1,0,0),0);
    assert.equal(ledger.damageAt(2,0,0),2);
    assert.equal(ledger.pendingDamageCells,1);

    const third=ledger.apply(pulse('pulse-3',target,1,2));
    assert.equal(third.removedVoxels,1);
    assert.equal(third.damagedVoxels,0);
    assert.equal(ledger.pendingDamageCells,0);
    assert.equal(world.get(2,0,0),0);
    assert.equal(world.get(3,0,0),4);
    assert.deepEqual(MATERIAL_RESISTANCE,{1:1,2:2,3:3});
  }
});

test('partial stone damage changes edit revision but never starts a geometry update', () => {
  const world=new VoxelWorld();
  world.set(1,2,3,3);
  const ledger=new TerrainEditLedger(world);
  const before=world.snapshots(), worldRevision=world.revision;
  const center={x:1,y:2,z:3,radius:1.2};
  const first=ledger.apply(pulse('first',center,1,0));
  const second=ledger.apply(pulse('second',center,1,1));
  assert.equal(first.removedVoxels,0);
  assert.equal(second.removedVoxels,0);
  assert.deepEqual(first.dirtyChunks,[]);
  assert.deepEqual(second.dirtyChunks,[]);
  assert.equal(world.revision,worldRevision);
  assert.deepEqual(world.snapshots(),before);
  assert.equal(ledger.damageAt(1,2,3),2);
  assert.equal(ledger.editRevision,2);
  const third=ledger.apply(pulse('third',center,1,2));
  assert.equal(third.removedVoxels,1);
  assert.ok(third.dirtyChunks.includes('0,0,0'));
  assert.equal(ledger.pendingDamageCells,0);
  assert.equal(world.get(1,2,3),0);
});

test('duplicate damage ID never stacks damage twice, payload conflicts are rejected', () => {
  const world=new VoxelWorld();
  world.set(0,0,0,3);
  const ledger=new TerrainEditLedger(world);
  const cmd=pulse('damage-1',{x:0,y:0,z:0,radius:1.1},1,0);
  const first=ledger.apply(cmd);
  const duplicate=ledger.apply({...cmd});
  assert.equal(first.damagedVoxels,1);
  assert.equal(duplicate.status,'duplicate');
  assert.equal(duplicate.damagedVoxels,0);
  assert.equal(duplicate.originalEditRevision,1);
  assert.equal(ledger.damageAt(0,0,0),1);
  assert.equal(ledger.editRevision,1);
  assert.throws(()=>ledger.apply({...cmd,power:2}),/Edit ID conflict/);
  assert.throws(()=>ledger.apply({...cmd,type:'carve-sphere',power:undefined}),/Edit ID conflict/);
  assert.equal(world.get(0,0,0),3);
});

test('partial damage must use edit revision for concurrency, even if world revision is unchanged', () => {
  const world=new VoxelWorld();
  world.set(0,0,0,3);
  const ledger=new TerrainEditLedger(world);
  const revision=world.revision;
  const c={x:0,y:0,z:0,radius:1.1};
  ledger.apply({...pulse('a',c,1,0),expectedRevision:revision});
  const before=world.snapshots();
  assert.throws(
    ()=>ledger.apply({...pulse('b',c,1,0),expectedRevision:revision}),
    /expected edit revision mismatch/
  );
  assert.equal(ledger.editRevision,1);
  assert.equal(ledger.damageAt(0,0,0),1);
  assert.deepEqual(world.snapshots(),before);
});

test('instant carve clears partial damage and keeps its legacy immediate effect', () => {
  const world=new VoxelWorld();
  world.set(0,0,0,3);
  const ledger=new TerrainEditLedger(world);
  const c={x:0,y:0,z:0,radius:1.1};
  ledger.apply(pulse('a',c,1,0));
  assert.equal(ledger.pendingDamageCells,1);
  const carve=ledger.apply({id:'instant',type:'carve-sphere',...c});
  assert.equal(carve.removedVoxels,1);
  assert.equal(carve.damagedVoxels,0);
  assert.equal(ledger.pendingDamageCells,0);
  assert.equal(ledger.damageAt(0,0,0),0);
});

test('damage pulses across negative and positive chunk seams match direct V2 meshes', () => {
  for(const edge of [16,32]){
    const world=new VoxelWorld({chunkEdge:edge});
    world.set(-1,0,0,2);
    world.set(0,0,0,2);
    const ledger=new TerrainEditLedger(world);
    const beforeRevision=world.revision;
    const c={x:0,y:0,z:0,radius:1.9};
    const first=ledger.apply(pulse('one',c,1));
    assert.equal(first.removedVoxels,0);
    assert.equal(world.revision,beforeRevision);
    const second=ledger.apply(pulse('two',c,1));
    assert.equal(second.removedVoxels,2);
    assert.deepEqual(second.dirtyChunks.sort(),['-1,0,0','0,0,0']);
    assert.equal(buildExposedFaceMeshes(world).length,0);
  }
});

test('identical damage sequence has identical material snapshots and edit histories', () => {
  for(const edge of [16,32]){
    function replay(){
      const world=createScene('hill',7,{chunkEdge:edge});
      const ledger=new TerrainEditLedger(world);
      const center={x:0,y:3,z:0,radius:3.75};
      const results=[];
      for(let index=0;index<3;index++){
        results.push(ledger.apply(pulse(`p-${index}`,center,1,ledger.editRevision)));
      }
      return {
        snapshots:world.snapshots(),results,
        remainingDamage:ledger.pendingDamageCells,editRevision:ledger.editRevision
      };
    }
    assert.deepEqual(replay(),replay());
  }
});

test('reject invalid powers and preflight pending-damage capacity without partial effects', () => {
  const world=new VoxelWorld({chunkEdge:16});
  const ledger=new TerrainEditLedger(world);
  world.set(0,0,0,3);
  for(const power of [0,9,1.5,NaN,Infinity]){
    assert.throws(()=>ledger.apply(pulse(`invalid-${power}`,
      {x:0,y:0,z:0,radius:1.1},power)),RangeError);
  }
  assert.throws(()=>ledger.apply({
    id:'bad-carve',type:'carve-sphere',x:0,y:0,z:0,radius:1.1,power:1
  }),TypeError);
  assert.equal(ledger.recordedEdits,0);
  assert.equal(world.get(0,0,0),3);

  const many=new VoxelWorld({chunkEdge:32});
  // Each radius-8 sphere has ~2100 cells; the fourth would exceed 8192.
  for(const cx of [0,24,48,72]){
    for(let z=-7;z<=7;z++) for(let y=-7;y<=7;y++) for(let x=-7;x<=7;x++){
      if(x*x+y*y+z*z<64) many.set(cx+x,y,z,3);
    }
  }
  const damage=new TerrainEditLedger(many);
  const center=cx=>({x:cx,y:0,z:0,radius:8});
  for (const [i,cx] of [0,24,48].entries()) {
    damage.apply(pulse(`big-${i}`,center(cx)));
  }
  assert.ok(damage.pendingDamageCells<MAX_PENDING_DAMAGE_CELLS);
  const before=many.snapshots(), prior=damage.editRevision;
  assert.throws(()=>damage.apply(pulse('overflow',center(72))),RangeError);
  assert.equal(damage.editRevision,prior);
  assert.deepEqual(many.snapshots(),before);
});
