// Composition Root pattern: platform chooses the output adapter. The
// independent World Generator knows only an injected function; this optional
// V2 integration wires the public Voxel terrain initialization schema.
import { WorldGeneratorV2 } from './world-generator.mjs';
import { toVoxelTerrainDefinition } from './voxel-terrain-adapter.mjs';

export function createDefaultWorldGeneratorV2({registry}={}) {
  return new WorldGeneratorV2({
    registry,terrainAdapter:toVoxelTerrainDefinition
  });
}

export function generateWorldSite(recipe,{registry}={}) {
  return createDefaultWorldGeneratorV2({registry}).generate(recipe);
}

 
// Expedition foundation: request one bounded, world-positioned region at a
// time. A streaming/activation manager and real Hunt integration are later.
export {
  createHuntExpeditionRecipe,composeHuntExpeditionPlan
} from './hunt-expedition-plan.mjs';
import { generateHuntExpeditionRegion } from './hunt-expedition-region.mjs';

export function generateWorldExpeditionRegion(plan,regionId) {
  return generateHuntExpeditionRegion(plan,regionId,{
    terrainAdapter:toVoxelTerrainDefinition
  });
}
