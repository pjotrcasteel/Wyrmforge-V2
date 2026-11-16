import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIRE_LAVA_MOTIF,fireLavaMotifGlsl,FIRE_LAVA_TEXELS_PER_VOXEL,FIRE_LAVA_FRAMES_PER_SECOND} from '../src/fire-lava-art.mjs';
import {spawnTerrainActor} from '../src/terrain-actor.mjs';
import {FIRE_HUNT_MATERIALS,TERRAIN_BASE_TILES,createMaterialLabTerrain,materialLabVolume,LAB_LAVA,LAB_CRUST,LAB_LAVA_BRIDGE_X,MATERIAL_LAB_SPAWN,MATERIAL_LAB_TARGET} from '../src/fire-hunt-material-lab.mjs';
import {terrainArtKey,TERRAIN_ART_CHANNELS,TERRAIN_ART_SLOTS} from '../src/terrain-material-handoff.mjs';
import {terrainMaterial} from '../src/terrain-materials.mjs';
import {buildPixelMicroSurfaceMeshes} from '../src/microvoxel-mesher.mjs';
import {buildExposedFaceMeshes} from '../src/exposed-face-mesher.mjs';

test('Fire Hunt lab includes every current authoring slot and valid preview carriers',()=>{
  assert.deepEqual(new Set(Object.keys(TERRAIN_BASE_TILES)),new Set(TERRAIN_ART_SLOTS));
  assert.equal(new Set(FIRE_HUNT_MATERIALS.map(item=>item.id)).size,FIRE_HUNT_MATERIALS.length);
  for(const item of FIRE_HUNT_MATERIALS){
    assert.ok(terrainMaterial(item.voxel));
    const tile=readFileSync(new URL('../art/fire-hunt-materials/'+item.asset+'.png',import.meta.url));
    assert.equal(tile.readUInt32BE(16),64);
    assert.equal(tile.readUInt32BE(20),64);
    for(const channel of TERRAIN_ART_CHANNELS)assert.ok(terrainArtKey(item.slot,channel));
    for(const scene of ['sample','repeats','layers','cliff']){
      const {world}=createMaterialLabTerrain(item.id,scene);
      assert.ok(buildExposedFaceMeshes(world).length);
    }
  }
});

test('the material lab crater exposes stone and dirt through a real terrain edit',()=>{
  const {world,removedVoxels}=createMaterialLabTerrain('grass','layers',true);
  assert.ok(removedVoxels>0);
  assert.equal(world.get(0,3,0),0);
  assert.equal(world.get(0,0,0),3);
  assert.equal(world.get(5,2,5),2);
  assert.equal(world.get(5,3,5),1);
  const restored=createMaterialLabTerrain('grass','layers');
  assert.equal(restored.world.get(0,3,0),1);
  assert.equal(restored.removedVoxels,0);
});

test('Hunt-scale comparison preserves the same cliff and damage geometry across materials',()=>{
  const layered=createMaterialLabTerrain('stone','hunt',true);
  const dark=createMaterialLabTerrain('dark-rock','hunt',true);
  assert.equal(layered.world.revision,dark.world.revision);
  assert.equal(layered.removedVoxels,dark.removedVoxels);
  assert.ok(layered.removedVoxels>0);
  const {x,y,z}=MATERIAL_LAB_TARGET;
  assert.equal(layered.world.get(x,y,z),0);
  assert.equal(layered.world.get(8,4,-12),3);
  assert.equal(layered.world.get(8,5,-12),3);
  assert.equal(layered.world.get(0,5,-12),2);
  assert.equal(layered.world.get(8,6,-12),1);
  assert.ok(Math.abs(spawnTerrainActor(layered.world,{...MATERIAL_LAB_SPAWN,searchTopY:10}).y-2.9)<.001);
});

test('rock cuts contain continuous rock instead of a buried dirt stripe',()=>{
  const fixture=createMaterialLabTerrain('dark-rock','layers',true);
  assert.ok(fixture.removedVoxels>0);
  const {data}=materialLabVolume(fixture);
  assert.ok(data.includes(3));
  assert.ok(!data.includes(2));
});

