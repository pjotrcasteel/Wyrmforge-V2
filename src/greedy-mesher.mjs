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
    if (typeof id !== 'string' || !/^-?(0|[1-9]\\d*),-?(0|[1-9]\\d*),-?(0|[1-9]\\d*)$/.test(id)) {
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

    for (const face of FACES) {
      const primaryAxis = axisOf(face.n);
      const stepU = face.corners[1].map((n,i) => n - face.corners[0][i]);
      const stepV = face.corners[3].map((n,i) => n - face.corners[0][i]);
      const axisU = axisOf(stepU), axisV = axisOf(stepV);
      const faceNeighbor = neighbors.get(key(cx+face.n[0],cy+face.n[1],cz+face.n[2]))?.data;
      const mask = new Uint8Array(edge * edge);

      for (let slice = 0; slice < edge; slice++) {
        mask.fill(0);
        for (let v = 0; v < edge; v++) {
          for (let u = 0; u < edge; u++) {
            const coords = [0,0,0];
            coords[primaryAxis] = slice;
            coords[axisU] = u;
            coords[axisV] = v;
            const material = chunk.data[offset(...coords, edge)];
            if (!material) continue;
            const adj = coords.slice();
            adj[primaryAxis] += face.n[primaryAxis];
            let other = 0;
            if (adj[primaryAxis] >= 0 && adj[primaryAxis] < edge) {
              other = chunk.data[offset(...adj, edge)];
            } else if (faceNeighbor) {
              adj[primaryAxis] = (adj[primaryAxis] + edge) % edge;
              other = faceNeighbor[offset(...adj, edge)];
            }
            if (!other) mask[u + edge*v] = material;
          }
        }

        // Greedy rectangle merging never crosses a material or normal boundary.
        for (let v = 0; v < edge; v++) {
          for (let u = 0; u < edge; u++) {
            const material = mask[u + edge*v];
            if (!material) continue;
            let width = 1;
            while (u+width < edge && mask[u+width + edge*v] === material) width++;
            let height = 1;
            heightLoop: while (v+height < edge) {
              for (let dx = 0; dx < width; dx++) {
                if (mask[u+dx + edge*(v+height)] !== material) break heightLoop;
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
