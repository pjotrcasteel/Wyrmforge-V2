// Clean-room V2 input model: pointer IDs and CSS-pixel coordinates only.
// The browser adapter owns capture, the camera and all rendering decisions.
export class PointerGestures {
  #points = new Map();

  get activeCount() { return this.#points.size; }

  begin(id, x, y) {
    validatePoint(id, x, y);
    // Ignore duplicate or extra fingers; never change the baseline accidentally.
    if (this.#points.has(id) || this.#points.size >= 2) return false;
    this.#points.set(id, { x, y });
    return true;
  }

  move(id, x, y) {
    validatePoint(id, x, y);
    const previous = this.#points.get(id);
    if (!previous) return null;

    if (this.#points.size === 1) {
      this.#points.set(id, { x, y });
      return { panX: x - previous.x, panY: y - previous.y,
        zoomRatio: 1, centerX: x, centerY: y };
    }

    const before = [...this.#points.values()];
    const originalCenter = midpoint(before[0], before[1]);
    const originalDistance = distance(before[0], before[1]);
    this.#points.set(id, { x, y });
    const after = [...this.#points.values()];
    const center = midpoint(after[0], after[1]);
    const newDistance = distance(after[0], after[1]);

    return {
      panX: center.x - originalCenter.x,
      panY: center.y - originalCenter.y,
      zoomRatio: originalDistance > 0 ? newDistance / originalDistance : 1,
      centerX: center.x,
      centerY: center.y
    };
  }

  end(id) { return this.#points.delete(id); }
  reset() { this.#points.clear(); }
}

function validatePoint(id, x, y) {
  if (!Number.isSafeInteger(id) || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('Expected a valid pointer ID and finite CSS coordinates');
  }
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
