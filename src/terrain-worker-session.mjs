// V2-only reusable browser worker controller. No voxel authority or WebGL state.
// One worker, one job in flight, no backlog. A canceled worker cannot publish results.
const SCHEMA = 'voxel-v2.terrain-mesh-job.v1';

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

  constructor({ createWorker, now, onWarm = () => {},
                onResult = () => {}, onFailure = () => {} }) {
    if (typeof createWorker !== 'function' || typeof now !== 'function') {
      throw new TypeError('Worker factory and clock are required');
    }
    this.#createWorker = createWorker;
    this.#now = now;
    this.#onWarm = onWarm;
    this.#onResult = onResult;
    this.#onFailure = onFailure;
  }

  get ready() { return this.#ready; }
  get busy() { return this.#pending !== null || this.#active !== null; }
  get warmupMs() { return this.#warmupMs; }

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
    if (message?.schema !== SCHEMA) return;
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
