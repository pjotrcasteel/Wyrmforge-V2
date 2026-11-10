import { createScene, MAX_SCENE_SEED, SCENE_GENERATOR_VERSION } from './src/voxel-world.mjs';
import { VERSION, COMMIT } from './src/build-info.mjs';
import { FrameMetrics } from './src/frame-metrics.mjs';
import { PointerGestures } from './src/pointer-gestures.mjs';
import { buildExposedFaceMeshes } from './src/exposed-face-mesher.mjs';
import { createMeshingJob, jobTransferBuffers, isCurrentMeshingResult } from './src/mesh-worker-protocol.mjs';
import { WebGLVoxelView } from './src/webgl-voxel-view.mjs';
import { getCameraPreset, projectVoxel } from './src/camera-presets.mjs';
import { carveDemoSphere, demoCarveTarget } from './src/demo-carve.mjs';

const build = document.querySelector('#build');
build.textContent = `v${VERSION} · ${COMMIT === 'local' ? 'local build' : COMMIT.slice(0, 7)}`;
build.title = `Voxel Engine V2 ${VERSION} | commit ${COMMIT}`;

const canvas = document.querySelector('#view');
const gpuCanvas = document.querySelector('#gpu-view');
const ctx = canvas.getContext('2d', { alpha: false });
const state = document.querySelector('#status');
const meshAuditStatus = document.querySelector('#mesh-audit');
const meshCompareButton = document.querySelector('#mesh-compare-button');
const scenePicker = document.querySelector('#scene');
const seedPicker = document.querySelector('#seed');
const chunkPicker = document.querySelector('#chunks');
const cameraPicker = document.querySelector('#camera');
let activeCamera = getCameraPreset(cameraPicker.value).id;
let activeSeed = 7;
let activeScene = 'hill';
let world = createScene(activeScene, activeSeed, { chunkEdge: Number(chunkPicker.value) });
let cameraX = 0, cameraY = 0, baseScale = 11, scale = 11, zoomFactor = 1;
const gestures = new PointerGestures();
let dirty = true, previous = null, lastStatusAt = 0, visibleSurfaces = 0;
const frameMetrics = new FrameMetrics();
let lastMeshAudit = null;
let lastMeshComparison = null;
let lastMeshWorker = null;
let compareWorker = null, compareJob = null, compareJobId = 0;
let lastCarve = null;

function cancelMeshWorker() {
  compareJobId++;
  if (compareWorker) compareWorker.terminate();
  compareWorker = null;
  compareJob = null;
  meshCompareButton.disabled = false;
}
let gpuRenderer = null;
let gpuBuildMs = null;
let gpuError = null;
let lastMeshUpdate = null;

function rebuildGpuMeshes(dirtyChunks = null) {
  if (!gpuRenderer) return;
  try {
    const start = performance.now();
    const meshes = buildExposedFaceMeshes(world, dirtyChunks === null ? {} : { chunkIds: dirtyChunks });
    if (dirtyChunks === null) gpuRenderer.setMeshes(meshes);
    else gpuRenderer.replaceMeshes(dirtyChunks, meshes);
    gpuBuildMs = performance.now() - start;
    lastMeshUpdate = {
      mode: dirtyChunks === null ? 'full' : 'localized',
      chunksUpdated: dirtyChunks === null ? meshes.length : dirtyChunks.size,
      worldChunks: world.chunkCount, elapsedMs: gpuBuildMs,
      uploadedCpuMeshBytes: meshes.reduce((sum, mesh) => sum + mesh.cpuBufferBytes, 0)
    };
    gpuError = null;
    dirty = true;
  } catch (error) {
    gpuError = error.message;
    gpuRenderer.dispose();
    gpuRenderer = null;
    gpuCanvas.style.display = 'none';
  }
}

function invalidateMeshAudit() {
  cancelMeshWorker();
  lastMeshAudit = null;
  lastMeshComparison = null;
  lastMeshWorker = null;
  meshAuditStatus.textContent = '3D geometry changed. Select Audit 3D faces to recompute.';
}

const formatMs = ms => ms === null ? 'n/a' : `${ms.toFixed(1)}ms`;
function updateStatus() {
  const frames = frameMetrics.summary();
  const rendererStatus = gpuRenderer?.ready
    ? `WebGL2 · ${gpuRenderer.statistics.triangles} triangles · ${gpuRenderer.statistics.drawCalls} draws`
    : `Canvas2D fallback${gpuError ? ' (' + gpuError + ')' : ''}`;
  state.textContent = `V2-only · ${rendererStatus} · camera ${activeCamera} · ${world.chunkEdge}³ chunks · seed ${activeSeed}` +
    ` · zoom ${zoomFactor.toFixed(2)}× · rev ${world.revision}` +
    ` · p95 ${formatMs(frames.p95)} · p99 ${formatMs(frames.p99)}` +
    ` · >50ms: ${frames.hitchesOver50Ms}/${frames.count}`;
}

