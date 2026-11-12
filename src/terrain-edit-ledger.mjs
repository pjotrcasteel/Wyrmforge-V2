import { markDirtyForEditedVoxel } from './chunk-dirty.mjs';

// Independent V2.3 foundation: one synchronous authoritative writer for bounded,
// ordered, idempotent spatial edits. No rendering, physics or V1 dependencies.
// Protected material 4 is independent V2 bedrock. Partial damage is private to
// this ledger and must eventually be included in a versioned snapshot/replay.
export const TERRAIN_EDIT_SCHEMA = 'voxel-v2.terrain-edit.v1';
export const V2_BEDROCK_MATERIAL = 4;
export const MAX_EDIT_RADIUS = 8;
export const MAX_RECORDED_EDITS = 1024;
export const MAX_PENDING_DAMAGE_CELLS = 8192;
export const MATERIAL_RESISTANCE = Object.freeze({ 1: 1, 2: 2, 3: 3 });
export const MAX_DAMAGE_POWER = 8;
// A first Wyrmforge-ready tunnel command sweeps a radius along a bounded
// line segment. This is ONE committed edit, not a series of sphere edits.
export const MAX_TUNNEL_LENGTH = 16;
export const MAX_TUNNEL_RADIUS = 3.5;
export const MAX_TUNNEL_SCAN_CELLS = 12000;
// Excavation is voxel-authoritative: a downward bowl, never a renderer overlay.
export const MAX_CRATER_DEPTH = 6;
// The independent box-shaped area pulse scans at most 9^3 voxel cells.
export const MAX_AREA_HALF_EXTENT = 4;
const EDIT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validateEdit(command) {
  const types = ['carve-sphere','damage-sphere','carve-tunnel','carve-crater','damage-area'];
  if (!command || typeof command !== 'object' ||
      !types.includes(command.type) ||
      typeof command.id !== 'string' || !EDIT_ID.test(command.id)) {
    throw new TypeError('Expected a bounded V2 terrain command with a stable edit ID');
  }
  const { x, y, z, radius, expectedRevision, expectedEditRevision } = command;
  const area = command.type === 'damage-area';
  const crater = command.type === 'carve-crater';
  const tunnel = command.type === 'carve-tunnel';
  const damaging = command.type === 'damage-sphere' || area;
  if (![x,y,z].every(Number.isSafeInteger)) {
    throw new RangeError('Invalid terrain edit center');
  }
  if (area) {
    if (radius !== undefined ||
        ![command.halfX, command.halfY, command.halfZ].every(n =>
          Number.isSafeInteger(n) && n >= 0 && n <= MAX_AREA_HALF_EXTENT)) {
      throw new RangeError('Area extents must be integers between 0 and 4 voxels');
    }
  } else if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_EDIT_RADIUS) {
    throw new RangeError('Invalid sphere, tunnel or crater radius');
  }
  if (crater) {
    if (!Number.isSafeInteger(command.depth) ||
        command.depth < 1 || command.depth > MAX_CRATER_DEPTH) {
      throw new RangeError('Crater depth must be an integer between 1 and 6 voxels');
    }
  } else if (command.depth !== undefined) {
    throw new TypeError('Crater depth is only valid for a crater command');
  }
  if (!area && [command.halfX, command.halfY, command.halfZ]
    .some(value => value !== undefined)) {
    throw new TypeError('Area extents are only valid for area damage');
  }
  const to = tunnel ? [command.toX,command.toY,command.toZ] : [x,y,z];
  if (tunnel && (!to.every(Number.isSafeInteger) ||
      to.every((n,i)=>n === [x,y,z][i]) ||
      radius > MAX_TUNNEL_RADIUS ||
      Math.hypot(to[0]-x,to[1]-y,to[2]-z) > MAX_TUNNEL_LENGTH)) {
    throw new RangeError('Tunnel endpoint, length or radius exceeds V2 edit limits');
  }
  if (!tunnel && [command.toX,command.toY,command.toZ]
    .some(value => value !== undefined)) {
    throw new TypeError('Tunnel endpoint is only valid for a tunnel command');
  }
  const extent = area
    ? MAX_AREA_HALF_EXTENT + 1
    : Math.ceil(Math.max(radius,crater ? command.depth : 0)) + 1;
  if (![...to,x,y,z].every(n =>
    Number.isSafeInteger(n - extent) && Number.isSafeInteger(n + extent))) {
    throw new RangeError('Terrain edit bounds exceed safe integer coordinates');
  }
  if (tunnel) {
    const counts = [x,y,z].map((n,i) =>
      Math.ceil(Math.max(n,to[i])+radius) -
      Math.floor(Math.min(n,to[i])-radius) + 1);
    if (counts.reduce((product,count)=>product*count,1) > MAX_TUNNEL_SCAN_CELLS) {
      throw new RangeError('Tunnel scan budget exceeded');
    }
  }
  if (expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
    throw new RangeError('Expected revision must be a nonnegative safe integer');
  }
  if (expectedEditRevision !== undefined &&
      (!Number.isSafeInteger(expectedEditRevision) || expectedEditRevision < 0)) {
    throw new RangeError('Expected edit revision must be a nonnegative safe integer');
  }
  if (damaging &&
      (!Number.isSafeInteger(command.power) || command.power < 1 ||
       command.power > MAX_DAMAGE_POWER)) {
    throw new RangeError('Damage power must be an integer from 1 to 8');
  }
  if (!damaging && command.power !== undefined) {
    throw new TypeError('Instant carve must not supply damage power');
  }
  return {
    id: command.id, type: command.type, x: x + 0, y: y + 0, z: z + 0,
    radius: area ? null : radius,
    depth: crater ? command.depth : null,
    halfX: area ? command.halfX : null,
    halfY: area ? command.halfY : null,
    halfZ: area ? command.halfZ : null,
    power: damaging ? command.power : null,
    toX: tunnel ? to[0]+0 : null,
    toY: tunnel ? to[1]+0 : null,
    toZ: tunnel ? to[2]+0 : null,
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

  // A V2 integration port must never pair a ledger with a different world,
  // even if both happen to have identical revision numbers.
  isBoundTo(world) { return this.#world === world; }

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
      edit.depth, edit.halfX, edit.halfY, edit.halfZ,
      edit.toX, edit.toY, edit.toZ,
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
    const area = edit.type === 'damage-area';
    const crater = edit.type === 'carve-crater';
    const tunnel = edit.type === 'carve-tunnel';
    const damaging = edit.power !== null;
    const r2 = area ? 0 : edit.radius * edit.radius;
    const a = [edit.x,edit.y,edit.z];
    const b = tunnel ? [edit.toX,edit.toY,edit.toZ] : a;
    const direction = b.map((v,i)=>v-a[i]);
    const lengthSquared = direction.reduce((sum,v)=>sum+v*v,0);
    const half = area ? [edit.halfX,edit.halfY,edit.halfZ] : null;
    const minCoords = area
      ? a.map((n,i)=>n-half[i])
      : crater
        ? [Math.floor(edit.x-edit.radius),edit.y-edit.depth+1,Math.floor(edit.z-edit.radius)]
        : a.map((v,i)=>Math.floor(Math.min(v,b[i])-edit.radius));
    const maxCoords = area
      ? a.map((n,i)=>n+half[i])
      : crater
        ? [Math.ceil(edit.x+edit.radius),edit.y,Math.ceil(edit.z+edit.radius)]
        : a.map((v,i)=>Math.ceil(Math.max(v,b[i])+edit.radius));

    // Plan the entire bounded edit before mutating committed terrain.
    // A tunnel uses the squared distance from a voxel center to its closest
    // point on the 3D segment; this makes diagonal tunnels continuous and
    // prevents multiple overlapping sphere commands or partial commits.
    for (let z = minCoords[2]; z <= maxCoords[2]; z++) {
      for (let y = minCoords[1]; y <= maxCoords[1]; y++) {
        for (let x = minCoords[0]; x <= maxCoords[0]; x++) {
          const offset = [x-a[0],y-a[1],z-a[2]];
          if (crater) {
            const horizontalSquared = offset[0]*offset[0] + offset[2]*offset[2];
            if (horizontalSquared >= r2) continue;
            const localDepth = Math.ceil(edit.depth*(1-horizontalSquared/r2));
            if (y < edit.y-localDepth+1) continue;
          } else if (!area) {
            const t = tunnel ? Math.max(0,Math.min(1,
              offset.reduce((sum,v,i)=>sum+v*direction[i],0)/lengthSquared)) : 0;
            const dx = offset[0]-t*direction[0];
            const dy = offset[1]-t*direction[1];
            const dz = offset[2]-t*direction[2];
            if (dx*dx + dy*dy + dz*dz >= r2) continue;
          }
          const material = this.#world.get(x, y, z);
          if (material === 0 || this.#protected.has(material)) continue;

          const cellKey = `${x},${y},${z}`;
          const stored = this.#damage.get(cellKey);
          const previous = stored?.material === material ? stored.amount : 0;
          const resistance = MATERIAL_RESISTANCE[material] ?? 1;
          const accumulated = damaging ? previous + edit.power : resistance;
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
    const recordedCommand = {
      id: edit.id, type: edit.type, x: edit.x, y: edit.y, z: edit.z
    };
    if (edit.radius !== null) recordedCommand.radius = edit.radius;
    if (edit.power !== null) recordedCommand.power = edit.power;
    if (crater) recordedCommand.depth = edit.depth;
    if (area) {
      recordedCommand.halfX = edit.halfX;
      recordedCommand.halfY = edit.halfY;
      recordedCommand.halfZ = edit.halfZ;
    }
    if (tunnel) {
      recordedCommand.toX = edit.toX;
      recordedCommand.toY = edit.toY;
      recordedCommand.toZ = edit.toZ;
    }
    if (edit.expectedRevision !== undefined) recordedCommand.expectedRevision = edit.expectedRevision;
    if (edit.expectedEditRevision !== undefined) {
      recordedCommand.expectedEditRevision = edit.expectedEditRevision;
    }
    this.#history.set(edit.id, { signature, result, command: recordedCommand });
    return result;
  }
}
