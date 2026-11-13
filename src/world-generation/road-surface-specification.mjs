// Specification pattern: a visually painted road is not accepted unless
// every cardinal step of its continuous spine is on the declared material,
// remains walkable, and crosses the real central fighting space.
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';

export const ROAD_SURFACE_AUDIT_SCHEMA='wyrmforge.road-surface-audit.v1';
const index=(radius,x,z)=>(z+radius)*radius*2+x+radius;
const inside=(radius,p)=>p.x>=-radius && p.x<radius &&
  p.z>=-radius && p.z<radius;

export function specifyRoadSurfaces({
  radius,heights,surfaces,routes=[],combatSpaces=[],roadWork
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
      !(heights instanceof Int16Array) ||
      !(surfaces instanceof Uint8Array) ||
      heights.length!==(radius*2)**2 ||
      surfaces.length!==heights.length ||
      !Array.isArray(routes) || !Array.isArray(combatSpaces) || !roadWork) {
    throw new TypeError('Road audit needs completed, bounded terrain');
  }
  const styled=routes.filter(route=>route.roadProfile);
  if(!styled.length) return Object.freeze({
    schema:ROAD_SURFACE_AUDIT_SCHEMA,ready:true,
    routes:Object.freeze([]),throughArena:false,
    recessedCells:0
  });
  if(roadWork.processedRoutes!==styled.length ||
      roadWork.recessedCells<10) {
    throw new Error('Road profile is painted but has no real recessed terrain');
  }
  const audits=[];
  for(const route of styled) {
    const path=rasterizeEscapeRoute(route.nodes);
    let previous=null,withinArena=0,materialCells=0,maxStep=0;
    for(const point of path) {
      if(!inside(radius,point)) throw new Error('Road leaves site footprint');
      const i=index(radius,point.x,point.z);
      const value=heights[i];
      // A crossing of two road profiles could use the primary material.
      // Both main road and spur retain continuous physical geometry.
      if(![2,3].includes(surfaces[i])) {
        throw new Error('Road visually stops before its destination: '+route.id);
      }
      materialCells++;
      if(previous!==null) {
        const delta=Math.abs(value-previous);
        maxStep=Math.max(maxStep,delta);
        if(delta>1) {
          throw new Error('Road is not walkable at a terrain grade: '+route.id+
            ' near '+point.x+','+point.z+' (delta '+delta+')');
        }
      }
      previous=value;
      if(combatSpaces.some(space=>
        Math.hypot(point.x-space.x,point.z-space.z)<=space.radius)) {
        withinArena++;
      }
    }
    if(route.id==='entry-to-exit' && combatSpaces.length && withinArena<8) {
      throw new Error('Main road must continue across the combat arena');
    }
    audits.push(Object.freeze({
      id:route.id,material:route.roadProfile.material,
      nominalCutFraction:route.roadProfile.nominalCutFraction,
      currentPhysicalCutVoxels:route.roadProfile.cutVoxels,
      pathCells:path.length,materialCells,combatCells:withinArena,
      maxStep,continuous:true
    }));
  }
  return Object.freeze({
    schema:ROAD_SURFACE_AUDIT_SCHEMA,ready:true,
    throughArena:audits.some(route=>
      route.id==='entry-to-exit' && route.combatCells>=8),
    paintedCells:roadWork.paintedCells,
    recessedCells:roadWork.recessedCells,
    routes:Object.freeze(audits)
  });
}
