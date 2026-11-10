// Independent V2 synchronous edit-footprint tracking.
// A changed solid can affect its own mesh and only the six face-neighbors at chunk seams.
export function markDirtyForEditedVoxel(dirtyChunks, chunkEdge, x, y, z) {
  if (!(dirtyChunks instanceof Set)) throw new TypeError('Expected a dirty-chunk Set');
  if (![16, 32].includes(chunkEdge)) throw new RangeError('Unsupported V2 chunk edge');
  if (![x, y, z].every(Number.isSafeInteger)) {
    throw new TypeError('Voxel position must contain safe integer coordinates');
  }

  const coords = [x, y, z];
  const chunks = coords.map(position => Math.floor(position / chunkEdge));
  const locals = coords.map(position => ((position % chunkEdge) + chunkEdge) % chunkEdge);
  const put = (cx, cy, cz) => dirtyChunks.add(`${cx},${cy},${cz}`);
  put(...chunks);

  for (let axis = 0; axis < 3; axis++) {
    for (const delta of locals[axis] === 0 ? [-1] : locals[axis] === chunkEdge - 1 ? [1] : []) {
      const neighbor = chunks.slice();
      neighbor[axis] += delta;
      put(...neighbor);
    }
  }
  return dirtyChunks;
}
