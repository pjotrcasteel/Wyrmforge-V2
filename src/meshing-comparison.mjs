// Diagnostic-only comparison. Never changes the authoritative world or live renderer.
import { buildExposedFaceMeshes } from './exposed-face-mesher.mjs';
import { buildGreedyFaceMeshes } from './greedy-mesher.mjs';

function summarize(meshes, unitCountProperty) {
  return {
    chunks: meshes.length,
    quads: meshes.reduce((total, mesh) => total + mesh.faceCount, 0),
    unitFaces: meshes.reduce((total, mesh) => total + mesh[unitCountProperty], 0),
    triangles: meshes.reduce((total, mesh) => total + mesh.triangleCount, 0),
    cpuGeometryBytes: meshes.reduce((total, mesh) => total + mesh.cpuBufferBytes, 0)
  };
}

export function compareMeshing(world, now = () => performance.now()) {
  if (!world || typeof world.snapshots !== 'function' ||
      ![16,32].includes(world.chunkEdge)) {
    throw new TypeError('Expected independent V2 voxel world');
  }
  const revision = world.revision;
  const startExposed = now();
  const exposed = buildExposedFaceMeshes(world);
  const exposedMs = now() - startExposed;
  const startGreedy = now();
  const greedy = buildGreedyFaceMeshes(world);
  const greedyMs = now() - startGreedy;

  const exposedSummary = summarize(exposed, 'faceCount');
  const greedySummary = {
    ...summarize(greedy, 'unitFaceCount'),
    candidateCellsVisited: greedy.reduce((total, mesh) => total + mesh.faceCandidateCells, 0),
    fullChunkCandidateCells: greedy.length * 6 * world.chunkEdge ** 3
  };
  if (world.revision !== revision || exposedSummary.unitFaces !== greedySummary.unitFaces ||
      exposedSummary.chunks !== greedySummary.chunks) {
    throw new Error('Meshing comparison mismatch: terrain changed or surface coverage differs');
  }
  return {
    schema: 'voxel-v2.mesh-compare.v1',
    chunkEdge: world.chunkEdge,
    worldRevision: revision,
    exposed: { ...exposedSummary, cpuBuildMs: exposedMs },
    greedy: { ...greedySummary, cpuBuildMs: greedyMs },
    note: 'One synchronous CPU build each, not a statistically stable GPU or mobile performance claim'
  };
}
