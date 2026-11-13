// Adapter pattern: the *only* World Generation V2 production module that
// references a voxel integration contract. No VoxelWorld/set(), renderer,
// physics, mesher or private terrain implementation is imported.
import {
  TERRAIN_INITIALIZATION_SCHEMA, validateExternalTerrainDefinition
} from '../external-terrain-loader.mjs';
import { WORLD_GENERATOR_VERSION } from './site-recipe.mjs';

export function toVoxelTerrainDefinition({siteId,seed,chunkEdge,runs}) {
  return validateExternalTerrainDefinition({
    schema:TERRAIN_INITIALIZATION_SCHEMA,
    siteId,seed,chunkEdge,
    generatorVersion:WORLD_GENERATOR_VERSION,
    runs
  });
}
