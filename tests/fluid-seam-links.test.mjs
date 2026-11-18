import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {FluidSeamLinks,FLUID_SEAM_STATE_SCHEMA} from '../src/fluid/fluid-seam-links.mjs';

const make=(x,{floor=0,depth=0,kind='water'}={})=>new ColumnFluidEngine({
  bounds:{minX:x,maxX:x,minZ:0,maxZ:0},
  floorAt:()=>floor,kind,
  initial:[{x,z:0,depth}]
});
const link=(a,b,id='seam')=>({
  id,from:{bandId:'band-'+a,x:a,z:0},
  to:{bandId:'band-'+b,x:b,z:0}
});
const mass=engines=>engines.reduce((sum,e)=>sum+e.totalDepth,0);

test('one cardinal, level seam conserves water and the same physical cells',()=>{
  const a=make(0,{depth:30}),b=make(1);
  const before=mass([a,b]),sched=new FluidSeamLinks([link(0,1)]);
  const active=new Map([['band-0',a],['band-1',b]]);
  let transferred=0;
  for(let i=0;i<20;i++){
    const result=sched.step(active,{budget:1});
    assert.ok(result.inspected<=1);
    assert.ok(result.moved<=2);
    transferred+=result.moved;
    assert.equal(mass([a,b]),before,'every individual transfer conserves volume');
  }
  assert.ok(transferred>0);
  assert.ok(b.sample(1,0).depth>0);
  assert.equal(a.inFlightUnits+b.inFlightUnits,0);
  assert.equal(a.totalDrained+b.totalDrained,0);

  // Both sides still serialize through their existing solver contract.
  const checkpoint=[a.snapshot(),b.snapshot()];
  const a2=make(0),b2=make(1);
  a2.restore(checkpoint[0]);
  b2.restore(checkpoint[1]);
  assert.deepEqual([a2.snapshot(),b2.snapshot()],checkpoint);
});

test('unloaded downstream region holds all water without teleport or loss',()=>{
  const a=make(0,{depth:24}),b=make(1);
  const sched=new FluidSeamLinks([link(0,1)]),resident=new Map([['band-0',a]]);
  for(let i=0;i<25;i++){
    assert.deepEqual(sched.step(resident),{inspected:1,moved:0,held:1});
  }
  assert.equal(a.totalDepth,24);
  assert.equal(b.totalDepth,0);
  resident.set('band-1',b);
  assert.ok(sched.step(resident).moved>0);
  assert.equal(mass([a,b]),24);
});

test('real higher bank, adjacent waterfall and dry source never fake flow',()=>{
  const a=make(0,{depth:4}),blocked=make(1,{floor:1});
  assert.equal(a.transferToAdjacent(blocked,{x:0,z:0,toX:1,toZ:0}),0);
  assert.equal(blocked.totalDepth,0);
  const downhill=make(1,{floor:-1});
  assert.equal(a.transferToAdjacent(downhill,{x:0,z:0,toX:1,toZ:0}),0,
    'a physical cliff needs an airborne cross-region parcel, never an instant deposit');
  assert.equal(downhill.totalDepth,0);
  const dry=make(0),receiver=make(1);
  assert.equal(dry.transferToAdjacent(receiver,{x:0,z:0,toX:1,toZ:0}),0);
});

test('a full target never overwrites occupied or pending arrival capacity',()=>{
  const a=make(0,{depth:80}),b=make(1,{depth:160});
  assert.equal(a.transferToAdjacent(b,{x:0,z:0,toX:1,toZ:0}),0);
  assert.equal(mass([a,b]),240);
});

test('never transfer between mismatched kinds, diagonal or nonresident footprints',()=>{
  const a=make(0,{depth:40}),b=make(1,{kind:'lava'});
  assert.throws(()=>a.transferToAdjacent(b,{x:0,z:0,toX:1,toZ:0}),/same kind/);
  assert.throws(()=>a.transferToAdjacent(a,{x:0,z:0,toX:1,toZ:0}),/distinct resident/);
  assert.throws(()=>a.transferToAdjacent(make(2),{x:0,z:0,toX:2,toZ:0}),/cardinal/);
  assert.throws(()=>a.transferToAdjacent(make(3),{x:0,z:0,toX:1,toZ:0}),/published fluid footprints/);
  assert.throws(()=>a.transferToAdjacent(make(1),{x:0,z:0,toX:1,toZ:0,maxUnits:9}),/bounded/);
  assert.throws(()=>new FluidSeamLinks([{id:'bad',from:{bandId:'a',x:0,z:0},
    to:{bandId:'b',x:3,z:0}}]),/adjacent authored/);
  assert.throws(()=>new FluidSeamLinks([link(0,1,'a'),link(1,0,'b')]),/Duplicate physical/);
});

test('small shared link-visit budget fairly visits later seams',()=>{
  const a=make(0,{depth:50}),b=make(1),c=make(2);
  const sched=new FluidSeamLinks([link(0,1,'1'),link(1,2,'2')]);
  const resident=new Map([
    ['band-0',a],['band-1',b],['band-2',c]
  ]);
  const before=mass([a,b,c]);
  for(let i=0;i<150;i++){
    const outcome=sched.step(resident,{budget:1});
    assert.equal(outcome.inspected,1);
    assert.ok(outcome.moved<=2);
  }
  assert.ok(c.totalDepth>0,'the later link must not starve');
  assert.equal(mass([a,b,c]),before);
  assert.equal(sched.totalVisits,150);
  const saved=JSON.parse(JSON.stringify(sched.snapshot()));
  assert.equal(saved.schema,FLUID_SEAM_STATE_SCHEMA);
  const next=new FluidSeamLinks([link(1,2,'2'),link(0,1,'1')]);
  next.restore(saved);
  assert.deepEqual(next.snapshot(),saved);
  assert.throws(()=>new FluidSeamLinks([link(0,1,'other')]).restore(saved),
    /Incompatible physical/);
});

test('lava uses its own one-unit boundary transfer rate',()=>{
  const left=make(0,{kind:'lava',depth:20});
  const right=make(1,{kind:'lava'});
  const resident=new Map([['band-0',left],['band-1',right]]);
  const seam=new FluidSeamLinks([link(0,1)]);
  const initial=mass([left,right]);
  const result=seam.step(resident,{budget:1});
  assert.equal(result.moved,1);
  assert.equal(mass([left,right]),initial);
});
