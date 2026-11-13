// Voxel V2: independent, deterministic terrain authority. No legacy imports.
import {
  MICRO_VOXEL_EDGE, MICRO_VOXEL_COUNT, MAX_MICRO_SURFACE_TILES,
  validateMicroSurfaceTile
} from './microvoxel-surface.mjs';
// World coordinates are signed integers; chunk dimensions are a V2 choice.
// 16 and 32 are explicit V2 experiment configurations, not inherited V1 constants.
export const CHUNK_EDGE = 16;
export const CHUNK_EDGE_CANDIDATES = Object.freeze([16, 32]);
const floorDiv = (n, edge) => Math.floor(n / edge);
const local = (n, edge) => ((n % edge) + edge) % edge;
const key = (x, y, z) => `${x},${y},${z}`;
const index = (x, y, z, edge) => x + edge * (z + edge * y);

export class VoxelWorld {
  #chunks = new Map();
  #revision = 0;
  #chunkRevisions = new Map();
  #occupied = new Map();
  #chunkEdge;
  #microSurfaces=new Map();

  constructor({ chunkEdge = CHUNK_EDGE } = {}) {
    if (!CHUNK_EDGE_CANDIDATES.includes(chunkEdge)) {
      throw new RangeError('chunkEdge must be 16 or 32');
    }
    this.#chunkEdge = chunkEdge;
  }

