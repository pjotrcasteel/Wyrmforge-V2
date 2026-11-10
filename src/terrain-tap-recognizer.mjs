// V2-only tap recognizer layered over existing pan/pinch pointer controls.
// It never fires after a drag, a second finger, cancellation or long press.
export class TerrainTapRecognizer {
  #tap = null;

  begin(pointerId,x,y,now) {
    this.#validate(pointerId,x,y,now);
    if (this.#tap) {
      this.cancel(); // Pinch/multi-touch is not a terrain spell command.
      return;
    }
    this.#tap = { pointerId,x,y,startedAt:now,moved:false };
  }

  move(pointerId,x,y) {
    if (!this.#tap || this.#tap.pointerId !== pointerId) return;
    if (Math.hypot(x-this.#tap.x,y-this.#tap.y) > 9) {
      this.#tap.moved = true;
    }
  }

  end(pointerId,x,y,now) {
    this.#validate(pointerId,x,y,now);
    const candidate=this.#tap;
    if (!candidate || candidate.pointerId !== pointerId) return null;
    this.#tap = null;
    if (candidate.moved || Math.hypot(x-candidate.x,y-candidate.y) > 9 ||
        now-candidate.startedAt > 500 || now < candidate.startedAt) return null;
    return { x,y };
  }

  cancel() { this.#tap = null; }

  #validate(id,x,y,now) {
    if (!Number.isSafeInteger(id) || ![x,y,now].every(Number.isFinite)) {
      throw new TypeError('Expected a valid pointer ID, location and clock');
    }
  }
}
