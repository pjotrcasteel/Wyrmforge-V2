// V2.6: a host-owned generation counter for independent terrain worlds.
// A world can have identical voxel and edit revisions after a reset/replay;
// distinct epochs let downstream consumers discard notifications from old worlds.
// Scope is the lifetime of one host, not a globally unique or persisted ID.
export class V2TerrainEpochClock {
  #value;

  constructor(initialEpoch=0) {
    if(!Number.isSafeInteger(initialEpoch) || initialEpoch<0 ||
        initialEpoch>=Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Invalid initial V2 terrain epoch');
    }
    this.#value=initialEpoch;
  }

  get current() { return this.#value; }

  next() {
    if(this.#value===Number.MAX_SAFE_INTEGER) {
      throw new RangeError('V2 terrain epoch exhausted');
    }
    this.#value++;
    return this.#value;
  }
}