test('the uploaded material volume keeps lava, crust and post-crater air distinct',()=>{
  const lava=createMaterialLabTerrain('stone','lava');
  const {size,origin,data}=materialLabVolume(lava);
  const at=(x,y,z)=>data[((z-origin[2])*size[1]+y)*size[0]+x-origin[0]];
  assert.equal(at(0,0,0),LAB_LAVA);
  assert.equal(at(0,1,0),0);
  assert.equal(at(0,1,3),LAB_CRUST);
  assert.equal(at(0,2,6),3);
  const crater=createMaterialLabTerrain('grass','hunt',true);
  const changed=materialLabVolume(crater);
  const {x,y,z}=MATERIAL_LAB_TARGET;
  const index=((z-changed.origin[2])*changed.size[1]+y)*changed.size[0]+x-changed.origin[0];
  assert.equal(changed.data[index],0);
});

test('the lava art packs five fixed palette bands on an eight-texel grid',()=>{
  assert.equal(FIRE_LAVA_TEXELS_PER_VOXEL,8);
  assert.equal(FIRE_LAVA_FRAMES_PER_SECOND,8);
  assert.equal(FIRE_LAVA_MOTIF.length,12);
  const packed=[...fireLavaMotifGlsl().matchAll(/(\d+)u/g)].map(match=>Number(match[1]));
  const unpacked=FIRE_LAVA_MOTIF.map((row,index)=>{
    assert.match(row,/^[0-4]{24}$/);
    return Array.from({length:24},(_,x)=>(packed[index*3+Math.floor(x/8)]>>((x%8)*3))&7).join('');
  });
  assert.deepEqual(unpacked,FIRE_LAVA_MOTIF);
  assert.ok(FIRE_LAVA_MOTIF.join('').split('4').length-1<16);
});

test('the basalt crossing keeps a solid walkable deck above the molten channel',()=>{
  const {world}=createMaterialLabTerrain('stone','lava');
  for(const x of [LAB_LAVA_BRIDGE_X,LAB_LAVA_BRIDGE_X+1]){
    for(let z=-4;z<=6;z++)assert.equal(world.get(x,2,z),3);
    assert.equal(world.get(x,0,1),LAB_LAVA);
    assert.equal(world.get(x,1,1),0);
  }
  assert.ok(world.get(-7,6,-5));
});

test('the optional trail lip is one physical microvoxel and shares the terrain mesh',()=>{
  const stepped=createMaterialLabTerrain('grass','hunt',false,'hard');
  const flat=createMaterialLabTerrain('grass','hunt',false,'hard',false);
  const foot=({world})=>spawnTerrainActor(world,{...MATERIAL_LAB_SPAWN,searchTopY:10}).y;
  assert.ok(Math.abs(foot(flat)-foot(stepped)-.1)<.001);
  assert.equal(flat.world.get(0,2,5),stepped.world.get(0,2,5));
  assert.equal(stepped.world.get(2,2,5),1);
  assert.equal(stepped.world.microSurfaceTile(2,2,5),null);
  const meshes=buildPixelMicroSurfaceMeshes(stepped.world,buildExposedFaceMeshes(stepped.world));
  assert.ok(meshes.some(mesh=>mesh.positions.some((value,index)=>index%3===1&&Math.abs(value+mesh.origin[1]-2.9)<.001)));
});

test('Fire Road has a continuous shallow trail alongside the lava at Hunt scale',()=>{
  const {world}=createMaterialLabTerrain('grass','hunt',false,'broken',true,true);
  for(let z=5;z>=-16;z--){
    const walker=spawnTerrainActor(world,{x:.5,z:z+.5,searchTopY:10});
    assert.ok(Math.abs(walker.y-2.9)<.001,`Trail is interrupted at z=${z}`);
  }
  assert.equal(world.get(4,2,4),1);
  assert.ok([4,5].some(x=>world.get(x,1,-14)===LAB_LAVA));
  assert.equal(world.get(5,2,-14),LAB_CRUST);
});
