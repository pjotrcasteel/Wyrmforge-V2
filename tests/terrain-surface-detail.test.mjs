import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import {
  SURFACE_DETAIL_SCHEMA,SURFACE_UNIT,
  createSurfaceDetailSampler,presentGeneratedSurfaceMeshes
} from '../src/terrain-surface-detail.mjs';

const kinds=['wet-forest','forest-highland','mountain-pass'];
const site=(kind,seed=7)=>generateWorldSite(createWorldSiteRecipe({
  kind,seed,chunkEdge:16,siteId:'surface-'+kind,
  regionId:'surface-tests',encounterId:'surface-geometry'
}));

function worldVertexHeights(meshes,x,y,z) {
  const result=[];
  for(const mesh of meshes) {
    for(let i=0;i<mesh.positions.length;i+=3) {
      if(mesh.positions[i]+mesh.origin[0]===x &&
          mesh.positions[i+2]+mesh.origin[2]===z &&
          Math.abs((mesh.positions[i+1]+mesh.origin[1])-y)<0.65) {
        result.push(mesh.positions[i+1]+mesh.origin[1]);
      }
    }
  }
  return result;
}

test('three authored road profiles render as 1/10, 2/10 and 3/10 voxel cuts',()=>{
  for(const [index,kind] of kinds.entries()) {
    const generated=site(kind);
    const sampler=createSurfaceDetailSampler(generated);
    assert.equal(sampler.schema,SURFACE_DETAIL_SCHEMA);
    assert.equal(sampler.verticalUnit,SURFACE_UNIT);
    assert.equal(sampler.roadProfiles,2);
    const bare={
      ...generated,
      layout:{...generated.layout,
        routes:generated.layout.routes.map(route=>({
          ...route,roadProfile:null
        }))
      }
    };
    const bareSampler=createSurfaceDetailSampler(bare);
    // The original authored main road passes exactly through {x:1,z:2}.
    assert.equal(bareSampler.sampleTenths(1,2)-sampler.sampleTenths(1,2),
      index+1,kind+' visual depression must be in exact tenths');
    assert.equal(generated.layout.roads.physicalCutVoxels,0);
    for(let x=-20;x<=20;x+=2)for(let z=-20;z<=20;z+=3) {
      const value=sampler.sampleOffset(x,z);
      assert.ok(Math.abs(value*10-Math.round(value*10))<1e-7);
      assert.ok(value>=-0.6 && value<=0.5);
      assert.equal(sampler.sampleOffset(x,z),value,'samples are deterministic');
    }
    assert.equal(generated.hash,site(kind).hash);
  }
});

test('mesh modifier produces true fractional vertex geometry with no voxel mutation',()=>{
  const generated=site('wet-forest');
  const world=new VoxelWorld({chunkEdge:16});
  // Put road top faces inside a synthetic flat section of the authored site.
  for(let x=0;x<=2;x++)for(let z=1;z<=3;z++) {
    world.set(x,0,z,2);
    world.set(x,-1,z,3);
  }
  const oldRevision=world.revision;
  const before=buildExposedFaceMeshes(world);
  const originalBuffers=before.map(mesh=>mesh.positions.slice());
  const presented=presentGeneratedSurfaceMeshes({site:generated,world,meshes:before});
  assert.equal(presented.length,before.length);
  assert.equal(world.revision,oldRevision);
  assert.deepEqual(before.map(mesh=>mesh.positions),originalBuffers,
    'presentation cannot mutate worker-owned source meshes');
  for(let i=0;i<before.length;i++) {
    assert.equal(presented[i].cpuBufferBytes,before[i].cpuBufferBytes);
    assert.equal(presented[i].triangleCount,before[i].triangleCount);
    assert.equal(presented[i].vertexCount,before[i].vertexCount);
    assert.equal(presented[i].indices,before[i].indices);
    assert.equal(presented[i].materials,before[i].materials);
  }
  const sampler=createSurfaceDetailSampler(generated);
  const original=worldVertexHeights(before,1,1,2);
  const modified=worldVertexHeights(presented,1,1,2);
  assert.ok(original.length>0);
  assert.ok(modified.length>0);
  assert.ok(modified.some(value=>Math.abs(value-(
    1+sampler.sampleOffset(1,2)))<0.0001));
  assert.ok(modified.some(value=>Math.abs(value-1)>0.0001),
    'the road surface really has a fractional-height vertex');
});

test('negative and positive Voxel chunks receive the same corner heights at seams',()=>{
  const generated=site('mountain-pass',19);
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++) {
    world.set(x,0,z,3);
  }
  const meshes=buildExposedFaceMeshes(world);
  assert.ok(meshes.length>=2,'fixture crosses a signed X/Z chunk seam');
  const modified=presentGeneratedSurfaceMeshes({site:generated,world,meshes});
  const heights=worldVertexHeights(modified,0,1,0);
  assert.ok(heights.length>=4,'shared surface corner is emitted on multiple chunks');
  assert.ok(heights.every(v=>Math.abs(v-heights[0])<1e-6),
    'all repeated surface vertices must remain watertight');
  assert.ok(Math.abs(heights[0]*10-Math.round(heights[0]*10))<1e-6);
  const x1=presentGeneratedSurfaceMeshes({site:generated,world,meshes});
  assert.deepEqual(modified.map(mesh=>mesh.positions),x1.map(mesh=>mesh.positions));
});

test('local carving results are presented from the CURRENT world, not stale top heights',()=>{
  const generated=site('forest-highland');
  const world=new VoxelWorld({chunkEdge:16});
  world.set(1,0,2,1);
  world.set(1,-1,2,2);
  const before=presentGeneratedSurfaceMeshes({
    site:generated,world,meshes:buildExposedFaceMeshes(world)
  });
  assert.ok(before.length>0);
  world.set(1,0,2,0);
  const after=presentGeneratedSurfaceMeshes({
    site:generated,world,meshes:buildExposedFaceMeshes(world)
  });
  const currentTop=worldVertexHeights(after,1,0,2);
  assert.ok(currentTop.length>0);
  assert.ok(currentTop.every(value=>value<0.7),
    'newly exposed lower surface should use its current top layer');
  assert.equal(world.get(1,0,2),0,'mesh presenter never restores destroyed voxels');
});

test('surface adapter is a replaceable consumer, not a private Voxel/WorldGen import',()=>{
  const src=readFileSync(new URL('../src/terrain-surface-detail.mjs',import.meta.url),'utf8');
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^import\s/m);
  assert.doesNotMatch(src,/Math\.random\(/);
  assert.match(host,/presentSiteMeshes\(terrain\.world,meshes\)/);
  assert.match(host,/presentSiteMeshes\(world,meshes\)/);
  assert.throws(()=>createSurfaceDetailSampler({}),/public World Generation/);
  assert.throws(()=>presentGeneratedSurfaceMeshes({
    site:site('wet-forest'),world:null,meshes:[]
  }),/current voxel world/);
});
