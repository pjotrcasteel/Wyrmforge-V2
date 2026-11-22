// Lighting-only visibility against public read-only spatial geometry.
// The same primitive serves moving point sources and static emissive cells.
// No terrain or Water imports, edits, material tags, or sprite class branches.
import {nearestOccluderDistance} from './occluder-contract.mjs';

export function nearestLightObstruction(port,origin,direction,maxDistance,shapes=[]){
  if(!port||typeof port.raycast!=='function'){
    throw new TypeError('Expected read-only public raycast port');
  }
  if(!(maxDistance>0)&&maxDistance!==0)throw new RangeError('Invalid light ray distance');
  if(maxDistance===0)return 0;
  const hit=port.raycast({origin,direction,maxDistance});
  let nearest=Number.isFinite(hit?.distance)&&hit.distance>=0&&hit.distance<=maxDistance
    ?hit.distance:maxDistance;
  nearest=Math.min(nearest,nearestOccluderDistance(origin,direction,maxDistance,shapes));
  return nearest;
}

export function lightSegmentVisible(port,source,receiver,shapes=[]){
  if(!source?.every(Number.isFinite)||!receiver?.every(Number.isFinite)||
    source.length!==3||receiver.length!==3){
    throw new TypeError('Expected finite world-space light segment endpoints');
  }
  const delta=receiver.map((value,i)=>value-source[i]);
  const distance=Math.hypot(...delta);
  if(distance<=.23)return true;
  const direction=delta.map(value=>value/distance);
  // Offset off the emissive surface; stop before the target's solid
  // receiving face to prevent self-occlusion (walls are still blockers).
  const origin=source.map((value,i)=>value+direction[i]*.065);
  const reach=distance-.065-.14;
  if(reach<=.03)return true;
  return nearestLightObstruction(port,origin,direction,reach,shapes)>=reach-.002;
}
