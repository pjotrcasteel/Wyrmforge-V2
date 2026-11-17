import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {
  FLUID_FALL_MIN_DROP,FLUID_FALL_RIBBON_SECTIONS,buildFluidSurfaceMesh
} from '../src/fluid/fluid-surface-mesh.mjs';
import {
  FLUID_VERTEX_GLSL,FLUID_FRAGMENT_GLSL
} from '../src/fluid/hunt-fluid-surface-renderer.mjs';
import {projectVoxel} from '../src/camera-presets.mjs';

function scenario({kind='water',lowerWet=true,lowerFloor=0,upperFloor=2,lowerDepth=10}={}){
  const engine=new ColumnFluidEngine({
    bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
    kind,floorAt:x=>x===0?upperFloor:lowerFloor,
    initial:[
      {x:0,z:0,depth:10},
      ...(lowerWet?[{x:1,z:0,depth:lowerDepth}]:[])
    ]
  });
  return {engine,mesh:()=>buildFluidSurfaceMesh(engine.snapshotSurface(),{
    sampleAt:(x,z)=>engine.sample(x,z)
  })};
}

test('real wet-to-wet downhill flow creates exactly one waterfall and one lip',()=>{
  const {engine,mesh}=scenario();
  const state=engine.snapshotSurface();
  assert.equal(FLUID_FALL_MIN_DROP,.75);
  assert.deepEqual([state.cells[0].flowX,state.cells[0].flowZ],[1,0]);
  const surface=mesh();
  assert.equal(surface.wetColumns,2);
  assert.equal(surface.waterfallFaces,1);
  assert.equal(surface.fallLipFaces,1);
  assert.equal(surface.topFaces,2);
  assert.equal(surface.sideFaces,1);
  assert.ok(surface.faceModes instanceof Uint8Array);
  assert.ok(surface.landingHeights instanceof Float32Array);
  assert.equal(surface.faceModes.length,surface.vertexCount);
  assert.equal(surface.landingHeights.length,surface.vertexCount);
  assert.deepEqual([...new Set(surface.faceModes)],[3,2,4,0,5],
    'upper lip, real falling cliff, projected falling ribbons and still lower pool');
  assert.equal(surface.fallRibbonFaces,FLUID_FALL_RIBBON_SECTIONS*4);
  assert.equal(surface.landingSplashFaces,16);
  assert.ok([...surface.faceModes.slice(-16*4)].every(mode=>mode===5),
    'landing splash must draw after all transparent pool caps');
  const curtain=[...surface.faceModes].findIndex(v=>v===2);
  assert.ok(curtain>=0);
  for(let i=curtain;i<curtain+4;i++){
    assert.equal(surface.faceModes[i],2);
    assert.equal(surface.landingHeights[i],1,
      'the sheet terminates on the authoritative lower liquid head');
  }
  const curtainY=[...Array(4).keys()].map(i=>surface.positions[(curtain+i)*3+1]);
  assert.ok(Math.abs(Math.min(...curtainY)-1)<.00001,
    'a real falling sheet reaches the downstream pool, not the upper rock floor');
  assert.ok(Math.abs(Math.max(...curtainY)-3.006)<.0001);
  assert.ok([...surface.faceModes].some(mode=>mode===3));
  assert.ok([...surface.faceModes].some(mode=>mode===4));
  assert.ok([...surface.faceModes].some(mode=>mode===5));
  assert.equal(engine.wetCount,2,'mesh must not modify fluid volume');
});

test('a dry lower crater is not invented as an active waterfall',()=>{
  const {mesh}=scenario({lowerWet:false});
  const surface=mesh();
  assert.equal(surface.waterfallFaces,0);
  assert.equal(surface.fallLipFaces,0);
  assert.equal(surface.sideFaces,1,
    'physical raised-water wall is retained until the receiving crater is wet');
  assert.equal(surface.fallRibbonFaces,0);
  assert.equal(surface.landingSplashFaces,0);
  assert.ok([...surface.faceModes].every(mode=>mode!==2&&mode!==3&&mode!==4&&mode!==5));
});