  get revision() { return this.#revision; }
  get chunkCount() { return this.#chunks.size; }
  get chunkEdge() { return this.#chunkEdge; }

  // Voxel payload only; excludes Map/object overhead and renderer/worker memory.
  get allocatedVoxelBytes() {
    return this.chunkCount*this.#chunkEdge**3+
      this.#microSurfaces.size*MICRO_VOXEL_COUNT;
  }
  get microSurfaceCount() {return this.#microSurfaces.size;}

  chunkRevision(cx, cy, cz) {
    this.#validate(cx, cy, cz);
    return this.#chunkRevisions.get(key(cx, cy, cz)) ?? 0;
  }

  get(x, y, z) {
    this.#validate(x, y, z);
    const edge = this.#chunkEdge;
    const chunk = this.#chunks.get(key(floorDiv(x, edge), floorDiv(y, edge), floorDiv(z, edge)));
    return chunk ? chunk[index(local(x, edge), local(y, edge), local(z, edge), edge)] : 0;
  }

  // Read-only copy. Each unit is 10cm; values 1..10 mean *occupied*
  // 10cm vertical cells above the voxel's integer bottom, not a shader warp.
  microSurfaceTile(x,y,z) {
    this.#validate(x,y,z);
    const tile=this.#microSurfaces.get(key(x,y,z));
    return tile ? tile.slice() : null;
  }

  microSurfaceTiles() {
    return [...this.#microSurfaces].sort(([a],[b])=>a.localeCompare(b))
      .map(([id,levels])=>{
        const [x,y,z]=id.split(',').map(Number);
        return {x,y,z,levels:Array.from(levels)};
      });
  }

  // A sparse optional detail layer is owned by this very same world.
  // Defining it changes the authoritative revision and is replayable.
  setMicroSurfaceTile(x,y,z,levels) {
    const tile=validateMicroSurfaceTile({x,y,z,levels});
    if(this.get(x,y,z)===0 || this.get(x,y+1,z)!==0) {
      throw new Error('Microvoxels require an exposed solid top voxel');
    }
    const id=key(x,y,z);
    const previous=this.#microSurfaces.get(id);
    if(previous?.every((value,i)=>value===tile.levels[i])) return false;
    if(!previous && this.#microSurfaces.size>=MAX_MICRO_SURFACE_TILES) {
      throw new RangeError('Micro surface tile budget exceeded');
    }
    this.#microSurfaces.set(id,Uint8Array.from(tile.levels));
    this.#revision++;
    this.#chunkRevisions.set(key(floorDiv(x,this.#chunkEdge),
      floorDiv(y,this.#chunkEdge),floorDiv(z,this.#chunkEdge)),this.#revision);
    return true;
  }

  // Physical material at a continuous world coordinate. On a refined top
  // voxel, this queries the exact 10x10x10 occupied microcells.
  materialAtPoint(x,y,z) {
    if(![x,y,z].every(Number.isFinite) ||
        [x,y,z].some(n=>Math.abs(n)>1e6)) {
      throw new TypeError('Expected finite bounded physical coordinates');
    }
    const bx=Math.floor(x),by=Math.floor(y),bz=Math.floor(z);
    const material=this.get(bx,by,bz);
    if(!material) return 0;
    const tile=this.#microSurfaces.get(key(bx,by,bz));
    if(!tile) return material;
    const mx=Math.min(9,Math.floor((x-bx)*MICRO_VOXEL_EDGE));
    const mz=Math.min(9,Math.floor((z-bz)*MICRO_VOXEL_EDGE));
    const my=Math.floor((y-by)*MICRO_VOXEL_EDGE);
    return my<tile[mz*10+mx] ? material : 0;
  }

  // Physical AABB overlap uses the 10cm occupied cells in refined top
  // voxels, and unchanged whole cubes elsewhere. No meshes or materials
  // shader are involved in collision.
  intersectsPhysicalBox(bounds) {
    if(!bounds || !['x','y','z'].every(axis=>
      Array.isArray(bounds[axis]) && bounds[axis].length===2 &&
      bounds[axis].every(Number.isFinite) &&
      bounds[axis][1]>=bounds[axis][0])) {
      throw new TypeError('Expected bounded physical x/y/z spans');
    }
    const span=axis=>[
      Math.floor(bounds[axis][0]+1e-6),
      Math.floor(bounds[axis][1]-1e-6)
    ];
    const [x0,x1]=span('x'),[y0,y1]=span('y'),[z0,z1]=span('z');
    for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++) {
      for(let x=x0;x<=x1;x++) {
        if(!this.get(x,y,z))continue;
        const tile=this.#microSurfaces.get(key(x,y,z));
        if(!tile)return true;
        const ix0=Math.max(0,Math.floor((bounds.x[0]-x)*10+1e-5));
        const ix1=Math.min(9,Math.ceil((bounds.x[1]-x)*10-1e-5)-1);
        const iz0=Math.max(0,Math.floor((bounds.z[0]-z)*10+1e-5));
        const iz1=Math.min(9,Math.ceil((bounds.z[1]-z)*10-1e-5)-1);
        for(let iz=iz0;iz<=iz1;iz++)for(let ix=ix0;ix<=ix1;ix++) {
          const top=y+tile[iz*10+ix]/10;
          if(bounds.y[0]<top-1e-7 && bounds.y[1]>y+1e-7)return true;
        }
      }
    }
    return false;
  }

  // Highest contacted 10cm/full-voxel floor along a bounded downward
  // sweep. Does not allocate 1000 tiny voxels for unrefined blocks.
  groundContactHeight(xRange,zRange,feetY,distance) {
    if(![...xRange,...zRange,feetY,distance].every(Number.isFinite) ||
        distance>=0 || distance < -32) {
      throw new RangeError('Invalid bounded downward ground probe');
    }
    let best=null;
    for(let z=Math.floor(zRange[0]+1e-6);
      z<=Math.floor(zRange[1]-1e-6);z++) {
      for(let x=Math.floor(xRange[0]+1e-6);
        x<=Math.floor(xRange[1]-1e-6);x++) {
        for(let y=Math.floor(feetY+1e-5);
          y>=Math.floor(feetY+distance-1);y--) {
          if(!this.get(x,y,z))continue;
          const tile=this.#microSurfaces.get(key(x,y,z));
          let top=y+1;
          if(tile) {
            top=y;
            const ix0=Math.max(0,Math.floor((xRange[0]-x)*10+1e-5));
            const ix1=Math.min(9,Math.ceil((xRange[1]-x)*10-1e-5)-1);
            const iz0=Math.max(0,Math.floor((zRange[0]-z)*10+1e-5));
            const iz1=Math.min(9,Math.ceil((zRange[1]-z)*10-1e-5)-1);
            for(let iz=iz0;iz<=iz1;iz++)for(let ix=ix0;ix<=ix1;ix++) {
              top=Math.max(top,y+tile[iz*10+ix]/10);
            }
          }
          if(top<=feetY+1e-5 &&
              top>=feetY+distance-1e-5 &&
              (best===null || top>best))best=top;
        }
      }
    }
    return best;
  }

  set(x, y, z, material) {
    this.#validate(x, y, z);
    if (!Number.isInteger(material) || material < 0 || material > 255) {
      throw new RangeError('Material must be an integer from 0 to 255');
    }
    const edge = this.#chunkEdge;
    const cx = floorDiv(x, edge), cy = floorDiv(y, edge), cz = floorDiv(z, edge);
    const id = key(cx, cy, cz);
    let chunk = this.#chunks.get(id);
    if (!chunk && material === 0) return false;
    if (!chunk) {
      chunk = new Uint8Array(edge ** 3);
      this.#chunks.set(id, chunk);
      this.#occupied.set(id, 0);
    }
    const offset = index(local(x, edge), local(y, edge), local(z, edge), edge);
    if (chunk[offset] === material) return false;
    // Destruction/replace invalidates micro detail with the parent voxel.
    // No detached visual/physical mask can outlive its authoritative solid.
    this.#microSurfaces.delete(key(x,y,z));
    this.#microSurfaces.delete(key(x,y-1,z));
    const wasSolid = chunk[offset] !== 0;
    chunk[offset] = material;
    const count = this.#occupied.get(id) + (material !== 0 ? 1 : 0) - (wasSolid ? 1 : 0);
    this.#revision++;
    this.#chunkRevisions.set(id, this.#revision);
    if (count === 0) {
      this.#chunks.delete(id);
      this.#occupied.delete(id);
      this.#chunkRevisions.delete(id);
    } else {
      this.#occupied.set(id, count);
    }
    return true;
  }

  // A single immutable-by-copy snapshot avoids copying unrelated chunks for local remeshing.
  chunkSnapshot(cx, cy, cz) {
    this.#validate(cx, cy, cz);
    const id = key(cx, cy, cz);
    const data = this.#chunks.get(id);
    return data ? { id, revision: this.#chunkRevisions.get(id), data: data.slice() } : null;
  }

  // Enumerate only stable identifiers for chunk-batched worker scheduling.
  // Unlike snapshots(), this allocates no voxel payload copies.
  chunkIds() {
    return [...this.#chunks.keys()].sort((a,b)=>a.localeCompare(b));
  }

  // Consumer receives copies: no mutable access to the authoritative store.
  snapshots() {
    return [...this.#chunks.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([id, data]) => ({ id, revision: this.#chunkRevisions.get(id), data: data.slice() }));
  }

  clear() {
    this.#chunks.clear();
    this.#microSurfaces.clear();
    this.#occupied.clear();
    this.#chunkRevisions.clear();
    this.#revision++;
  }

  #validate(x, y, z) {
    if (![x, y, z].every(Number.isSafeInteger)) {
      throw new TypeError('Voxel coordinates must be safe integers');
    }
  }
}

export const SCENE_GENERATOR_VERSION = 'v2.scene.v2';
export const MAX_SCENE_SEED = 0xffffffff;

// Stable 32-bit integer mixing; all scene variations are derived from the supplied seed.
function mixSceneSeed(seed) {
  let hash = seed >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function createScene(name = 'hill', seed = 7, { chunkEdge = CHUNK_EDGE } = {}) {
  if (!['flat', 'hill', 'cliff', 'arch', 'hunt-load'].includes(name)) throw new RangeError('Unknown scene');
  if (!Number.isSafeInteger(seed)) throw new TypeError('Seed must be a safe integer');
  if (seed < 0 || seed > MAX_SCENE_SEED) throw new RangeError('Seed must be an unsigned 32-bit integer');
  // Flat, cliff and arch stay fixed as comparable baseline fixtures.
  // The hill's position and height change with the seed.
  const variation = mixSceneSeed(seed);
  const hillCenterX = (variation % 5) - 2;
  const hillCenterZ = (Math.floor(variation / 5) % 5) - 2;
  const hillHeight = 6 + (Math.floor(variation / 25) % 3);
  const world = new VoxelWorld({ chunkEdge });
  // Larger V2-only performance fixture: 96 x 96 cells, not a final Hunt map size.
  const radius = name === 'hunt-load' ? 48 : 12;
  for (let z = -radius; z < radius; z++) {
    for (let x = -radius; x < radius; x++) {
      let top = 1;
      if (name === 'hunt-load') {
        const ridge = Math.sin((x + (variation % 13)) / 13) * 2 +
          Math.cos((z - (variation % 11)) / 17) * 2;
        top += Math.max(0, Math.floor(3 + ridge));
      }
      if (name === 'hill') top += Math.max(0, Math.floor(hillHeight - Math.hypot(x - hillCenterX, z - hillCenterZ) / 2));
      if (name === 'cliff') top += x >= 0 ? 8 : 0;
      if (name === 'arch') {
        // V2-only arch fixture: a freestanding, stepped stone span on solid ground.
        // The opening faces the camera and is open through its full depth,
        // unlike the previous sealed underground cavity.
        for (let y = -2; y <= 1; y++) {
          world.set(x, y, z, y === 1 ? 1 : y >= -1 ? 2 : 3);
        }
        if (Math.abs(x) <= 5 && z >= 1 && z <= 3) {
          for (let y = 2; y <= 8; y++) {
            const distanceFromCenter = Math.abs(x);
            const pillar = distanceFromCenter === 5;
            const shoulder = distanceFromCenter === 4 && y >= 5;
            const steppedArch = distanceFromCenter === 3 && y >= 7;
            const lintel = y === 8;
            if (pillar || shoulder || steppedArch || lintel) {
              world.set(x, y, z, 3);
            }
          }
        }
        continue;
      }
      for (let y = -2; y <= top; y++) {
        world.set(x, y, z, y === top ? 1 : y > top - 3 ? 2 : 3);
      }
    }
  }
  return world;
}
