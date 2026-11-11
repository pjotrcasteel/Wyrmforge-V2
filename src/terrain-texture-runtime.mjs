// Coordinates decoded CPU tiles with bounded GPU uploads. Renderer-independent.
// No automatic work is scheduled: the owning render loop calls uploadFrame().
export class TerrainTextureRuntime {
  #loader;
  #gpu;
  #queue = [];
  #queued = new Set();
  #lost = false;

  constructor(loader, gpu) {
    if (!loader || typeof loader.acquire !== 'function' ||
        typeof loader.release !== 'function' || !gpu ||
        typeof gpu.upload !== 'function' || typeof gpu.getLayer !== 'function') {
      throw new TypeError('Invalid terrain texture runtime dependencies');
    }
    this.#loader = loader;
    this.#gpu = gpu;
  }

  get pending() { return this.#queue.length; }

  /** Adds a known manifest texture to the bounded frame queue, once. */
  enqueue(channel, key) {
    if (typeof channel !== 'string' || !channel || typeof key !== 'string' || !key) {
      throw new TypeError('Invalid texture key');
    }
    const identity = channel + ':' + key;
    if (this.#gpu.getLayer(channel, key) !== null || this.#queued.has(identity)) return false;
    if (this.#queue.length >= 256) throw new RangeError('Texture upload queue capacity exceeded');
    this.#queued.add(identity);
    this.#queue.push({ channel, key, identity });
    return true;
  }

  /** Upload at most maxTiles tiles. Failed tiles stay queued for explicit retry. */
  async uploadFrame({ maxTiles = 1 } = {}) {
    if (!Number.isSafeInteger(maxTiles) || maxTiles < 1 || maxTiles > 8) {
      throw new RangeError('Invalid per-frame texture upload budget');
    }
    if (this.#lost) return 0;
    let uploaded = 0;
    while (uploaded < maxTiles && this.#queue.length && !this.#lost) {
      const next = this.#queue[0];
      if (this.#gpu.getLayer(next.channel, next.key) !== null) {
        this.#queue.shift();
        this.#queued.delete(next.identity);
        continue;
      }
      const decoded = await this.#loader.acquire(next.channel, next.key);
      try {
        if (this.#lost) break;
        this.#gpu.upload(next.channel, next.key, decoded);
        this.#queue.shift();
        this.#queued.delete(next.identity);
        uploaded++;
      } finally {
        this.#loader.release(next.channel, next.key);
      }
    }
    return uploaded;
  }

  /** GPU handles are invalidated by the browser; requeue previously uploaded assets. */
  contextLost() {
    this.#lost = true;
    this.#gpu.contextLost();
  }

  contextRestored(assets) {
    if (!Array.isArray(assets)) throw new TypeError('Expected texture asset list');
    this.#gpu.contextRestored();
    this.#lost = false;
    for (const asset of assets) this.enqueue(asset.channel, asset.key);
  }

  dispose() {
    this.#queue.length = 0;
    this.#queued.clear();
    this.#loader.clearUnused();
    this.#gpu.dispose();
  }
}
