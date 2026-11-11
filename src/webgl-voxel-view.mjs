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
uniform vec4 uTerrainLayers;
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
  float layer = uTerrainLayers[surfaceIndex];
  if (layer >= 0.0) {
    vec2 uv = abs(vNormal.y) > 0.5 ? vWorld.xz
      : abs(vNormal.x) > 0.5 ? vWorld.zy : vWorld.xy;
    albedo = texture(uTerrainAlbedo, vec3(uv * uTerrainTilesPerVoxel, layer)).rgb;
  }
  float lighting = vNormal.y > 0.5 ? 1.0
    : vNormal.y < -0.5 ? 0.43
    : vNormal.x > 0.5 ? 0.74
    : vNormal.z > 0.5 ? 0.62
    : vNormal.x < -0.5 ? 0.55 : 0.50;
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
  #terrainManifest = compileTerrainTextureManifest();
  #terrainCache = null;
  #terrainTileImages = new Map();
  #terrainTilesPerVoxel = 1;
  #grassTexture = null;
  #grassTexelsPerVoxel = 32;
  #contextLossExtension = null;
  #program = null;
  #uniforms = null;
  #gpuMeshes = new Map();
  #sourceMeshes = new Map();
  #queuedUploads = new Map();
  #uploadQueuePeak = 0;
  #uploadQueueBytes = 0;
  #recoveryQueue = new Map();
  #recoveryBytes = 0;
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
      this.#gpuMeshes.clear();
      this.#recoveryQueue.clear();
      this.#recoveryBytes = 0;
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
    const asset = this.#terrainManifest.assets.find(item => item.channel === 'albedo' && item.key === key);
    if (!asset) throw new RangeError('Unknown terrain albedo asset');
    if (!image || image.width !== this.#terrainManifest.tileSize ||
        image.height !== this.#terrainManifest.tileSize) {
      throw new RangeError('Terrain albedo tiles must match manifest dimensions');
    }
    this.#terrainTileImages.set(key, image);
    if (this.ready) this.#terrainCache.upload('albedo', key, image);
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
  get pendingUploads() { return this.#queuedUploads.size + this.#recoveryQueue.size; }
  get recovering() { return this.#recovering; }
  #meshBytes(mesh) {
    return mesh.positions.byteLength + mesh.normals.byteLength +
      mesh.materials.byteLength + mesh.indices.byteLength;
  }
  get uploadQueueStatistics() {
    return { pendingChunks: this.#queuedUploads.size,
      pendingBytes: this.#uploadQueueBytes + this.#recoveryBytes,
      recoveryChunks: this.#recoveryQueue.size,
      peakChunks: this.#uploadQueuePeak };
  }

  // V2.4: stage a bounded batch; caller invalidates it on new edits/reset.
  queueReplacementMeshes(dirtyIds, meshes) {
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
      if (this.#queuedUploads.size) {
        const [id, mesh] = this.#queuedUploads.entries().next().value;
        this.#queuedUploads.delete(id);
        this.#uploadQueueBytes -= mesh ? this.#meshBytes(mesh) : 0;
        this.replaceMeshes(new Set([id]), mesh ? [mesh] : []);
      } else {
        const [id, mesh] = this.#recoveryQueue.entries().next().value;
        this.#recoveryQueue.delete(id);
        this.#recoveryBytes -= this.#meshBytes(mesh);
        // Source mesh may have changed during recovery; never resurrect it.
        if (this.#sourceMeshes.get(id) === mesh) this.#uploadOne(mesh);
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
      gpuBufferBytesEstimate: gpuBytes,
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
      terrainLayers: gl.getUniformLocation(this.#program, 'uTerrainLayers'),
      terrainScale: gl.getUniformLocation(this.#program, 'uTerrainTilesPerVoxel')
    };
    this.#uploadGrassTexture();
    this.#terrainCache?.dispose();
    this.#terrainCache = new TerrainGpuTextureCache(gl, this.#terrainManifest);
    this.#terrainCache.initialize();
    for (const [key, image] of this.#terrainTileImages) {
      this.#terrainCache.upload('albedo', key, image);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
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

  #uploadAll() {
    this.#recoveryQueue.clear();
    this.#recoveryBytes = 0;
    this.#recovering = false;
    this.#discardGpuMeshes();
    for (const mesh of this.#sourceMeshes.values()) this.#uploadOne(mesh);
  }

  // Full reset for a new scene/seed/chunk size; remove all old GPU resources.
  setMeshes(meshes) {
    this.cancelQueuedUploads();
    if (!Array.isArray(meshes)) throw new TypeError('Expected V2 chunk meshes');
    const next = new Map();
    for (const mesh of meshes) {
      if (!mesh || typeof mesh.id !== 'string' || next.has(mesh.id)) {
        throw new TypeError('Invalid or duplicate V2 mesh ID');
      }
      next.set(mesh.id, mesh);
    }
    this.#sourceMeshes = next;
    if (this.ready) this.#uploadAll();
  }

  // Replace ONLY dirty chunk meshes; an empty result deletes a removed chunk.
  replaceMeshes(dirtyIds, meshes) {
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
        } else if (this.ready) {
          this.#uploadOne(replacement);
        }
      }
    }
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
      return this.#terrainCache.getLayer('albedo', variant.textures.albedo) ?? -1;
    });
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#terrainCache.getTexture('albedo'));
    gl.uniform1i(this.#uniforms.terrainAlbedo, 1);
    gl.uniform4fv(this.#uniforms.terrainLayers, layers);
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
    this.#recovering = false;
    this.#discardGpuMeshes();
    if (this.#grassTexture && !this.#lost) this.#gl.deleteTexture(this.#grassTexture);
    this.#grassTexture = null;
    this.#terrainCache?.dispose();
    this.#terrainCache = null;
    this.#terrainTileImages.clear();
    if (this.#program && !this.#lost) this.#gl.deleteProgram(this.#program);
    this.#program = null;
    this.#sourceMeshes.clear();
  }
}
