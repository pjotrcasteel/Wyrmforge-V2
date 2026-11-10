// V2-only worker for actual localized exposed-face geometry (no WebGL inside worker).
import { processTerrainMeshJob, terrainMeshTransfers } from './terrain-mesh-protocol.mjs';

self.addEventListener('message', ({ data }) => {
  try {
    const reply = processTerrainMeshJob(data);
    self.postMessage(reply, terrainMeshTransfers(reply));
  } catch (error) {
    self.postMessage({
      schema:'voxel-v2.terrain-mesh-job.v1', type:'error',
      id:Number.isSafeInteger(data?.id) ? data.id : null,
      message:error instanceof Error ? error.message : 'Worker mesh build error'
    });
  }
});
