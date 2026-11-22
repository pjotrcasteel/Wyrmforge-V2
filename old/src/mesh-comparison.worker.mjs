// V2-only disposable browser module worker. No GPU access and no terrain authority.
// The main thread owns edits and must reject stale results after a scene/reset/carve.
import { runMeshingJob } from './mesh-worker-protocol.mjs';

self.addEventListener('message', ({ data }) => {
  try {
    self.postMessage(runMeshingJob(data));
  } catch (error) {
    self.postMessage({
      schema: 'voxel-v2.mesh-worker.v1', type: 'error',
      id: Number.isSafeInteger(data?.id) ? data.id : null,
      message: error instanceof Error ? error.message : 'Unknown mesh worker failure'
    });
  }
});
