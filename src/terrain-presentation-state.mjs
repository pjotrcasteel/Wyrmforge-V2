// Presentation-only readiness gate. A WebGL2 context is not a visible scene.
// Keep the existing Canvas2D terrain visible while scene/recovery GPU work drains.
// This never touches authoritative voxels, meshing, or any other V2 engine.
export function terrainPresentationState(renderer, populatedChunks) {
  if (!Number.isSafeInteger(populatedChunks) || populatedChunks < 0) {
    throw new RangeError('Invalid authoritative terrain chunk count');
  }
  if (!renderer?.ready) return 'fallback';
  const queue = renderer.uploadQueueStatistics;
  if (queue.sceneChunks > 0 || queue.recoveryChunks > 0 ||
      queue.pendingGpuDisposals > 0) {
    return 'staging';
  }
  if (populatedChunks > 0 && (
      renderer.statistics.drawCalls === 0 || renderer.statistics.triangles === 0)) {
    return 'missing-geometry';
  }
  return populatedChunks > 0 ? 'gpu' : 'fallback';
}
