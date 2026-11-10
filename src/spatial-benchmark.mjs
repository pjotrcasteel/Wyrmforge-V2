// Deterministic spatial coverage for the V2 laboratory benchmark.
// A fresh surface is chosen from a 7x7 grid; three pulses weaken and break rock.
// This is a benchmark fixture, not gameplay targeting.
export function spatialDamageTarget(world, impactIndex) {
  if (!world || typeof world.get !== 'function' || !Number.isSafeInteger(impactIndex) || impactIndex < 0) {
    throw new TypeError('Expected voxel world and non-negative impact index');
  }
  const cell = Math.floor(impactIndex / 3) % 49;
  // Stride 17 visits every cell before repeating, avoiding a linear trench.
  const slot = (cell * 17) % 49;
  const x = -9 + (slot % 7) * 3;
  const z = -9 + Math.floor(slot / 7) * 3;
  for (let y = 14; y >= -4; y--) {
    if (world.get(x, y, z) !== 0) {
      return { x, y, z, radius: 2.25 };
    }
  }
  return { x, y: 0, z, radius: 2.25 };
}
