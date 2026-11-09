// Renderer-independent, bounded frame-time telemetry for the V2 lab.
export class FrameMetrics {
  #samples;
  #size = 0;
  #cursor = 0;

  constructor(capacity = 1800) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('Frame sample capacity must be a positive safe integer');
    }
    this.#samples = new Float64Array(capacity);
  }

  record(durationMs) {
    // Exclude invalid intervals and browser tab-suspension gaps.
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs >= 1000) return false;
    this.#samples[this.#cursor] = durationMs;
    this.#cursor = (this.#cursor + 1) % this.#samples.length;
    this.#size = Math.min(this.#size + 1, this.#samples.length);
    return true;
  }

  reset() {
    this.#size = 0;
    this.#cursor = 0;
  }

  summary() {
    const samples = [...this.#samples.subarray(0, this.#size)].sort((a, b) => a - b);
    const percentile = q => samples.length ? samples[Math.ceil(q * samples.length) - 1] : null;
    return {
      count: samples.length,
      capacity: this.#samples.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      hitchesOver33Ms: samples.filter(ms => ms > 33).length,
      hitchesOver50Ms: samples.filter(ms => ms > 50).length,
      hitchesOver100Ms: samples.filter(ms => ms > 100).length
    };
  }
}
