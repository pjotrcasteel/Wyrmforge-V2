// V2.6 — independent, engine-neutral terrain integration boundary.
// The caller owns the V2 VoxelWorld and its ONE authoritative TerrainEditLedger.
// This port only forwards queries/commands and publishes versioned events after
// successful commits; it never creates a second world, renderer or edit writer.
import { raycastTerrain } from './terrain-raycast.mjs';
import { actorOverlapsTerrain, sweepActorAxis } from './terrain-actor.mjs';

export const TERRAIN_PORT_SCHEMA = 'voxel-v2.terrain-port.v1';
export const TERRAIN_CHANGE_SCHEMA = 'voxel-v2.terrain-change.v1';
export const TERRAIN_CONSUMERS = Object.freeze([
  'gameplay', 'physics', 'lighting', 'vfx', 'audio', 'navigation'
]);
export const MAX_TERRAIN_CONSUMERS = 12;

function validWorld(world) {
  return world && [16,32].includes(world.chunkEdge) &&
    Number.isSafeInteger(world.revision) &&
    typeof world.get === 'function' &&
    typeof world.snapshots === 'function' &&
    typeof world.chunkSnapshot === 'function';
}

function validLedger(ledger) {
  return ledger && typeof ledger.apply === 'function' &&
    typeof ledger.exportJournal === 'function' &&
    typeof ledger.exportDamage === 'function' &&
    typeof ledger.damageAt === 'function' &&
    Number.isSafeInteger(ledger.editRevision);
}

function immutableChange(command,result,epoch) {
  const bounds = result.changedBounds
    ? Object.freeze({
        min:Object.freeze({...result.changedBounds.min}),
        max:Object.freeze({...result.changedBounds.max})
      })
    : null;
  return Object.freeze({
    schema:TERRAIN_CHANGE_SCHEMA,
    epoch,
    sequence:result.editRevision,
    editId:result.editId,
    editType:command.type,
    status:'accepted',
    worldRevision:result.worldRevision,
    editRevision:result.editRevision,
    removedVoxels:result.removedVoxels,
    damagedVoxels:result.damagedVoxels,
    pendingDamageCells:result.pendingDamageCells,
    geometryChanged:result.removedVoxels>0,
    damageChanged:result.damagedVoxels>0,
    dirtyChunks:Object.freeze([...result.dirtyChunks]),
    changedBounds:bounds
  });
}

export class V2TerrainPort {
  #world;
  #ledger;
  #epoch;
  #subscriptions = new Map();
  #nextSubscriptionId = 0;
  #lastChange = null;
  #published = 0;
  #delivered = 0;
  #failures = 0;
  #lastFailure = null;
  #notifying = false;
  #disposed = false;

  constructor(world,ledger,{epoch=1}={}) {
    if (!validWorld(world) || !validLedger(ledger) ||
        typeof ledger.isBoundTo !== 'function' || !ledger.isBoundTo(world) ||
        !Number.isSafeInteger(epoch) || epoch<1) {
      throw new TypeError('Expected V2 world, edit ledger and positive epoch');
    }
    this.#world=world;
    this.#ledger=ledger;
    this.#epoch=epoch;
  }

  #active() {
    if(this.#disposed) throw new Error('V2 terrain port was disposed');
  }

  get schema() { return TERRAIN_PORT_SCHEMA; }
  get epoch() { return this.#epoch; }
  get revision() { this.#active(); return this.#world.revision; }
  get chunkEdge() { this.#active(); return this.#world.chunkEdge; }
  get editRevision() { this.#active(); return this.#ledger.editRevision; }
  get recordedEdits() { this.#active(); return this.#ledger.recordedEdits; }
  get pendingDamageCells() { this.#active(); return this.#ledger.pendingDamageCells; }

  // Read-only V2 contracts. Data does not depend on a mesh upload or worker.
  materialAt(x,y,z) { this.#active(); return this.#world.get(x,y,z); }
  damageAt(x,y,z) { this.#active(); return this.#ledger.damageAt(x,y,z); }
  snapshots() { this.#active(); return this.#world.snapshots(); }
  chunkSnapshot(cx,cy,cz) {
    this.#active();
    return this.#world.chunkSnapshot(cx,cy,cz);
  }
  raycast(ray) { this.#active(); return raycastTerrain(this.#world,ray); }
  actorOverlaps(position) {
    this.#active();
    return actorOverlapsTerrain(this.#world,position);
  }
  sweepActor(position,axis,distance) {
    this.#active();
    return sweepActorAxis(this.#world,position,axis,distance);
  }

  exportJournal() { this.#active(); return this.#ledger.exportJournal(); }
  exportDamage() { this.#active(); return this.#ledger.exportDamage(); }

  subscribe(kind,listener) {
    this.#active();
    if (!TERRAIN_CONSUMERS.includes(kind) || typeof listener!=='function') {
      throw new TypeError('Expected named V2 consumer and synchronous event listener');
    }
    if(this.#subscriptions.size>=MAX_TERRAIN_CONSUMERS) {
      throw new RangeError('V2 terrain consumer capacity exceeded');
    }
    const id=++this.#nextSubscriptionId;
    this.#subscriptions.set(id,{kind,listener});
    let released=false;
    return () => {
      if(released) return;
      released=true;
      this.#subscriptions.delete(id);
    };
  }

  // A command either fails in the original ledger (no event), returns a
  // duplicate (no event), or publishes one synchronous ordered change.
  // Consumers cannot reenter the writer during delivery.
  apply(command) {
    this.#active();
    if (this.#notifying) throw new Error('Nested terrain command during change delivery');
    const result=this.#ledger.apply(command);
    if(result.status!=='accepted') return result;
    const change=immutableChange(command,result,this.#epoch);
    if (change.sequence !== this.#ledger.editRevision) {
      throw new Error('V2 terrain edit sequence changed unexpectedly');
    }
    this.#lastChange=change;
    this.#published++;
    this.#notifying=true;
    try {
      for(const {kind,listener} of [...this.#subscriptions.values()]) {
        try {
          const returned=listener(change);
          if(returned && typeof returned.then==='function') {
            // A misconfigured async consumer cannot reject without handling.
            Promise.resolve(returned).catch(() => {});
            throw new TypeError('V2 terrain event consumers must be synchronous');
          }
          this.#delivered++;
        } catch(error) {
          this.#failures++;
          this.#lastFailure={kind,message:String(error?.message??error).slice(0,160)};
          // Errors in derived effects never roll back committed terrain.
        }
      }
    } finally {
      this.#notifying=false;
    }
    return result;
  }

  metrics() {
    this.#active();
    return {
      schema:TERRAIN_PORT_SCHEMA,epoch:this.#epoch,
      worldRevision:this.#world.revision,editRevision:this.#ledger.editRevision,
      subscribers:this.#subscriptions.size,
      published:this.#published,delivered:this.#delivered,
      listenerFailures:this.#failures,
      lastFailure:this.#lastFailure && {...this.#lastFailure},
      lastChange:this.#lastChange
    };
  }

  dispose() {
    this.#subscriptions.clear();
    this.#disposed=true;
  }
}
