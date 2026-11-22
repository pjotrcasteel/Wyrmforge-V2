// V2.4: bounded, one-sample-per-second sustained device telemetry.
// Estimated GPU bytes are not driver allocations; JS heap is optional.
export class SustainedTelemetry {
  #samples = [];
  #start = null;
  #last = null;
  #peakPendingBytes = 0;
  #peakPendingChunks = 0;
  #peakRecoveryChunks = 0;
  #peakPendingTextureTiles = 0;
  #peakPendingGpuDisposals = 0;
  #peakRetiredGpuBytesEstimate = 0;
  #samplingGaps = [];
  #largestSamplingGapMs = 0;
  #estimatedSkippedIntervals = 0;
  constructor({ intervalMs = 1000, capacity = 900 } = {}) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 ||
        !Number.isInteger(capacity) || capacity < 1 || capacity > 3600) {
      throw new RangeError('Invalid sustained telemetry limits');
    }
    this.intervalMs = intervalMs;
    this.capacity = capacity;
  }
  observeQueue(queue) {
    if (!queue) return;
    this.#peakPendingBytes = Math.max(this.#peakPendingBytes, queue.pendingBytes ?? 0);
    this.#peakPendingChunks = Math.max(this.#peakPendingChunks, queue.pendingChunks ?? 0, queue.peakChunks ?? 0);
    this.#peakRecoveryChunks = Math.max(this.#peakRecoveryChunks, queue.recoveryChunks ?? 0);
    this.#peakPendingTextureTiles = Math.max(this.#peakPendingTextureTiles, queue.pendingTextureTiles ?? 0);
    this.#peakPendingGpuDisposals = Math.max(this.#peakPendingGpuDisposals, queue.pendingGpuDisposals ?? 0);
    this.#peakRetiredGpuBytesEstimate = Math.max(this.#peakRetiredGpuBytesEstimate,
      queue.retiredGpuBytesEstimate ?? 0);
  }
  due(now) { return Number.isFinite(now) && (this.#last === null || now - this.#last >= this.intervalMs); }
  record(now, { frames, frameWork = null, queue, renderer, voxelBytes, edits, pendingTerrainChunks,
    heapBytes = null }, { force = false } = {}) {
    if (!Number.isFinite(now)) return false;
    if (this.#start === null) this.#start = now;
    if (!force && this.#last !== null && now - this.#last < this.intervalMs) return false;
    if (this.#last !== null) {
      const gap = now - this.#last;
      // A missing observation is not automatically an application freeze.
      if (gap >= this.intervalMs * 2) {
        this.#largestSamplingGapMs = Math.max(this.#largestSamplingGapMs, gap);
        const estimatedSkipped = Math.max(1, Math.floor(gap / this.intervalMs) - 1);
        this.#estimatedSkippedIntervals += estimatedSkipped;
        if (this.#samplingGaps.length < 32) {
          this.#samplingGaps.push(Object.freeze({
            afterSeconds: Math.round((this.#last - this.#start) / 1000),
            gapMs: Math.round(gap), estimatedSkippedIntervals: estimatedSkipped
          }));
        }
      }
    }
    this.#last = now;
    this.observeQueue(queue);
    const sample = {
      elapsedSeconds: Math.round((now - this.#start) / 1000),
      p95Ms: frames.p95, p99Ms: frames.p99,
      frameWorkP95Ms: frameWork?.p95 ?? null,
      frameWorkP99Ms: frameWork?.p99 ?? null,
      hitchesOver50Ms: frames.hitchesOver50Ms,
      pendingChunks: queue?.pendingChunks ?? null,
      pendingBytes: queue?.pendingBytes ?? null,
      recoveryChunks: queue?.recoveryChunks ?? null,
      pendingTextureTiles: queue?.pendingTextureTiles ?? null,
      pendingGpuDisposals: queue?.pendingGpuDisposals ?? null,
      retiredGpuBytesEstimate: queue?.retiredGpuBytesEstimate ?? null,
      gpuTextureBytesEstimate: renderer?.terrainGpuTextureBytesEstimate ?? null,
      terrainDecodedTileBytesEstimate: renderer?.terrainDecodedTileBytesEstimate ?? null,
      pendingTerrainChunks, gpuBytesEstimate: renderer?.gpuBufferBytesEstimate ?? null,
      voxelBytes, edits, heapBytes
    };
    if (this.#samples.length === this.capacity) this.#samples.shift();
    this.#samples.push(sample);
    return true;
  }
  reset() {
    this.#samples = []; this.#start = null; this.#last = null;
    this.#peakPendingBytes = 0;
    this.#peakPendingChunks = 0;
    this.#peakRecoveryChunks = 0;
    this.#peakPendingTextureTiles = 0;
    this.#peakPendingGpuDisposals = 0;
    this.#peakRetiredGpuBytesEstimate = 0;
    this.#samplingGaps = [];
    this.#largestSamplingGapMs = 0;
    this.#estimatedSkippedIntervals = 0;
  }
  report() {
    const samples = this.#samples.map(s => ({...s}));
    const max = key => samples.reduce((m,s) => s[key] === null ? m : Math.max(m,s[key]), 0);
    return {
      schema: 'voxel-v2.sustained-telemetry.v1',
      intervalMs: this.intervalMs, capacity: this.capacity,
      sampleCount: samples.length,
      elapsedSeconds: samples.at(-1)?.elapsedSeconds ?? 0,
      samplingGapCount: this.#samplingGaps.length,
      largestSamplingGapMs: this.#largestSamplingGapMs,
      estimatedSkippedIntervals: this.#estimatedSkippedIntervals,
      samplingGaps: this.#samplingGaps.map(gap => ({...gap})),
      peakPendingBytes: this.#peakPendingBytes,
      peakPendingChunks: this.#peakPendingChunks,
      peakRecoveryChunks: this.#peakRecoveryChunks,
      peakPendingTextureTiles: this.#peakPendingTextureTiles,
      peakPendingGpuDisposals: this.#peakPendingGpuDisposals,
      peakRetiredGpuBytesEstimate: this.#peakRetiredGpuBytesEstimate,
      peakGpuTextureBytesEstimate: max('gpuTextureBytesEstimate'),
      peakDecodedTileBytesEstimate: max('terrainDecodedTileBytesEstimate'),
      peakGpuBytesEstimate: max('gpuBytesEstimate'),
      heapAvailable: samples.some(s => s.heapBytes !== null),
      samples
    };
  }
}
