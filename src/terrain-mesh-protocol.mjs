// V2.4 pilot: one bounded, disposable background job for exposed-face terrain meshes.
// Static terrain authority remains in VoxelWorld. No WebGL calls inside the worker.
import { buildExposedFaceMeshes } from './exposed-face-mesher.mjs';

export const MAX_TERRAIN_JOB_CHUNKS = 64;
export const MAX_TERRAIN_JOB_BYTES = 2 * 1024 * 1024;

const directions = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key = (x,y,z) => `${x},${y},${z}`;
const chunkPattern = /^-?(0|[1-9]\d*),-?(0|[1-9]\d*),-?(0|[1-9]\d*)$/;

function parseId(id) {
  if (typeof id !== 'string' || !chunkPattern.test(id)) {
    throw new TypeError('Invalid V2 chunk ID');
  }
  const values = id.split(',').map(Number);
  if (!values.every(Number.isSafeInteger) || key(...values) !== id) {
    throw new TypeError('Noncanonical or unsafe chunk ID');
  }
  return values;
}

function validateChunk(snapshot, edge) {
  if (!snapshot || typeof snapshot.id !== 'string' ||
      !(snapshot.data instanceof Uint8Array) ||
      snapshot.data.byteLength !== edge ** 3 ||
      !Number.isSafeInteger(snapshot.revision)) {
    throw new TypeError('Invalid V2 chunk snapshot');
  }
  parseId(snapshot.id);
}

export function createTerrainMeshJob(world, dirtyIds, jobId) {
  if (!world || ![16,32].includes(world.chunkEdge) ||
      typeof world.chunkSnapshot !== 'function' ||
      !Number.isSafeInteger(world.revision)) {
    throw new TypeError('Expected revisioned independent V2 voxel world');
  }
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw new RangeError('Invalid job ID');
  if (!(dirtyIds instanceof Set) && !Array.isArray(dirtyIds)) {
    throw new TypeError('Expected dirty-chunk IDs');
  }
  const requested = [...new Set(dirtyIds)].sort();
  if (!requested.length || requested.length > MAX_TERRAIN_JOB_CHUNKS) {
    throw new RangeError('Invalid dirty-chunk count');
  }
  const needed = new Map();
  const read = coords => {
    const id = key(...coords);
    if (needed.has(id)) return;
    const snapshot = world.chunkSnapshot(...coords);
    if (snapshot) {
      validateChunk(snapshot, world.chunkEdge);
      if (snapshot.id !== id) throw new TypeError('Snapshot chunk ID mismatch');
      needed.set(id, snapshot);
    } else {
      needed.set(id, null);
    }
  };
  for (const id of requested) {
    const coords = parseId(id);
    read(coords);
    for (const [dx,dy,dz] of directions) {
      read([coords[0]+dx,coords[1]+dy,coords[2]+dz]);
    }
  }
  const snapshots = [...needed.values()].filter(Boolean);
  const snapshotBytes = snapshots.reduce((sum, snapshot) => sum+snapshot.data.byteLength,0);
  if (snapshots.length > MAX_TERRAIN_JOB_CHUNKS || snapshotBytes > MAX_TERRAIN_JOB_BYTES) {
    throw new RangeError('Terrain mesh snapshot limit exceeded');
  }
  return { schema:'voxel-v2.terrain-mesh-job.v1', type:'build',
    id:jobId, revision:world.revision, chunkEdge:world.chunkEdge,
    dirtyIds:requested, snapshots, snapshotBytes };
}

export function terrainJobTransfers(job) {
  return job.snapshots.map(snapshot => snapshot.data.buffer);
}

