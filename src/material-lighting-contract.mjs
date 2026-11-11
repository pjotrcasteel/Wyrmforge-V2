// V2 renderer-facing contract. Neither the voxel world nor lighting engine owns materials.
// Texture keys are logical assets, not loaded GPU objects. Missing maps have safe defaults.
export const MATERIAL_LIGHTING_CONTRACT_VERSION = 'wyrmforge.material-lighting.v1';

const surface = (key, baseColor, roughness, textures) => Object.freeze({
  key,
  baseColor: Object.freeze(baseColor),
  metallic: 0,
  roughness,
  normalScale: 1,
  ambientOcclusion: 1,
  emissive: Object.freeze([0, 0, 0]),
  textures: Object.freeze({ albedo: textures.albedo, normal: textures.normal ?? null,
    orm: textures.orm ?? null, height: textures.height ?? null })
});

export const V2_SURFACES = Object.freeze({
  'terrain/grass': surface('terrain/grass', [0.38, 0.55, 0.28], 0.95, {
    albedo: 'terrain/grass/albedo', normal: 'terrain/grass/normal', orm: 'terrain/grass/orm'
  }),
  'terrain/grass-soil-side': surface('terrain/grass-soil-side', [0.48, 0.34, 0.24], 0.94, {
    albedo: 'terrain/grass-soil-side/albedo', normal: 'terrain/grass-soil-side/normal',
    orm: 'terrain/grass-soil-side/orm'
  }),
  'terrain/dirt': surface('terrain/dirt', [0.48, 0.34, 0.24], 0.96, {
    albedo: 'terrain/dirt/albedo', normal: 'terrain/dirt/normal', orm: 'terrain/dirt/orm'
  }),
  'terrain/stone': surface('terrain/stone', [0.42, 0.47, 0.53], 0.85, {
    albedo: 'terrain/stone/albedo', normal: 'terrain/stone/normal', orm: 'terrain/stone/orm'
  })
});

export function getV2Surface(key) {
  return V2_SURFACES[key] ?? null;
}

// Packed ORM: R = ambient occlusion, G = roughness, B = metallic.
// Values are linear, while albedo assets use sRGB.
export const ORM_CHANNELS = Object.freeze({ ambientOcclusion: 'r', roughness: 'g', metallic: 'b' });

export function createLightingFrame({ ambient = [0.25, 0.25, 0.25],
  directionalLights = [], localLights = [], shadowResources = null } = {}) {
  if (!Array.isArray(ambient) || ambient.length !== 3 ||
      ambient.some(value => !Number.isFinite(value) || value < 0) ||
      !Array.isArray(directionalLights) || !Array.isArray(localLights)) {
    throw new TypeError('Invalid V2 lighting frame');
  }
  // Snapshot only: renderer may read this but must not mutate the lighting engine's state.
  return Object.freeze({
    version: MATERIAL_LIGHTING_CONTRACT_VERSION,
    ambient: Object.freeze([...ambient]),
    directionalLights: Object.freeze(directionalLights.map(light => Object.freeze({ ...light }))),
    localLights: Object.freeze(localLights.map(light => Object.freeze({ ...light }))),
    shadowResources
  });
}
