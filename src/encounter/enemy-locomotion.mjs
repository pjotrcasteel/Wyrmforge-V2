// Data-owned movement capabilities. AI decides intent, Physics authoritatively
// resolves all headroom, floor, sweep and ballistic movement. No species checks
// belong in Physics, WorldGen, or the AI navigation decision loop.
import {DEFAULT_TRAVERSAL_PROFILE} from '../character-traversal-policy.mjs';

export const ENEMY_LOCOMOTION_SCHEMA='wyrmforge.enemy-locomotion.v1';
export const CAUTIOUS_WALKER_PROFILE=Object.freeze({
  ...DEFAULT_TRAVERSAL_PROFILE,
  maxNavigableDrop:.55 // a cautious actor does not plan a 1m downward jump
});
export const AGILE_HOP_PROFILE=Object.freeze({
  ...DEFAULT_TRAVERSAL_PROFILE,
  autoHopHeight:1.1, // clearance for one real 1m voxel, never a teleport
  autoHopSpeed:7.8,  // ballistic jump under the shared Physics gravity
  maxNavigableDrop:1.1 // agile enemies also plan a 1m hop down
});
export const ENEMY_LOCOMOTION=Object.freeze({
  hollowed:CAUTIOUS_WALKER_PROFILE,
  hollow:CAUTIOUS_WALKER_PROFILE,
  mage:CAUTIOUS_WALKER_PROFILE,
  ashling:AGILE_HOP_PROFILE,
  wolf:AGILE_HOP_PROFILE
});

export function locomotionFor(archetypeId){
  if(typeof archetypeId!=='string'||!archetypeId){
    throw new TypeError('Creature locomotion requires a stable archetype id');
  }
  return ENEMY_LOCOMOTION[archetypeId]??DEFAULT_TRAVERSAL_PROFILE;
}
