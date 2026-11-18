import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {buildFluidSurfaceMesh} from '../src/fluid/fluid-surface-mesh.mjs';
import {FLUID_FRAGMENT_GLSL} from '../src/fluid/hunt-fluid-surface-renderer.mjs';

const create=()=>new ColumnFluidEngine({
  bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
  floorAt:x=>x===0?2:0,
  initial:[{x:0,z:0,depth:10}]
});

const mesh=fluid=>buildFluidSurfaceMesh(fluid.snapshotSurface(),{
  sampleAt:(x,z)=>fluid.sample(x,z)
});

test('actual airborne fluid units project into bounded 2.5D waterfall geometry',()=>{
  const fluid=create();
  fluid.step({budget:2});
  const first=mesh(fluid);
  assert.equal(fluid.inFlightCount,1);
  assert.equal(first.flightFaces,1);
  assert.ok([...first.faceModes].includes(6));
  assert.equal(first.faceCount,
    first.topFaces+first.sideFaces+first.fallRibbonFaces+
    first.landingSplashFaces+first.flightFaces);
  const firstFace=[...first.faceModes].findIndex(mode=>mode===6);
  assert.ok(firstFace>=0);
  const y0=first.positions[firstFace*3+1];
  assert.ok(y0>2.5,'departing fluid starts at upper river height');
  fluid.step({budget:2});
  const next=mesh(fluid);
  assert.ok(next.flightFaces>=1);
  const nextFace=[...next.faceModes].findIndex(mode=>mode===6);
  const y1=next.positions[nextFace*3+1];
  assert.ok(y1<y0,'real packet falls in world Y between solver ticks');
  assert.equal(fluid.totalDepth,10,'rendering and solver transfer conserve mass');
  assert.match(FLUID_FRAGMENT_GLSL,/vFaceMode==6/);
});

test('old fluid surface snapshots without packets remain valid render handoffs',()=>{
  const fluid=create();
  const saved=fluid.snapshotSurface();
  const old={...saved};
  delete old.flights;
  const result=buildFluidSurfaceMesh(old,{
    sampleAt:(x,z)=>fluid.sample(x,z)
  });
  assert.equal(result.flightFaces,0);
});

test('malformed or out-of-region airborne stream is rejected before drawing',()=>{
  const fluid=create();
  fluid.step({budget:2});
  const state=fluid.snapshotSurface();
  assert.throws(()=>buildFluidSurfaceMesh({
    ...state,flights:[{...state.flights[0],toX:99}]
  },{sampleAt:(x,z)=>fluid.sample(x,z)}),/traveling liquid parcel/);
});

test('one real parcel uses bounded mesh allocation even with dynamic 3D fall geometry',()=>{
  const fluid=create();
  fluid.step({budget:2});
  const m=mesh(fluid);
  const bytes=m.positions.byteLength+m.normals.byteLength+
    m.flows.byteLength+m.faceModes.byteLength+m.landingHeights.byteLength+
    m.indices.byteLength;
  assert.ok(bytes<2*1024*1024);
});
