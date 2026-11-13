// World Generation V2 - pure, deterministic route geometry.
// Authored waypoints are converted to an orthogonally traversable chain;
// neither camera, runtime enemy navigation, nor Voxel V2 is referenced.
export function rasterizeEscapeRoute(nodes) {
  if(!Array.isArray(nodes) || nodes.length<2 || nodes.length>10) {
    throw new RangeError('Escape route requires 2-10 authored waypoints');
  }
  const path=[];
  const add=(x,z)=>{
    if(!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) {
      throw new TypeError('Escape routes require integer coordinates');
    }
    if(!path.length || path.at(-1).x!==x || path.at(-1).z!==z) {
      path.push(Object.freeze({x,z}));
    }
  };
  add(nodes[0].x,nodes[0].z);
  for(let i=1;i<nodes.length;i++) {
    const a=nodes[i-1],b=nodes[i];
    const dx=b.x-a.x,dz=b.z-a.z;
    const steps=Math.max(Math.abs(dx),Math.abs(dz));
    if(steps===0) throw new RangeError('Escape route has a zero-length segment');
    for(let j=1;j<=steps;j++) {
      const x=Math.round(a.x+dx*j/steps);
      const z=Math.round(a.z+dz*j/steps);
      let current=path.at(-1);
      while(current.x!==x) {
        add(current.x+Math.sign(x-current.x),current.z);
        current=path.at(-1);
      }
      while(current.z!==z) {
        add(current.x,current.z+Math.sign(z-current.z));
        current=path.at(-1);
      }
    }
  }
  return Object.freeze(path);
}

const key=(x,z)=>x+','+z;
const index=(radius,x,z)=>(z+radius)*2*radius+x+radius;
const valid=(radius,x,z)=>x>=-radius && x<radius && z>=-radius && z<radius;

// Carve usable, subtle detours into generated terrain, not runtime paths.
// The endpoint elevations remain untouched, tying the detour to existing
// authored entry/exit routes. Two-level terraces stay outside the walkway.
export function gradeEscapeRoutes({radius,heights,escapeRoutes}) {
  if(!(heights instanceof Int16Array) ||
      !Number.isSafeInteger(radius) || heights.length!==(2*radius)**2 ||
      !Array.isArray(escapeRoutes)) {
    throw new TypeError('Expected generated terrain surface and escape routes');
  }
  const original=heights.slice();
  const centerHeights=new Map();
  const paths=[];
  for(const route of escapeRoutes) {
    const path=rasterizeEscapeRoute(route.nodes);
    if(!path.every(point=>valid(radius,point.x,point.z))) {
      throw new RangeError('Escape path outside generated terrain');
    }
    const a=original[index(radius,path[0].x,path[0].z)];
    const b=original[index(radius,path.at(-1).x,path.at(-1).z)];
    if(Math.abs(b-a)>path.length-1) {
      throw new Error('Escape path cannot meet its endpoint grade');
    }
    paths.push(path);
    for(let i=0;i<path.length;i++) {
      const point=path[i];
      const elevation=Math.round(a+(b-a)*i/(path.length-1));
      const k=key(point.x,point.z);
      if(centerHeights.has(k) &&
          Math.abs(centerHeights.get(k)-elevation)>1) {
        throw new Error('Conflicting authored escape route grades');
      }
      centerHeights.set(k,elevation);
    }
  }
  // Shape the shoulders first, then impose exact centerline grades.
  // No voxel values are written here: the existing public terrain adapter
  // continues to own material encoding and Voxel V2 construction.
  for(const [k,elevation] of centerHeights) {
    const [x,z]=k.split(',').map(Number);
    for(const [dx,dz] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx=x+dx,nz=z+dz;
      if(!valid(radius,nx,nz) || centerHeights.has(key(nx,nz))) continue;
      const pos=index(radius,nx,nz);
      heights[pos]=Math.round(original[pos]*0.45+elevation*0.55);
    }
  }
  for(const [k,elevation] of centerHeights) {
    const [x,z]=k.split(',').map(Number);
    heights[index(radius,x,z)]=elevation;
  }
  return Object.freeze({routes:paths.length,cells:centerHeights.size});
}
