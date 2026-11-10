// Ground-up V2 WebGL2 baseline. Orthographic/oblique 2.5D view; not a texture-atlas art pass.
// The renderer owns every GPU buffer. Voxel data and collision never depend on GPU state.
export function projectVoxel(x, y, z, { width, height, scale, panX = 0, panY = 0 }) {
  return {
    x: width / 2 + (x - z) * scale * 0.75 + panX,
    y: height / 2 + (x + z) * scale * 0.35 - y * scale + panY,
    depth: -(x + z + 0.7 * y) / 128
  };
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aMaterial;
uniform vec3 uOrigin;
uniform vec2 uViewport;
uniform vec2 uPan;
uniform float uScale;
out vec3 vNormal;
flat out float vMaterial;

void main() {
  vec3 world = aPosition + uOrigin;
  vec2 pixel = vec2((world.x - world.z) * 0.75,
                    (world.x + world.z) * 0.35 - world.y) * uScale
               + uViewport * 0.5 + uPan;
  // The camera looks along +X, +Y, +Z. The nullspace of the two
  // projected axes is (1, 0.7, 1), matching the independent depth.
  float depth = -(world.x + world.z + 0.7 * world.y) / 128.0;
  gl_Position = vec4(2.0 * pixel.x / uViewport.x - 1.0,
                     1.0 - 2.0 * pixel.y / uViewport.y,
                     depth, 1.0);
  vNormal = aNormal;
  vMaterial = aMaterial;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
flat in float vMaterial;
out vec4 outColor;

void main() {
  vec3 albedo = vMaterial < 1.5
    ? vec3(0.38, 0.55, 0.28)        // V2 grass
    : vMaterial < 2.5
      ? vec3(0.48, 0.34, 0.24)      // V2 dirt
      : vec3(0.42, 0.47, 0.53);     // V2 stone
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
  #canvas;
  #program = null;
  #uniforms = null;
  #gpuMeshes = [];
  #sourceMeshes = [];
  #gpuBytes = 0;
  #triangles = 0;
  #lost = false;
  #losses = 0;
  #onAvailabilityChange;

  constructor(canvas, { onAvailabilityChange = () => {} } = {}) {
    this.#canvas = canvas;
    this.#onAvailabilityChange = onAvailabilityChange;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: true, stencil: false, preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WebGL2 is unavailable on this device');
    this.#gl = gl;
    this.#initialize();

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.#lost = true;
      this.#losses++;
      this.#program = null;
      this.#gpuMeshes = [];
      this.#gpuBytes = 0;
      this.#onAvailabilityChange(false);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.#lost = false;
        this.#initialize();
        this.#uploadMeshes();
        this.#onAvailabilityChange(true);
      } catch (error) {
        this.#lost = true;
        this.#onAvailabilityChange(false, error);
      }
    });
  }

  get ready() { return !this.#lost && this.#program !== null; }
  get statistics() {
    return {
      renderer: 'WebGL2 exposed-face V2 baseline',
      triangles: this.#triangles,
      drawCalls: this.#gpuMeshes.length,
      gpuBufferBytesEstimate: this.#gpuBytes,
      contextLosses: this.#losses,
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
      scale: gl.getUniformLocation(this.#program, 'uScale')
    };
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE); // Explicit baseline; culling gets device-tested later.
  }

  #discardGpuMeshes() {
    const gl = this.#gl;
    if (!this.#lost && !gl.isContextLost()) {
      for (const mesh of this.#gpuMeshes) {
        gl.deleteVertexArray(mesh.vao);
        for (const buffer of mesh.buffers) gl.deleteBuffer(buffer);
      }
    }
    this.#gpuMeshes = [];
    this.#gpuBytes = 0;
    this.#triangles = 0;
  }

  setMeshes(meshes) {
    if (!Array.isArray(meshes)) throw new TypeError('Expected V2 chunk meshes');
    this.#sourceMeshes = meshes;
    if (this.ready) this.#uploadMeshes();
  }

  #uploadMeshes() {
    this.#discardGpuMeshes();
    const gl = this.#gl;
    try {
      for (const mesh of this.#sourceMeshes) {
        if (!mesh.indices.length) continue;
        const vao = gl.createVertexArray();
        if (!vao) throw new Error('WebGL2 vertex array allocation failed');
        const record = { vao, origin: mesh.origin, count: mesh.indices.length, buffers: [] };
        this.#gpuMeshes.push(record);
        gl.bindVertexArray(vao);

        const upload = (target, data) => {
          const buffer = gl.createBuffer();
          if (!buffer) throw new Error('WebGL2 buffer allocation failed');
          record.buffers.push(buffer);
          gl.bindBuffer(target, buffer);
          gl.bufferData(target, data, gl.STATIC_DRAW);
          this.#gpuBytes += data.byteLength;
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
        this.#triangles += mesh.triangleCount;
      }
    } catch (error) {
      this.#discardGpuMeshes();
      throw error;
    } finally {
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  render({ width, height, scale, panX, panY }) {
    if (!this.ready || width <= 0 || height <= 0) return false;
    const gl = this.#gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(16 / 255, 24 / 255, 32 / 255, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.#program);
    gl.uniform2f(this.#uniforms.viewport, width, height);
    gl.uniform2f(this.#uniforms.pan, panX, panY);
    gl.uniform1f(this.#uniforms.scale, scale);
    for (const mesh of this.#gpuMeshes) {
      gl.uniform3fv(this.#uniforms.origin, mesh.origin);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    return true;
  }

  dispose() {
    this.#discardGpuMeshes();
    if (this.#program && !this.#lost) this.#gl.deleteProgram(this.#program);
    this.#program = null;
    this.#sourceMeshes = [];
  }
}
