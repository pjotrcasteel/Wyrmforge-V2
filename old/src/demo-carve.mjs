import { markDirtyForEditedVoxel } from './chunk-dirty.mjs';

// V2 laboratory-only deterministic edit fixture. Not yet the V2.3 ordered edit-command API.
// Gameplay and renderer must not use this scene selector as their terrain authority.
export function demoCarveTarget(scene) {
  if (!['flat', 'hill', 'cliff', 'arch'].includes(scene)) {
    throw new RangeError('Unknown demo scene');
  }
  // The original demo sphere was at (0,3,0): this is empty space under Arch.
  // Hit the visible right stone support and the edge of its roof instead.
  return scene === 'arch'
    ? { x: 5, y: 5, z: 2, radius: 3.5 }
    : { x: 0, y: 3, z: 0, radius: 4.65 };
}

export function carveDemoSphere(world, { x, y, z, radius }, { dirtyChunks = null } = {}) {
  if (!world || typeof world.get !== 'function' || typeof world.set !== 'function') {
    throw new TypeError('Expected an independent V2 voxel world');
  }
  if (![x, y, z].every(Number.isSafeInteger)) {
    throw new TypeError('Carve center must use safe integer voxel coordinates');
  }
  if (!Number.isFinite(radius) || radius <= 0 || radius > 8) {
    throw new RangeError('Demo carve radius must be greater than 0 and at most 8 voxels');
  }

  if (dirtyChunks !== null && !(dirtyChunks instanceof Set)) {
    throw new TypeError('dirtyChunks must be a Set or null');
  }
  let removedVoxels = 0;
  const radiusSquared = radius * radius;
  for (let zCell = Math.floor(z - radius); zCell <= Math.ceil(z + radius); zCell++) {
    for (let yCell = Math.floor(y - radius); yCell <= Math.ceil(y + radius); yCell++) {
      for (let xCell = Math.floor(x - radius); xCell <= Math.ceil(x + radius); xCell++) {
        const dx = xCell - x, dy = yCell - y, dz = zCell - z;
        if (dx * dx + dy * dy + dz * dz >= radiusSquared) continue;
        if (world.set(xCell, yCell, zCell, 0)) {
          removedVoxels++;
          if (dirtyChunks) markDirtyForEditedVoxel(dirtyChunks, world.chunkEdge, xCell, yCell, zCell);
        }
      }
    }
  }
  return removedVoxels;
}
