// V2.7 external-world save/replay. Source terrain is retained as a bounded
// V2-native 3D definition, not regenerated through the lab's scene selector.
// No V1 dependencies, browser storage, rendering or mutable world shortcuts.
import { V2ExternalTerrainLoader, validateExternalTerrainDefinition } from './external-terrain-loader.mjs';
import { MAX_RECORDED_EDITS } from './terrain-edit-ledger.mjs';
import { replayDataDigest, worldDigest, damageDigest } from './replay-checkpoint.mjs';

export const EXTERNAL_TERRAIN_CHECKPOINT_SCHEMA='voxel-v2.external-terrain-checkpoint.v1';
export const MAX_EXTERNAL_CHECKPOINT_BYTES=1024*1024;
export const MAX_EXTERNAL_CHECKPOINT_EDITS=128;
const DIGEST_PATTERN=/^[0-9a-f]{16}$/;

function verifyJournal(journal,editRevision) {
  if(!journal || journal.schema!=='voxel-v2.terrain-journal.v1' ||
      !Array.isArray(journal.commands) ||
      journal.commands.length>MAX_EXTERNAL_CHECKPOINT_EDITS ||
      journal.commands.length>MAX_RECORDED_EDITS ||
      journal.editRevision!==editRevision ||
      journal.commands.length!==editRevision) {
    throw new TypeError('Invalid or excessive external V2 terrain edit journal');
  }
}

function checkpointSize(checkpoint) {
  let json;
  try {
    json=JSON.stringify(checkpoint);
  } catch {
    throw new TypeError('External terrain checkpoint is not JSON serializable');
  }
  if(typeof json!=='string') throw new TypeError('Expected V2 checkpoint data');
  const bytes=new TextEncoder().encode(json).byteLength;
  if(bytes===0 || bytes>MAX_EXTERNAL_CHECKPOINT_BYTES) {
    throw new RangeError('External V2 checkpoint exceeds the 1 MiB portable limit');
  }
  return bytes;
}

// Only one canonical writer exists: the loader's original edit ledger.
export function createExternalTerrainCheckpoint(loader) {
  if(!(loader instanceof V2ExternalTerrainLoader)) {
    throw new TypeError('Expected an active V2 external terrain loader');
  }
  const {world,ledger}=loader.terrain;
  const source=loader.exportDefinition();
  const journal=ledger.exportJournal();
  verifyJournal(journal,ledger.editRevision);
  const checkpoint={
    schema:EXTERNAL_TERRAIN_CHECKPOINT_SCHEMA,
    source,
    worldRevision:world.revision,
    editRevision:ledger.editRevision,
    pendingDamageCells:ledger.pendingDamageCells,
    journal,
    checksums:{
      source:replayDataDigest(source),
      journal:replayDataDigest(journal),
      world:worldDigest(world),
      damage:damageDigest(ledger)
    }
  };
  checkpointSize(checkpoint);
  return checkpoint;
}

// All validation happens before allocating an external world. Restoration is
// explicitly step-driven: cell initialization and journal application each
// have their own upper bounds. No partially replayed world can be read.
export class V2ExternalTerrainReplaySession {
  #loader;
  #checkpoint;
  #applied=0;
  #verified=false;
  #closed=false;

