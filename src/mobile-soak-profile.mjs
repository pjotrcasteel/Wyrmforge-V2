// V2.7 mobile-soak schedule. Pure timing and profile logic; no browser or voxel dependencies.
export const SOAK_CYCLE_MS = 60_000;
export const SOAK_ATTACK_MS = 40_000;

export const SOAK_PROFILES = Object.freeze({
  short: Object.freeze({
    id: 'short', label: '3-minute destruction preset', durationMs: 180_000,
    resetBetweenCycles: false
  }),
  sustained: Object.freeze({
    id: 'sustained', label: '10-minute mobile soak', durationMs: 600_000,
    resetBetweenCycles: true
  })
});

/**
 * Classify an elapsed monotonic interval without scheduling timers or editing the world.
 * The caller only starts a new cycle after the worker and GPU queues are drained.
 */
export function describeSoakProgress(profile, elapsedMs, currentCycleIndex) {
  if (!Object.values(SOAK_PROFILES).includes(profile) ||
      !Number.isFinite(elapsedMs) || elapsedMs < 0 ||
      !Number.isSafeInteger(currentCycleIndex) || currentCycleIndex < 0) {
    throw new RangeError('Invalid V2 soak profile or progress');
  }
  const finished = elapsedMs >= profile.durationMs;
  const cycleIndex = Math.min(Math.floor(elapsedMs / SOAK_CYCLE_MS),
    Math.ceil(profile.durationMs / SOAK_CYCLE_MS) - 1);
  const phaseMs = elapsedMs % SOAK_CYCLE_MS;
  return Object.freeze({
    finished,
    cycleIndex,
    resetDue: !finished && profile.resetBetweenCycles && cycleIndex > currentCycleIndex,
    attacking: !finished && phaseMs < SOAK_ATTACK_MS,
    phaseMs
  });
}
