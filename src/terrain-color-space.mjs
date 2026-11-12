// V2 terrain color transfer contract.
// SRGB8_ALPHA8 GPU arrays decode sRGB automatically, but the default canvas
// framebuffer expects display-encoded sRGB output from the fragment shader.
// Procedural fallback colors and the legacy RGBA8 Grass 002 sampler are already
// sRGB encoded and must be decoded before mixing with linear material light.
// No lighting-engine or voxel-world dependencies.
export const SRGB_DECODE_THRESHOLD = 0.04045;
export const SRGB_ENCODE_THRESHOLD = 0.0031308;

function unit(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('Expected a finite normalized color channel');
  }
  return value;
}

/** CPU reference for the WebGL shader's piecewise IEC 61966-2-1 decoder. */
export function srgbToLinear(value) {
  const srgb = unit(value);
  return srgb <= SRGB_DECODE_THRESHOLD
    ? srgb / 12.92
    : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** CPU reference for the WebGL shader's piecewise linear-to-sRGB encoder. */
export function linearToSrgb(value) {
  const linear = unit(value);
  return linear <= SRGB_ENCODE_THRESHOLD
    ? linear * 12.92
    : 1.055 * linear ** (1 / 2.4) - 0.055;
}

/** Expected displayed shade of one sRGB channel under a linear light factor. */
export function shadeSrgb(value, lighting) {
  if (!Number.isFinite(lighting) || lighting < 0 || lighting > 2) {
    throw new RangeError('Invalid finite lighting factor');
  }
  return linearToSrgb(Math.min(1, srgbToLinear(value) * lighting));
}

/**
 * Keep GPU and CPU transfer rules explicit. The fragment shader receives
 * decoded linear albedo for SRGB8_ALPHA8 texture-array samples; untextured
 * fallback colors require a separate decode before linear illumination.
 */
export function terrainColorTransferGlsl() {
  return `
vec3 srgbToLinearColor(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), color));
}

vec3 linearToSrgbColor(vec3 color) {
  vec3 safeColor = clamp(color, 0.0, 1.0);
  vec3 low = safeColor * 12.92;
  vec3 high = 1.055 * pow(safeColor, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), safeColor));
}
`;
}
