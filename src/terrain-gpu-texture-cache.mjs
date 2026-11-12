import { estimateTerrainTextureBytes } from './terrain-texture-manifest.mjs';
// Voxel V2 WebGL2 texture-array upload adapter. No lighting or voxel-world dependency.
// Each channel has a separate array to preserve sRGB/linear sampling semantics.
export class TerrainGpuTextureCache {
  #gl;
  #manifest;
  #textures = new Map();
  #layers = new Map();
  #uploaded = new Set();
  #bytes = 0;
  #maxBytes;
  #lost = false;

  constructor(gl, manifest, { maxBytes = 64 * 1024 * 1024 } = {}) {
    if (!gl || typeof gl.createTexture !== 'function' ||
        !manifest || !Array.isArray(manifest.assets) ||
        !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new TypeError('Invalid terrain GPU texture cache configuration');
    }
    this.#gl = gl;
    this.#manifest = manifest;
    this.#maxBytes = maxBytes;
  }

  get statistics() {
    return Object.freeze({ allocatedBytes: this.#bytes, uploadedAssets: this.#uploaded.size,
      allocatedChannels: this.#textures.size, lost: this.#lost });
  }

  /** Allocate channel arrays once; all layers use the same tile size. */
  initialize() {
    if (this.#lost) throw new Error('WebGL context is lost');
    if (this.#textures.size) return;
    const gl = this.#gl;
    const tileSize = this.#manifest.tileSize;
    const pending = [];
    const mipLevels = this.#manifest.mipLevels ?? 1;
    const requiredBytes = estimateTerrainTextureBytes(tileSize, this.#manifest.layersByChannel, mipLevels);
    for (const channel of ['albedo', 'normal', 'orm', 'height']) {
      const assets = this.#manifest.assets.filter(asset => asset.channel === channel);
      if (!assets.length) continue;
      const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
      if (assets.length > maxLayers) throw new RangeError('Texture array layer limit exceeded');
      pending.push({ channel, assets });
    }
    if (requiredBytes !== this.#manifest.estimatedBytes) {
      throw new RangeError('Terrain texture manifest allocation estimate mismatch');
    }
    if (requiredBytes > this.#maxBytes) throw new RangeError('Terrain GPU texture budget exceeded');
    try {
      for (const entry of pending) {
        const texture = gl.createTexture();
        if (!texture) throw new Error('Cannot allocate terrain texture array');
        this.#textures.set(entry.channel, texture);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        const format = entry.channel === 'albedo' ? gl.SRGB8_ALPHA8 : gl.RGBA8;
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mipLevels, format,
          tileSize, tileSize, entry.assets.length);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
        entry.assets.forEach((asset, index) => {
          this.#layers.set(asset.channel + ':' + asset.key, index);
        });
      }
      this.#bytes = requiredBytes;
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    }
  }

  /** Upload a single decoded tile; caller schedules a bounded number per frame. */
  upload(channel, key, image) {
    if (this.#lost) throw new Error('WebGL context is lost');
    const identity = channel + ':' + key;
    const layer = this.#layers.get(identity);
    if (layer === undefined) throw new RangeError('Unknown or unallocated terrain texture');
    if (!image || image.width !== this.#manifest.tileSize ||
        image.height !== this.#manifest.tileSize) {
      throw new RangeError('Terrain texture tile dimensions mismatch');
    }
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#textures.get(channel));
    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      // WebGL2 texSubImage3D requires the dimensions even for TexImageSource.
      // The previous eight-argument call threw "Not enough arguments" on Safari
      // whenever an authored/reference texture reached the GPU upload queue.
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer,
        image.width, image.height, 1, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.#uploaded.add(identity);
    } finally {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    }
    return layer;
  }

  getLayer(channel, key) {
    return this.#uploaded.has(channel + ':' + key) ?
      this.#layers.get(channel + ':' + key) : null;
  }

  getTexture(channel) {
    return this.#textures.get(channel) ?? null;
  }

  /** The browser destroyed all GPU handles; the owner must reupload staged assets. */
  contextLost() {
    this.#lost = true;
    this.#textures.clear();
    this.#layers.clear();
    this.#uploaded.clear();
    this.#bytes = 0;
  }

  contextRestored() {
    this.#lost = false;
    this.initialize();
  }

  dispose() {
    if (!this.#lost) {
      for (const texture of this.#textures.values()) this.#gl.deleteTexture(texture);
    }
    this.#textures.clear();
    this.#layers.clear();
    this.#uploaded.clear();
    this.#bytes = 0;
  }
}
