// Renderer-independent, bounded frame-time telemetry for the V2 lab.
export class FrameMetrics {
  #samples;
  #size = 0;
  #cursor = 0;
  #sessionFrameCount = 0;
  #sessionHitchesOver33Ms = 0;
  #sessionHitchesOver50Ms = 0;
  #sessionHitchesOver100Ms = 0;
  #sessionLongGapCount = 0;
  #sessionLongestGapMs = 0;
  #sessionTotalLongGapMs = 0;
  #sessionMaxFrameIntervalMs = 0;

  constructor(capacity = 1800) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('Frame sample capacity must be a positive safe integer');
    }
    this.#samples = new Float64Array(capacity);
  }

  record(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
    // Long requestAnimationFrame intervals are excluded from rolling
    // percentiles but retained as full-session continuity evidence.
    // A long gap is NOT proof that the GPU stalled; page/OS scheduling
    // can produce identical symptoms.
    if (durationMs >= 1000) {
      this.#sessionLongGapCount++;
      this.#sessionLongestGapMs = Math.max(this.#sessionLongestGapMs, durationMs);
      this.#sessionTotalLongGapMs += durationMs;
      return false;
    }
    this.#sessionFrameCount++;
    this.#sessionMaxFrameIntervalMs = Math.max(this.#sessionMaxFrameIntervalMs, durationMs);
    if (durationMs > 33) this.#sessionHitchesOver33Ms++;
    if (durationMs > 50) this.#sessionHitchesOver50Ms++;
    if (durationMs > 100) this.#sessionHitchesOver100Ms++;
    this.#samples[this.#cursor] = durationMs;
    this.#cursor = (this.#cursor + 1) % this.#samples.length;
    this.#size = Math.min(this.#size + 1, this.#samples.length);
    return true;
  }

  reset() {
    this.#size = 0;
    this.#cursor = 0;
    this.#sessionFrameCount = 0;
    this.#sessionHitchesOver33Ms = 0;
    this.#sessionHitchesOver50Ms = 0;
    this.#sessionHitchesOver100Ms = 0;
    this.#sessionLongGapCount = 0;
    this.#sessionLongestGapMs = 0;
    this.#sessionTotalLongGapMs = 0;
    this.#sessionMaxFrameIntervalMs = 0;
  }

  /** Counts every observed frame since reset, not just the rolling 1800. */
  sessionSummary() {
    return Object.freeze({
      validFrameCount: this.#sessionFrameCount,
      hitchesOver33Ms: this.#sessionHitchesOver33Ms,
      hitchesOver50Ms: this.#sessionHitchesOver50Ms,
      hitchesOver100Ms: this.#sessionHitchesOver100Ms,
      maxMeasuredFrameIntervalMs: this.#sessionFrameCount ? this.#sessionMaxFrameIntervalMs : null,
      longAnimationFrameGaps: this.#sessionLongGapCount,
      longestAnimationFrameGapMs: this.#sessionLongGapCount ? this.#sessionLongestGapMs : null,
      totalLongAnimationFrameGapMs: this.#sessionTotalLongGapMs,
      note: 'Gaps >=1000ms excluded from rolling percentiles; browser scheduling cause unknown'
    });
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
