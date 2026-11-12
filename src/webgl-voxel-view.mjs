// Ground-up V2 WebGL2 baseline. Two fixed V2-native 2.5D camera presets.
import { getCameraPreset } from './camera-presets.mjs';
import { terrainMaterialGlsl } from './terrain-materials.mjs';
import { compileTerrainTextureManifest } from './terrain-texture-manifest.mjs';
import { TERRAIN_SURFACE_LIBRARY } from './terrain-surface-library.mjs';
import { TerrainGpuTextureCache } from './terrain-gpu-texture-cache.mjs';
export { projectVoxel } from './camera-presets.mjs';

const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aMaterial;
uniform vec3 uOrigin;
uniform vec2 uViewport;
uniform vec2 uPan;
uniform float uScale;
uniform vec3 uCameraRight;
uniform vec3 uCameraDown;
uniform vec3 uCameraDepth;
out vec3 vNormal;
out vec3 vWorld;
flat out float vMaterial;

void main() {
  vec3 world = aPosition + uOrigin;
  vec2 pixel = vec2(dot(world, uCameraRight),
                    dot(world, uCameraDown)) * uScale
               + uViewport * 0.5 + uPan;
  float depth = dot(world, uCameraDepth);
  gl_Position = vec4(2.0 * pixel.x / uViewport.x - 1.0,
                     1.0 - 2.0 * pixel.y / uViewport.y,
                     depth, 1.0);
  vNormal = aNormal;
  vWorld = world;
  vMaterial = aMaterial;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
flat in float vMaterial;
uniform sampler2D uGrassTexture;
uniform highp sampler2DArray uTerrainAlbedo;
uniform highp sampler2DArray uTerrainNormal;
uniform highp sampler2DArray uTerrainOrm;
uniform vec4 uTerrainNormalLayers;
uniform vec4 uTerrainOrmLayers;
uniform vec4 uTerrainLayers;
uniform vec4 uTerrainSecondaryLayers;
uniform vec4 uTerrainSecondaryNormalLayers;
uniform vec4 uTerrainSecondaryOrmLayers;
uniform float uTerrainTilesPerVoxel;
uniform bool uGrassEnabled;
uniform float uGrassTexelsPerVoxel;
out vec4 outColor;

${terrainMaterialGlsl()}

// Low-frequency, world-anchored soil detail. This is a first procedural dirt
// material, not a final authored texture. No additional texture uploads.
float soilHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 soilAlbedo(vec3 world, vec3 normal) {
  // Use horizontal world coordinates on tops and world-height on walls.
  vec2 uv = abs(normal.y) > 0.5 ? world.xz
    : abs(normal.x) > 0.5 ? world.zy : world.xy;
  vec2 coarseCell = floor(uv * 5.0);
  vec2 fineCell = floor(uv * 17.0);
  float coarse = soilHash(coarseCell) - 0.5;
  float fine = soilHash(fineCell) - 0.5;
  vec3 base = terrainAlbedo(2.0);
  return clamp(base * (1.0 + coarse * 0.17 + fine * 0.075), 0.0, 1.0);
}

// Subtle, deterministic grass fallback until an authored grass PNG is supplied.
// Sampling world-space coordinates keeps the pattern fixed after excavation.
vec3 grassAlbedo(vec3 world) {
  vec2 coarseCell = floor(world.xz * 7.0);
  vec2 fineCell = floor(world.xz * 23.0);
  float coarse = soilHash(coarseCell + vec2(41.0, 17.0)) - 0.5;
  float fine = soilHash(fineCell + vec2(9.0, 63.0)) - 0.5;
  vec3 base = terrainAlbedo(1.0);
  return clamp(base * (1.0 + coarse * 0.10 + fine * 0.045), 0.0, 1.0);
}

void main() {
  vec3 albedo = terrainAlbedo(vMaterial);
  if (abs(vMaterial - 2.0) < 0.5) {
    albedo = soilAlbedo(vWorld, vNormal);
  }
  if (abs(vMaterial - 1.0) < 0.5) {
    if (vNormal.y > 0.5) {
      albedo = grassAlbedo(vWorld);
      if (uGrassEnabled) {
        // World-anchored mapping: edits and chunk boundaries cannot shift the texture.
        vec2 uv = vWorld.xz * (uGrassTexelsPerVoxel / 1024.0);
        albedo = texture(uGrassTexture, uv).rgb;
      }
    } else if (vNormal.y < 0.5) {
      // An exposed grass voxel side is soil, not a vertical grass photograph.
      // The narrow upper rim remains grass-colored and tracks each voxel top.
      vec3 soil = soilAlbedo(vWorld, vNormal);
      float topRim = smoothstep(0.79, 0.94, fract(vWorld.y));
      albedo = mix(soil, albedo, topRim);
    }
  }
  // Surface-specific albedo layers; negative layer means procedural fallback.
  int surfaceIndex = abs(vMaterial - 1.0) < 0.5
    ? (vNormal.y > 0.5 ? 0 : 1)
    : (abs(vMaterial - 2.0) < 0.5 ? 2 : 3);
  vec2 materialUv = abs(vNormal.y) > 0.5 ? vWorld.xz
    : abs(vNormal.x) > 0.5 ? vWorld.zy : vWorld.xy;
  float layer = uTerrainLayers[surfaceIndex];
  float normalLayer = uTerrainNormalLayers[surfaceIndex];
  float ormLayer = uTerrainOrmLayers[surfaceIndex];
  float variantMix = 0.0;
  if (layer >= 0.0) {
    vec2 uv = materialUv;
    vec3 primary = texture(uTerrainAlbedo, vec3(uv * uTerrainTilesPerVoxel, layer)).rgb;
    float secondaryLayer = uTerrainSecondaryLayers[surfaceIndex];
    if (secondaryLayer >= 0.0) {
      // World-anchored 4-voxel cells: deterministic patches survive excavation
      // and remeshing. Neighboring cells blend without hard checkerboard edges.
      vec2 cell = uv / 4.0;
      vec2 grid = floor(cell);
      vec2 blend = smoothstep(vec2(0.15), vec2(0.85), fract(cell));
      vec2 h0 = vec2(dot(grid, vec2(127.1, 311.7)), dot(grid, vec2(269.5, 183.3)));
      vec2 h1 = h0 + vec2(127.1, 269.5);
      vec2 h2 = h0 + vec2(311.7, 183.3);
      vec2 h3 = h0 + vec2(438.8, 452.8);
      float threshold = surfaceIndex == 0 ? 0.25 : 0.20;
      float a = step(1.0 - threshold, fract(sin(h0.x + h0.y) * 43758.5453));
      float b = step(1.0 - threshold, fract(sin(h1.x + h1.y) * 43758.5453));
      float c = step(1.0 - threshold, fract(sin(h2.x + h2.y) * 43758.5453));
      float d = step(1.0 - threshold, fract(sin(h3.x + h3.y) * 43758.5453));
      float mixAmount = mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
      vec3 secondary = texture(uTerrainAlbedo,
        vec3(uv * uTerrainTilesPerVoxel, secondaryLayer)).rgb;
      albedo = mix(primary, secondary, mixAmount);
      variantMix = mixAmount;
    } else {
      albedo = primary;
    }
  }
  float lighting = vNormal.y > 0.5 ? 1.0
    : vNormal.y < -0.5 ? 0.43
    : vNormal.x > 0.5 ? 0.74
    : vNormal.z > 0.5 ? 0.62
    : vNormal.x < -0.5 ? 0.55 : 0.50;
  // Voxel-local material response: fixed, inexpensive directional illumination.
  // This is not Lighting Engine V2 and introduces no dynamic lights or shadows.
  if (layer >= 0.0 && normalLayer >= 0.0) {
    vec3 tangentNormal = texture(uTerrainNormal,
      vec3(materialUv * uTerrainTilesPerVoxel, normalLayer)).xyz * 2.0 - 1.0;
    float secondaryNormal = uTerrainSecondaryNormalLayers[surfaceIndex];
    if (variantMix > 0.0 && secondaryNormal >= 0.0) {
      vec3 nextNormal = texture(uTerrainNormal,
        vec3(materialUv * uTerrainTilesPerVoxel, secondaryNormal)).xyz * 2.0 - 1.0;
      tangentNormal = normalize(mix(tangentNormal, nextNormal, variantMix));
    }
    // Explicit face bases prevent top/wall normal maps from rotating incorrectly.
    vec3 n = normalize(vNormal);
    vec3 t = abs(n.y) > 0.5 ? vec3(1.0, 0.0, 0.0)
      : abs(n.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 b = normalize(cross(n, t));
    vec3 detailedNormal = normalize(t * tangentNormal.x + b * tangentNormal.y +
      n * max(0.2, tangentNormal.z));
    vec3 lightDirection = normalize(vec3(-0.4, 0.85, 0.3));
    float baseDiffuse = max(dot(n, lightDirection), 0.0);
    float detailedDiffuse = max(dot(detailedNormal, lightDirection), 0.0);
    lighting *= clamp(1.0 + (detailedDiffuse - baseDiffuse) * 0.4, 0.75, 1.25);
  }
  if (layer >= 0.0 && ormLayer >= 0.0) {
    vec3 orm = texture(uTerrainOrm,
      vec3(materialUv * uTerrainTilesPerVoxel, ormLayer)).rgb;
    float secondaryOrm = uTerrainSecondaryOrmLayers[surfaceIndex];
    if (variantMix > 0.0 && secondaryOrm >= 0.0) {
      vec3 nextOrm = texture(uTerrainOrm,
        vec3(materialUv * uTerrainTilesPerVoxel, secondaryOrm)).rgb;
      orm = mix(orm, nextOrm, variantMix);
    }
    // AO is local material micro-occlusion; roughness reduces broad highlights.
    // Metalness is reserved for a future physically based renderer.
    lighting *= mix(0.65, 1.0, orm.r);
    lighting *= mix(0.96, 1.0, orm.g);
  }
  outColor = vec4(albedo * lighting, 1.0);
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL2 shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error('WebGL2 shader compilation failed: ' + message);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL2 program allocation failed');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);
    throw new Error('WebGL2 shader program link failed: ' + message);
  }
  return program;
}

export class WebGLVoxelView {
  #gl;
  #grassImage = null;
  // Authored texture slots are native 64px art, not downscaled preview assets.
  #terrainManifest = compileTerrainTextureManifest(undefined,{tileSize:64});
  #terrainCache = null;
  #terrainTileImages = new Map();
  #pendingTerrainTiles = new Map();
  #terrainTileStagingBytes = 0;
  #terrainTileStagingMaxBytes = 32 * 1024 * 1024;
  #terrainTilesPerVoxel = 1;
  #grassTexture = null;
  #grassTexelsPerVoxel = 32;
  #contextLossExtension = null;
  #program = null;
  #uniforms = null;
  #gpuMeshes = new Map();
  #sourceMeshes = new Map();
  // Scene generation, independent of the terrain world's runtime epoch.
  // Async consumers must present the generation they captured before starting work.
  #sceneEpoch = 0;
  #staleUploadRejections = 0;
  #queuedUploads = new Map();
  #uploadQueuePeak = 0;
  #uploadQueueBytes = 0;
  #recoveryQueue = new Map();
  #recoveryBytes = 0;
  #sceneQueue = new Map();
  #sceneBytes = 0;
  #retiredGpuMeshes = [];
  #retiredGpuBytes = 0;
  #recovering = false;
  #lost = false;
  #losses = 0;
  #onAvailabilityChange;

  constructor(canvas, { onAvailabilityChange = () => {} } = {}) {
    this.#onAvailabilityChange = onAvailabilityChange;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: true, stencil: false, preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WebGL2 is unavailable on this device');
    this.#gl = gl;
    // WebGL extensions cannot reliably be queried while the context is lost.
    this.#contextLossExtension = gl.getExtension?.('WEBGL_lose_context') ?? null;
    this.#initialize();

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.#lost = true;
      this.#losses++;
      this.#program = null;
      this.#grassTexture = null;
      this.#terrainCache?.contextLost();
      this.#pendingTerrainTiles.clear();
      this.#gpuMeshes.clear();
      // Context loss destroys GPU handles; never replay obsolete retirement work.
      this.#retiredGpuMeshes.length = 0;
      this.#retiredGpuBytes = 0;
      this.#recoveryQueue.clear();
      this.#recoveryBytes = 0;
      this.#sceneQueue.clear();
      this.#sceneBytes = 0;
      this.#recovering = false;
      this.#onAvailabilityChange(false);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.#lost = false;
        this.#initialize();
        // Restore incrementally: a context restoration must not synchronously
        // re-upload the entire scene on the main thread.
        this.#recoveryQueue = new Map(this.#sourceMeshes);
        this.#recoveryBytes = [...this.#recoveryQueue.values()].reduce((sum, mesh) =>
          sum + this.#meshBytes(mesh), 0);
        this.#recovering = this.#recoveryQueue.size > 0;
        this.#onAvailabilityChange(true);
      } catch (error) {
        this.#lost = true;
        this.#onAvailabilityChange(false, error);
      }
    });
  }

  // Diagnostic only: browser-supported WEBGL_lose_context; no synthetic events.
  simulateContextTransition(action) {
    if (action !== 'lose' && action !== 'restore') {
      throw new RangeError('Invalid WebGL context transition');
    }
    const extension = this.#contextLossExtension;
    if (!extension) return false;
    if (action === 'lose' && this.ready) extension.loseContext();
    else if (action === 'restore' && this.#lost) extension.restoreContext();
    else return false;
    return true;
  }

  // Optional authored albedo tiles; unchanged terrain continues using procedural fallback.
  // Keys must exist in the material manifest. Images are retained for context recovery.
  setTerrainAlbedoTile(key, image) {
    return this.setTerrainMaterialTile('albedo', key, image);
  }

  setTerrainMaterialTile(channel, key, image) {
    const asset = this.#terrainManifest.assets.find(item => item.channel === channel && item.key === key);
    if (!asset) throw new RangeError('Unknown terrain material asset');
    if (!image || image.width !== this.#terrainManifest.tileSize ||
        image.height !== this.#terrainManifest.tileSize) {
      throw new RangeError('Terrain material tiles must match manifest dimensions');
    }
    const identity = channel + ':' + key;
    const previous = this.#terrainTileImages.get(identity);
    const bytes = image.width * image.height * 4;
    const nextBytes = this.#terrainTileStagingBytes - (previous?.bytes ?? 0) + bytes;
    if (nextBytes > this.#terrainTileStagingMaxBytes) {
      throw new RangeError('Terrain decoded tile staging budget exceeded');
    }
    // Last-write-wins queue. Retained images are the source of truth for
    // context recovery; the frame loop performs GPU uploads incrementally.
    this.#terrainTileImages.set(identity, { channel, key, image, bytes });
    this.#terrainTileStagingBytes = nextBytes;
    this.#pendingTerrainTiles.set(identity, { channel, key, image });
  }

  clearTerrainAlbedoTiles() {
    this.#terrainTileImages.clear();
    this.#pendingTerrainTiles.clear();
    this.#terrainTileStagingBytes = 0;
    this.#terrainCache?.dispose();
    this.#terrainCache = null;
  }

  get terrainTileStagingStatistics() {
    return Object.freeze({ retainedTiles: this.#terrainTileImages.size,
      estimatedDecodedBytes: this.#terrainTileStagingBytes,
      pendingTiles: this.#pendingTerrainTiles.size,
      maxBytes: this.#terrainTileStagingMaxBytes });
  }

  setTerrainTextureScale(tilesPerVoxel) {
    if (!Number.isFinite(tilesPerVoxel) || tilesPerVoxel <= 0 || tilesPerVoxel > 16) {
      throw new RangeError('Invalid terrain texture scale');
    }
    this.#terrainTilesPerVoxel = tilesPerVoxel;
  }

  setGrassMaterial(image, texelsPerVoxel = 32) {
    if (!image || image.width !== 1024 || image.height !== 1024) {
      throw new RangeError("Grass texture must be exactly 1024×1024");
    }
    if (![16, 32, 64, 128].includes(texelsPerVoxel)) {
      throw new RangeError("Unsupported grass texture density");
    }
    this.#grassImage = image;
    this.#grassTexelsPerVoxel = texelsPerVoxel;
    if (this.ready) this.#uploadGrassTexture();
  }

  setGrassDensity(value) {
    if (![16, 32, 64, 128].includes(value)) throw new RangeError("Unsupported grass density");
    this.#grassTexelsPerVoxel = value;
  }

  #uploadGrassTexture() {
    const gl = this.#gl;
    if (this.#grassTexture) gl.deleteTexture(this.#grassTexture);
    this.#grassTexture = null;
    if (!this.#grassImage || this.#lost || gl.isContextLost()) return;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Cannot allocate grass texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.#grassImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.#grassTexture = texture;
  }

  get ready() { return !this.#lost && this.#program !== null; }
  get pendingUploads() {
    return this.#queuedUploads.size + this.#sceneQueue.size + this.#recoveryQueue.size +
      this.#pendingTerrainTiles.size + this.#retiredGpuMeshes.length;
  }
  get recovering() { return this.#recovering; }
  get sceneEpoch() { return this.#sceneEpoch; }

  #acceptSceneEpoch(epoch) {
    // Legacy callers may omit the guard, but asynchronous consumers must use it.
    if (epoch === undefined) return true;
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      throw new RangeError('Invalid renderer scene epoch');
    }
    if (epoch === this.#sceneEpoch) return true;
    this.#staleUploadRejections++;
    return false;
  }

  #meshBytes(mesh) {
    return mesh.positions.byteLength + mesh.normals.byteLength +
      mesh.materials.byteLength + mesh.indices.byteLength;
  }
  get uploadQueueStatistics() {
    return { pendingChunks: this.#queuedUploads.size,
      pendingBytes: this.#uploadQueueBytes + this.#sceneBytes + this.#recoveryBytes,
      sceneChunks: this.#sceneQueue.size,
      recoveryChunks: this.#recoveryQueue.size,
      pendingGpuDisposals: this.#retiredGpuMeshes.length,
      retiredGpuBytesEstimate: this.#retiredGpuBytes,
      peakChunks: this.#uploadQueuePeak,
      sceneEpoch: this.#sceneEpoch,
      staleUploadRejections: this.#staleUploadRejections,
      pendingTextureTiles: this.#pendingTerrainTiles.size };
  }

  // V2.4: stage a bounded batch; caller invalidates it on new edits/reset.
  queueReplacementMeshes(dirtyIds, meshes, { sceneEpoch } = {}) {
    if (!this.#acceptSceneEpoch(sceneEpoch)) return false;
    const ids = new Set(dirtyIds);
    if (!ids.size || ids.size > 128 || !Array.isArray(meshes)) {
      throw new RangeError('Invalid bounded GPU replacement batch');
    }
    const replacements = new Map();
    for (const mesh of meshes) {
      if (!mesh || !ids.has(mesh.id) || replacements.has(mesh.id)) {
        throw new TypeError('Invalid queued replacement mesh');
      }
      replacements.set(mesh.id, mesh);
    }
    const newIds = [...ids].filter(id => !this.#queuedUploads.has(id));
    if (this.#queuedUploads.size + newIds.length > 128) {
      throw new RangeError('GPU upload queue capacity exceeded');
    }
    let nextBytes = this.#uploadQueueBytes;
    for (const id of ids) {
      const previous = this.#queuedUploads.get(id);
      if (previous) nextBytes -= this.#meshBytes(previous);
      const mesh = replacements.get(id);
      if (mesh) nextBytes += this.#meshBytes(mesh);
    }
    if (nextBytes > 16 * 1024 * 1024) {
      throw new RangeError('GPU upload queue byte capacity exceeded');
    }
    for (const id of ids) {
      this.#queuedUploads.set(id, replacements.get(id) ?? null);
    }
    this.#uploadQueueBytes = nextBytes;
    this.#uploadQueuePeak = Math.max(this.#uploadQueuePeak, this.#queuedUploads.size);
    return true;
  }

  cancelQueuedUploads() {
    this.#queuedUploads.clear();
    this.#uploadQueueBytes = 0;
  }

  // One chunk minimum per frame; WebGL bufferData itself is not preemptible.
  flushQueuedUploads({ budgetMs = 2, now = () => performance.now() } = {}) {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
      throw new RangeError('Invalid GPU upload frame budget');
    }
    if (!this.ready || !this.pendingUploads) return { chunks: 0, elapsedMs: 0 };
    const start = now();
    let chunks = 0;
    while (this.pendingUploads && (chunks === 0 || now() - start < budgetMs)) {
      // Free old scene buffers before allocating any new ones on rapid resets.
      // Each WebGL delete operation is synchronous; one retired mesh is the
      // smallest bounded disposal step we can schedule.
      if (this.#retiredGpuMeshes.length) {
        const record = this.#retiredGpuMeshes.at(-1);
        this.#disposeRecord(record);
        this.#retiredGpuMeshes.pop();
        this.#retiredGpuBytes -= record.bytes;
      } else if (this.#queuedUploads.size) {
        const [id, mesh] = this.#queuedUploads.entries().next().value;
        this.#queuedUploads.delete(id);
        this.#uploadQueueBytes -= mesh ? this.#meshBytes(mesh) : 0;
        this.replaceMeshes(new Set([id]), mesh ? [mesh] : []);
      } else if (this.#sceneQueue.size) {
        const [id, mesh] = this.#sceneQueue.entries().next().value;
        this.#sceneQueue.delete(id);
        this.#sceneBytes -= this.#meshBytes(mesh);
        // A reset or edit may supersede a pending scene mesh.
        if (this.#sourceMeshes.get(id) === mesh) this.#uploadOne(mesh);
      } else if (this.#recoveryQueue.size) {
        const [id, mesh] = this.#recoveryQueue.entries().next().value;
        this.#recoveryQueue.delete(id);
        this.#recoveryBytes -= this.#meshBytes(mesh);
        // Source mesh may have changed during recovery; never resurrect it.
        if (this.#sourceMeshes.get(id) === mesh) this.#uploadOne(mesh);
      } else {
        // Surface art is optional. Never allow decoded texture work to block
        // a newly activated world or its GPU recovery geometry.
        const [identity, tile] = this.#pendingTerrainTiles.entries().next().value;
        this.#ensureTerrainCache();
        this.#terrainCache.upload(tile.channel, tile.key, tile.image);
        this.#pendingTerrainTiles.delete(identity);
      }
      chunks++;
    }
    if (!this.#recoveryQueue.size) this.#recovering = false;
    return { chunks, elapsedMs: now() - start };
  }
  get statistics() {
    let triangles = 0, gpuBytes = 0;
    for (const record of this.#gpuMeshes.values()) {
      triangles += record.triangles;
      gpuBytes += record.bytes;
    }
    return {
      renderer: 'WebGL2 exposed-face V2 baseline',
      triangles,
      drawCalls: this.#gpuMeshes.size,
      gpuBufferBytesEstimate: gpuBytes + this.#retiredGpuBytes,
      retiredGpuBytesEstimate: this.#retiredGpuBytes,
      terrainGpuTextureBytesEstimate: this.#terrainCache?.statistics.allocatedBytes ?? 0,
      terrainDecodedTileBytesEstimate: this.#terrainTileStagingBytes,
      contextLosses: this.#losses,
      ...this.uploadQueueStatistics,
      gpuTimingMs: null
    };
  }

  #initialize() {
    const gl = this.#gl;
    this.#program = createProgram(gl);
    this.#uniforms = {
      origin: gl.getUniformLocation(this.#program, 'uOrigin'),
      viewport: gl.getUniformLocation(this.#program, 'uViewport'),
      pan: gl.getUniformLocation(this.#program, 'uPan'),
      scale: gl.getUniformLocation(this.#program, 'uScale'),
      cameraRight: gl.getUniformLocation(this.#program, 'uCameraRight'),
      cameraDown: gl.getUniformLocation(this.#program, 'uCameraDown'),
      cameraDepth: gl.getUniformLocation(this.#program, 'uCameraDepth'),
      grassTexture: gl.getUniformLocation(this.#program, 'uGrassTexture'),
      grassEnabled: gl.getUniformLocation(this.#program, 'uGrassEnabled'),
      grassDensity: gl.getUniformLocation(this.#program, 'uGrassTexelsPerVoxel'),
      terrainAlbedo: gl.getUniformLocation(this.#program, 'uTerrainAlbedo'),
      terrainNormal: gl.getUniformLocation(this.#program, 'uTerrainNormal'),
      terrainOrm: gl.getUniformLocation(this.#program, 'uTerrainOrm'),
      terrainNormalLayers: gl.getUniformLocation(this.#program, 'uTerrainNormalLayers'),
      terrainOrmLayers: gl.getUniformLocation(this.#program, 'uTerrainOrmLayers'),
      terrainLayers: gl.getUniformLocation(this.#program, 'uTerrainLayers'),
      terrainSecondaryLayers: gl.getUniformLocation(this.#program, 'uTerrainSecondaryLayers'),
      terrainSecondaryNormalLayers: gl.getUniformLocation(this.#program, 'uTerrainSecondaryNormalLayers'),
      terrainSecondaryOrmLayers: gl.getUniformLocation(this.#program, 'uTerrainSecondaryOrmLayers'),
      terrainScale: gl.getUniformLocation(this.#program, 'uTerrainTilesPerVoxel')
    };
    this.#uploadGrassTexture();
    this.#terrainCache?.dispose();
    this.#terrainCache = null;
    // Restore textures through the existing per-frame upload drain.
    this.#pendingTerrainTiles = new Map(this.#terrainTileImages);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
  }

  #ensureTerrainCache() {
    if (this.#terrainCache) return;
    const cache = new TerrainGpuTextureCache(this.#gl, this.#terrainManifest);
    cache.initialize();
    this.#terrainCache = cache;
  }

  #disposeRecord(record) {
    if (this.#lost || this.#gl.isContextLost()) return;
    this.#gl.deleteVertexArray(record.vao);
    for (const buffer of record.buffers) this.#gl.deleteBuffer(buffer);
  }

  #discardGpuMeshes() {
    for (const record of this.#gpuMeshes.values()) this.#disposeRecord(record);
    this.#gpuMeshes.clear();
  }

  #retireGpuMeshes() {
    // Remove the old scene from rendering immediately, then release its GPU
    // handles in the ordinary frame-budgeted drain. Multiple rapid resets
    // cannot allocate new scene buffers ahead of pending retirements.
    for (const record of this.#gpuMeshes.values()) {
      this.#retiredGpuMeshes.push(record);
      this.#retiredGpuBytes += record.bytes;
    }
    this.#gpuMeshes.clear();
  }

  #uploadOne(mesh) {
    if (mesh.indices.length === 0) return;
    const gl = this.#gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('WebGL2 vertex array allocation failed');
    const record = {
      vao, origin: mesh.origin, count: mesh.indices.length,
      triangles: mesh.triangleCount, buffers: [], bytes: 0
    };
    try {
      gl.bindVertexArray(vao);
      const upload = (target, data) => {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('WebGL2 buffer allocation failed');
        record.buffers.push(buffer);
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, gl.STATIC_DRAW);
        record.bytes += data.byteLength;
      };
      upload(gl.ARRAY_BUFFER, mesh.positions);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      upload(gl.ARRAY_BUFFER, mesh.normals);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.BYTE, false, 0, 0);
      upload(gl.ARRAY_BUFFER, mesh.materials);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.UNSIGNED_BYTE, false, 0, 0);
      upload(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
      this.#gpuMeshes.set(mesh.id, record);
    } catch (error) {
      this.#disposeRecord(record);
      throw error;
    } finally {
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  #stageNewScene() {
    this.#recoveryQueue.clear();
    this.#recoveryBytes = 0;
    this.#recovering = false;
    this.#retireGpuMeshes();
    // Full scene initialization uses the same bounded per-frame upload drain.
    this.#sceneQueue = new Map(this.#sourceMeshes);
    this.#sceneBytes = [...this.#sceneQueue.values()].reduce((sum, mesh) =>
      sum + this.#meshBytes(mesh), 0);
  }

  // Full reset for a new scene/seed/chunk size; remove all old GPU resources.
  setMeshes(meshes) {
    if (!Array.isArray(meshes)) throw new TypeError('Expected V2 chunk meshes');
    const next = new Map();
    for (const mesh of meshes) {
      if (!mesh || typeof mesh.id !== 'string' || next.has(mesh.id)) {
        throw new TypeError('Invalid or duplicate V2 mesh ID');
      }
      next.set(mesh.id, mesh);
    }
    if (this.#sceneEpoch === Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Renderer scene epoch exhausted');
    }
    // Validate before invalidating the currently queued scene. Failed scene
    // activations must not discard a valid active world's deferred uploads.
    this.cancelQueuedUploads();
    this.#sceneEpoch++;
    this.#sourceMeshes = next;
    this.#sceneQueue.clear();
    this.#sceneBytes = 0;
    if (this.ready) this.#stageNewScene();
  }

  // Replace ONLY dirty chunk meshes; an empty result deletes a removed chunk.
  replaceMeshes(dirtyIds, meshes, { sceneEpoch } = {}) {
    if (!this.#acceptSceneEpoch(sceneEpoch)) return false;
    if (!(dirtyIds instanceof Set) && !Array.isArray(dirtyIds)) {
      throw new TypeError('Expected a dirty-chunk Set or array');
    }
    if (!Array.isArray(meshes)) throw new TypeError('Expected replacement meshes');
    const ids = new Set(dirtyIds);
    if (ids.size > 128 || [...ids].some(id => typeof id !== 'string')) {
      throw new RangeError('Invalid or excessive dirty chunk IDs');
    }
    const replacements = new Map();
    for (const mesh of meshes) {
      if (!mesh || typeof mesh.id !== 'string' || !ids.has(mesh.id) ||
          replacements.has(mesh.id)) {
        throw new TypeError('Replacement mesh must match one unique dirty chunk ID');
      }
      replacements.set(mesh.id, mesh);
    }
    for (const id of ids) {
      // A direct authoritative replacement supersedes any older staged upload.
      // Otherwise the stale queue entry could overwrite this edit on a later frame.
      if (this.#queuedUploads.has(id)) {
        const queuedMesh = this.#queuedUploads.get(id);
        if (queuedMesh) this.#uploadQueueBytes -= this.#meshBytes(queuedMesh);
        this.#queuedUploads.delete(id);
      }
      const sceneMesh = this.#sceneQueue.get(id);
      if (sceneMesh) this.#sceneBytes -= this.#meshBytes(sceneMesh);
      this.#sceneQueue.delete(id);
      const recoveryMesh = this.#recoveryQueue.get(id);
      if (recoveryMesh) this.#recoveryBytes -= this.#meshBytes(recoveryMesh);
      this.#recoveryQueue.delete(id);
      const oldGpu = this.#gpuMeshes.get(id);
      if (oldGpu) this.#disposeRecord(oldGpu);
      this.#gpuMeshes.delete(id);
      this.#sourceMeshes.delete(id);
      const replacement = replacements.get(id);
      if (replacement) {
        this.#sourceMeshes.set(id, replacement);
        if (this.ready && this.#recovering) {
          // Recovery must stay frame-budgeted even when edits arrive mid-restore.
          this.#recoveryQueue.set(id, replacement);
          this.#recoveryBytes += this.#meshBytes(replacement);
        } else if (this.ready && (this.#sceneQueue.size || this.#retiredGpuMeshes.length)) {
          // An edit cannot bypass pending full-scene uploads or GPU disposal.
          this.#sceneQueue.set(id, replacement);
          this.#sceneBytes += this.#meshBytes(replacement);
        } else if (this.ready) {
          this.#uploadOne(replacement);
        }
      }
    }
    return true;
  }

  render({ width, height, scale, panX, panY, camera = 'inspection' }) {
    if (!this.ready || width <= 0 || height <= 0) return false;
    const gl = this.#gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(16 / 255, 24 / 255, 32 / 255, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.#program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#grassTexture);
    gl.uniform1i(this.#uniforms.grassTexture, 0);
    gl.uniform1i(this.#uniforms.grassEnabled, this.#grassTexture ? 1 : 0);
    gl.uniform1f(this.#uniforms.grassDensity, this.#grassTexelsPerVoxel);
    const keys = ['terrain/grass', 'terrain/grass-soil-side', 'terrain/dirt', 'terrain/stone'];
    const layers = keys.map(key => {
      const variant = TERRAIN_SURFACE_LIBRARY[key].variants[0];
      return this.#terrainCache?.getLayer('albedo', variant.textures.albedo) ?? -1;
    });
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#terrainCache?.getTexture('albedo') ?? null);
    gl.uniform1i(this.#uniforms.terrainAlbedo, 1);
    gl.uniform4fv?.(this.#uniforms.terrainLayers, layers);
    for (const [channel, unit, sampler, locations] of [
      ['normal', 2, this.#uniforms.terrainNormal, this.#uniforms.terrainNormalLayers],
      ['orm', 3, this.#uniforms.terrainOrm, this.#uniforms.terrainOrmLayers]
    ]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#terrainCache?.getTexture(channel) ?? null);
      gl.uniform1i(sampler, unit);
      const channelLayers = keys.map(key => {
        const variant = TERRAIN_SURFACE_LIBRARY[key].variants[0];
        return this.#terrainCache?.getLayer(channel, variant.textures[channel]) ?? -1;
      });
      gl.uniform4fv?.(locations, channelLayers);
      const secondLayers = keys.map(key => {
        const variant = TERRAIN_SURFACE_LIBRARY[key].variants[1];
        return variant ? (this.#terrainCache?.getLayer(channel, variant.textures[channel]) ?? -1) : -1;
      });
      const secondaryUniform = channel === 'normal'
        ? this.#uniforms.terrainSecondaryNormalLayers : this.#uniforms.terrainSecondaryOrmLayers;
      gl.uniform4fv?.(secondaryUniform, secondLayers);
    }
    const secondaryLayers = keys.map(key => {
      const variant = TERRAIN_SURFACE_LIBRARY[key].variants[1];
      return variant ? (this.#terrainCache?.getLayer('albedo', variant.textures.albedo) ?? -1) : -1;
    });
    gl.uniform4fv?.(this.#uniforms.terrainSecondaryLayers, secondaryLayers);
    gl.uniform1f(this.#uniforms.terrainScale, this.#terrainTilesPerVoxel);
    gl.uniform2f(this.#uniforms.viewport, width, height);
    gl.uniform2f(this.#uniforms.pan, panX, panY);
    gl.uniform1f(this.#uniforms.scale, scale);
    const basis = getCameraPreset(camera);
    gl.uniform3fv(this.#uniforms.cameraRight, basis.right);
    gl.uniform3fv(this.#uniforms.cameraDown, basis.down);
    gl.uniform3fv(this.#uniforms.cameraDepth, basis.depth);
    for (const mesh of this.#gpuMeshes.values()) {
      gl.uniform3fv(this.#uniforms.origin, mesh.origin);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    return true;
  }

  dispose() {
    this.cancelQueuedUploads();
    this.#recoveryQueue.clear();
    this.#recoveryBytes = 0;
    this.#sceneQueue.clear();
    this.#sceneBytes = 0;
    this.#recovering = false;
    this.#discardGpuMeshes();
    // Explicit disposal is terminal: release any delayed old-scene buffers now.
    for (const record of this.#retiredGpuMeshes) this.#disposeRecord(record);
    this.#retiredGpuMeshes.length = 0;
    this.#retiredGpuBytes = 0;
    if (this.#grassTexture && !this.#lost) this.#gl.deleteTexture(this.#grassTexture);
    this.#grassTexture = null;
    this.#terrainCache?.dispose();
    this.#terrainCache = null;
    this.#terrainTileImages.clear();
    this.#pendingTerrainTiles.clear();
    this.#terrainTileStagingBytes = 0;
    if (this.#program && !this.#lost) this.#gl.deleteProgram(this.#program);
    this.#program = null;
    this.#sourceMeshes.clear();
  }
}
