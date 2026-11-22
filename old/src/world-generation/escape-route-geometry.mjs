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
    const source=path.map(point=>original[index(radius,point.x,point.z)]);
    if(Math.abs(source.at(-1)-source[0])>path.length-1) {
      throw new Error('Escape path cannot meet its endpoint grade');
    }
    // Terrain-preserving slope limiter: keep as much authored ridge and
    // mountain-approach height as possible while correcting sharp steps.
    // Unlike a straight end-to-end interpolation, this does not excavate a
    // deep trench through existing horde ingress routes.
    const grades=[...source];
    for(let pass=0;pass<2;pass++) {
      for(let i=1;i<grades.length;i++) {
        grades[i]=Math.max(grades[i-1]-1,Math.min(grades[i-1]+1,grades[i]));
      }
      for(let i=grades.length-2;i>=0;i--) {
        grades[i]=Math.max(grades[i+1]-1,Math.min(grades[i+1]+1,grades[i]));
      }
    }
    if(grades[0]!==source[0] || grades.at(-1)!==source.at(-1)) {
      throw new Error('Escape route grades cannot preserve its entry anchors');
    }
    paths.push(path);
    for(let i=0;i<path.length;i++) {
      const point=path[i],elevation=grades[i];
      const k=key(point.x,point.z);
      if(centerHeights.has(k) &&
          Math.abs(centerHeights.get(k)-elevation)>1) {
        throw new Error('Conflicting authored escape route grades');
      }
      if(!centerHeights.has(k)) centerHeights.set(k,elevation);
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
      // Keep existing intersecting horde corridors and main routes intact.
      heights[pos]=Math.round(original[pos]*0.8+elevation*0.2);
    }
  }
  for(const [k,elevation] of centerHeights) {
    const [x,z]=k.split(',').map(Number);
    heights[index(radius,x,z)]=elevation;
  }
  return Object.freeze({routes:paths.length,cells:centerHeights.size});
}
