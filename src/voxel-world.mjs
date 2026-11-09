// Voxel V2: independent, deterministic terrain authority. No legacy imports.
// World coordinates are signed integers; chunk dimensions are a V2 choice.
export const CHUNK_EDGE = 16;
const volume = CHUNK_EDGE ** 3;
const floorDiv = n => Math.floor(n / CHUNK_EDGE);
const local = n => ((n % CHUNK_EDGE) + CHUNK_EDGE) % CHUNK_EDGE;
const key = (x, y, z) => `${x},${y},${z}`;
const index = (x, y, z) => x + CHUNK_EDGE * (z + CHUNK_EDGE * y);

export class VoxelWorld {
  #chunks = new Map();
  #revision = 0;
  #chunkRevisions = new Map();
  #occupied = new Map();

  get revision() { return this.#revision; }
  get chunkCount() { return this.#chunks.size; }

  chunkRevision(cx, cy, cz) {
    this.#validate(cx, cy, cz);
    return this.#chunkRevisions.get(key(cx, cy, cz)) ?? 0;
  }

  get(x, y, z) {
    this.#validate(x, y, z);
    const chunk = this.#chunks.get(key(floorDiv(x), floorDiv(y), floorDiv(z)));
    return chunk ? chunk[index(local(x), local(y), local(z))] : 0;
  }

  set(x, y, z, material) {
    this.#validate(x, y, z);
    if (!Number.isInteger(material) || material < 0 || material > 255) {
      throw new RangeError('Material must be an integer from 0 to 255');
    }
    const cx = floorDiv(x), cy = floorDiv(y), cz = floorDiv(z);
    const id = key(cx, cy, cz);
    let chunk = this.#chunks.get(id);
    if (!chunk && material === 0) return false;
    if (!chunk) {
      chunk = new Uint8Array(volume);
      this.#chunks.set(id, chunk);
      this.#occupied.set(id, 0);
    }
    const offset = index(local(x), local(y), local(z));
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

export const SCENE_GENERATOR_VERSION = 'v2.scene.v1';
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

export function createScene(name = 'hill', seed = 7) {
  if (!['flat', 'hill', 'cliff', 'arch'].includes(name)) throw new RangeError('Unknown scene');
  if (!Number.isSafeInteger(seed)) throw new TypeError('Seed must be a safe integer');
  if (seed < 0 || seed > MAX_SCENE_SEED) throw new RangeError('Seed must be an unsigned 32-bit integer');
  // Flat, cliff and arch stay fixed as comparable baseline fixtures.
  // The hill's position and height change with the seed.
  const variation = mixSceneSeed(seed);
  const hillCenterX = (variation % 5) - 2;
  const hillCenterZ = (Math.floor(variation / 5) % 5) - 2;
  const hillHeight = 6 + (Math.floor(variation / 25) % 3);
  const world = new VoxelWorld();
  for (let z = -12; z < 12; z++) {
    for (let x = -12; x < 12; x++) {
      let top = 1;
      if (name === 'hill') top += Math.max(0, Math.floor(hillHeight - Math.hypot(x - hillCenterX, z - hillCenterZ) / 2));
      if (name === 'cliff') top += x >= 0 ? 8 : 0;
      if (name === 'arch') top += 2;
      for (let y = -2; y <= top; y++) {
        if (name === 'arch' && x >= -4 && x <= 4 && y >= 0 && y <= 2 && Math.abs(z) <= 2) continue;
        world.set(x, y, z, y === top ? 1 : y > top - 3 ? 2 : 3);
      }
    }
  }
  return world;
}
