// Voxel V2: disposable CPU geometry derived from immutable authoritative snapshots.
// This is an exposed-face baseline, not greedy meshing, a GPU renderer or collision truth.
const FACE_DEFINITIONS = Object.freeze([
  { name: '+x', normal: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { name: '-x', normal: [-1, 0, 0], corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { name: '+y', normal: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { name: '-y', normal: [0, -1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { name: '+z', normal: [0, 0, 1], corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { name: '-z', normal: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }
]);

const chunkKey = (x, y, z) => [x, y, z].join(',');
const index = (x, y, z, edge) => x + edge * (z + edge * y);

export function buildExposedFaceMeshes(world, { maxFacesPerChunk = 100000, chunkIds = null } = {}) {
  if (!world || ![16, 32].includes(world.chunkEdge) || typeof world.snapshots !== 'function') {
    throw new TypeError('Expected an independent V2 voxel world');
  }
  if (!Number.isSafeInteger(maxFacesPerChunk) || maxFacesPerChunk < 1 || maxFacesPerChunk > 150000) {
    throw new RangeError('maxFacesPerChunk must be an integer from 1 to 150000');
  }

  const edge = world.chunkEdge;
  let snapshots;
  let byId;
  if (chunkIds === null) {
    snapshots = world.snapshots();
    byId = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
  } else {
    if ((!Array.isArray(chunkIds) && !(chunkIds instanceof Set)) ||
        typeof world.chunkSnapshot !== 'function') {
      throw new TypeError('Expected chunk IDs and per-chunk snapshot support');
    }
    const uniqueIds = [...new Set(chunkIds)];
    if (uniqueIds.length > 128) throw new RangeError('One local mesh batch may include at most 128 chunks');
    const requested = uniqueIds.map(id => {
      if (typeof id !== 'string' || !/^-?(0|[1-9]\\d*),-?(0|[1-9]\\d*),-?(0|[1-9]\\d*)$/.test(id)) {
        throw new TypeError('Expected a canonical signed chunk ID');
      }
      const coords = id.split(',').map(Number);
      if (!coords.every(Number.isSafeInteger) || chunkKey(...coords) !== id) {
        throw new TypeError('Chunk ID coordinates must be safe canonical integers');
      }
      return coords;
    });
    byId = new Map();
    const snapshotOf = (coords) => {
      const id = chunkKey(...coords);
      if (!byId.has(id)) {
        const snap = world.chunkSnapshot(...coords);
        byId.set(id, snap);
      }
      return byId.get(id);
    };
    snapshots = [];
    for (const coords of requested) {
      const snap = snapshotOf(coords);
      if (snap) snapshots.push(snap);
      for (const face of FACE_DEFINITIONS) {
        snapshotOf(coords.map((value, i) => value + face.normal[i]));
      }
    }
  }
  const meshes = [];

  for (const snapshot of snapshots) {
    const coords = snapshot.id.split(',').map(Number);
    if (coords.length !== 3 || !coords.every(Number.isSafeInteger) ||
        !(snapshot.data instanceof Uint8Array) || snapshot.data.length !== edge ** 3) {
      throw new TypeError('Invalid V2 chunk snapshot');
    }
    const [cx, cy, cz] = coords;

    // Only the six immediate neighbors matter for cross-chunk face visibility.
    const neighborRevisions = {};
    for (const face of FACE_DEFINITIONS) {
      const [dx, dy, dz] = face.normal;
      neighborRevisions[face.name] = byId.get(chunkKey(cx + dx, cy + dy, cz + dz))?.revision ?? 0;
    }

    function materialAt(x, y, z) {
      let ncx = cx, ncy = cy, ncz = cz;
      if (x < 0) { ncx--; x += edge; }
      else if (x >= edge) { ncx++; x -= edge; }
      if (y < 0) { ncy--; y += edge; }
      else if (y >= edge) { ncy++; y -= edge; }
      if (z < 0) { ncz--; z += edge; }
      else if (z >= edge) { ncz++; z -= edge; }

      const data = ncx === cx && ncy === cy && ncz === cz
        ? snapshot.data
        : byId.get(chunkKey(ncx, ncy, ncz))?.data;
      return data ? data[index(x, y, z, edge)] : 0;
    }

    function visitFaces(visitor) {
      for (let y = 0; y < edge; y++) {
        for (let z = 0; z < edge; z++) {
          for (let x = 0; x < edge; x++) {
            const material = snapshot.data[index(x, y, z, edge)];
            if (material === 0) continue;
            for (const face of FACE_DEFINITIONS) {
              const [nx, ny, nz] = face.normal;
              if (materialAt(x + nx, y + ny, z + nz) === 0) {
                visitor(x, y, z, material, face);
              }
            }
          }
        }
      }
    }

    const faceCounts = { '+x': 0, '-x': 0, '+y': 0, '-y': 0, '+z': 0, '-z': 0 };
    let faceCount = 0;
    visitFaces((_x, _y, _z, _material, face) => {
      faceCounts[face.name]++;
      if (++faceCount > maxFacesPerChunk) {
        throw new RangeError('Chunk face budget exceeded');
      }
    });

    // Chunk-local coordinates preserve precision; origin is applied by the renderer.
    const positions = new Float32Array(faceCount * 4 * 3);
    const normals = new Int8Array(faceCount * 4 * 3);
    const materials = new Uint8Array(faceCount * 4);
    const indices = new Uint32Array(faceCount * 6);
    let vertex = 0, positionOffset = 0, normalOffset = 0, materialOffset = 0, indexOffset = 0;

    visitFaces((x, y, z, material, face) => {
      for (const corner of face.corners) {
        positions[positionOffset++] = x + corner[0];
        positions[positionOffset++] = y + corner[1];
        positions[positionOffset++] = z + corner[2];
        normals[normalOffset++] = face.normal[0];
        normals[normalOffset++] = face.normal[1];
        normals[normalOffset++] = face.normal[2];
        materials[materialOffset++] = material;
      }
      indices[indexOffset++] = vertex;
      indices[indexOffset++] = vertex + 1;
      indices[indexOffset++] = vertex + 2;
      indices[indexOffset++] = vertex;
      indices[indexOffset++] = vertex + 2;
      indices[indexOffset++] = vertex + 3;
      vertex += 4;
    });

    meshes.push({
      id: snapshot.id,
      revision: snapshot.revision,
      origin: [cx * edge, cy * edge, cz * edge],
      neighborRevisions,
      faceCounts,
      faceCount,
      triangleCount: faceCount * 2,
      vertexCount: faceCount * 4,
      positions,
      normals,
      materials,
      indices,
      cpuBufferBytes: positions.byteLength + normals.byteLength + materials.byteLength + indices.byteLength
    });
  }
  return meshes;
}
