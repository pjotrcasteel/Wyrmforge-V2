// V2.7: isolate externally generated terrain meshing from the main UI thread.
// One warmed V2 worker, one in-flight bounded chunk batch, and no parallel
// collision/rendering authority. Invalidation is by world identity, revision,
// active job identity and worker generation (through TerrainWorkerSession).
import {
  createTerrainMeshJob, isCurrentTerrainMeshReply
} from './terrain-mesh-protocol.mjs';
import { TerrainWorkerSession } from './terrain-worker-session.mjs';

export const EXTERNAL_MESH_BATCH_CHUNKS = 4;

export class V2ExternalTerrainMeshBridge {
  #session;
  #onReady;
  #onFailure;
  #active = null;
  #activeJob = null;
  #nextJobId = 0;
  #epoch = 0;
  #closed = false;

  constructor({createWorker,now,onReady,onFailure}) {
    if(typeof onReady!=='function' || typeof onFailure!=='function') {
      throw new TypeError('External terrain mesh callbacks are required');
    }
    this.#onReady=onReady;
    this.#onFailure=onFailure;
    this.#session=new TerrainWorkerSession({
      createWorker,now,
      onResult:(reply,job)=>this.#accept(reply,job),
      onFailure:(message)=>this.#abort(message)
    });
  }

  get status() {
    const pending=this.#active;
    return Object.freeze({
      busy:Boolean(pending),
      epoch:this.#epoch,
      completedChunks:pending?.completedChunks ?? 0,
      totalChunks:pending?.totalChunks ?? 0,
      closed:this.#closed
    });
  }

  #validateWorld(world) {
    if(this.#closed) throw new Error('External terrain mesh bridge is closed');
    if(!world || ![16,32].includes(world.chunkEdge) ||
        !Number.isSafeInteger(world.revision) ||
        typeof world.chunkIds!=='function' ||
        typeof world.chunkSnapshot!=='function') {
      throw new TypeError('Expected an authoritative V2 voxel world');
    }
  }

  #start(world,ids,kind) {
    this.cancel();
    const target={
      epoch:this.#epoch,world,revision:world.revision,kind,
      dirtyIds:kind==='edit' ? [...ids] : null,
      remaining:ids,meshes:[],completedChunks:0,totalChunks:ids.length
    };
    this.#active=target;
    this.#dispatch();
    return target.epoch;
  }

  begin(world) {
    this.#validateWorld(world);
    const ids=world.chunkIds();
    if(ids.length===0) throw new RangeError('External terrain has no occupied chunks');
    return this.#start(world,ids,'scene');
  }

  // Mesh only the changed chunks and their neighbors after an accepted edit.
  // Removed chunks are valid dirty IDs: the worker returns no mesh for them,
  // allowing WebGL to retire their old buffers. Never scan the whole scene.
  replace(world,dirtyIds) {
    this.#validateWorld(world);
    if(!(dirtyIds instanceof Set) && !Array.isArray(dirtyIds)) {
      throw new TypeError('Expected dirty V2 chunk IDs');
    }
    const ids=[...new Set(dirtyIds)];
    if(ids.length<1 || ids.length>128) {
      throw new RangeError('External terrain edit chunk budget exceeded');
    }
    const pattern=/^-?(0|[1-9][0-9]*),-?(0|[1-9][0-9]*),-?(0|[1-9][0-9]*)$/;
    if(!ids.every(id=>typeof id==='string' && pattern.test(id) &&
        id.split(',').map(Number).every(Number.isSafeInteger))) {
      throw new TypeError('Expected canonical signed V2 dirty chunk IDs');
    }
    ids.sort();
    return this.#start(world,ids,'edit');
  }

  cancel() {
    if(this.#closed) return false;
    const wasActive=Boolean(this.#active);
    this.#active=null;
    this.#activeJob=null;
    this.#epoch++;
    this.#session.cancel();
    return wasActive;
  }

  close() {
    if(this.#closed) return;
    this.cancel();
    this.#closed=true;
    this.#session.close();
  }

  #abort(reason) {
    const target=this.#active;
    if(!target) return;
    this.cancel();
    this.#onFailure(String(reason),target.epoch);
  }

  #dispatch() {
    const target=this.#active;
    if(!target) return;
    if(target.world.revision!==target.revision) {
      this.#abort('External terrain changed before worker meshing completed');
      return;
    }
    if(target.remaining.length===0) {
      this.#active=null;
      this.#activeJob=null;
      // Publish meshes only as a complete set from one authoritative revision.
      try {
        this.#onReady(target.world,target.meshes,target.epoch,target.kind,target.dirtyIds);
      } catch(error) {
        this.#onFailure(error?.message ?? String(error),target.epoch);
      }
      return;
    }
    try {
      // 4 dirty chunks need at most 4*7 neighbor snapshots. At 32 cubed,
      // this is under the existing 2 MiB worker payload cap per job.
      const ids=target.remaining.slice(0,EXTERNAL_MESH_BATCH_CHUNKS);
      const job=createTerrainMeshJob(target.world,new Set(ids),++this.#nextJobId);
      this.#activeJob=job;
      this.#session.submit(job);
      target.remaining.splice(0,ids.length);
    } catch(error) {
      this.#abort(error?.message ?? String(error));
    }
  }

  #accept(reply,job) {
    const target=this.#active;
    if(!target || this.#activeJob!==job) return;
    this.#activeJob=null;
    if(!isCurrentTerrainMeshReply(reply,job,target.world.revision) ||
        target.world.revision!==target.revision) {
      this.#abort('Stale or invalid external terrain mesh result');
      return;
    }
    target.meshes.push(...reply.meshes);
    target.completedChunks+=job.dirtyIds.length;
    this.#dispatch();
  }
}
