// Texture asset preparation for Voxel V2. No browser, GPU or lighting dependencies.
// A manifest resolves logical texture keys into validated, deduplicated upload slots.
import { TERRAIN_SURFACE_LIBRARY, validateTerrainSurfaceLibrary } from './terrain-surface-library.mjs';

export const TERRAIN_TEXTURE_CHANNELS = Object.freeze(['albedo', 'normal', 'orm', 'height']);
export const TERRAIN_TEXTURE_DEFAULTS = Object.freeze({
  albedo: Object.freeze([255, 255, 255, 255]),
  normal: Object.freeze([128, 128, 255, 255]),
  orm: Object.freeze([255, 255, 0, 255]),
  height: Object.freeze([128, 128, 128, 255])
});

/**
 * Compiles a surface library into a stable list of unique logical asset slots.
 * Missing optional maps are represented by neutral fallback values.
 * No image loading occurs here; upload and cache ownership belong to the renderer.
 */
export function compileTerrainTextureManifest(library = TERRAIN_SURFACE_LIBRARY, {
  tileSize = 256, maxLayers = 256, maxEstimatedBytes = 64 * 1024 * 1024
} = {}) {
  validateTerrainSurfaceLibrary(library);
  if (!Number.isSafeInteger(tileSize) || tileSize < 16 || tileSize > 2048 ||
      (tileSize & (tileSize - 1)) !== 0 ||
      !Number.isSafeInteger(maxLayers) || maxLayers < 1 ||
      !Number.isSafeInteger(maxEstimatedBytes) || maxEstimatedBytes < 1) {
    throw new RangeError('Invalid terrain texture budget');
  }
  const assets = new Map();
  const surfaces = {};
  for (const surfaceKey of Object.keys(library).sort()) {
    const surface = library[surfaceKey];
    surfaces[surfaceKey] = surface.variants.map(variant => {
      const slots = {};
      for (const channel of TERRAIN_TEXTURE_CHANNELS) {
        const key = variant.textures[channel] ?? null;
        if (key !== null && (typeof key !== 'string' || !key)) {
          throw new TypeError('Invalid texture asset key');
        }
        if (key !== null) {
          // The same source can be reused by multiple variants, but never
          // across channels with incompatible color-space semantics.
          const identity = channel + ':' + key;
          if (!assets.has(identity)) {
            assets.set(identity, Object.freeze({
              key, channel, colorSpace: channel === 'albedo' ? 'srgb' : 'linear'
            }));
          }
        }
        slots[channel] = key;
      }
      return Object.freeze({ key: variant.key, weight: variant.weight, slots: Object.freeze(slots) });
    });
    Object.freeze(surfaces[surfaceKey]);
  }
  // A texture-array implementation reserves a layer for every asset per channel.
  // The estimate intentionally excludes mipmaps and staging buffers; the upload
  // implementation must budget those separately before allocating GPU memory.
  const layersByChannel = Object.fromEntries(TERRAIN_TEXTURE_CHANNELS.map(channel =>
    [channel, [...assets.values()].filter(asset => asset.channel === channel).length]));
  const totalLayers = Object.values(layersByChannel).reduce((sum, count) => sum + count, 0);
  const estimatedBytes = totalLayers * tileSize * tileSize * 4;
  if (Object.values(layersByChannel).some(count => count > maxLayers) ||
      estimatedBytes > maxEstimatedBytes) {
    throw new RangeError('Terrain texture manifest exceeds configured GPU budget');
  }
  return Object.freeze({
    tileSize,
    assets: Object.freeze([...assets.values()]),
    surfaces: Object.freeze(surfaces),
    layersByChannel: Object.freeze(layersByChannel),
    estimatedBytes
  });
}
