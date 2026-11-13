import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { buildPixelMicroSurfaceMeshes } from '../src/microvoxel-mesher.mjs';
import { worldDigest } from '../src/replay-checkpoint.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import {
  createExternalTerrainCheckpoint,
  V2ExternalTerrainReplaySession
} from '../src/external-terrain-checkpoint.mjs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';

const cols=(height)=>new Array(100).fill(height);
const all=[0,1,2,3,4,5,6,7,8,9];
const site=(kind,seed=7,edge=16)=>generateWorldSite(createWorldSiteRecipe({
  regionId:'real-microvoxel',siteId:'micro-'+kind,
  encounterId:'real-surface',kind,seed,chunkEdge:edge
}));

test('authoritative voxel world stores true 10x10x10 solid 10cm cells, not tilted mesh vertices',()=>{
  const world=new VoxelWorld();
  world.set(0,0,0,2);
  const rev=world.revision;
  assert.equal(world.setMicroSurfaceTile(0,0,0,cols(7)),true);
  assert.equal(world.microSurfaceCount,1);
  assert.equal(world.revision,rev+1);
  assert.equal(world.get(0,0,0),2,'the coarse voxel remains the same material');
  assert.equal(world.materialAtPoint(0.05,0.65,0.05),2);
  assert.equal(world.materialAtPoint(0.05,0.75,0.05),0);
  assert.equal(world.materialAtPoint(0.95,0.69,0.95),2);
  assert.equal(world.materialAtPoint(0.95,0.7,0.95),0);
  const copy=world.microSurfaceTile(0,0,0);
  copy[0]=1;
  assert.equal(world.microSurfaceTile(0,0,0)[0],7,
    'no external consumer may modify authoritative microvoxels');
  const snapshots=world.microSurfaceTiles();
  snapshots[0].levels[0]=1;
  assert.equal(world.microSurfaceTile(0,0,0)[0],7);
  assert.equal(world.setMicroSurfaceTile(0,0,0,cols(7)),false);
  assert.throws(()=>world.setMicroSurfaceTile(0,0,0,cols(11)),/heights/);
  assert.throws(()=>world.setMicroSurfaceTile(1,0,0,cols(7)),/exposed solid/);
});

test('10cm physical cells vary independently across X/Z with 10 vertical occupancy steps',()=>{
  const world=new VoxelWorld();
  world.set(-1,0,-1,3);
  const levels=cols(10);
  for(const z of all)for(const x of all) {
    levels[z*10+x]=1+(x+z)%10;
  }
  world.setMicroSurfaceTile(-1,0,-1,levels);
  for(const z of all)for(const x of all) {
    const px=-1+(x+0.5)/10,pz=-1+(z+0.5)/10;
    const h=levels[z*10+x];
    assert.equal(world.materialAtPoint(px,(h-0.5)/10,pz),3);
    assert.equal(world.materialAtPoint(px,(h+0.5)/10,pz),0);
  }
  assert.equal(world.microSurfaceCount,1);
  assert.equal(world.allocatedVoxelBytes,16**3+100);
  world.set(-1,0,-1,0);
  assert.equal(world.microSurfaceCount,0,'removing parent voxel removes its microcells');
  assert.equal(world.materialAtPoint(-0.95,0.05,-0.95),0);
});

test('pixel-art mesher produces only flat square tops and vertical walls, never sloped faces',()=>{
  const world=new VoxelWorld();
  world.set(0,0,0,2);
  world.set(0,-1,0,3);
  const levels=cols(10);
  for(let z=3;z<7;z++)for(let x=2;x<8;x++)levels[z*10+x]=8;
  world.setMicroSurfaceTile(0,0,0,levels);
  const source=buildExposedFaceMeshes(world);
  const before=source.map(x=>x.positions.slice());
  const meshes=buildPixelMicroSurfaceMeshes(world,source);
  assert.equal(meshes.length,source.length);
  assert.deepEqual(source.map(x=>x.positions),before,
    'source worker-owned buffers remain immutable');
  const changed=meshes.find(m=>m.id==='0,0,0');
  assert.ok(changed.faceCount>6);
  assert.ok(changed.vertexCount===changed.faceCount*4);
  assert.ok(changed.triangleCount===changed.faceCount*2);
  assert.ok(changed.cpuBufferBytes===changed.positions.byteLength+
    changed.normals.byteLength+changed.materials.byteLength+
    changed.indices.byteLength);
  let fraction=false;
  for(let i=0;i<changed.positions.length;i+=12) {
    const ys=[changed.positions[i+1],changed.positions[i+4],
      changed.positions[i+7],changed.positions[i+10]];
    const xs=[changed.positions[i],changed.positions[i+3],
      changed.positions[i+6],changed.positions[i+9]];
    const zs=[changed.positions[i+2],changed.positions[i+5],
      changed.positions[i+8],changed.positions[i+11]];
    assert.ok(new Set(ys).size===1 || new Set(xs).size===1 ||
      new Set(zs).size===1,'every face must be axis-aligned; never bent');
    for(const y of ys) {
      assert.ok(Math.abs(y*10-Math.round(y*10))<1e-6);
      if(Math.abs(y-Math.round(y))>1e-6) fraction=true;
    }
  }
  assert.equal(fraction,true,'at least one genuine 0.1m cuboid face exists');
  assert.equal(world.materialAtPoint(0.3,0.85,0.4),0);
  assert.equal(world.materialAtPoint(0.3,0.75,0.4),2);
});

