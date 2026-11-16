import test from 'node:test';
import assert from 'node:assert/strict';
import {FIRE_HUNT_MATERIALS,createMaterialLabTerrain} from '../src/fire-hunt-material-lab.mjs';
import {terrainArtKey,TERRAIN_ART_CHANNELS,TERRAIN_ART_SLOTS} from '../src/terrain-material-handoff.mjs';
import {terrainMaterial} from '../src/terrain-materials.mjs';
import {buildExposedFaceMeshes} from '../src/exposed-face-mesher.mjs';

test('Fire Hunt lab includes every current authoring slot and valid preview carriers',()=>{
  assert.deepEqual(new Set(FIRE_HUNT_MATERIALS.filter(item=>!item.swatch).map(item=>item.slot)),new Set(TERRAIN_ART_SLOTS));
  assert.equal(new Set(FIRE_HUNT_MATERIALS.map(item=>item.id)).size,FIRE_HUNT_MATERIALS.length);
  for(const item of FIRE_HUNT_MATERIALS){
    assert.ok(terrainMaterial(item.voxel));
    for(const channel of TERRAIN_ART_CHANNELS)assert.ok(terrainArtKey(item.slot,channel));
    for(const scene of ['sample','repeats','layers']){
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
