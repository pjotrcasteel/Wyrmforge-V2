import { VoxelWorld, createScene, CHUNK_EDGE } from './src/voxel-world.mjs';
import { VERSION, COMMIT } from './src/build-info.mjs';

const build = document.querySelector('#build');
build.textContent = `v${VERSION} · ${COMMIT === 'local' ? 'local build' : COMMIT.slice(0, 7)}`;
build.title = `Voxel Engine V2 ${VERSION} | commit ${COMMIT}`;

const canvas = document.querySelector('#view');
const ctx = canvas.getContext('2d', { alpha: false });
const state = document.querySelector('#status');
const scenePicker = document.querySelector('#scene');
let world = createScene('hill');
let cameraX = 0, cameraY = 0, scale = 11, drag = null;
let dirty = true, frameCount = 0, previous = null;
const frameTimes = [];

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
  state.textContent = `V2-only · ${world.chunkCount} chunks · revision ${world.revision} · ${surfaces.length} visible columns`;
}

function tick(now) {
  if (previous !== null && !document.hidden && now - previous < 1000) {
    frameTimes.push(now - previous);
    if (frameTimes.length > 1800) frameTimes.shift();
  }
  previous = now;
  frameCount++;
  draw();
  requestAnimationFrame(tick);
}
function chooseScene() {
  world = createScene(scenePicker.value);
  dirty = true;
}
scenePicker.addEventListener('change', chooseScene);
document.querySelector('#reset').addEventListener('click', chooseScene);
document.querySelector('#carve').addEventListener('click', () => {
  for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) for (let y = -1; y <= 8; y++) {
    if (x*x + z*z + (y-3)*(y-3) < 22) world.set(x,y,z,0);
  }
  dirty = true;
});
document.querySelector('#report').addEventListener('click', () => {
  const sorted = [...frameTimes].sort((a,b)=>a-b);
  const p = q => sorted.length ? sorted[Math.ceil(q*sorted.length)-1] : null;
  const report = { schema:'voxel-v2.benchmark.v1', version:VERSION, commit:COMMIT, scene:scenePicker.value,
    userAgent:navigator.userAgent, viewport:[canvas.width,canvas.height],
    frames:{ count:sorted.length,p50:p(.5),p95:p(.95),p99:p(.99) },
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
resize();
requestAnimationFrame(tick);