test('flat pool and tiny differences do not create fake falling sheets',()=>{
  const {mesh}=scenario({upperFloor:0,lowerFloor:0,lowerDepth:9});
  const surface=mesh();
  assert.equal(surface.waterfallFaces,0);
  assert.equal(surface.fallLipFaces,0);
  assert.equal(surface.fallRibbonFaces,0);
  assert.equal(surface.landingSplashFaces,0);
  assert.equal(surface.sideFaces,0);
  assert.equal(surface.topFaces,2);
});

test('lava and water share real falling geometry without changing solver rates',()=>{
  const water=scenario({kind:'water'});
  const lava=scenario({kind:'lava'});
  const wm=water.mesh(),lm=lava.mesh();
  assert.equal(wm.waterfallFaces,1);
  assert.equal(lm.waterfallFaces,1);
  assert.deepEqual(wm.positions,lm.positions);
  assert.deepEqual(wm.faceModes,lm.faceModes);
  assert.deepEqual(wm.landingHeights,lm.landingHeights);
  const waterFlow=water.engine.step({budget:2});
  const lavaFlow=lava.engine.step({budget:2});
  assert.ok(waterFlow.transferred>=lavaFlow.transferred);
});

test('falling sheets retain water-fall shader-specific motion and shared Voxel depth axis',()=>{
  assert.match(FLUID_VERTEX_GLSL,/layout\(location=3\) in float aFaceMode/);
  assert.match(FLUID_VERTEX_GLSL,/layout\(location=4\) in float aLandingY/);
  assert.match(FLUID_VERTEX_GLSL,/dot\(world,uCameraDepth\)-uDepthOrigin/);
  assert.match(FLUID_FRAGMENT_GLSL,/vFaceMode==2/);
  assert.match(FLUID_FRAGMENT_GLSL,/vFaceMode==3/);
  assert.match(FLUID_FRAGMENT_GLSL,/vFaceMode==4/);
  assert.match(FLUID_FRAGMENT_GLSL,/uRibbonEnabled/);
  assert.match(FLUID_FRAGMENT_GLSL,/vWorld.y-vLandingY/);
});

test('flow ribbons project across visible Hunt-camera pixels, not edge-on against the cliff',()=>{
  const {engine,mesh}=scenario();
  const surface=mesh();
  const ribbons=[];
  for(let first=0;first<surface.vertexCount;first+=4){
    if(surface.faceModes[first]!==4)continue;
    const points=[];
    for(let v=first;v<first+4;v++){
      points.push(projectVoxel(
        surface.positions[3*v],surface.positions[3*v+1],surface.positions[3*v+2],
        {width:402,height:874,scale:32,camera:'hunt'}
      ));
    }
    ribbons.push(points);
  }
  assert.equal(ribbons.length,8);
  const bounds=ribbons.map(points=>({
    width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),
    height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))
  }));
  assert.ok(bounds.some(rect=>rect.width>=6&&rect.height>=5),
    'Hunt camera must see a sheet with physical screen area, not a cliff-flush line');
  const ribbonVertices=[...Array(surface.vertexCount).keys()]
    .filter(i=>surface.faceModes[i]===4)
    .map(i=>[
      surface.positions[i*3],
      surface.positions[i*3+1],
      surface.positions[i*3+2]
    ]);
  assert.ok(ribbonVertices.some(([x])=>x>1.2),
    'the liquid ribbon must project beyond the upper cliff into the receiving pool');
  assert.ok(ribbonVertices.every(([x,y,z])=>
    Math.abs(x*10-Math.round(x*10))<.000001&&
    Math.abs(z*10-Math.round(z*10))<.000001),
    'fall ribbon boundaries stay on the 10cm pixel grid');
  assert.equal(engine.wetCount,2,'ribbons are rendering only and conserve fluid volume');
});
