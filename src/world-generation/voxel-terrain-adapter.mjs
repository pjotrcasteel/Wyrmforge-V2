// Adapter pattern: the *only* World Generation V2 production module that
// references a voxel integration contract. No VoxelWorld/set(), renderer,
// physics, mesher or private terrain implementation is imported.
import {
  TERRAIN_INITIALIZATION_SCHEMA, TERRAIN_INITIALIZATION_MICRO_SCHEMA,
  validateExternalTerrainDefinition
} from '../external-terrain-loader.mjs';
import { WORLD_GENERATOR_VERSION } from './site-recipe.mjs';

export function toVoxelTerrainDefinition({
  siteId,seed,chunkEdge,runs,surfaceTiles=[]
}) {
  return validateExternalTerrainDefinition({
    schema:surfaceTiles.length
      ? TERRAIN_INITIALIZATION_MICRO_SCHEMA
      : TERRAIN_INITIALIZATION_SCHEMA,
    siteId,seed,chunkEdge,
    generatorVersion:WORLD_GENERATOR_VERSION,
    runs,
    ...(surfaceTiles.length ? {surfaceTiles} : {})
  });
}
