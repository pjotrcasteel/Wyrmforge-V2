import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainViewResidencyPolicy} from '../src/terrain-view-residency-policy.mjs';

const cells=Array.from({length:12},(_,index)=>{
  const x=(index-6)*8;
  return {id:String(index),bounds:{minX:x,maxX:x+7,minZ:0,maxZ:7}};
});
const windowAt=x=>({minX:x-5,maxX:x+5,minZ:1,maxZ:7});

test('prefetch and retention keep a reversing viewport loaded without round-trip churn',()=>{
  const policy=new TerrainViewResidencyPolicy(cells,{limit:6,preload:8,retain:16});
  const residentIds=new Set();
  function settle(x){
    let loads=0,evictions=0;
    for(let step=0;step<20;step++){
      const {job}=policy.next({view:windowAt(x),residentIds});
      if(!job)return {loads,evictions};
      if(job.action==='load'){
        residentIds.add(job.id);
        loads++;
      }else{
        const {bounds}=cells.find(cell=>cell.id===job.id);
        assert.ok(bounds.maxX+1<x-5||bounds.minX>x+5);
        residentIds.delete(job.id);
        evictions++;
      }
      assert.ok(residentIds.size<=6);
    }
    assert.fail('View policy did not settle');
  }
  assert.ok(settle(0).loads>2);
  assert.ok(residentIds.has('7'),'preload reaches beyond the visible edge');
  assert.deepEqual(settle(1),{loads:0,evictions:0});
  assert.deepEqual(settle(-1),{loads:0,evictions:0});
  assert.ok(settle(25).evictions>0);
});

test('keeps visible and physically protected cells when pressure reaches the cap',()=>{
  const policy=new TerrainViewResidencyPolicy(cells,{limit:2});
  const view=windowAt(4);
  assert.deepEqual(policy.next({view,residentIds:['6','0'],protectedIds:['0']}),
    {job:null,reason:'required-capacity'});
  assert.deepEqual(policy.next({view,residentIds:['6','0']}).job,{action:'evict',id:'0'});
  assert.deepEqual(policy.next({view,residentIds:['6'],protectedIds:['0']}).job,{action:'load',id:'0'});
  assert.deepEqual(policy.next({view,residentIds:['6'],busy:true}),
    {job:null,reason:'transition-in-flight'});
});

test('urgent visible cells can use an offscreen slot inside the retention ring',()=>{
  const policy=new TerrainViewResidencyPolicy(cells,{limit:2});
  const view={minX:9,maxX:15,minZ:1,maxZ:7};
  assert.deepEqual(policy.next({view,residentIds:['6','8']}).job,{action:'evict',id:'6'});
  assert.deepEqual(policy.next({view,residentIds:['8']}).job,{action:'load',id:'7'});
});

test('planner waits for real terrain publication and preserves an edit after moving away and back',async()=>{
  const {TerrainStreamCellBuilder}=await import('../src/terrain-stream-cells.mjs');
  const {VoxelWorld}=await import('../src/voxel-world.mjs');
  const {V2TerrainResidencySet}=await import('../src/terrain-residency-set.mjs');
  const builder=new TerrainStreamCellBuilder({schema:'voxel-v2.terrain-initialization.v1',
    siteId:'trail',generatorVersion:'test',seed:7,chunkEdge:16,
    runs:[{x:-16,y:0,z:0,length:48,material:1}]});
  while(!builder.done)builder.step(2);
  const catalog=builder.cells;
  const world=new VoxelWorld({chunkEdge:16});
  const residency=new V2TerrainResidencySet(world,{residentLimit:3});
  const policy=new TerrainViewResidencyPolicy(catalog,{limit:3,preload:1,retain:4});
  for(const cell of catalog)residency.register(cell.id,cell.definition);
  const frame=(x)=>{
    const request={view:{minX:x-2,maxX:x+2,minZ:0,maxZ:1},residentIds:residency.residentIds};
    const {job}=policy.next(request);
    if(!job)return false;
    residency.begin(job.id,job.action);
    while(residency.metrics.transition.phase==='writing')residency.step(2);
    assert.equal(policy.next({...request,residentIds:residency.residentIds,busy:true}).job,null);
    assert.ok(!residency.residentIds.includes(job.id));
    assert.ok(residency.dirtyChunks.size>0);
    residency.publish();
    return true;
  };
  const settle=x=>{
    for(let step=0;step<20;step++)if(!frame(x))return;
    assert.fail('Terrain publication did not settle');
  };
  settle(-4);
  assert.equal(world.get(-4,0,0),1);
  world.set(-4,0,0,0);
  settle(24);
  assert.ok(!residency.residentIds.includes(catalog[1].id));
  settle(-4);
  assert.ok(residency.residentIds.includes(catalog[1].id));
  assert.equal(world.get(-4,0,0),0);
  assert.equal(world.get(-3,0,0),1);
});

test('directional preload replaces trailing padding at capacity and settles',()=>{
  const policy=new TerrainViewResidencyPolicy(cells,{limit:3,preload:8,retain:16});
  const request={view:windowAt(6),lookahead:windowAt(14)};
  assert.deepEqual(policy.next({...request,residentIds:['5','6','7']}).job,{action:'evict',id:'5'});
  assert.deepEqual(policy.next({...request,residentIds:['6','7']}).job,{action:'load',id:'8'});
  assert.equal(policy.next({...request,residentIds:['6','7','8']}).job,null);
  assert.deepEqual(policy.next({...request,residentIds:['6','7'],protectedIds:['5']}).job,
    {action:'load',id:'5'});
  assert.equal(policy.next({...request,residentIds:['5','6','7'],protectedIds:['5']}).job,null);
});
