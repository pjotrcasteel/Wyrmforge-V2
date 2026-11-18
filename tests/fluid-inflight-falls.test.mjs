import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ColumnFluidEngine,MAX_FLUID_FLIGHTS,FLUID_DEPTH_UNITS
} from '../src/fluid/column-fluid-engine.mjs';

function cliff(kind='water',lowerDepth=0,upperDepth=10){
  return new ColumnFluidEngine({
    kind,bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
    floorAt:x=>x===0?2:0,
    initial:[
      {x:0,z:0,depth:upperDepth},
      ...(lowerDepth?[{x:1,z:0,depth:lowerDepth}]:[])
    ]
  });
}

test('water traverses an actual drop through conserved in-flight volume, not instantaneous teleportation',()=>{
  const engine=cliff();
  assert.equal(FLUID_DEPTH_UNITS,10);
  const first=engine.step({budget:2});
  assert.equal(first.transferred,4);
  assert.equal(first.landed,0);
  assert.equal(first.inFlight,1);
  assert.equal(engine.sample(0,0).depth,6);
  assert.equal(engine.sample(1,0).depth,0,
    'a lower crater receives nothing on the departure frame');
  assert.equal(engine.sample(1,0).pendingArrival,4,
    'receiving capacity is reserved before the actual landing');
  assert.equal(engine.totalDepth,10,'airborne fluid remains part of conserved mass');
  assert.equal(engine.inFlightUnits,4);
  const published=engine.snapshotSurface();
  assert.equal(published.flights.length,1);
  assert.equal(published.flights[0].startY,3);
  assert.equal(published.flights[0].landingY,0);
  assert.ok(Object.isFrozen(published.flights));
  assert.ok(Object.isFrozen(published.flights[0]));
  assert.equal(published.flights[0].toX,1);
  assert.equal(published.flights[0].toZ,0);
  let landed=0;
  for(let i=0;i<12;i++){
    const state=engine.step({budget:2});
    landed+=state.landed;
    assert.equal(engine.totalDepth,10);
  }
  assert.ok(landed>=4,'falling fluid eventually lands in the lower pool');
  assert.ok(engine.sample(1,0).depth>0);
  assert.equal(engine.inFlightUnits,0);
});

test('water falls faster than lava only through already established bounded rates',()=>{
  const water=cliff('water'),lava=cliff('lava');
  const w=water.step({budget:2}),l=lava.step({budget:2});
  assert.equal(w.transferred,4);
  assert.equal(l.transferred,1);
  assert.equal(w.landed,0);
  assert.equal(l.landed,0);
  assert.equal(water.totalDepth,10);
  assert.equal(lava.totalDepth,10);
  assert.ok(water.inFlightUnits>lava.inFlightUnits);
});

test('every in-flight packet replays deterministically after exact snapshot and restore',()=>{
  const a=cliff();
  for(let i=0;i<3;i++)a.step({budget:1});
  const snapshot=JSON.parse(JSON.stringify(a.snapshot()));
  assert.ok(snapshot.flights.length>0);
  const b=cliff();
  b.restore(snapshot);
  assert.deepEqual(b.snapshot(),snapshot);
  assert.deepEqual(b.snapshotSurface(),a.snapshotSurface());
  for(let i=0;i<35;i++){
    assert.deepEqual(a.step({budget:2}),b.step({budget:2}));
    assert.deepEqual(a.snapshot(),b.snapshot());
    assert.equal(a.totalDepth,10);
  }
});

test('an old V1 save without flight fields still replays into a zero-flight state',()=>{
  const original=cliff();
  const save=original.snapshot();
  delete save.flights;
  delete save.flightCursor;
  const restored=cliff();
  restored.restore(save);
  assert.equal(restored.inFlightCount,0);
  assert.equal(restored.inFlightUnits,0);
  assert.equal(restored.totalDepth,10);
  assert.equal(restored.snapshot().flightCursor,0);
});

test('reserved arrival capacity never exceeds the receiving-column cap',()=>{
  const high=new ColumnFluidEngine({
    bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
    floorAt:x=>x===0?17:0,
    initial:[{x:0,z:0,depth:10},{x:1,z:0,depth:158}]
  });
  for(let i=0;i<15;i++){
    high.step({budget:2});
    assert.ok(high.sample(1,0).depth+high.sample(1,0).pendingArrival<=160);
    assert.equal(high.totalDepth,168);
  }
});

test('invalid or over-capacity airborne packet snapshots are rejected without mutation',()=>{
  const fluid=cliff();
  fluid.step({budget:2});
  const before=fluid.snapshot();
  const tampered=JSON.parse(JSON.stringify(before));
  tampered.flights[0].to=0;
  assert.throws(()=>fluid.restore(tampered),/downhill edge/);
  assert.deepEqual(fluid.snapshot(),before);
  const huge=JSON.parse(JSON.stringify(before));
  huge.flights=Array.from({length:MAX_FLUID_FLIGHTS+1},()=>({...before.flights[0]}));
  assert.throws(()=>fluid.restore(huge),/bounded in-flight/);
  assert.deepEqual(fluid.snapshot(),before);
});

test('flat pools exchange immediately and do not spend vertical-flight capacity',()=>{
  const fluid=new ColumnFluidEngine({
    bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
    floorAt:()=>0,initial:[{x:0,z:0,depth:10}]
  });
  fluid.step({budget:2});
  assert.equal(fluid.inFlightCount,0);
  assert.ok(fluid.sample(1,0).depth>0);
  assert.equal(fluid.totalDepth,10);
});
