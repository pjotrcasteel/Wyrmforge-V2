import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {buildFluidSurfaceMesh} from '../src/fluid/fluid-surface-mesh.mjs';
import {createWorldGenFluidEngine} from '../src/fluid/worldgen-fluid-adapter.mjs';

function ledge(kind='water'){
  const fluid=new ColumnFluidEngine({
    kind,
    bounds:{minX:0,maxX:5,minZ:0,maxZ:0},
    floorAt:x=>x<3?2:0,
    initial:Array.from({length:6},(_,x)=>({x,z:0,depth:10})),
    sources:[{x:0,z:0,surfaceY:3,rate:3}],
    outlets:[{x:5,z:0,surfaceY:1,rate:3}]
  });
  return fluid;
}

function physicalRiver(){
  const floor=(x,z)=>x<2||x>4||z===0||z===8?4:z<=3?2:0;
  const layout={
    footprint:{minX:0,maxX:8,minZ:0,maxZ:8,minY:-1,maxY:5},
    riverChannels:[{
      kind:'water',
      floor:Array.from({length:7},(_,index)=>index+1)
        .flatMap(z=>[2,3,4].map(x=>({x,z,y:floor(x,z)}))),
      nodes:Array.from({length:7},(_,index)=>({
        x:3,z:index+1,y:floor(3,index+1)
      })),
      from:{x:3,z:1},to:{x:3,z:7}
    }]
  };
  const terrain={materialAt:(x,y,z)=>y<floor(x,z)?3:0};
  return {layout,terrain,floor};
}

test('an active upstream water inlet is serviced every game step, not once per 4096-cell scan',()=>{
  const fluid=new ColumnFluidEngine({
    bounds:{minX:0,maxX:63,minZ:0,maxZ:63},
    floorAt:()=>0,
    sources:[{x:0,z:0,surfaceY:1,rate:3}]
  });
  let injected=0;
  for(let i=0;i<8;i++){
    const state=fluid.step({budget:96});
    assert.equal(state.sourcesProcessed,1);
    assert.ok(state.processed<=96);
    injected+=state.injected;
  }
  assert.ok(injected>=10,'the inlet replenishes ten centimeters every few frames');
  assert.ok(fluid.wetCount>0);
  assert.equal(fluid.snapshot().sourceCursor,0);
});

test('an open river with a real downstream outlet keeps a wet stone lip and sustained falls',()=>{
  const fluid=ledge();
  const first=fluid.totalDepth;
  let totalInjected=0,drainFrames=0,persistentFalls=0;
  for(let tick=0;tick<500;tick++){
    const result=fluid.step({budget:6});
    totalInjected+=result.injected;
    if(result.drained>0)drainFrames++;
    assert.equal(fluid.totalDepth+fluid.totalDrained,first+totalInjected,
      'water must be accounted for as resident, airborne, or legitimately leaving the downstream edge');
    if(tick>150&&tick%10===0){
      assert.ok(fluid.sample(2,0).depth>0,'real upper stone lip must stay under water');
      const surface=fluid.snapshotSurface();
      const geometry=buildFluidSurfaceMesh(surface,{
        sampleAt:(x,z)=>fluid.sample(x,z)
      });
      if(geometry.waterfallFaces>0)persistentFalls++;
    }
  }
  assert.ok(drainFrames>5,'the downstream mouth must actually carry away excess water');
  assert.ok(persistentFalls>=28,'real waterfall should persist across sustained sampled gameplay');
  assert.ok(fluid.totalDrained>0);
});

test('WorldGen uses real authored upstream and downstream river mouths, not artificial river-wide refills',()=>{
  const {layout,terrain,floor}=physicalRiver();
  const created=createWorldGenFluidEngine(layout,terrain);
  const {fluid}=created;
  assert.ok(created.inletCellCount>=3);
  assert.ok(created.outletCellCount>=3);
  assert.ok(created.inletCellCount<=8);
  assert.ok(created.outletCellCount<=8);
  const saved=fluid.snapshot();
  assert.equal(saved.sources.length,created.inletCellCount);
  assert.equal(saved.outlets.length,created.outletCellCount);
  const width=9;
  for(const {index} of saved.sources){
    const x=index%width,z=Math.floor(index/width);
    assert.equal(z,1);
    assert.ok(x>=2&&x<=4);
  }
  for(const {index} of saved.outlets){
    const x=index%width,z=Math.floor(index/width);
    assert.ok(z>=6&&z<=7);
    assert.ok(x>=2&&x<=4);
  }
  const initial=fluid.totalDepth;
  let injected=0,drained=0,fallFrames=0;
  for(let tick=0;tick<320;tick++){
    const response=fluid.step({budget:48});
    injected+=response.injected;
    drained+=response.drained;
    assert.ok(response.processed<=48);
    assert.equal(fluid.totalDepth,initial+injected-drained);
    assert.equal(fluid.sample(1,3).depth,0,'high solid riverbank must remain dry');
    if(tick>=120&&tick%8===0){
      assert.ok(fluid.sample(3,3).depth>0,
        'the authored rock ledge must stay covered after the river is flowing');
      assert.equal(fluid.sample(3,3).floorY,floor(3,3));
      const mesh=buildFluidSurfaceMesh(fluid.snapshotSurface(),{
        sampleAt:(x,z)=>fluid.sample(x,z)
      });
      if(mesh.waterfallFaces>0)fallFrames++;
    }
  }
  assert.ok(fallFrames>=18,'a WorldGen cliff should maintain its genuine waterfall');
  assert.ok(drained>0,'the natural exit should carry liquid out of the resident river');
});

test('midflow inlet/outlet budget and saved boundary cursor are deterministic',()=>{
  const a=ledge();
  for(let i=0;i<41;i++){
    const result=a.step({budget:2});
    assert.ok(result.processed<=2);
  }
  const copy=JSON.parse(JSON.stringify(a.snapshot()));
  const b=ledge();
  b.restore(copy);
  assert.deepEqual(b.snapshot(),copy);
  for(let i=0;i<100;i++){
    assert.deepEqual(a.step({budget:2}),b.step({budget:2}));
    assert.deepEqual(a.snapshot(),b.snapshot());
  }
  const incompatible=ledge();
  const forged=JSON.parse(JSON.stringify(copy));
  forged.outlets[0].rate=10;
  assert.throws(()=>incompatible.restore(forged),/Incompatible fluid snapshot/);
  assert.equal(incompatible.totalDrained,0);
});

test('lava uses the same open physical channel, but its lower transfer rate',()=>{
  const water=ledge('water'),lava=ledge('lava');
  let waterTransfers=0,lavaTransfers=0;
  for(let i=0;i<10;i++){
    waterTransfers+=water.step({budget:6}).transferred;
    lavaTransfers+=lava.step({budget:6}).transferred;
  }
  assert.ok(waterTransfers>lavaTransfers);
  assert.ok(lava.totalDepth>0);
});
