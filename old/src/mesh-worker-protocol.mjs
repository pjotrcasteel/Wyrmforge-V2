// Bounded, V2-only background comparison packet. VoxelWorld remains authoritative
// on the main thread; worker snapshots are disposable, detached copies.
import { compareMeshing } from './meshing-comparison.mjs';

export const MAX_WORKER_CHUNKS = 64;
export const MAX_WORKER_SNAPSHOT_BYTES = 2 * 1024 * 1024;

export function createMeshingJob(world, id) {
  if (!world || ![16,32].includes(world.chunkEdge) ||
      typeof world.snapshots !== 'function' || !Number.isSafeInteger(world.revision)) {
    throw new TypeError('Expected a V2 world with revisioned snapshots');
  }
  if (!Number.isSafeInteger(id) || id < 1) throw new RangeError('Invalid job ID');
  const chunks = world.snapshots();
  if (chunks.length > MAX_WORKER_CHUNKS) {
    throw new RangeError('Worker snapshot chunk count exceeded');
  }
  let snapshotBytes = 0;
  for (const chunk of chunks) {
    if (!(chunk.data instanceof Uint8Array) || chunk.data.byteLength !== world.chunkEdge ** 3) {
      throw new TypeError('Invalid chunk snapshot');
    }
    snapshotBytes += chunk.data.byteLength;
    if (snapshotBytes > MAX_WORKER_SNAPSHOT_BYTES) {
      throw new RangeError('Worker snapshot memory budget exceeded');
    }
  }
  return { schema: 'voxel-v2.mesh-worker.v1', type: 'compare',
    id, chunkEdge: world.chunkEdge, revision: world.revision,
    chunks, snapshotBytes };
}

export function jobTransferBuffers(job) {
  return job.chunks.map(chunk => chunk.data.buffer);
}

export function runMeshingJob(job, now = () => performance.now()) {
  if (!job || job.schema !== 'voxel-v2.mesh-worker.v1' || job.type !== 'compare' ||
      !Number.isSafeInteger(job.id) || job.id < 1 ||
      !Number.isSafeInteger(job.revision) || job.revision < 0 ||
      ![16,32].includes(job.chunkEdge) || !Array.isArray(job.chunks) ||
      job.chunks.length > MAX_WORKER_CHUNKS) {
    throw new TypeError('Invalid V2 mesh worker message');
  }
  const ids = new Set();
  let bytes = 0;
  for (const chunk of job.chunks) {
    if (!chunk || typeof chunk.id !== 'string' || ids.has(chunk.id) ||
        !/^-?(0|[1-9]\d*),-?(0|[1-9]\d*),-?(0|[1-9]\d*)$/.test(chunk.id) ||
        !chunk.id.split(',').map(Number).every(Number.isSafeInteger) ||
        !(chunk.data instanceof Uint8Array) ||
        chunk.data.byteLength !== job.chunkEdge ** 3 ||
        !Number.isSafeInteger(chunk.revision)) {
      throw new TypeError('Invalid or duplicate V2 chunk in worker message');
    }
    ids.add(chunk.id);
    bytes += chunk.data.byteLength;
    if (bytes > MAX_WORKER_SNAPSHOT_BYTES) throw new RangeError('Worker snapshot bytes exceeded');
  }
  const world = {
    chunkEdge: job.chunkEdge,
    revision: job.revision,
    snapshots: () => job.chunks
  };
  return { schema: job.schema, type: 'complete', id: job.id, revision: job.revision,
    comparison: compareMeshing(world, now), snapshotBytes: bytes };
}

export function isCurrentMeshingResult(reply, jobId, worldRevision) {
  return !!reply && reply.type === 'complete' &&
    reply.id === jobId && reply.revision === worldRevision &&
    reply.comparison?.worldRevision === worldRevision;
}
