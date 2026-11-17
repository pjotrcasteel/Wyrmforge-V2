import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {buildFluidSurfaceMesh} from '../src/fluid/fluid-surface-mesh.mjs';
import {
  FLUID_VERTEX_GLSL,FLUID_FRAGMENT_GLSL
} from '../src/fluid/hunt-fluid-surface-renderer.mjs';

function fixture(kind='water'){
  const floorAt=(x)=>x===1?-2:x===2?3:0;
  const engine=new ColumnFluidEngine({
    bounds:{minX:0,maxX:2,minZ:0,maxZ:0},
    floorAt,kind,
    initial:[{x:0,z:0,depth:10},{x:1,z:0,depth:15}]
  });
  return {engine,mesh:()=>buildFluidSurfaceMesh(engine.snapshotSurface(),{
    sampleAt:(x,z)=>engine.sample(x,z)
  })};
}

test('real fluid geometry uses 10cm surface head instead of painting the solid floor',()=>{
  const {engine,mesh}=fixture();
  const result=mesh();
  assert.equal(result.schema,'wyrmforge.fluid-surface-mesh.v1');
  assert.equal(result.topFaces,2);
  assert.equal(result.sideFaces,1,'higher pool exposes a real vertical liquid wall');
  assert.equal(result.faceCount,3);
  assert.equal(result.vertexCount,12);
  assert.equal(result.triangleCount,6);
  assert.ok(result.positions instanceof Float32Array);
  assert.ok(result.normals instanceof Int8Array);
  assert.ok(result.indices instanceof Uint32Array);
  assert.ok(result.indices.every(i=>i<result.vertexCount));
  assert.equal(engine.sample(1,0).surfaceY,-.5);
  const waterCapY=result.positions[1];
  const craterCapY=result.positions[13];
  assert.ok(Math.abs(waterCapY-1.006)<.001);
  assert.ok(Math.abs(craterCapY-(-.494))<.001,
    'crater liquid top must not be flattened to the solid floor -2');
  assert.equal(result.positions[12],1);
  assert.equal(result.positions[14],0);
});

test('a dry elevated bank never becomes a fake water face',()=>{
  const {engine,mesh}=fixture('lava');
  const first=mesh();
  assert.equal(first.kind,'lava');
  assert.equal(first.topFaces,2);
  assert.equal(first.sideFaces,1,'the elevated dry bank should hide lava behind it');
  assert.equal(engine.sample(2,0).depth,0);
  assert.equal(engine.sample(2,0).floorY,3);
});

test('fluid meshes respond deterministically to stepped liquid depth and support empty regions',()=>{
  const {engine,mesh}=fixture();
  const before=mesh();
  engine.step({budget:3});
  const after=mesh();
  assert.notDeepEqual(after.positions,before.positions);
  assert.deepEqual(after.positions,mesh().positions);
  const dry=new ColumnFluidEngine({
    bounds:{minX:0,maxX:0,minZ:0,maxZ:0},floorAt:()=>0
  });
  const empty=buildFluidSurfaceMesh(dry.snapshotSurface(),{
    sampleAt:(x,z)=>dry.sample(x,z)
  });
  assert.equal(empty.vertexCount,0);
  assert.equal(empty.indices.length,0);
  assert.throws(()=>buildFluidSurfaceMesh(engine.snapshotSurface(),{}),/sampler/);
  const tampered={...engine.snapshotSurface(),
    cells:[...engine.snapshotSurface().cells,engine.snapshotSurface().cells[0]]};
  assert.throws(()=>buildFluidSurfaceMesh(tampered,{
    sampleAt:(x,z)=>engine.sample(x,z)
  }),/Duplicate wet column/);
});

test('fluid WebGL shader projects on the exact Voxel V2 depth axis and handles both liquids',()=>{
  assert.match(FLUID_VERTEX_GLSL,/^#version 300 es/);
  assert.match(FLUID_FRAGMENT_GLSL,/^#version 300 es/);
  assert.match(FLUID_VERTEX_GLSL,/dot\(world,uCameraDepth\)-uDepthOrigin/);
  assert.match(FLUID_FRAGMENT_GLSL,/uLava/);
  assert.match(FLUID_FRAGMENT_GLSL,/vWorld\.xz\*8\.0/);
});