test('sparse surface meshes agree across signed chunk boundaries',()=>{
  const world=new VoxelWorld();
  for(const x of [-1,0])for(const z of [-1,0]) {
    world.set(x,0,z,3);
    world.setMicroSurfaceTile(x,0,z,cols(7));
  }
  const source=buildExposedFaceMeshes(world);
  const result=buildPixelMicroSurfaceMeshes(world,source);
  assert.equal(result.length,4);
  const seam=[];
  for(const mesh of result) {
    for(let i=0;i<mesh.positions.length;i+=3) {
      const x=mesh.positions[i]+mesh.origin[0];
      const z=mesh.positions[i+2]+mesh.origin[2];
      if(Math.abs(x)<1e-6 && Math.abs(z)<1e-6) {
        seam.push(mesh.positions[i+1]+mesh.origin[1]);
      }
    }
  }
  assert.ok(seam.length>=4);
  assert.ok(seam.every(height=>Math.abs(height-seam[0])<1e-6),
    'all chunk mesh copies meet at exactly the same physical micro height');
});

test('versioned generated sites load actual microvoxels and keep 1m world performance budget sparse',()=>{
  for(const kind of ['wet-forest','forest-highland','mountain-pass']) {
    const generated=site(kind,7);
    assert.equal(generated.definition.schema,'voxel-v2.terrain-initialization.v2');
    assert.ok(generated.definition.surfaceTiles.length>20);
    assert.ok(generated.definition.surfaceTiles.length<=384);
    const loader=new V2ExternalTerrainLoader(generated.definition);
    try {
      let steps=0;
      while(!loader.progress.done) {
        loader.loadStep(1024);
        if(++steps>300)throw new Error('Microtile loader stalled');
      }
      assert.equal(loader.terrain.world.microSurfaceCount,
        generated.definition.surfaceTiles.length);
      const any=generated.definition.surfaceTiles[0];
      assert.notEqual(loader.terrain.world.get(any.x,any.y,any.z),0);
      assert.ok(loader.terrain.world.microSurfaceTile(any.x,any.y,any.z));
      assert.equal(generated.hash,site(kind,7).hash);
    } finally {loader.unload();}
  }
});

test('microvoxel checkpoint survives JSON, restores physical cells, and detects corrupted occupancy',()=>{
  const generated=site('wet-forest');
  const loader=new V2ExternalTerrainLoader(generated.definition);
  while(!loader.progress.done)loader.loadStep(2048);
  const checkpoint=createExternalTerrainCheckpoint(loader);
  assert.equal(checkpoint.source.schema,'voxel-v2.terrain-initialization.v2');
  assert.equal(checkpoint.source.surfaceTiles.length,
    generated.definition.surfaceTiles.length);
  const fresh=new V2ExternalTerrainReplaySession(JSON.parse(JSON.stringify(checkpoint)));
  try {
    let steps=0;
    while(!fresh.progress.done) {
      fresh.step({maxCells:2048,maxEdits:1});
      if(++steps>400)throw new Error('Microvoxel checkpoint replay hung');
    }
    assert.equal(worldDigest(fresh.terrain.world),worldDigest(loader.terrain.world));
    assert.equal(fresh.terrain.world.microSurfaceCount,loader.terrain.world.microSurfaceCount);
  } finally {fresh.unload();}
  const corrupted=JSON.parse(JSON.stringify(checkpoint));
  corrupted.source.surfaceTiles[0].levels[0]=1;
  assert.throws(()=>new V2ExternalTerrainReplaySession(corrupted),
    /checksum mismatch/);
  loader.unload();
});

test('a destructive voxel edit invalidates microcells and checkpoint digest changes',()=>{
  const world=new VoxelWorld();
  world.set(2,1,-3,3);
  world.setMicroSurfaceTile(2,1,-3,cols(6));
  const before=worldDigest(world);
  const revision=world.revision;
  world.set(2,1,-3,0);
  assert.equal(world.microSurfaceCount,0);
  assert.ok(world.revision>revision);
  assert.notEqual(worldDigest(world),before);
  const meshes=buildPixelMicroSurfaceMeshes(world,buildExposedFaceMeshes(world));
  assert.equal(meshes.length,0);
});

test('obsolete mesh-bending adapter is not used by runtime or physical authority',()=>{
  const source=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/presentGeneratedSurfaceMeshes|terrain-surface-detail/);
  assert.match(source,/buildPixelMicroSurfaceMeshes/);
});
