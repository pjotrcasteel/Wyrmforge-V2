// Voxel V2 terrain texture CPU staging. No GPU allocation, no lighting dependency.
// Explicit, injectable decode() keeps tests browser-independent.
export class TerrainTextureLoader {
  #manifest;
  #decode;
  #maxResidentBytes;
  #maxConcurrent;
  #cache = new Map();
  #inflight = new Map();
  #residentBytes = 0;

  constructor(manifest, { decode, maxResidentBytes = 32 * 1024 * 1024, maxConcurrent = 2 } = {}) {
    if (!manifest || !Array.isArray(manifest.assets) || typeof decode !== 'function' ||
        !Number.isSafeInteger(maxResidentBytes) || maxResidentBytes < 1 ||
        !Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 8) {
      throw new TypeError('Invalid terrain texture loader configuration');
    }
    this.#manifest = manifest;
    this.#decode = decode;
    this.#maxResidentBytes = maxResidentBytes;
    this.#maxConcurrent = maxConcurrent;
  }

  get statistics() {
    return Object.freeze({
      residentBytes: this.#residentBytes,
      cachedAssets: this.#cache.size,
      inflightAssets: this.#inflight.size,
      maxResidentBytes: this.#maxResidentBytes
    });
  }

  #identity(asset) { return asset.channel + ':' + asset.key; }

  /** Caller owns the returned decoded asset until release(). */
  async acquire(channel, key) {
    const asset = this.#manifest.assets.find(item => item.channel === channel && item.key === key);
    if (!asset) throw new RangeError('Unknown terrain texture asset');
    const identity = this.#identity(asset);
    const cached = this.#cache.get(identity);
    if (cached) {
      cached.refs++;
      return cached.value;
    }
    const pending = this.#inflight.get(identity);
    if (pending) {
      const value = await pending;
      const record = this.#cache.get(identity);
      if (!record) throw new Error('Texture staging entry disappeared');
      record.refs++;
      return value;
    }
    if (this.#inflight.size >= this.#maxConcurrent) {
      throw new RangeError('Terrain texture decode concurrency limit reached');
    }
    const promise = (async () => {
      const decoded = await this.#decode(asset);
      if (!decoded || !Number.isSafeInteger(decoded.width) || !Number.isSafeInteger(decoded.height) ||
          decoded.width !== this.#manifest.tileSize || decoded.height !== this.#manifest.tileSize) {
        throw new RangeError('Decoded terrain texture dimensions do not match manifest tile size');
      }
      const bytes = decoded.width * decoded.height * 4;
      if (bytes > this.#maxResidentBytes) throw new RangeError('Texture exceeds staging budget');
      // Only evict unreferenced entries, in insertion order (oldest first).
      for (const [entryKey, entry] of this.#cache) {
        if (this.#residentBytes + bytes <= this.#maxResidentBytes) break;
        if (entry.refs === 0) {
          this.#cache.delete(entryKey);
          this.#residentBytes -= entry.bytes;
          entry.value.close?.();
        }
      }
      if (this.#residentBytes + bytes > this.#maxResidentBytes) {
        decoded.close?.();
        throw new RangeError('Terrain texture CPU staging budget exceeded');
      }
      this.#cache.set(identity, { value: decoded, bytes, refs: 0 });
      this.#residentBytes += bytes;
      return decoded;
    })();
    this.#inflight.set(identity, promise);
    try {
      const value = await promise;
      this.#cache.get(identity).refs++;
      return value;
    } finally {
      this.#inflight.delete(identity);
    }
  }

  release(channel, key) {
    const entry = this.#cache.get(channel + ':' + key);
    if (!entry || entry.refs === 0) throw new RangeError('Terrain texture is not acquired');
    entry.refs--;
  }

  /** Evict unused decoded images; never closes a still-acquired image. */
  clearUnused() {
    for (const [key, entry] of this.#cache) {
      if (entry.refs !== 0) continue;
      this.#cache.delete(key);
      this.#residentBytes -= entry.bytes;
      entry.value.close?.();
    }
  }
}
