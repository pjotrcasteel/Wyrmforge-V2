import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {
  buildFluidSurfaceMesh,FLUID_LANDING_SPLASH_TILES
} from '../src/fluid/fluid-surface-mesh.mjs';
import {
  FLUID_VERTEX_GLSL,FLUID_FRAGMENT_GLSL
} from '../src/fluid/hunt-fluid-surface-renderer.mjs';

const connected=(kind='water',dry=false,reverse=false)=>{
  const engine=new ColumnFluidEngine({
    bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
    kind,
    floorAt:x=>reverse?(x===1?2:0):(x===0?2:0),
    initial:[
      {x:reverse?1:0,z:0,depth:10},
      ...(!dry?[{x:reverse?0:1,z:0,depth:10}]:[])
    ]
  });
  return {engine,mesh:()=>buildFluidSurfaceMesh(engine.snapshotSurface(),{
    sampleAt:(x,z)=>engine.sample(x,z)
  })};
};

const splashVertices=mesh=>{
  const points=[];
  for(let index=0;index<mesh.vertexCount;index++){
    if(mesh.faceModes[index]!==5)continue;
    points.push({
      x:mesh.positions[index*3],
      y:mesh.positions[index*3+1],
      z:mesh.positions[index*3+2],
      landingY:mesh.landingHeights[index]
    });
  }
  return points;
};

test('a real downstream wet pool receives sparse bounded 10cm impact tiles',()=>{
  const {engine,mesh}=connected();
  const state=mesh();
  assert.equal(state.waterfallFaces,1);
  assert.equal(FLUID_LANDING_SPLASH_TILES.length,16);
  assert.equal(state.landingSplashFaces,FLUID_LANDING_SPLASH_TILES.length);
  assert.equal(splashVertices(state).length,16*4);
  for(const {x,y,z,landingY} of splashVertices(state)){
    assert.ok(x>=1.1-1e-6&&x<=1.9+1e-6,'spray remains inside lower receiving cell');
    assert.ok(z>=.1-1e-6&&z<=.9+1e-6);
    assert.ok(Math.abs(y-1.036)<1e-5,'spray sits above actual lower water head');
    assert.equal(landingY,1);
    assert.ok(Math.abs(x*10-Math.round(x*10))<1e-5);
    assert.ok(Math.abs(z*10-Math.round(z*10))<1e-5);
  }
  const unchanged=buildFluidSurfaceMesh(engine.snapshotSurface(),{
    sampleAt:(x,z)=>engine.sample(x,z)
  });
  assert.deepEqual(state.positions,unchanged.positions,'splash placement is deterministic');
  assert.deepEqual(state.faceModes,unchanged.faceModes);
  assert.equal(engine.wetCount,2,'spray is visual only: no extra liquid');
});

test('water and lava use same bounded impact geometry but separate rendering palettes',()=>{
  const water=connected('water').mesh();
  const lava=connected('lava').mesh();
  assert.equal(water.landingSplashFaces,16);
  assert.equal(lava.landingSplashFaces,16);
  assert.deepEqual(water.positions,lava.positions);
  assert.deepEqual(water.faceModes,lava.faceModes);
  assert.match(FLUID_FRAGMENT_GLSL,/if\(vFaceMode==5\)/);
  assert.match(FLUID_FRAGMENT_GLSL,/uLandingEnabled/);
  assert.ok(FLUID_FRAGMENT_GLSL.includes('float pace=uLava<.5?.9:.45;'));
  assert.ok(FLUID_FRAGMENT_GLSL.includes('uniform float uRippleFade;'));
  assert.ok(FLUID_FRAGMENT_GLSL.includes('float rippleFade=uRippleFade;'));
  assert.match(FLUID_FRAGMENT_GLSL,/rippleFade/);
  assert.match(FLUID_VERTEX_GLSL,/dot\(world,uCameraDepth\)-uDepthOrigin/);
});

test('dry receiving hole and flat neighboring pools do not get fake impact foam',()=>{
  assert.equal(connected('water',true).mesh().landingSplashFaces,0);
  const flat=new ColumnFluidEngine({
    bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
    floorAt:()=>0,
    initial:[{x:0,z:0,depth:10},{x:1,z:0,depth:10}]
  });
  const still=buildFluidSurfaceMesh(flat.snapshotSurface(),{
    sampleAt:(x,z)=>flat.sample(x,z)
  });
  assert.equal(still.waterfallFaces,0);
  assert.equal(still.landingSplashFaces,0);
});

test('impact stays on receiving water when real downhill flow is reversed',()=>{
  const {engine,mesh}=connected('water',false,true);
  const state=mesh();
  assert.equal(state.waterfallFaces,1);
  for(const {x,y,z,landingY} of splashVertices(state)){
    assert.ok(x>=.1-1e-6&&x<=.9+1e-6);
    assert.ok(z>=.1-1e-6&&z<=.9+1e-6);
    assert.ok(Math.abs(y-1.036)<1e-5);
    assert.equal(landingY,1);
  }
  assert.equal(engine.totalDepth,20);
});

test('additional landing pixels remain in the 2MiB bounded GPU contract',()=>{
  const {mesh}=connected();
  const result=mesh();
  const bytes=result.positions.byteLength+result.normals.byteLength+
    result.flows.byteLength+result.faceModes.byteLength+
    result.landingHeights.byteLength+result.indices.byteLength;
  assert.ok(bytes<2*1024*1024);
  assert.equal(result.faceCount,
    result.topFaces+result.sideFaces+
    result.fallRibbonFaces+result.landingSplashFaces);
});
