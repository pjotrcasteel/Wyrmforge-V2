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

export function validateTerrainArtFile(file) {
  if (!file || file.type!=='image/png' ||
      !Number.isSafeInteger(file.size) || file.size<24 ||
      file.size>MAX_TERRAIN_ART_PNG_BYTES) {
    throw new TypeError('Expected a 64×64 PNG under the upload size limit');
  }
  return true;
}

// Read 24 bytes before decoding. A tiny compressed PNG can otherwise declare
// enormous dimensions and trigger a large browser-side image allocation.
export async function inspectTerrainArtPngHeader(file) {
  validateTerrainArtFile(file);
  if (typeof file.slice !== 'function') {
    throw new TypeError('Expected a browser PNG File');
  }
  const buffer=await file.slice(0,24).arrayBuffer();
  const bytes=new Uint8Array(buffer);
  const signature=[137,80,78,71,13,10,26,10];
  if (bytes.length!==24 || !signature.every((part,i)=>bytes[i]===part) ||
      bytes[8]!==0 || bytes[9]!==0 || bytes[10]!==0 || bytes[11]!==13 ||
      bytes[12]!==73 || bytes[13]!==72 || bytes[14]!==68 || bytes[15]!==82) {
    throw new TypeError('Invalid PNG header or missing IHDR chunk');
  }
  const view=new DataView(buffer);
  if (view.getUint32(16,false)!==TERRAIN_ART_TILE_SIZE ||
      view.getUint32(20,false)!==TERRAIN_ART_TILE_SIZE) {
    throw new RangeError('Terrain artwork must declare exactly 64×64 pixels');
  }
  return true;
}

/** Fail closed before any GPU queue mutation or source-image retention. */
export function validateTerrainArtInput(file,image,slot,channel) {
  const key=terrainArtKey(slot,channel);
  validateTerrainArtFile(file);
  if (!image || image.width!==TERRAIN_ART_TILE_SIZE ||
      image.height!==TERRAIN_ART_TILE_SIZE) {
    throw new RangeError('Terrain artwork must be exactly 64×64 pixels');
  }
  return Object.freeze({channel,key,tileSize:TERRAIN_ART_TILE_SIZE});
}