function project(x, y, z) {
  const pixel = projectVoxel(x, y, z, {
    width: canvas.width, height: canvas.height, scale, panX: cameraX, panY: cameraY,
    camera: activeCamera
  });
  return [pixel.x, pixel.y];
}

function resize() {
  gestures.reset();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  gpuCanvas.width = canvas.width;
  gpuCanvas.height = canvas.height;
  baseScale = Math.max(7, Math.min(16, canvas.width / 35));
  scale = baseScale * zoomFactor;
  dirty = true;
}

function zoomAt(cssX, cssY, ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  const nextZoom = Math.max(0.55, Math.min(2.5, zoomFactor * ratio));
  if (nextZoom === zoomFactor) return;
  const factor = nextZoom / zoomFactor;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const pixelX = cssX * canvas.width / rect.width;
  const pixelY = cssY * canvas.height / rect.height;
  // Keep the world coordinate below the pinch midpoint stationary.
  cameraX = (canvas.width / 2 + cameraX - pixelX) * factor + pixelX - canvas.width / 2;
  cameraY = (canvas.height / 2 + cameraY - pixelY) * factor + pixelY - canvas.height / 2;
  zoomFactor = nextZoom;
  scale = baseScale * zoomFactor;
  dirty = true;
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function draw() {
  if (!dirty) return;
  dirty = false;
  if (gpuRenderer?.ready && gpuRenderer.render({
    width: gpuCanvas.width, height: gpuCanvas.height,
    scale, panX: cameraX, panY: cameraY, camera: activeCamera
  })) {
    return;
  }
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Foundation visualizer: deliberately simple and not the future WebGL2 renderer.
  const surfaces = [];
  for (let z = -12; z < 12; z++) for (let x = -12; x < 12; x++) {
    for (let y = 14; y >= -2; y--) {
      const material = world.get(x, y, z);
      if (!material || world.get(x, y + 1, z)) continue;
      surfaces.push({ x, y, z, material, depth: x + z });
    }
  }
  surfaces.sort((a, b) => a.depth - b.depth || a.y - b.y);
  for (const { x, y, z, material } of surfaces) {
    const top = y + 1;
    const corners = [
      project(x - .5, top, z - .5),
      project(x + .5, top, z - .5),
      project(x + .5, top, z + .5),
      project(x - .5, top, z + .5)
    ];
    ctx.fillStyle = material === 1 ? '#638c48' : material === 2 ? '#806449' : '#727b85';
    ctx.beginPath();
    ctx.moveTo(...corners[0]);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(...corners[i]);
    ctx.closePath();
    ctx.fill();
  }
  visibleSurfaces = surfaces.length;
}

function tick(now) {
  if (previous !== null && !document.hidden) frameMetrics.record(now - previous);
  previous = document.hidden ? null : now;
  draw();
  if (now - lastStatusAt >= 1000 && !document.hidden) {
    updateStatus();
    lastStatusAt = now;
  }
  requestAnimationFrame(tick);
}
function chooseScene() {
  const rawSeed = seedPicker.value.trim();
  const seed = Number(rawSeed);
  if (!/^\d+$/.test(rawSeed) || !Number.isSafeInteger(seed) || seed > MAX_SCENE_SEED) {
    scenePicker.value = activeScene;
    state.textContent = `Invalid seed: enter a whole number from 0 to ${MAX_SCENE_SEED}`;
    return;
  }
  world = createScene(scenePicker.value, seed, { chunkEdge: Number(chunkPicker.value) });
  lastCarve = null;
  invalidateMeshAudit();
  rebuildGpuMeshes();
  activeScene = scenePicker.value;
  activeSeed = seed;
  frameMetrics.reset();
  previous = null;
  visibleSurfaces = 0;
  gestures.reset();
  dirty = true;
}
scenePicker.addEventListener('change', chooseScene);
seedPicker.addEventListener('change', chooseScene);
chunkPicker.addEventListener('change', chooseScene);
cameraPicker.addEventListener('change', () => {
  activeCamera = getCameraPreset(cameraPicker.value).id;
  dirty = true;
  // Switching camera is presentation-only: no generation, remesh or GPU upload.
  updateStatus();
});
document.querySelector('#reset').addEventListener('click', chooseScene);
document.querySelector('#carve').addEventListener('click', () => {
  const target = demoCarveTarget(activeScene);
  const dirtyChunks = new Set();
  const removedVoxels = carveDemoSphere(world, target, { dirtyChunks });
  lastCarve = {
    scene: activeScene, ...target, removedVoxels,
    worldRevision: world.revision, dirtyChunks: [...dirtyChunks].sort()
  };
  invalidateMeshAudit();
  // Do not upload new meshes if the demo hit only empty space.
  if (removedVoxels > 0) rebuildGpuMeshes(dirtyChunks);
  meshAuditStatus.textContent = removedVoxels > 0
    ? `Carved ${removedVoxels} voxels. Remeshed ${lastMeshUpdate?.chunksUpdated ?? 'n/a'}/${world.chunkCount} chunks. Audit 3D faces to inspect.`
    : 'No solid voxels remain in that demo impact area; select Reset to restore terrain.';
  dirty = true;
});

document.querySelector('#mesh-audit-button').addEventListener('click', () => {
  meshAuditStatus.textContent = 'Auditing exposed voxel faces…';
  try {
    const startedAt = performance.now();
    const meshes = buildExposedFaceMeshes(world);
    const faceCounts = { '+x': 0, '-x': 0, '+y': 0, '-y': 0, '+z': 0, '-z': 0 };
    let faceCount = 0, triangleCount = 0, cpuBufferBytes = 0;
    for (const mesh of meshes) {
      faceCount += mesh.faceCount;
      triangleCount += mesh.triangleCount;
      cpuBufferBytes += mesh.cpuBufferBytes;
      for (const face of Object.keys(faceCounts)) faceCounts[face] += mesh.faceCounts[face];
    }
    lastMeshAudit = {
      chunkEdge: world.chunkEdge, worldRevision: world.revision,
      chunks: meshes.length, faceCount, triangleCount, faceCounts,
      cpuBufferBytes, elapsedMs: performance.now() - startedAt
    };
    meshAuditStatus.textContent = '3D faces: ' + faceCount + ' · triangles: ' + triangleCount +
      ' · underside (-Y): ' + faceCounts['-y'] + ' · side faces: ' +
      (faceCounts['+x'] + faceCounts['-x'] + faceCounts['+z'] + faceCounts['-z']) +
      ' · CPU geometry: ' + Math.round(cpuBufferBytes / 1024) + ' KiB';
  } catch (error) {
    lastMeshAudit = null;
    meshAuditStatus.textContent = 'Mesh audit failed: ' + error.message;
  }
});

meshCompareButton.addEventListener('click', () => {
  if (compareJob) return; // Explicit one-in-flight, zero-backlog limit.
  if (typeof Worker !== 'function') {
    meshAuditStatus.textContent = 'Background mesh comparison requires browser module workers.';
    return;
  }
  let worker;
  try {
    const job = createMeshingJob(world, ++compareJobId);
    const targetWorld = world;
    const started = performance.now();
    worker = new Worker(new URL('./src/mesh-comparison.worker.mjs', import.meta.url),
      { type: 'module' });
    compareWorker = worker;
    compareJob = { id: job.id, world: targetWorld, revision: job.revision };
    meshCompareButton.disabled = true;
    lastMeshComparison = null;
    lastMeshWorker = { status: 'running', snapshotBytes: job.snapshotBytes };
    meshAuditStatus.textContent = 'Comparing meshes in V2 background worker…';

    function finish(message) {
      if (compareWorker !== worker) return; // A reset/carve superseded this worker.
      worker.terminate();
      compareWorker = null;
      compareJob = null;
      meshCompareButton.disabled = false;
      const elapsed = performance.now() - started;
      if (world !== targetWorld || world.revision !== job.revision) {
        meshAuditStatus.textContent = 'Discarded stale mesh result after terrain changed.';
        lastMeshWorker = { status: 'stale', endToEndMs: elapsed };
        return;
      }
      if (!isCurrentMeshingResult(message, job.id, job.revision)) {
        meshAuditStatus.textContent = 'Background mesh comparison failed: ' +
          (message?.message || 'Invalid or stale worker response');
        lastMeshWorker = { status: 'error', endToEndMs: elapsed,
          message: message?.message || 'Invalid worker response' };
        return;
      }
      lastMeshComparison = message.comparison;
      lastMeshWorker = { status: 'complete', snapshotBytes: job.snapshotBytes,
        endToEndMs: elapsed, workerCpuBuildMs:
          message.comparison.exposed.cpuBuildMs + message.comparison.greedy.cpuBuildMs };
      const { exposed, greedy } = lastMeshComparison;
      meshAuditStatus.textContent =
        `CPU meshes (worker): exposed ${exposed.triangles} triangles / ${Math.round(exposed.cpuGeometryBytes/1024)} KiB` +
        ` / ${exposed.cpuBuildMs.toFixed(1)} ms · greedy ${greedy.triangles} triangles` +
        ` / ${Math.round(greedy.cpuGeometryBytes/1024)} KiB / ${greedy.cpuBuildMs.toFixed(1)} ms` +
        ' · live renderer unchanged';
    }

    worker.addEventListener('message', event => finish(event.data), { once: true });
    worker.addEventListener('error', event => {
      event.preventDefault();
      finish({ type: 'error', message: event.message || 'Worker runtime error' });
    }, { once: true });
    worker.postMessage(job, jobTransferBuffers(job));
  } catch (error) {
    worker?.terminate();
    compareWorker = null;
    compareJob = null;
    meshCompareButton.disabled = false;
    lastMeshComparison = null;
    lastMeshWorker = { status: 'error', message: error.message };
    meshAuditStatus.textContent = 'Cannot start background mesh comparison: ' + error.message;
  }
});

document.querySelector('#report').addEventListener('click', () => {
  const frames = frameMetrics.summary();
  const report = { schema:'voxel-v2.benchmark.v1', version:VERSION, commit:COMMIT, scene:activeScene,
    sceneGenerator:SCENE_GENERATOR_VERSION, seed:activeSeed, cameraPreset:activeCamera,
    userAgent:navigator.userAgent, viewport:[canvas.width,canvas.height],
    viewportCss:[canvas.clientWidth,canvas.clientHeight], renderScale:canvas.width/canvas.clientWidth,
    frames,
    chunkEdge:world.chunkEdge, chunks:world.chunkCount,
    voxelPayloadBytes:world.allocatedVoxelBytes, revision:world.revision,
    meshAudit:lastMeshAudit, meshComparison:lastMeshComparison, meshWorker:lastMeshWorker, lastCarve,
    renderer: gpuRenderer?.ready ? gpuRenderer.statistics : { renderer:'Canvas2D fallback' },
    cpuMeshAndUploadMs:gpuBuildMs, lastMeshUpdate, rendererError:gpuError,
    caveat:'Flat-shaded V2 WebGL2 baseline; only diagnostic mesh comparison uses a bounded worker. Live terrain remeshing and GPU upload budgets are not yet asynchronous.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download='voxel-v2-report.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const point = pointerPosition(event);
  if (gestures.begin(event.pointerId, point.x, point.y)) {
    canvas.setPointerCapture(event.pointerId);
  }
});
canvas.addEventListener('pointermove', event => {
  const point = pointerPosition(event);
  const delta = gestures.move(event.pointerId, point.x, point.y);
  if (!delta) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  cameraX += delta.panX * canvas.width / rect.width;
  cameraY += delta.panY * canvas.height / rect.height;
  zoomAt(delta.centerX, delta.centerY, delta.zoomRatio);
  dirty = true;
});
canvas.addEventListener('pointerup', event => gestures.end(event.pointerId));
canvas.addEventListener('pointercancel', event => gestures.end(event.pointerId));
canvas.addEventListener('lostpointercapture', event => gestures.end(event.pointerId));
canvas.addEventListener('wheel', event => {
  if (event.cancelable) event.preventDefault();
  const point = pointerPosition(event);
  const unit = event.deltaMode === 1 ? 0.03 : event.deltaMode === 2 ? 0.25 : 0.002;
  zoomAt(point.x, point.y, Math.exp(-event.deltaY * unit));
}, { passive: false });
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange', () => { previous = null; if (document.hidden) gestures.reset(); });
window.addEventListener('blur', () => gestures.reset());
try {
  gpuRenderer = new WebGLVoxelView(gpuCanvas, {
    onAvailabilityChange(available, error) {
      gpuCanvas.style.display = available ? 'block' : 'none';
      gpuError = error?.message ?? null;
      // WebGLVoxelView restores its retained chunk meshes; no duplicate full upload.
      dirty = true;
    }
  });
  gpuCanvas.style.display = 'block';
  rebuildGpuMeshes();
} catch (error) {
  gpuError = error.message;
  gpuCanvas.style.display = 'none';
}
resize();
requestAnimationFrame(tick);
