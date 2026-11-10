import { markDirtyForEditedVoxel } from './chunk-dirty.mjs';

// Independent V2.3 foundation: one synchronous authoritative writer for bounded,
// ordered, idempotent sphere edits. No rendering, physics or V1 dependencies.
// Material 4 is the experimental V2 protected bedrock ID; other materials remain
// fully destructible. Resistance/damage accumulation is deliberately future work.
export const TERRAIN_EDIT_SCHEMA = 'voxel-v2.terrain-edit.v1';
export const V2_BEDROCK_MATERIAL = 4;
export const MAX_EDIT_RADIUS = 8;
export const MAX_RECORDED_EDITS = 1024;
const EDIT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validateEdit(command) {
  if (!command || typeof command !== 'object' || command.type !== 'carve-sphere' ||
      typeof command.id !== 'string' || !EDIT_ID.test(command.id)) {
    throw new TypeError('Expected a bounded carve-sphere command with a stable edit ID');
  }
  const { x, y, z, radius, expectedRevision } = command;
  if (![x, y, z].every(Number.isSafeInteger) ||
      !Number.isFinite(radius) || radius <= 0 || radius > MAX_EDIT_RADIUS) {
    throw new RangeError('Invalid sphere center or radius');
  }
  const extent = Math.ceil(radius) + 1;
  if (![x, y, z].every(n => Number.isSafeInteger(n - extent) &&
                                Number.isSafeInteger(n + extent))) {
    throw new RangeError('Sphere bounds exceed safe integer coordinates');
  }
  if (expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
    throw new RangeError('Expected revision must be a nonnegative safe integer');
  }
  // Normalize -0 and avoid property-order-dependent payload comparisons.
  return {
    id: command.id, type: command.type, x: x + 0, y: y + 0, z: z + 0,
    radius, expectedRevision
  };
}

function resultBounds(min, max) {
  return min ? Object.freeze({
    min: Object.freeze({ x: min[0], y: min[1], z: min[2] }),
    max: Object.freeze({ x: max[0], y: max[1], z: max[2] })
  }) : null;
}

export class TerrainEditLedger {
  #world;
  #protected;
  #history = new Map();

  constructor(world, { protectedMaterials = [V2_BEDROCK_MATERIAL] } = {}) {
    if (!world || typeof world.get !== 'function' ||
        typeof world.set !== 'function' || ![16, 32].includes(world.chunkEdge) ||
        !Number.isSafeInteger(world.revision)) {
      throw new TypeError('Expected a revisioned independent V2 voxel world');
    }
    if (!Array.isArray(protectedMaterials) ||
        !protectedMaterials.every(n => Number.isInteger(n) && n >= 1 && n <= 255)) {
      throw new TypeError('Protected materials must be valid non-air byte IDs');
    }
    this.#world = world;
    this.#protected = new Set(protectedMaterials);
  }

  get recordedEdits() { return this.#history.size; }

  apply(command) {
    const edit = validateEdit(command);
    const signature = JSON.stringify([
      edit.type, edit.x, edit.y, edit.z, edit.radius,
      edit.expectedRevision ?? null
    ]);
    const recorded = this.#history.get(edit.id);
    if (recorded) {
      if (recorded.signature !== signature) {
        throw new Error('Edit ID conflict: a different payload was already accepted');
      }
      return Object.freeze({
        schema: TERRAIN_EDIT_SCHEMA, editId: edit.id, status: 'duplicate',
        removedVoxels: 0, dirtyChunks: Object.freeze([]), changedBounds: null,
        worldRevision: this.#world.revision,
        originalWorldRevision: recorded.result.worldRevision
      });
    }
    if (edit.expectedRevision !== undefined &&
        edit.expectedRevision !== this.#world.revision) {
      throw new Error('Stale terrain edit: expected world revision mismatch');
    }
    if (this.#history.size >= MAX_RECORDED_EDITS) {
      throw new RangeError('Terrain edit history capacity exceeded: checkpoint required');
    }

    const dirty = new Set();
    let removed = 0;
    let min = null, max = null;
    const r2 = edit.radius * edit.radius;
    // Maximum 8-voxel radius guarantees bounded scan and edit cost.
    for (let z = Math.floor(edit.z - edit.radius); z <= Math.ceil(edit.z + edit.radius); z++) {
      for (let y = Math.floor(edit.y - edit.radius); y <= Math.ceil(edit.y + edit.radius); y++) {
        for (let x = Math.floor(edit.x - edit.radius); x <= Math.ceil(edit.x + edit.radius); x++) {
          const dx = x - edit.x, dy = y - edit.y, dz = z - edit.z;
          if (dx * dx + dy * dy + dz * dz >= r2) continue;
          const material = this.#world.get(x, y, z);
          if (material === 0 || this.#protected.has(material)) continue;
          if (!this.#world.set(x, y, z, 0)) continue;
          removed++;
          markDirtyForEditedVoxel(dirty, this.#world.chunkEdge, x, y, z);
          if (!min) {
            min = [x, y, z];
            max = [x, y, z];
          } else {
            min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y);
            min[2] = Math.min(min[2], z); max[0] = Math.max(max[0], x);
            max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
          }
        }
      }
    }

    const result = Object.freeze({
      schema: TERRAIN_EDIT_SCHEMA, editId: edit.id, status: 'accepted',
      removedVoxels: removed, dirtyChunks: Object.freeze([...dirty].sort()),
      changedBounds: resultBounds(min, max), worldRevision: this.#world.revision
    });
    this.#history.set(edit.id, { signature, result });
    return result;
  }
}
