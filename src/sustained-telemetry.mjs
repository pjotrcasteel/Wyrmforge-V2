// V2.4: bounded, one-sample-per-second sustained device telemetry.
// Estimated GPU bytes are not driver allocations; JS heap is optional.
export class SustainedTelemetry {
  #samples = [];
  #start = null;
  #last = null;
  constructor({ intervalMs = 1000, capacity = 900 } = {}) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 ||
        !Number.isInteger(capacity) || capacity < 1 || capacity > 3600) {
      throw new RangeError('Invalid sustained telemetry limits');
    }
    this.intervalMs = intervalMs;
    this.capacity = capacity;
  }
  due(now) { return Number.isFinite(now) && (this.#last === null || now - this.#last >= this.intervalMs); }
  record(now, { frames, queue, renderer, voxelBytes, edits, pendingTerrainChunks,
    heapBytes = null }) {
    if (!Number.isFinite(now)) return false;
    if (this.#start === null) this.#start = now;
    if (this.#last !== null && now - this.#last < this.intervalMs) return false;
    this.#last = now;
    const sample = {
      elapsedSeconds: Math.round((now - this.#start) / 1000),
      p95Ms: frames.p95, p99Ms: frames.p99,
      hitchesOver50Ms: frames.hitchesOver50Ms,
      pendingChunks: queue?.pendingChunks ?? null,
      pendingBytes: queue?.pendingBytes ?? null,
      recoveryChunks: queue?.recoveryChunks ?? null,
      pendingTerrainChunks, gpuBytesEstimate: renderer?.gpuBufferBytesEstimate ?? null,
      voxelBytes, edits, heapBytes
    };
    if (this.#samples.length === this.capacity) this.#samples.shift();
    this.#samples.push(sample);
    return true;
  }
  reset() { this.#samples = []; this.#start = null; this.#last = null; }
  report() {
    const samples = this.#samples.map(s => ({...s}));
    const max = key => samples.reduce((m,s) => s[key] === null ? m : Math.max(m,s[key]), 0);
    return {
      schema: 'voxel-v2.sustained-telemetry.v1',
      intervalMs: this.intervalMs, capacity: this.capacity,
      sampleCount: samples.length,
      elapsedSeconds: samples.at(-1)?.elapsedSeconds ?? 0,
      peakPendingBytes: max('pendingBytes'),
      peakPendingChunks: max('pendingChunks'),
      peakGpuBytesEstimate: max('gpuBytesEstimate'),
      heapAvailable: samples.some(s => s.heapBytes !== null),
      samples
    };
  }
}
