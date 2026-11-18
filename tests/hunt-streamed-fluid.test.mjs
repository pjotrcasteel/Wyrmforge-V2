import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntStreamedFluid} from '../src/fluid/hunt-streamed-fluid.mjs';

function fixture(){
  const listeners=new Set();
  const floors=new Map();
  const terrain={
    materialAt(x,y,z){return y<(floors.get(x+','+z)??0)?3:0;},
    subscribe(topic,listener){
      assert.equal(topic,'fluids');
      listeners.add(listener);
      return ()=>listeners.delete(listener);
    }
  };
  const layout=(minX)=>({
    footprint:{minX,maxX:minX+4,minZ:0,maxZ:2,minY:-3,maxY:3},
    riverChannels:[{
      kind:'water',
      floor:Array.from({length:5},(_,i)=>({x:minX+i,z:1,y:0,flowX:1,flowZ:0})),
      nodes:Array.from({length:5},(_,i)=>({x:minX+i,z:1,y:0})),
      from:{x:minX,z:1},to:{x:minX+4,z:1}
    }]
  });
  const layouts=new Map([['r1',layout(0)],['r2',layout(8)]]);
  const graph={
    region(id){
      if(!layouts.has(id))throw new RangeError('Unknown band');
      return {fluidLayout:layouts.get(id)};
    }
  };
  return {terrain,graph,floors,get subscriptions(){return listeners.size;}};
}

test('two real stream-region water engines use a single shared processing budget',()=>{
  const f=fixture();
  const stream=new HuntStreamedFluid({graph:f.graph,terrain:f.terrain,identity:'plan-seven'});
  assert.equal(stream.syncResident(['r1','r2']),2);
  assert.deepEqual(stream.activeIds,['r1','r2']);
  assert.equal(f.subscriptions,2);
  assert.equal(stream.wetCount,10);
  assert.equal(stream.columnCount,30);
  for(let i=0;i<20;i++)assert.ok(stream.step({budget:12}).processed<=12);
  const surface=stream.snapshotSurface();
  assert.equal(surface.kind,'water');
  assert.equal(surface.cells.length,stream.wetCount);
  assert.deepEqual(surface.bounds,{minX:0,maxX:12,minZ:0,maxZ:2});
  assert.equal(stream.presentationLayout().riverChannels[0].kind,'water');
  assert.equal(stream.sample(20,1),null);
  assert.ok(stream.sample(8,1).depth>0);
  stream.dispose();
  assert.equal(f.subscriptions,0);
});

test('eviction checkpoints water before Voxel removes a resident region',()=>{
  const f=fixture();
  const stream=new HuntStreamedFluid({graph:f.graph,terrain:f.terrain,identity:'plan-nineteen'});
  stream.syncResident(['r1','r2']);
  for(let i=0;i<30;i++)stream.step({budget:12});
  const before=stream.exportCheckpoint().regions.find(r=>r.id==='r1').state;
  assert.equal(stream.evict('r1'),true);
  assert.equal(f.subscriptions,1);
  assert.equal(stream.sample(0,1),null);
  assert.deepEqual(stream.activeIds,['r2']);
  assert.equal(stream.syncResident(['r2','r1']),1);
  const after=stream.exportCheckpoint().regions.find(r=>r.id==='r1').state;
  assert.deepEqual(after,before);
  assert.equal(f.subscriptions,2);
  assert.equal(stream.syncResident(['r2','r1']),0);
  assert.throws(()=>stream.syncResident(['r1']),/checkpoint before Voxel region eviction/);
  stream.dispose();
});

test('water reload rejects missing authoritative terrain replay before mutating state',()=>{
  const f=fixture();
  const a=new HuntStreamedFluid({graph:f.graph,terrain:f.terrain,identity:'world-seven'});
  a.syncResident(['r1']);
  for(let i=0;i<10;i++)a.step({budget:8});
  const saved=a.exportCheckpoint();
  a.dispose();
  const b=new HuntStreamedFluid({graph:f.graph,terrain:f.terrain,identity:'world-seven'});
  b.importCheckpoint(saved);
  f.floors.set('0,1',-1);
  assert.throws(()=>b.syncResident(['r1']),
    /Incompatible fluid snapshot|same replayed physical terrain/);
  assert.deepEqual(b.activeIds,[]);
  f.floors.delete('0,1');
  assert.equal(b.syncResident(['r1']),1);
  assert.deepEqual(b.exportCheckpoint().regions,saved.regions);
  assert.throws(()=>new HuntStreamedFluid({
    graph:f.graph,terrain:f.terrain,identity:'different'
  }).importCheckpoint(saved),/Incompatible Water V2 region checkpoint/);
  b.dispose();
});

test('streamed Water V2 does not require a channel in an unrelated dry region',()=>{
  const f=fixture();
  const graph={region:id=>({fluidLayout:id==='dry'?null:f.graph.region(id).fluidLayout})};
  const stream=new HuntStreamedFluid({graph,terrain:f.terrain,identity:'dry-regions'});
  assert.equal(stream.syncResident(['dry','r1']),1);
  assert.deepEqual(stream.activeIds,['r1']);
  assert.equal(stream.evict('dry'),false);
  stream.dispose();
});
