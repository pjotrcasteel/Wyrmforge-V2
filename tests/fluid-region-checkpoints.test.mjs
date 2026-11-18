import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {
  FluidRegionCheckpoints,FLUID_REGION_CHECKPOINT_SCHEMA,
  MAX_ACTIVE_FLUID_REGIONS,MAX_FLUID_REGIONS
} from '../src/fluid/fluid-region-checkpoints.mjs';

const engine=(floor=0,kind='water')=>new ColumnFluidEngine({
  bounds:{minX:0,maxX:2,minZ:0,maxZ:0},floorAt:()=>floor,kind,
  initial:[{x:0,z:0,depth:24}]
});

test('evict and revisit preserves the exact water and airborne solver state',()=>{
  const regions=new FluidRegionCheckpoints('seed-7-world-a');
  const first=regions.open('river-1',()=>engine());
  for(let i=0;i<20;i++)regions.step({budget:3});
  const original=first.snapshot();
  assert.equal(regions.close('river-1'),true);
  assert.deepEqual(regions.activeIds,[]);
  assert.deepEqual(regions.dormantIds,['river-1']);
  assert.equal(regions.step({budget:3}).processed,0);
  const restored=regions.open('river-1',()=>engine());
  assert.deepEqual(restored.snapshot(),original);
  for(let i=0;i<30;i++){
    first.step({budget:3});
    regions.step({budget:3});
  }
  assert.deepEqual(restored.snapshot(),first.snapshot());
  assert.equal(regions.close('river-1'),true);
  assert.equal(regions.close('river-1'),false);
});

test('a region cannot restore before the matching voxel terrain has been replayed',()=>{
  const regions=new FluidRegionCheckpoints('seed-7-world-b');
  regions.open('bank',()=>engine(0));
  regions.close('bank');
  assert.throws(()=>regions.open('bank',()=>engine(-2)),/same replayed physical terrain/);
  assert.deepEqual(regions.dormantIds,['bank']);
  assert.deepEqual(regions.activeIds,[]);
  assert.equal(regions.open('bank',()=>engine(0)).totalDepth,24);
});

test('checkpoint export/import survives a reload without leaking live references',()=>{
  const original=new FluidRegionCheckpoints('plan-19-seed-42');
  const a=original.open('a',()=>engine());
  original.open('b',()=>engine(2,'lava'));
  original.step({budget:3});
  original.close('a');
  const data=JSON.parse(JSON.stringify(original.exportCheckpoint()));
  assert.equal(data.schema,FLUID_REGION_CHECKPOINT_SCHEMA);
  assert.deepEqual(data.regions.map(r=>r.id),['a','b']);
  const replay=new FluidRegionCheckpoints('plan-19-seed-42');
  replay.importCheckpoint(data);
  assert.deepEqual(replay.open('a',()=>engine()).snapshot(),a.snapshot());
  assert.equal(replay.open('b',()=>engine(2,'lava')).kind,'lava');
  data.regions[0].state.depths[0]=999;
  assert.notEqual(replay.exportCheckpoint().regions[0].state.depths[0],999);
  assert.throws(()=>new FluidRegionCheckpoints('other-world').importCheckpoint(data),
    /Incompatible Water V2 region checkpoint/);
});

test('checkpoint import is atomic and rejects duplicates and corrupted entries',()=>{
  const regions=new FluidRegionCheckpoints('seed-7');
  regions.open('valid',()=>engine());
  regions.close('valid');
  const before=regions.exportCheckpoint();
  const duplicate={...before,regions:[before.regions[0],before.regions[0]]};
  assert.throws(()=>regions.importCheckpoint(duplicate),/Duplicate/);
  const broken={...before,regions:[{id:'bad',state:{schema:'bogus'}}]};
  assert.throws(()=>regions.importCheckpoint(broken),/bounded Water V2/);
  assert.deepEqual(regions.exportCheckpoint(),before);
  regions.open('valid',()=>engine());
  assert.throws(()=>regions.importCheckpoint(before),/Evict active/);
});

test('a shared fixed budget is bounded and rotates across live regions',()=>{
  const regions=new FluidRegionCheckpoints('seed-8');
  const first=regions.open('first',()=>engine());
  const second=regions.open('second',()=>engine());
  const third=regions.open('third',()=>engine());
  for(let i=0;i<9;i++){
    const result=regions.step({budget:2});
    assert.ok(result.processed<=2);
    assert.equal(result.regions,2);
  }
  assert.ok(first.steps>0&&second.steps>0&&third.steps>0);
  assert.throws(()=>regions.step({budget:0}),/step budget/);
  for(let i=3;i<MAX_ACTIVE_FLUID_REGIONS;i++){
    regions.open('r'+i,()=>engine());
  }
  assert.throws(()=>regions.open('overflow',()=>engine()),/Too many active/);
});

test('region count and serialised state remain bounded',()=>{
  const regions=new FluidRegionCheckpoints('seed-9');
  for(let i=0;i<MAX_FLUID_REGIONS;i++){
    const id='r'+i;
    regions.open(id,()=>engine());
    regions.close(id);
  }
  assert.equal(regions.dormantIds.length,MAX_FLUID_REGIONS);
  assert.throws(()=>regions.open('r48',()=>engine()),/region count/);
  assert.throws(()=>regions.importCheckpoint({...regions.exportCheckpoint(),
    regions:[{id:'invalid id',state:engine().snapshot()}]}),/region ID/);
});
