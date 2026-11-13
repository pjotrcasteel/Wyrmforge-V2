// Specification pattern: guarantee alternate, traversable detours around a
// future horde without putting enemy pathfinding into World Generation.
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';

export const ESCAPE_ROUTE_AUDIT_SCHEMA='wyrmforge.escape-route-audit.v1';
const key=point=>point.x+','+point.z;
const index=(radius,x,z)=>(z+radius)*2*radius+x+radius;
const inside=(radius,p)=>p.x>=-radius && p.x<radius &&
  p.z>=-radius && p.z<radius;
const matches=(a,b)=>a.x===b.x && a.z===b.z;

export function specifyEscapeRoutes({
  radius,heights,escapeRoutes=[],combatSpaces=[]
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
      !(heights instanceof Int16Array) ||
      heights.length!==(2*radius)**2 ||
      !Array.isArray(escapeRoutes) || !Array.isArray(combatSpaces)) {
    throw new TypeError('Invalid terrain height grid or authored escape plan');
  }
  if(!escapeRoutes.length) {
    // Custom/older Strategies may intentionally offer no escape grammar.
    return Object.freeze({
      schema:ESCAPE_ROUTE_AUDIT_SCHEMA,ready:true,routeCount:0,
      uniqueInteriorCells:0,routes:Object.freeze([])
    });
  }
  if(escapeRoutes.length!==2 ||
      new Set(escapeRoutes.map(route=>route.side)).size!==2 ||
      !escapeRoutes.some(route=>route.side==='west') ||
      !escapeRoutes.some(route=>route.side==='east')) {
    throw new Error('Horde escape plan needs independent east and west detours');
  }
  const paths=escapeRoutes.map(route=>rasterizeEscapeRoute(route.nodes));
  if(!matches(paths[0][0],paths[1][0]) ||
      !matches(paths[0].at(-1),paths[1].at(-1))) {
    throw new Error('Escape detours must share entry and rejoin anchors');
  }
  const interior=new Set();
  const audits=[];
  for(let i=0;i<escapeRoutes.length;i++) {
    const route=escapeRoutes[i],path=paths[i];
    if(path.length<35 || path.length>130) {
      throw new Error('Escape route is too short or unbounded: '+route.id);
    }
    let maxRise=0;
    for(let j=0;j<path.length;j++) {
      const point=path[j];
      if(!inside(radius,point)) {
        throw new RangeError('Escape path outside terrain: '+route.id);
      }
      // Consecutive cardinal cells must be directly walkable, regardless
      // of future enemy path planners or movement animation.
      if(j>0) {
        const previous=path[j-1];
        if(Math.abs(previous.x-point.x)+Math.abs(previous.z-point.z)!==1) {
          throw new Error('Escape path contains a diagonal jump: '+route.id);
        }
        const delta=Math.abs(
          heights[index(radius,point.x,point.z)]-
          heights[index(radius,previous.x,previous.z)]
        );
        maxRise=Math.max(maxRise,delta);
        if(delta>1) throw new Error('Escape path has an impassable step: '+route.id);
      }
      for(const space of combatSpaces) {
        if(Math.hypot(point.x-space.x,point.z-space.z)<=space.radius) {
          throw new Error('Escape route crosses the combat floor: '+route.id);
        }
      }
      if(j>0 && j<path.length-1) {
        const k=key(point);
        if(interior.has(k)) {
          throw new Error('Escape detours overlap and lose route independence');
        }
        interior.add(k);
      }
    }
    // At least two grid steps of clearance from the fighting floor at
    // the midpoint gives real flanking alternatives, not parallel lanes.
    if(combatSpaces.length) {
      const mid=path[Math.floor(path.length/2)];
      if(!combatSpaces.some(space=>route.side==='west'
          ? mid.x<=space.x-space.radius-1
          : mid.x>=space.x+space.radius+1)) {
        throw new Error('Escape detour does not flank the arena: '+route.id);
      }
    }
    audits.push(Object.freeze({
      id:route.id,side:route.side,style:route.style,
      cells:path.length,maxStep:maxRise,
      entry:Object.freeze({...path[0]}),
      exit:Object.freeze({...path.at(-1)}),
      ready:true
    }));
  }
  return Object.freeze({
    schema:ESCAPE_ROUTE_AUDIT_SCHEMA,
    ready:true,routeCount:audits.length,
    uniqueInteriorCells:interior.size,
    routes:Object.freeze(audits)
  });
}