  constructor(checkpoint,{epoch=1}={}) {
    checkpointSize(checkpoint);
    if(!checkpoint || checkpoint.schema!==EXTERNAL_TERRAIN_CHECKPOINT_SCHEMA ||
        !Number.isSafeInteger(checkpoint.editRevision) ||
        checkpoint.editRevision<0 ||
        !Number.isSafeInteger(checkpoint.worldRevision) ||
        checkpoint.worldRevision<0 ||
        !Number.isSafeInteger(checkpoint.pendingDamageCells) ||
        checkpoint.pendingDamageCells<0 ||
        !checkpoint.checksums ||
        !['source','journal','world','damage'].every(key=>
          typeof checkpoint.checksums[key]==='string' &&
          DIGEST_PATTERN.test(checkpoint.checksums[key]))) {
      throw new TypeError('Unsupported or corrupt external V2 checkpoint');
    }
    verifyJournal(checkpoint.journal,checkpoint.editRevision);
    const validated=validateExternalTerrainDefinition(checkpoint.source);
    const source={
      schema:validated.schema,siteId:validated.siteId,
      generatorVersion:validated.generatorVersion,
      seed:validated.seed,chunkEdge:validated.chunkEdge,
      runs:validated.runs.map(run=>({...run})),
      ...(validated.surfaceTiles
        ? {surfaceTiles:validated.surfaceTiles.map(tile=>({
          x:tile.x,y:tile.y,z:tile.z,levels:[...tile.levels]
        }))} : {})
    };
    if(replayDataDigest(source)!==checkpoint.checksums.source ||
        replayDataDigest(checkpoint.journal)!==checkpoint.checksums.journal) {
      throw new Error('External V2 checkpoint source or journal checksum mismatch');
    }
    this.#checkpoint={
      worldRevision:checkpoint.worldRevision,
      editRevision:checkpoint.editRevision,
      pendingDamageCells:checkpoint.pendingDamageCells,
      journal:JSON.parse(JSON.stringify(checkpoint.journal)),
      checksums:{...checkpoint.checksums}
    };
    // Runtime epoch belongs to the hosting session, not the persisted world.
    this.#loader=new V2ExternalTerrainLoader(source,{epoch});
  }

  get progress() {
    const state=this.#loader.progress;
    return Object.freeze({
      loadedCells:state.loadedCells,totalCells:state.totalCells,
      appliedEdits:this.#applied,
      totalEdits:this.#checkpoint.journal.commands.length,
      done:this.#verified && !this.#closed,
      closed:this.#closed
    });
  }

  step({maxCells=192,maxEdits=1}={}) {
    if(this.#closed) throw new Error('External V2 replay session is closed');
    if(!Number.isSafeInteger(maxCells) || maxCells<1 || maxCells>4096 ||
        !Number.isSafeInteger(maxEdits) || maxEdits<1 || maxEdits>8) {
      throw new RangeError('External V2 replay step budget exceeded');
    }
    if(this.#verified) return this.progress;
    try {
      if(!this.#loader.progress.done) this.#loader.loadStep(maxCells);
      if(this.#loader.progress.done) {
        const {world,ledger}=this.#loader.terrain;
        let remaining=maxEdits;
        while(remaining-- > 0 && this.#applied<this.#checkpoint.journal.commands.length) {
          const edit=this.#checkpoint.journal.commands[this.#applied];
          const result=ledger.apply(edit);
          if(result.status!=='accepted') {
            throw new Error('External V2 checkpoint replay rejected an edit');
          }
          this.#applied++;
        }
        if(this.#applied===this.#checkpoint.journal.commands.length) {
          if(world.revision!==this.#checkpoint.worldRevision ||
              ledger.editRevision!==this.#checkpoint.editRevision ||
              ledger.pendingDamageCells!==this.#checkpoint.pendingDamageCells ||
              worldDigest(world)!==this.#checkpoint.checksums.world ||
              damageDigest(ledger)!==this.#checkpoint.checksums.damage) {
            throw new Error('External V2 checkpoint terrain or damage replay mismatch');
          }
          this.#verified=true;
        }
      }
      return this.progress;
    } catch(error) {
      this.unload();
      throw error;
    }
  }

  get terrain() {
    if(this.#closed) throw new Error('External V2 replay session is closed');
    if(!this.#verified) throw new Error('External V2 replay is not verified');
    return this.#loader.terrain;
  }

  saveCheckpoint() {
    if(this.#closed) throw new Error('External V2 replay session is closed');
    if(!this.#verified) throw new Error('External V2 replay is not verified');
    return createExternalTerrainCheckpoint(this.#loader);
  }

  unload() {
    if(this.#closed) return;
    this.#closed=true;
    this.#verified=false;
    this.#loader.unload();
  }
}
