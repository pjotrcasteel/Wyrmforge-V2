// V2-only reusable browser worker controller. No voxel authority or WebGL state.
// One worker, one job in flight, no backlog. A canceled worker cannot publish results.
const SCHEMA = 'voxel-v2.terrain-mesh-job.v1';
// RAF-driven deadlines: no timers, parallel worker jobs or unbounded retries.
export const WORKER_WARMUP_TIMEOUT_MS = 15_000;
export const WORKER_JOB_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

export class TerrainWorkerSession {
  #createWorker;
  #now;
  #onWarm;
  #onResult;
  #onFailure;
  #worker = null;
  #generation = 0;
  #startedAt = 0;
  #ready = false;
  #warmupMs = null;
  #pending = null;
  #active = null;
  #pausedAt = null;
  #warmupTimeoutMs;
  #jobTimeoutMs;

  constructor({ createWorker, now, onWarm = () => {},
                onResult = () => {}, onFailure = () => {},
                warmupTimeoutMs = WORKER_WARMUP_TIMEOUT_MS,
                jobTimeoutMs = WORKER_JOB_TIMEOUT_MS }) {
    if (typeof createWorker !== 'function' || typeof now !== 'function') {
      throw new TypeError('Worker factory and clock are required');
    }
    if (![warmupTimeoutMs, jobTimeoutMs].every(value =>
      Number.isSafeInteger(value) && value >= 100 && value <= MAX_TIMEOUT_MS)) {
      throw new RangeError('Invalid V2 worker watchdog deadline');
    }
    this.#warmupTimeoutMs = warmupTimeoutMs;
    this.#jobTimeoutMs = jobTimeoutMs;
    this.#createWorker = createWorker;
    this.#now = now;
    this.#onWarm = onWarm;
    this.#onResult = onResult;
    this.#onFailure = onFailure;
  }

  get ready() { return this.#ready; }
  get busy() { return this.#pending !== null || this.#active !== null; }
  get warmupMs() { return this.#warmupMs; }

  // Backgrounded mobile tabs suspend RAF and worker execution unpredictably.
  // Ignore that elapsed wall time instead of reporting a false worker hang.
  setPaused(paused) {
    if (typeof paused !== 'boolean') throw new TypeError('Expected pause flag');
    if (paused) {
      if (this.#pausedAt === null) this.#pausedAt = this.#now();
      return;
    }
    if (this.#pausedAt === null) return;
    const delta = Math.max(0, this.#now() - this.#pausedAt);
    this.#startedAt += delta;
    if (this.#pending) this.#pending.submittedAt += delta;
    if (this.#active) {
      this.#active.submittedAt += delta;
      this.#active.dispatchedAt += delta;
    }
    this.#pausedAt = null;
  }

  // Called by the host animation frame. A hung warmup or job must release
  // the single-in-flight queue and report the failed job just like a worker error.
  pollTimeout() {
    if (!this.#worker || this.#pausedAt !== null) return false;
    const now = this.#now();
    if (!Number.isFinite(now)) throw new TypeError('Invalid worker watchdog clock');
    if (!this.#ready && now - this.#startedAt >= this.#warmupTimeoutMs) {
      this.#fail('Terrain worker warmup timed out');
      return true;
    }
    if (this.#active && now - this.#active.dispatchedAt >= this.#jobTimeoutMs) {
      this.#fail('Terrain worker mesh job timed out');
      return true;
    }
    return false;
  }

  start() {
    if (this.#worker) return;
    const worker = this.#createWorker();
    if (!worker || typeof worker.addEventListener !== 'function' ||
        typeof worker.postMessage !== 'function' ||
        typeof worker.terminate !== 'function') {
      throw new TypeError('Expected a browser Worker instance');
    }
    const generation = ++this.#generation;
    this.#worker = worker;
    this.#ready = false;
    this.#warmupMs = null;
    this.#startedAt = this.#now();
    if (this.#pausedAt !== null) this.#pausedAt = this.#startedAt;
    worker.addEventListener('message', event => {
      if (this.#worker !== worker) return;
      this.#handleMessage(event.data, generation);
    });
    worker.addEventListener('error', event => {
      if (this.#worker !== worker) return;
      event.preventDefault?.();
      this.#fail(event.message || 'Terrain worker runtime error');
    });
    worker.addEventListener('messageerror', event => {
      if (this.#worker !== worker) return;
      event.preventDefault?.();
      this.#fail('Terrain worker message could not be deserialized');
    });
    try {
      worker.postMessage({ schema: SCHEMA, type: 'warmup', id: generation });
    } catch (error) {
      this.#discardWorker();
      throw error;
    }
  }

  submit(job) {
    if (!job || job.schema !== SCHEMA || job.type !== 'build' ||
        !Number.isSafeInteger(job.id) || job.id < 1) {
      throw new TypeError('Invalid terrain worker job');
    }
    if (this.busy) throw new Error('Terrain worker already has a job');
    this.start();
    this.#pending = {
      job,
      submittedAt: this.#now(),
      wasWarmAtSubmission: this.#ready
    };
    if (this.#ready) this.#dispatch();
  }

  // Keep an already-idle warm worker on reset. A pending/running job must be
  // terminated so a late result can never mutate the new world.
  cancel() {
    if (!this.busy) return false;
    this.#discardWorker();
    return true;
  }

  close() { this.#discardWorker(); }

  #discardWorker() {
    const old = this.#worker;
    this.#worker = null;
    this.#ready = false;
    this.#pending = null;
    this.#active = null;
    if (old) old.terminate();
  }

  #dispatch() {
    const pending = this.#pending;
    if (!pending || !this.#ready || !this.#worker) return;
    this.#pending = null;
    this.#active = { ...pending, dispatchedAt: this.#now() };
    try {
      const transfer = pending.job.snapshots.map(chunk => chunk.data.buffer);
      this.#worker.postMessage(pending.job, transfer);
    } catch (error) {
      this.#fail(error.message);
    }
  }

  #handleMessage(message, generation) {
    // An invalid response for the active job must fail rather than deadlock the
    // single-in-flight session. Unrelated messages remain safely ignored.
    if (message?.schema !== SCHEMA) {
      if (this.#active && message?.id === this.#active.job.id) {
        this.#fail('Invalid terrain worker response schema');
      }
      return;
    }
    if (message.type === 'warm' && message.id === generation && !this.#ready) {
      this.#ready = true;
      this.#warmupMs = this.#now() - this.#startedAt;
      this.#onWarm(this.#warmupMs);
      this.#dispatch();
      return;
    }
    const active = this.#active;
    if (!active || message.id !== active.job.id) return; // Stale or unrelated job.
    if (message.type === 'error') {
      this.#fail(message.message || 'Terrain worker returned an error');
      return;
    }
    if (message.type !== 'ready') {
      this.#fail('Unexpected terrain worker response');
      return;
    }
    this.#active = null;
    const completedAt = this.#now();
    this.#onResult(message, active.job, {
      wasWarmAtSubmission: active.wasWarmAtSubmission,
      warmupMs: this.#warmupMs,
      waitForReadyMs: active.dispatchedAt - active.submittedAt,
      workerRoundTripMs: completedAt - active.dispatchedAt,
      endToEndMs: completedAt - active.submittedAt
    });
  }

  #fail(message) {
    const job = this.#active?.job ?? this.#pending?.job ?? null;
    this.#discardWorker();
    this.#onFailure(message, job);
  }
}
