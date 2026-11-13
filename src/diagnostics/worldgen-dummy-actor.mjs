// Viewer diagnostic ONLY. The 1.6m actor is shown at its actual
// physics dimensions; never upscale it to make the map appear smaller.
// The position is derived from the current public reachability report.
import { projectActorDiagnostic } from './actor-proxy.mjs';
import {
  classifyTraversalHeight,DEFAULT_TRAVERSAL_PROFILE
} from '../character-traversal-policy.mjs';

export function projectRouteDummy(report,progress,view) {
  if(!report || !Array.isArray(report.targets) ||
      typeof report.routeTo!=='function' ||
      !Number.isFinite(progress) || progress<0 || progress>100) {
    throw new TypeError('Dummy requires an actor-sized reachability route and 0–100% progress');
  }
  const exit=report.targets.find(target=>target.id==='exit');
  const path=exit && report.routeTo(exit.x,exit.z);
  const start=report.entry;
  const fallback=report.cells.find(cell=>
    cell.x===start.x && cell.z===start.z && cell.y!==null);
  if(!path?.length && !fallback) return null;
  const index=path?.length>1 ? Math.round((path.length-1)*progress/100) : 0;
  const current=path?.[index] ?? fallback;
  if(!Number.isFinite(current.y))return null;
  const next=path?.[index+1] ?? null;
  const change=next ? classifyTraversalHeight(current.y,next.y) : null;
  return Object.freeze({
    ...projectActorDiagnostic({
      x:current.x+0.5,y:current.y,z:current.z+0.5
    },view),
    x:current.x,z:current.z,feetY:current.y,
    routeIndex:index,routeLength:path?.length??1,
    nextHeightDifference:change?.rise??null,
    nextMovement:change?.type??'end',
    nextPassable:change?.passable??true,
    recommendedHopLimit:DEFAULT_TRAVERSAL_PROFILE.autoHopHeight
  });
}
