// Character traversal policy, independently replaceable from Voxel V2.
// All heights are world metres (1 large voxel = 1m). WorldGen describes
// geography; this policy describes whether a character can survive it.
export const TRAVERSAL_POLICY_SCHEMA='wyrmforge.character-traversal.v1';
export const AUTO_STEP_HEIGHT=0.35;
export const AUTO_HOP_HEIGHT=1.05;
export const AUTO_HOP_UPWARD_SPEED=8;
export const SAFE_FALL_HEIGHT=2;
export const MAX_NAVIGABLE_DROP=6;
export const FALL_DAMAGE_PER_METRE=20;
export const MAX_FALL_DAMAGE=100;

export const DEFAULT_TRAVERSAL_PROFILE=Object.freeze({
  schema:TRAVERSAL_POLICY_SCHEMA,
  autoStepHeight:AUTO_STEP_HEIGHT,
  autoHopHeight:AUTO_HOP_HEIGHT,
  autoHopSpeed:AUTO_HOP_UPWARD_SPEED,
  safeFallHeight:SAFE_FALL_HEIGHT,
  maxNavigableDrop:MAX_NAVIGABLE_DROP
});

export function classifyTraversalHeight(fromY,toY,profile=DEFAULT_TRAVERSAL_PROFILE) {
  if(!Number.isFinite(fromY)||!Number.isFinite(toY) ||
      !profile || !Number.isFinite(profile.autoStepHeight) ||
      !Number.isFinite(profile.autoHopHeight) ||
      !Number.isFinite(profile.maxNavigableDrop) ||
      !Number.isFinite(profile.safeFallHeight)) {
    throw new TypeError('Expected finite heights and traversal profile');
  }
  const change=Math.round((toY-fromY)*1000)/1000;
  if(change>profile.autoHopHeight+1e-4) {
    return Object.freeze({type:'blocked-uphill',passable:false,rise:change,damage:0});
  }
  if(change< -profile.maxNavigableDrop-1e-4) {
    return Object.freeze({type:'unsafe-drop',passable:false,rise:change,damage:0});
  }
  if(change>profile.autoStepHeight+1e-4) {
    return Object.freeze({type:'auto-hop',passable:true,rise:change,damage:0});
  }
  if(change>1e-4) {
    return Object.freeze({type:'auto-step',passable:true,rise:change,damage:0});
  }
  if(change< -profile.safeFallHeight-1e-4) {
    const damage=computeFallDamage(-change);
    return Object.freeze({type:'damaging-drop',passable:true,rise:change,damage});
  }
  return Object.freeze({type:change<0?'safe-descent':'walk',
    passable:true,rise:change,damage:0});
}

// Physics emits a landing; the gameplay/health engine owns application of
// this suggested damage. No health, armor, lives or inventory is stored in Voxel.
export function computeFallDamage(distance) {
  if(!Number.isFinite(distance)||distance<0) {
    throw new RangeError('Fall distance must be finite and non-negative');
  }
  return Math.min(MAX_FALL_DAMAGE,Math.ceil(
    Math.max(0,distance-SAFE_FALL_HEIGHT)*FALL_DAMAGE_PER_METRE
  ));
}

export function describeFallImpact({distance,speed}) {
  if(![distance,speed].every(Number.isFinite) ||
      distance<0 || speed<0) {
    throw new TypeError('Fall impact requires non-negative distance and speed');
  }
  const damage=computeFallDamage(distance);
  return Object.freeze({
    schema:'wyrmforge.character-fall-impact.v1',
    distance:Math.round(distance*1000)/1000,
    speed:Math.round(speed*1000)/1000,
    damage,
    severity:damage>=100?'fatal':damage>0?'injury':'safe'
  });
}
