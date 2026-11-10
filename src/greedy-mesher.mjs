// Clean-room V2 comparison implementation: greedy quads by material and face normal.
// CPU-only experiment. The production WebGL2 renderer remains on exposed faces until
// physical mobile measurements, fractured-terrain tests and atlas UV rules are accepted.
const FACES = [
  { name: '+x', n: [1,0,0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { name: '-x', n: [-1,0,0], corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { name: '+y', n: [0,1,0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { name: '-y', n: [0,-1,0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { name: '+z', n: [0,0,1], corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { name: '-z', n: [0,0,-1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }
];

const key = (x,y,z) => `${x},${y},${z}`;
const offset = (x,y,z,edge) => x + edge * (z + edge * y);
const axisOf = vector => vector.findIndex(value => value !== 0);

// Compute a chunk's occupied axis-aligned bounds once rather than visiting all
// 16³/32³ cells for every face direction. Neighbor culling still uses the original
// authoritative snapshots; clipping the mask never changes actual visible faces.
function occupiedBounds(data, edge) {
  const min = [edge, edge, edge];
  const max = [-1, -1, -1];
  for (let y = 0; y < edge; y++) {
    for (let z = 0; z < edge; z++) {
      const start = edge * (z + edge * y);
      for (let x = 0; x < edge; x++) {
        if (!data[start + x]) continue;
        if (x < min[0]) min[0] = x;
        if (y < min[1]) min[1] = y;
        if (z < min[2]) min[2] = z;
        if (x > max[0]) max[0] = x;
        if (y > max[1]) max[1] = y;
        if (z > max[2]) max[2] = z;
      }
    }
  }
  return { min, max };
}

function snapshotSelection(world, chunkIds) {
  if (chunkIds === null) {
    const chunks = world.snapshots();
    return { chunks, neighbors: new Map(chunks.map(chunk => [chunk.id, chunk])) };
  }
  if ((!Array.isArray(chunkIds) && !(chunkIds instanceof Set)) ||
      typeof world.chunkSnapshot !== 'function') {
    throw new TypeError('Scoped meshing requires chunk IDs and chunkSnapshot');
  }
  const ids = [...new Set(chunkIds)];
  if (ids.length > 128) throw new RangeError('Scoped mesh batch exceeds 128 chunks');
  const neighbors = new Map();
  const read = (x,y,z) => {
    const id = key(x,y,z);
    if (!neighbors.has(id)) neighbors.set(id, world.chunkSnapshot(x,y,z));
    return neighbors.get(id);
  };
  const chunks = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !/^-?(0|[1-9]\d*),-?(0|[1-9]\d*),-?(0|[1-9]\d*)$/.test(id)) {
      throw new TypeError('Invalid canonical chunk ID');
    }
    const coords = id.split(',').map(Number);
    if (!coords.every(Number.isSafeInteger) || key(...coords) !== id) {
      throw new TypeError('Invalid chunk coordinates');
    }
    const center = read(...coords);
    if (center) chunks.push(center);
    for (const face of FACES) {
      read(coords[0]+face.n[0], coords[1]+face.n[1], coords[2]+face.n[2]);
    }
  }
  return { chunks, neighbors };
}

export function buildGreedyFaceMeshes(world, { chunkIds = null, maxQuadsPerChunk = 100000 } = {}) {
  if (!world || ![16,32].includes(world.chunkEdge) || typeof world.snapshots !== 'function') {
    throw new TypeError('Expected an independent V2 voxel world');
  }
  if (!Number.isSafeInteger(maxQuadsPerChunk) ||
      maxQuadsPerChunk < 1 || maxQuadsPerChunk > 150000) {
    throw new RangeError('Invalid per-chunk quad budget');
  }
  const edge = world.chunkEdge;
  const { chunks, neighbors } = snapshotSelection(world, chunkIds);
  const results = [];

  for (const chunk of chunks) {
    if (!(chunk.data instanceof Uint8Array) || chunk.data.length !== edge ** 3) {
      throw new TypeError('Invalid authoritative chunk snapshot');
    }
    const [cx,cy,cz] = chunk.id.split(',').map(Number);
    const neighborRevisions = {};
    for (const face of FACES) {
      const n = face.n;
      neighborRevisions[face.name] =
        neighbors.get(key(cx+n[0],cy+n[1],cz+n[2]))?.revision ?? 0;
    }

    const faceCounts = Object.fromEntries(FACES.map(face => [face.name, 0]));
    const unitFaceCounts = Object.fromEntries(FACES.map(face => [face.name, 0]));
    const positions = [], normals = [], materials = [], indices = [];
    let quadCount = 0, coveredFaces = 0;

    // Reuse a single typed mask instead of allocating one for every normal.
    const mask = new Uint8Array(edge * edge);
    const strides = [1, edge * edge, edge];
    const { min, max } = occupiedBounds(chunk.data, edge);
    let faceCandidateCells = 0;

    for (const face of FACES) {
      const primaryAxis = axisOf(face.n);
      const stepU = face.corners[1].map((n,i) => n - face.corners[0][i]);
      const stepV = face.corners[3].map((n,i) => n - face.corners[0][i]);
      const axisU = axisOf(stepU), axisV = axisOf(stepV);
      const faceNeighbor = neighbors.get(key(cx+face.n[0],cy+face.n[1],cz+face.n[2]))?.data;
      const direction = face.n[primaryAxis];
      const stride = strides[primaryAxis];
      const uMin = min[axisU], uMax = max[axisU];
      const vMin = min[axisV], vMax = max[axisV];

      // Empty slices cannot emit exposed faces. Loop only occupied source
      // coordinates; the neighbor can cull faces, never create new source faces.
      for (let slice = min[primaryAxis]; slice <= max[primaryAxis]; slice++) {
        mask.fill(0);
        for (let v = vMin; v <= vMax; v++) {
          for (let u = uMin; u <= uMax; u++) {
            faceCandidateCells++;
            // Scalar indexing avoids allocating two coordinate arrays and
            // several spreads per inspected candidate voxel.
            const x = primaryAxis === 0 ? slice : axisU === 0 ? u : v;
            const y = primaryAxis === 1 ? slice : axisU === 1 ? u : v;
            const z = primaryAxis === 2 ? slice : axisU === 2 ? u : v;
            const cellIndex = x + edge * (z + edge * y);
            const material = chunk.data[cellIndex];
            if (!material) continue;

            const adjacentSlice = slice + direction;
            const neighborIndex = adjacentSlice >= 0 && adjacentSlice < edge
              ? cellIndex + direction * stride
              : cellIndex - direction * (edge - 1) * stride;
            const other = adjacentSlice >= 0 && adjacentSlice < edge
              ? chunk.data[neighborIndex]
              : faceNeighbor?.[neighborIndex] ?? 0;
            if (!other) mask[u + edge*v] = material;
          }
        }

        // Keep all material seams and face-normal boundaries. We deliberately
        // do not cross chunk edges; neighboring chunks are independent meshes.
        for (let v = vMin; v <= vMax; v++) {
          for (let u = uMin; u <= uMax; u++) {
            const material = mask[u + edge*v];
            if (!material) continue;
            let width = 1;
            while (u + width <= uMax && mask[u + width + edge*v] === material) width++;
            let height = 1;
            heightLoop: while (v + height <= vMax) {
              for (let dx = 0; dx < width; dx++) {
                if (mask[u + dx + edge*(v + height)] !== material) break heightLoop;
              }
              height++;
            }
            const cell = [0,0,0];
            cell[primaryAxis] = slice;
            cell[axisU] = u;
            cell[axisV] = v;
            const origin = cell.map((n,i) => n + face.corners[0][i]);
            const points = [
              origin,
              origin.map((n,i) => n + stepU[i]*width),
              origin.map((n,i) => n + stepU[i]*width + stepV[i]*height),
              origin.map((n,i) => n + stepV[i]*height)
            ];
            const base = quadCount * 4;
            for (const point of points) {
              positions.push(...point);
              normals.push(...face.n);
              materials.push(material);
            }
            indices.push(base,base+1,base+2,base,base+2,base+3);
            quadCount++;
            if (quadCount > maxQuadsPerChunk) throw new RangeError('Greedy quad budget exceeded');
            const unitCount = width * height;
            coveredFaces += unitCount;
            faceCounts[face.name]++;
            unitFaceCounts[face.name] += unitCount;
            for (let dv = 0; dv < height; dv++) {
              for (let du = 0; du < width; du++) mask[u+du + edge*(v+dv)] = 0;
            }
          }
        }
      }
    }

    const packedPositions = new Float32Array(positions);
    const packedNormals = new Int8Array(normals);
    const packedMaterials = new Uint8Array(materials);
    const packedIndices = new Uint32Array(indices);
    results.push({
      id: chunk.id,
      revision: chunk.revision,
      origin: [cx*edge,cy*edge,cz*edge],
      neighborRevisions,
      faceCounts, unitFaceCounts,
      faceCount: quadCount,
      unitFaceCount: coveredFaces,
      faceCandidateCells,
      triangleCount: quadCount*2,
      vertexCount: quadCount*4,
      positions: packedPositions,
      normals: packedNormals,
      materials: packedMaterials,
      indices: packedIndices,
      cpuBufferBytes: packedPositions.byteLength + packedNormals.byteLength +
        packedMaterials.byteLength + packedIndices.byteLength
    });
  }
  return results;
}
