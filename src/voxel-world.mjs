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

  get revision() { return this.#revision; }
  get chunkCount() { return this.#chunks.size; }

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
    }
    const offset = index(local(x), local(y), local(z));
    if (chunk[offset] === material) return false;
    chunk[offset] = material;
    if (material === 0 && !chunk.some(Boolean)) this.#chunks.delete(id);
    this.#revision++;
    return true;
  }

  // Consumer receives copies: no mutable access to the authoritative store.
  snapshots() {
    return [...this.#chunks.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([id, data]) => ({ id, revision: this.#revision, data: data.slice() }));
  }

  clear() {
    this.#chunks.clear();
    this.#revision++;
  }

  #validate(x, y, z) {
    if (![x, y, z].every(Number.isSafeInteger)) {
      throw new TypeError('Voxel coordinates must be safe integers');
    }
  }
}

export function createScene(name = 'hill', seed = 7) {
  if (!['flat', 'hill', 'cliff', 'arch'].includes(name)) throw new RangeError('Unknown scene');
  if (!Number.isSafeInteger(seed)) throw new TypeError('Seed must be an integer');
  const world = new VoxelWorld();
  for (let z = -12; z < 12; z++) {
    for (let x = -12; x < 12; x++) {
      let top = 1;
      if (name === 'hill') top += Math.max(0, Math.floor(7 - Math.hypot(x + 1, z - 1) / 2));
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
