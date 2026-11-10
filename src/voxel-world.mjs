// Voxel V2: independent, deterministic terrain authority. No legacy imports.
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
  get allocatedVoxelBytes() { return this.chunkCount * this.#chunkEdge ** 3; }

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

  // Consumer receives copies: no mutable access to the authoritative store.
  snapshots() {
    return [...this.#chunks.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([id, data]) => ({ id, revision: this.#chunkRevisions.get(id), data: data.slice() }));
  }

  clear() {
    this.#chunks.clear();
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
  if (!['flat', 'hill', 'cliff', 'arch'].includes(name)) throw new RangeError('Unknown scene');
  if (!Number.isSafeInteger(seed)) throw new TypeError('Seed must be a safe integer');
  if (seed < 0 || seed > MAX_SCENE_SEED) throw new RangeError('Seed must be an unsigned 32-bit integer');
  // Flat, cliff and arch stay fixed as comparable baseline fixtures.
  // The hill's position and height change with the seed.
  const variation = mixSceneSeed(seed);
  const hillCenterX = (variation % 5) - 2;
  const hillCenterZ = (Math.floor(variation / 5) % 5) - 2;
  const hillHeight = 6 + (Math.floor(variation / 25) % 3);
  const world = new VoxelWorld({ chunkEdge });
  for (let z = -12; z < 12; z++) {
    for (let x = -12; x < 12; x++) {
      let top = 1;
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