export function processTerrainMeshJob(job, now = () => performance.now()) {
  if (!job || job.schema !== 'voxel-v2.terrain-mesh-job.v1' ||
      job.type !== 'build' || !Number.isSafeInteger(job.id) || job.id < 1 ||
      ![16,32].includes(job.chunkEdge) || !Number.isSafeInteger(job.revision) ||
      !Array.isArray(job.dirtyIds) || !Array.isArray(job.snapshots) ||
      !job.dirtyIds.length || job.dirtyIds.length > MAX_TERRAIN_JOB_CHUNKS ||
      job.snapshots.length > MAX_TERRAIN_JOB_CHUNKS) {
    throw new TypeError('Invalid V2 terrain mesh job');
  }
  const dirtyIds = new Set();
  for (const id of job.dirtyIds) {
    parseId(id);
    if (dirtyIds.has(id)) throw new TypeError('Duplicate dirty chunk ID');
    dirtyIds.add(id);
  }
  const byId = new Map();
  let bytes = 0;
  for (const snapshot of job.snapshots) {
    validateChunk(snapshot, job.chunkEdge);
    if (byId.has(snapshot.id)) throw new TypeError('Duplicate chunk snapshot');
    byId.set(snapshot.id,snapshot);
    bytes += snapshot.data.byteLength;
    if (bytes > MAX_TERRAIN_JOB_BYTES) throw new RangeError('Snapshot memory exceeded');
  }
  if (bytes !== job.snapshotBytes) throw new TypeError('Snapshot byte count mismatch');
  for (const id of dirtyIds) {
    const coords = parseId(id);
    for (const [dx,dy,dz] of directions) {
      const neighbor = key(coords[0]+dx,coords[1]+dy,coords[2]+dz);
      // The job's snapshot set must include all existing adjacent chunks,
      // checked by its authoritative producer. Missing entries represent air.
      // There is no global query available inside the worker.
      if (byId.has(neighbor)) validateChunk(byId.get(neighbor),job.chunkEdge);
    }
  }
  const view = {
    chunkEdge:job.chunkEdge,
    snapshots:() => [...byId.values()],
    chunkSnapshot:(x,y,z) => byId.get(key(x,y,z)) ?? null
  };
  const start = now();
  const meshes = buildExposedFaceMeshes(view, { chunkIds:dirtyIds });
  const cpuMs = now()-start;
  return { schema:job.schema, type:'ready', id:job.id,
    revision:job.revision, dirtyIds:job.dirtyIds,
    meshes, cpuMs, snapshotBytes:bytes,
    meshBytes:meshes.reduce((sum,mesh)=>sum+mesh.cpuBufferBytes,0) };
}

export function terrainMeshTransfers(reply) {
  return reply.meshes.flatMap(mesh=>[
    mesh.positions.buffer,mesh.normals.buffer,mesh.materials.buffer,mesh.indices.buffer
  ]);
}

export function isCurrentTerrainMeshReply(reply, job, currentRevision) {
  if (!reply || reply.schema !== 'voxel-v2.terrain-mesh-job.v1' ||
      reply.type !== 'ready' || reply.id !== job?.id ||
      reply.revision !== job.revision || reply.revision !== currentRevision ||
      !Array.isArray(reply.dirtyIds) || !Array.isArray(reply.meshes) ||
      reply.dirtyIds.length !== job.dirtyIds.length) return false;
  if (!reply.dirtyIds.every((id,i)=>id===job.dirtyIds[i])) return false;
  const dirty = new Set(reply.dirtyIds), seen = new Set();
  for (const mesh of reply.meshes) {
    if (!mesh || typeof mesh.id !== 'string' || !dirty.has(mesh.id) ||
        seen.has(mesh.id) ||
        !(mesh.positions instanceof Float32Array) ||
        !(mesh.normals instanceof Int8Array) ||
        !(mesh.materials instanceof Uint8Array) ||
        !(mesh.indices instanceof Uint32Array) ||
        mesh.positions.length !== mesh.vertexCount*3 ||
        mesh.indices.length !== mesh.triangleCount*3) return false;
    seen.add(mesh.id);
  }
  return true;
}
