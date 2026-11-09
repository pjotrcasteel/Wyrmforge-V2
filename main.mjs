import { createScene, MAX_SCENE_SEED, SCENE_GENERATOR_VERSION } from './src/voxel-world.mjs';
import { VERSION, COMMIT } from './src/build-info.mjs';
import { FrameMetrics } from './src/frame-metrics.mjs';

const build = document.querySelector('#build');
build.textContent = `v${VERSION} · ${COMMIT === 'local' ? 'local build' : COMMIT.slice(0, 7)}`;
build.title = `Voxel Engine V2 ${VERSION} | commit ${COMMIT}`;

const canvas = document.querySelector('#view');
const ctx = canvas.getContext('2d', { alpha: false });
const state = document.querySelector('#status');
const scenePicker = document.querySelector('#scene');
const seedPicker = document.querySelector('#seed');
let activeSeed = 7;
let world = createScene('hill', activeSeed);
let cameraX = 0, cameraY = 0, scale = 11, drag = null;
let dirty = true, previous = null, lastStatusAt = 0, visibleSurfaces = 0;
const frameMetrics = new FrameMetrics();

const formatMs = ms => ms === null ? 'n/a' : `${ms.toFixed(1)}ms`;
function updateStatus() {
  const frames = frameMetrics.summary();
  state.textContent = `V2-only · seed ${activeSeed} · ${world.chunkCount} chunks · rev ${world.revision}` +
    ` · ${visibleSurfaces} columns · p95 ${formatMs(frames.p95)}` +
    ` · p99 ${formatMs(frames.p99)} · >50ms: ${frames.hitchesOver50Ms}/${frames.count}`;
}

function project(x, y, z) {
  return [canvas.width / 2 + (x - z) * scale * 0.75 + cameraX,
    canvas.height / 2 + (x + z) * scale * 0.35 - y * scale + cameraY];
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  scale = Math.max(7, Math.min(16, canvas.width / 35));
  dirty = true;
}

function draw() {
  if (!dirty) return;
  dirty = false;
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
    const [px, py] = project(x, y, z);
    ctx.fillStyle = material === 1 ? '#638c48' : material === 2 ? '#806449' : '#727b85';
    ctx.beginPath();
    ctx.moveTo(px, py - scale * .35);
    ctx.lineTo(px + scale * .75, py);
    ctx.lineTo(px, py + scale * .35);
    ctx.lineTo(px - scale * .75, py);
    ctx.closePath();
    ctx.fill();
  }
  visibleSurfaces = surfaces.length;
  updateStatus();
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
    state.textContent = `Invalid seed: enter a whole number from 0 to ${MAX_SCENE_SEED}`;
    return;
  }
  world = createScene(scenePicker.value, seed);
  activeSeed = seed;
  frameMetrics.reset();
  previous = null;
  visibleSurfaces = 0;
  dirty = true;
}
scenePicker.addEventListener('change', chooseScene);
seedPicker.addEventListener('change', chooseScene);
document.querySelector('#reset').addEventListener('click', chooseScene);
document.querySelector('#carve').addEventListener('click', () => {
  for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) for (let y = -1; y <= 8; y++) {
    if (x*x + z*z + (y-3)*(y-3) < 22) world.set(x,y,z,0);
  }
  dirty = true;
});
document.querySelector('#report').addEventListener('click', () => {
  const frames = frameMetrics.summary();
  const report = { schema:'voxel-v2.benchmark.v1', version:VERSION, commit:COMMIT, scene:scenePicker.value,
    sceneGenerator:SCENE_GENERATOR_VERSION, seed:activeSeed,
    userAgent:navigator.userAgent, viewport:[canvas.width,canvas.height],
    viewportCss:[canvas.clientWidth,canvas.clientHeight], renderScale:canvas.width/canvas.clientWidth,
    frames,
    chunks:world.chunkCount, revision:world.revision, caveat:'Canvas2D foundation visualizer; not a GPU benchmark' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download='voxel-v2-report.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); drag={x:e.clientX,y:e.clientY}; });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const dpr=canvas.width/canvas.clientWidth;
  cameraX+=(e.clientX-drag.x)*dpr; cameraY+=(e.clientY-drag.y)*dpr;
  drag={x:e.clientX,y:e.clientY}; dirty=true;
});
canvas.addEventListener('pointerup',()=>drag=null);
canvas.addEventListener('pointercancel',()=>drag=null);
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange', () => { previous = null; });
resize();
requestAnimationFrame(tick);
