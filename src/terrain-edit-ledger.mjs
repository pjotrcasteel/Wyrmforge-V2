import { markDirtyForEditedVoxel } from './chunk-dirty.mjs';

// Independent V2.3 foundation: one synchronous authoritative writer for bounded,
// ordered, idempotent sphere edits. No rendering, physics or V1 dependencies.
// Protected material 4 is independent V2 bedrock. Partial damage is private to
// this ledger and must eventually be included in a versioned snapshot/replay.
export const TERRAIN_EDIT_SCHEMA = 'voxel-v2.terrain-edit.v1';
export const V2_BEDROCK_MATERIAL = 4;
export const MAX_EDIT_RADIUS = 8;
export const MAX_RECORDED_EDITS = 1024;
export const MAX_PENDING_DAMAGE_CELLS = 8192;
export const MATERIAL_RESISTANCE = Object.freeze({ 1: 1, 2: 2, 3: 3 });
export const MAX_DAMAGE_POWER = 8;
const EDIT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validateEdit(command) {
  if (!command || typeof command !== 'object' ||
      !['carve-sphere','damage-sphere'].includes(command.type) ||
      typeof command.id !== 'string' || !EDIT_ID.test(command.id)) {
    throw new TypeError('Expected a bounded sphere command with a stable edit ID');
  }
  const { x, y, z, radius, expectedRevision, expectedEditRevision } = command;
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
  if (expectedEditRevision !== undefined &&
      (!Number.isSafeInteger(expectedEditRevision) || expectedEditRevision < 0)) {
    throw new RangeError('Expected edit revision must be a nonnegative safe integer');
  }
  if (command.type === 'damage-sphere' &&
      (!Number.isSafeInteger(command.power) || command.power < 1 ||
       command.power > MAX_DAMAGE_POWER)) {
    throw new RangeError('Damage power must be an integer from 1 to 8');
  }
  if (command.type === 'carve-sphere' && command.power !== undefined) {
    throw new TypeError('Instant carve must not supply damage power');
  }
  // Normalize -0 and avoid property-order-dependent payload comparisons.
  return {
    id: command.id, type: command.type, x: x + 0, y: y + 0, z: z + 0,
    radius, power: command.type === 'damage-sphere' ? command.power : null,
    expectedRevision, expectedEditRevision
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
  #damage = new Map();
  #editRevision = 0;

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
  get pendingDamageCells() { return this.#damage.size; }
  get editRevision() { return this.#editRevision; }

  // JSON-friendly bounded journal. Commands retain their original expected
  // revisions so a replay can reject reordering instead of silently accepting it.
  exportJournal() {
    return {
      schema: 'voxel-v2.terrain-journal.v1',
      editRevision: this.#editRevision,
      commands: [...this.#history.values()].map(record => ({ ...record.command }))
    };
  }

  // Partial-only damage is authoritative even when the voxel geometry has
  // not changed. Include it in the checkpoint digest and replay acceptance.
  exportDamage() {
    return [...this.#damage.entries()]
      .map(([position, value]) => ({
        position, material: value.material, amount: value.amount
      }))
      .sort((a,b) => a.position.localeCompare(b.position));
  }

  damageAt(x, y, z) {
    if (![x,y,z].every(Number.isSafeInteger)) {
      throw new TypeError('Damage query requires safe integer coordinates');
    }
    const material = this.#world.get(x, y, z);
    const stored = this.#damage.get(`${x},${y},${z}`);
    return stored?.material === material ? stored.amount : 0;
  }

  apply(command) {
    const edit = validateEdit(command);
    const signature = JSON.stringify([
      edit.type, edit.x, edit.y, edit.z, edit.radius, edit.power,
      edit.expectedRevision ?? null, edit.expectedEditRevision ?? null
    ]);
    const recorded = this.#history.get(edit.id);
    if (recorded) {
      if (recorded.signature !== signature) {
        throw new Error('Edit ID conflict: a different payload was already accepted');
      }
      return Object.freeze({
        schema: TERRAIN_EDIT_SCHEMA, editId: edit.id, status: 'duplicate',
        removedVoxels: 0, damagedVoxels: 0, dirtyChunks: Object.freeze([]), changedBounds: null,
        worldRevision: this.#world.revision, editRevision: this.#editRevision,
        pendingDamageCells: this.#damage.size,
        originalWorldRevision: recorded.result.worldRevision,
        originalEditRevision: recorded.result.editRevision
      });
    }
    if (edit.expectedRevision !== undefined &&
        edit.expectedRevision !== this.#world.revision) {
      throw new Error('Stale terrain edit: expected world revision mismatch');
    }
    if (edit.expectedEditRevision !== undefined &&
        edit.expectedEditRevision !== this.#editRevision) {
      throw new Error('Stale terrain edit: expected edit revision mismatch');
    }
    if (this.#history.size >= MAX_RECORDED_EDITS) {
      throw new RangeError('Terrain edit history capacity exceeded: checkpoint required');
    }

    const dirty = new Set();
    const planned = [];
    let removed = 0, damaged = 0, newDamageSlots = 0;
    let min = null, max = null;
    const r2 = edit.radius * edit.radius;

    // Plan a bounded edit before committing its world changes. Damage pulses
    // consume capacity only for partial voxels. Carve removes partial entries.
    for (let z = Math.floor(edit.z - edit.radius); z <= Math.ceil(edit.z + edit.radius); z++) {
      for (let y = Math.floor(edit.y - edit.radius); y <= Math.ceil(edit.y + edit.radius); y++) {
        for (let x = Math.floor(edit.x - edit.radius); x <= Math.ceil(edit.x + edit.radius); x++) {
          const dx = x - edit.x, dy = y - edit.y, dz = z - edit.z;
          if (dx * dx + dy * dy + dz * dz >= r2) continue;
          const material = this.#world.get(x, y, z);
          if (material === 0 || this.#protected.has(material)) continue;

          const cellKey = `${x},${y},${z}`;
          const stored = this.#damage.get(cellKey);
          const previous = stored?.material === material ? stored.amount : 0;
          const resistance = MATERIAL_RESISTANCE[material] ?? 1;
          const accumulated = edit.type === 'carve-sphere'
            ? resistance
            : previous + edit.power;
          const destroy = accumulated >= resistance;
          planned.push({ x,y,z,cellKey,material,accumulated,destroy });
          if (!destroy && !stored) newDamageSlots++;
        }
      }
    }

    // Do not partially apply a pulse if its bounded damage-state allocation
    // cannot fit. Already stored slots can be updated in place.
    if (this.#damage.size + newDamageSlots > MAX_PENDING_DAMAGE_CELLS) {
      throw new RangeError('Pending terrain damage capacity exceeded: checkpoint required');
    }

    for (const cell of planned) {
      if (!cell.destroy) {
        this.#damage.set(cell.cellKey, {
          material: cell.material, amount: cell.accumulated
        });
        damaged++;
        continue;
      }
      this.#damage.delete(cell.cellKey);
      if (!this.#world.set(cell.x, cell.y, cell.z, 0)) continue;
      removed++;
      markDirtyForEditedVoxel(dirty, this.#world.chunkEdge, cell.x, cell.y, cell.z);
      const { x, y, z } = cell;
      if (!min) {
        min = [x,y,z]; max = [x,y,z];
      } else {
        min[0] = Math.min(min[0],x); min[1] = Math.min(min[1],y); min[2] = Math.min(min[2],z);
        max[0] = Math.max(max[0],x); max[1] = Math.max(max[1],y); max[2] = Math.max(max[2],z);
      }
    }

    this.#editRevision++;
    const result = Object.freeze({
      schema: TERRAIN_EDIT_SCHEMA, editId: edit.id, status: 'accepted',
      removedVoxels: removed, damagedVoxels: damaged,
      dirtyChunks: Object.freeze([...dirty].sort()),
      changedBounds: resultBounds(min, max), worldRevision: this.#world.revision,
      editRevision: this.#editRevision, pendingDamageCells: this.#damage.size
    });
    const command = {
      id: edit.id, type: edit.type,
      x: edit.x, y: edit.y, z: edit.z, radius: edit.radius
    };
    if (edit.power !== null) command.power = edit.power;
    if (edit.expectedRevision !== undefined) command.expectedRevision = edit.expectedRevision;
    if (edit.expectedEditRevision !== undefined) {
      command.expectedEditRevision = edit.expectedEditRevision;
    }
    this.#history.set(edit.id, { signature, result, command });
    return result;
  }
}
