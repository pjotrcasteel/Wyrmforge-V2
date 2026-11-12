// V2-native authoring handoff. Logical texture slots, never voxel IDs or art paths.
// A preview file stays in the browser session; no V1 or unapproved art is bundled.
import { compileTerrainTextureManifest } from './terrain-texture-manifest.mjs';

export const TERRAIN_ART_TILE_SIZE = 64;
export const MAX_TERRAIN_ART_PNG_BYTES = 256 * 1024;
export const TERRAIN_ART_CHANNELS = Object.freeze(['albedo','normal','orm']);
export const TERRAIN_ART_SLOTS = Object.freeze([
  'grass/meadow','grass/meadow-dark','grass/rooted-soil',
  'dirt/earth','dirt/earth-dark','stone/bedrock'
]);

const manifest = compileTerrainTextureManifest(undefined,{tileSize:TERRAIN_ART_TILE_SIZE});
const known = new Set(manifest.assets.map(asset=>asset.channel+':'+asset.key));

/** Resolve a material authoring slot without trusting arbitrary file paths. */
export function terrainArtKey(slot,channel) {
  if (!TERRAIN_ART_SLOTS.includes(slot) || !TERRAIN_ART_CHANNELS.includes(channel)) {
    throw new RangeError('Unknown terrain material authoring slot');
  }
  const key=slot+'/'+channel;
  if (!known.has(channel+':'+key)) {
    throw new RangeError('Terrain material channel not included in manifest');
  }
  return key;
}

/** Fail closed before any GPU queue mutation or source-image retention. */
export function validateTerrainArtInput(file,image,slot,channel) {
  const key=terrainArtKey(slot,channel);
  if (!file || file.type!=='image/png' ||
      !Number.isSafeInteger(file.size) || file.size<1 ||
      file.size>MAX_TERRAIN_ART_PNG_BYTES) {
    throw new TypeError('Expected a 64×64 PNG under the upload size limit');
  }
  if (!image || image.width!==TERRAIN_ART_TILE_SIZE ||
      image.height!==TERRAIN_ART_TILE_SIZE) {
    throw new RangeError('Terrain artwork must be exactly 64×64 pixels');
  }
  return Object.freeze({channel,key,tileSize:TERRAIN_ART_TILE_SIZE});
}
