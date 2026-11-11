// Data-only world appearance progression. This module does not change voxel IDs,
// lighting, rendering, destruction, or the currently active terrain milestone.
export const CORRUPTION_STOPS = Object.freeze([
  Object.freeze({ at: 0, key: 'living-forest', daylight: 1, saturation: 1, ash: 0, volcanic: 0 }),
  Object.freeze({ at: 0.35, key: 'fading-wilds', daylight: 0.86, saturation: 0.82, ash: 0.08, volcanic: 0 }),
  Object.freeze({ at: 0.7, key: 'ashen-mountains', daylight: 0.64, saturation: 0.55, ash: 0.65, volcanic: 0.25 }),
  Object.freeze({ at: 1, key: 'wyrmlayer', daylight: 0.45, saturation: 0.35, ash: 1, volcanic: 1 })
]);

const clamp = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Continuous location-based art direction, not a global darkness filter.
 * Consumers may later interpret the channels independently. Daylight is
 * descriptive only; no lighting engine is invoked or modified here.
 */
export function terrainCorruptionProfile(progress) {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError('Corruption progress must be finite and between 0 and 1');
  }
  const nextIndex = CORRUPTION_STOPS.findIndex(stop => stop.at >= progress);
  const upper = CORRUPTION_STOPS[nextIndex];
  const lower = CORRUPTION_STOPS[Math.max(0, nextIndex - 1)];
  const span = upper.at - lower.at;
  const t = span === 0 ? 0 : clamp((progress - lower.at) / span);
  return Object.freeze({
    progress,
    region: upper.at === progress ? upper.key : lower.key,
    daylight: lerp(lower.daylight, upper.daylight, t),
    saturation: lerp(lower.saturation, upper.saturation, t),
    ash: lerp(lower.ash, upper.ash, t),
    volcanic: lerp(lower.volcanic, upper.volcanic, t)
  });
}

/** Distance is supplied by world generation; this contract is map-layout agnostic. */
export function corruptionFromDistance(distanceFromStart, distanceToWyrm) {
  if (!Number.isFinite(distanceFromStart) || !Number.isFinite(distanceToWyrm) ||
      distanceFromStart < 0 || distanceToWyrm <= 0) {
    throw new RangeError('Invalid world progression distance');
  }
  return clamp(distanceFromStart / distanceToWyrm);
}
