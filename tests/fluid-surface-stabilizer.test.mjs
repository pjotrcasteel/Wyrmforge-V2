import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {buildFluidSurfaceMesh} from '../src/fluid/fluid-surface-mesh.mjs';
import {stabilizeFluidSurface} from '../src/fluid/fluid-surface-stabilizer.mjs';

const fixture=(depth,upper=2)=>new ColumnFluidEngine({
  bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
  floorAt:x=>x===0?upper:0,
  initial:[{x:0,z:0,depth},{x:1,z:0,depth:4}]
});

function presentation(fluid,previous){
  return stabilizeFluidSurface(fluid.snapshotSurface(),
    (x,z)=>fluid.sample(x,z),previous);
}

test('small 10cm oscillations do not move the visible river cap each frame',()=>{
  const baseline=fixture(4);
  const first=presentation(baseline);
  assert.equal(first.surface.cells[0].depth,4);
  const higher=fixture(5);
  const displayed=presentation(higher,first.history);
  assert.equal(displayed.surface.cells[0].depth,4);
  assert.equal(displayed.sampleAt(0,0).surfaceY,2.4);
  assert.equal(higher.sample(0,0).surfaceY,2.5,
    'the physical solver remains untouched');
  const later=presentation(baseline,displayed.history);
  assert.equal(later.surface.cells[0].depth,4);
  const m1=buildFluidSurfaceMesh(first.surface,{sampleAt:first.sampleAt});
  const m2=buildFluidSurfaceMesh(displayed.surface,{sampleAt:displayed.sampleAt});
  assert.deepEqual(m1.positions,m2.positions,
    'small head fluctuations should not rebuild visibly jumping water geometry');
});

test('large real depth changes catch up without freezing the visible river forever',()=>{
  let previous=presentation(fixture(4)).history;
  const target=fixture(10);
  const displayed=[];
  for(let i=0;i<5;i++){
    const next=presentation(target,previous);
    displayed.push(next.surface.cells[0].depth);
    previous=next.history;
  }
  assert.deepEqual(displayed,[6,8,9,9,9],
    'visual mesh approaches the real level within 10cm without an abrupt leap');
  assert.equal(target.sample(0,0).depth,10);
});

test('new wet cells appear immediately, genuinely dry cells vanish, and terrain edits reset smoothing',()=>{
  const first=presentation(fixture(4));
  const raised=presentation(fixture(10,3),first.history);
  assert.equal(raised.surface.cells[0].depth,10,
    'a raised authoritative stone floor resets only its affected water cap');
  const dry=new ColumnFluidEngine({
    bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
    floorAt:x=>x===0?2:0,initial:[{x:1,z:0,depth:4}]
  });
  const noPhantom=presentation(dry,first.history);
  assert.equal(noPhantom.surface.cells.length,1);
  assert.equal(noPhantom.sampleAt(0,0).depth,0,
    'stabilization cannot invent water in a physically dry column');
  assert.equal(noPhantom.history.has('0,0'),false);
  const reflooded=presentation(fixture(2),noPhantom.history);
  assert.equal(reflooded.surface.cells[0].depth,2,
    'real reopened water cells must not inherit old height history');
});

test('presentation is deterministic and does not alter mass, save/replay or waterfall ownership',()=>{
  const fluid=fixture(4);
  const initial=JSON.stringify(fluid.snapshot());
  const first=presentation(fluid);
  const second=presentation(fluid,first.history);
  const replay=presentation(fluid,first.history);
  assert.deepEqual(second.surface,replay.surface);
  assert.deepEqual([...second.history],[...replay.history]);
  assert.equal(JSON.stringify(fluid.snapshot()),initial);
  assert.equal(fluid.totalDepth,8);
  const mesh=buildFluidSurfaceMesh(second.surface,{
    sampleAt:second.sampleAt
  });
  assert.equal(mesh.waterfallFaces,1);
  assert.ok(mesh.positions.every(Number.isFinite));
});
