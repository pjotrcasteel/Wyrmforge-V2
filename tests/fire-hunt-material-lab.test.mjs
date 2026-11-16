import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnTerrainActor} from '../src/terrain-actor.mjs';
import {FIRE_HUNT_MATERIALS,TERRAIN_BASE_TILES,createMaterialLabTerrain,materialLabVolume,LAB_LAVA,LAB_CRUST,MATERIAL_LAB_SPAWN,MATERIAL_LAB_TARGET} from '../src/fire-hunt-material-lab.mjs';
import {terrainArtKey,TERRAIN_ART_CHANNELS,TERRAIN_ART_SLOTS} from '../src/terrain-material-handoff.mjs';
import {terrainMaterial} from '../src/terrain-materials.mjs';
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
  assert.ok(Math.abs(spawnTerrainActor(layered.world,{...MATERIAL_LAB_SPAWN,searchTopY:10}).y-3)<.001);
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
