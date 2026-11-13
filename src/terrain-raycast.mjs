// V2-only terrain sight queries. The authoritative voxel world is read directly;
// neither WebGL meshes nor the lab scene generator participates in hit testing.
import { getCameraPreset } from './camera-presets.mjs';

const MAX_RAY_DISTANCE = 256;
const EPSILON = 1e-9;
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0]
];

function normalize(direction) {
  if (!Array.isArray(direction) || direction.length !== 3 ||
      !direction.every(Number.isFinite)) {
    throw new TypeError('Terrain ray direction must contain three finite components');
  }
  const length = Math.hypot(...direction);
  if (length < EPSILON) throw new RangeError('Terrain ray direction cannot be zero');
  return direction.map(value => value/length);
}

function validateRay(origin, direction, maxDistance) {
  if (!Array.isArray(origin) || origin.length !== 3 ||
      !origin.every(Number.isFinite) ||
      origin.some(value => Math.abs(value) > Number.MAX_SAFE_INTEGER / 2)) {
    throw new TypeError('Terrain ray origin must contain three finite, bounded components');
  }
  if (!Number.isFinite(maxDistance) || maxDistance <= 0 ||
      maxDistance > MAX_RAY_DISTANCE) {
    throw new RangeError('Terrain ray distance must be in (0,256]');
  }
  return normalize(direction);
}

// Refined top voxels are physically 10x10x10 occupied cells. Traverse only
// those selected coarse cells at the ten-centimeter grid, preserving the
// ordinary fast whole-voxel DDA everywhere else.
function firstMicroContact(world,cell,origin,unit,start,end,entryNormal) {
  let t=start,normal=entryNormal;
  for(let visited=0;visited<=34 && t<=end+EPSILON;visited++) {
    const p=origin.map((value,i)=>value+unit[i]*(t+EPSILON*10));
    if(world.materialAtPoint(...p)) return {distance:t,normal};
    let best=Infinity,axis=-1;
    for(let i=0;i<3;i++) {
      if(unit[i]===0)continue;
      const coordinate=p[i]*10;
      const boundary=unit[i]>0 ? (Math.floor(coordinate)+1)/10
        : (Math.ceil(coordinate)-1)/10;
      const dt=(boundary-p[i])/unit[i];
      if(dt>0 && dt<best) {best=dt;axis=i;}
    }
    if(axis<0 || !Number.isFinite(best))break;
    t+=best+EPSILON*10;
    normal=[0,0,0];
    normal[axis]=-Math.sign(unit[axis]);
  }
  return null;
}

// Amanatides-Woo grid traversal, using the exact signed V2 voxel convention.
// Each query is bounded by distance and an explicit cell-visit budget.
// The first solid voxel encountered is the closest hit along the ray.
export function raycastTerrain(world, {
  origin, direction, maxDistance = 128
} = {}) {
  if (!world || typeof world.get !== 'function' ||
      !Number.isSafeInteger(world.revision)) {
    throw new TypeError('Expected a revisioned authoritative V2 voxel world');
  }
  const unit = validateRay(origin,direction,maxDistance);
  const cell = origin.map(Math.floor);
  const step = unit.map(value => Math.sign(value));
  const next = cell.map((value,i) =>
    step[i] === 0 ? Infinity
      : (step[i] > 0 ? value+1-origin[i] : origin[i]-value) / Math.abs(unit[i]));
  const delta = unit.map(value => value === 0 ? Infinity : 1/Math.abs(value));
  const maxVisits = Math.ceil(maxDistance * 3) + 4;
  let t = 0, entryNormal = null;

  for (let visits = 0; visits < maxVisits && t <= maxDistance+EPSILON; visits++) {
    const material = world.get(...cell);
    if (material) {
      let hit={distance:t,normal:entryNormal};
      if(typeof world.microSurfaceTile==='function' &&
          world.microSurfaceTile(...cell)) {
        hit=firstMicroContact(world,cell,origin,unit,t,
          Math.min(maxDistance,...next),entryNormal);
      }
      if(hit) {
        const distance=hit.distance;
        return {
          cell:{x:cell[0],y:cell[1],z:cell[2]},
          material,distance,
          point:{
            x:origin[0]+unit[0]*distance,
            y:origin[1]+unit[1]*distance,
            z:origin[2]+unit[2]*distance
          },
          normal:hit.normal ? {
            x:hit.normal[0],y:hit.normal[1],z:hit.normal[2]
          } : null,
          worldRevision:world.revision
        };
      }
    }
    // Deterministic X/Y/Z order at identical boundary intersections.
    // The next voxel is checked after exactly one grid plane is crossed.
    const axis = next[0] <= next[1] && next[0] <= next[2] ? 0
      : next[1] <= next[2] ? 1 : 2;
    if (next[axis] === Infinity || next[axis] > maxDistance+EPSILON) return null;
    t = next[axis];
    cell[axis] += step[axis];
    next[axis] += delta[axis];
    entryNormal = [0,0,0];
    entryNormal[axis] = -step[axis];
  }
  return null;
}

// Reverse the *same* V2 orthographic camera basis used by the WebGL2 renderer.
// Input is backing-canvas pixels (not CSS pixels); adapters scale pointer
// positions by canvas.width / boundingRect.width before calling this.
// Inversion uses a full Gram matrix so future oblique V2 camera presets can
// change axis angles without breaking targeting.
export function terrainRayFromScreen({
  x, y, width, height, scale, panX = 0, panY = 0,
  camera = 'hunt', nearDistance = 96
} = {}) {
  if (![x,y,width,height,scale,panX,panY,nearDistance].every(Number.isFinite) ||
      width <= 0 || height <= 0 || scale <= 0 ||
      nearDistance <= 0 || nearDistance > 128) {
    throw new RangeError('Invalid orthographic V2 terrain ray projection');
  }
  const basis = getCameraPreset(camera);
  const right = basis.right, down = basis.down;
  const r = (x-width/2-panX)/scale, d = (y-height/2-panY)/scale;
  const rr=dot(right,right), rd=dot(right,down), dd=dot(down,down);
  const determinant = rr*dd-rd*rd;
  if (determinant <= EPSILON) throw new RangeError('Degenerate V2 camera basis');
  const a = (r*dd-d*rd)/determinant;
  const b = (d*rr-r*rd)/determinant;
  // Cross(R,D) points from the camera toward the terrain for V2 presets.
  const direction = normalize(cross(right,down));
  const center = right.map((value,i) => value*a+down[i]*b);
  const origin = center.map((value,i) => value-direction[i]*nearDistance);
  return { origin, direction, maxDistance:Math.min(MAX_RAY_DISTANCE,nearDistance*2) };
}
