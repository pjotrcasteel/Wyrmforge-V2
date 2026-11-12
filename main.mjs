import { createScene, MAX_SCENE_SEED, SCENE_GENERATOR_VERSION } from './src/voxel-world.mjs';
import { VERSION, COMMIT } from './src/build-info.mjs';
import { FrameMetrics } from './src/frame-metrics.mjs';
import { SustainedTelemetry } from './src/sustained-telemetry.mjs';
import { SOAK_CYCLE_MS, SOAK_PROFILES, describeSoakProgress } from './src/mobile-soak-profile.mjs';
import { PointerGestures } from './src/pointer-gestures.mjs';
import { buildExposedFaceMeshes } from './src/exposed-face-mesher.mjs';
import { createMeshingJob, jobTransferBuffers, isCurrentMeshingResult } from './src/mesh-worker-protocol.mjs';
import { createTerrainMeshJob, isCurrentTerrainMeshReply } from './src/terrain-mesh-protocol.mjs';
import { TerrainWorkerSession } from './src/terrain-worker-session.mjs';
import { WebGLVoxelView } from './src/webgl-voxel-view.mjs';
import { REFERENCE_TERRAIN_KEYS, createReferenceTerrainCanvas, createReferenceMaterialCanvas } from './src/terrain-reference-tiles.mjs';
import { getCameraPreset, projectVoxel } from './src/camera-presets.mjs';
import { demoCarveTarget } from './src/demo-carve.mjs';
import { spatialDamageTarget } from './src/spatial-benchmark.mjs';
import { fissureSites, applyFissureStage, FISSURE_STAGE_TIMES_MS } from './src/ambush-fissure-fixture.mjs';
import { runCollisionProbe } from './src/collision-benchmark.mjs';
import { runCollisionFixtureSuite } from './src/collision-fixtures.mjs';
import { runDynamicCollisionSuite } from './src/dynamic-collision-benchmark.mjs';
import { demoTunnelTarget } from './src/demo-tunnel.mjs';
import { demoCraterTarget } from './src/demo-crater.mjs';
import { TerrainEditLedger, MATERIAL_RESISTANCE } from './src/terrain-edit-ledger.mjs';
import { applyDemoBurst } from './src/demo-burst.mjs';
import { createReplayCheckpoint, restoreReplayCheckpoint } from './src/replay-checkpoint.mjs';
import { createReplayFile, parseReplayFile, MAX_REPLAY_FILE_BYTES } from './src/replay-file.mjs';
import { terrainRayFromScreen } from './src/terrain-raycast.mjs';
import { applyTerrainSpellHit } from './src/hunt-terrain-impact.mjs';
import { TerrainTapRecognizer } from './src/terrain-tap-recognizer.mjs';
import { spawnTerrainActor, simulateTerrainActor, actorHeadClearance,
  ACTOR_PHYSICS_SCHEMA } from './src/terrain-actor.mjs';
import { projectActorDiagnostic } from './src/diagnostics/actor-proxy.mjs';
import { excavateActorSupport } from './src/actor-support-excavation.mjs';
import { V2TerrainPort } from './src/terrain-integration-port.mjs';
import { attachTerrainConsumerProbes } from './src/terrain-consumer-probes.mjs';

const build = document.querySelector('#build');
build.textContent = `v${VERSION} · ${COMMIT === 'local' ? 'local build' : COMMIT.slice(0, 7)}`;
build.title = `Voxel Engine V2 ${VERSION} | commit ${COMMIT}`;

// Grass 002 remains an opt-in lab material until visual approval.
let grassMaterialImage = null;
const referenceTerrainToggle = document.querySelector('#reference-terrain-toggle');
let referenceTerrainEnabled = false;
referenceTerrainToggle.addEventListener('click', () => {
  if (!gpuRenderer?.ready) {
    referenceTerrainToggle.textContent = 'WebGL2 unavailable — preview cannot start';
    return;
  }
  try {
    if (referenceTerrainEnabled) {
      gpuRenderer.clearTerrainAlbedoTiles();
    } else {
      for (const [key, kind] of Object.entries(REFERENCE_TERRAIN_KEYS)) {
        gpuRenderer.setTerrainAlbedoTile(key, createReferenceTerrainCanvas(kind));
        for (const channel of ['normal', 'orm']) {
          const mapKey = key.replace(/\/albedo$/, '/' + channel);
          gpuRenderer.setTerrainMaterialTile(channel, mapKey,
            createReferenceMaterialCanvas(kind, channel));
        }
      }
    }
    referenceTerrainEnabled = !referenceTerrainEnabled;
    referenceTerrainToggle.setAttribute('aria-pressed', String(referenceTerrainEnabled));
    referenceTerrainToggle.textContent = 'Preview reference terrain textures: ' +
      (referenceTerrainEnabled ? 'On (temporary artwork)' : 'Off');
    dirty = true;
  } catch (error) {
    referenceTerrainToggle.textContent = 'Texture preview error: ' + error.message;
  }
});
const grassFile = document.querySelector('#grass-texture-file');
const grassDensity = document.querySelector('#grass-density');
const grassStatus = document.querySelector('#grass-material-status');
grassFile.addEventListener('change', async () => {
  const file = grassFile.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.width !== 1024 || image.height !== 1024) {
      throw new RangeError('Expected an original 1024×1024 PNG');
    }
    if (!gpuRenderer?.ready) throw new Error('WebGL2 renderer unavailable');
    gpuRenderer.setGrassMaterial(image, Number(grassDensity.value));
    grassMaterialImage = image;
    grassStatus.textContent = 'Grass 002 on actual voxel top faces · ' + grassDensity.value + ' px/voxel';
    dirty = true;
  } catch (error) {
    grassStatus.textContent = 'Grass texture not applied: ' + error.message;
  } finally {
    URL.revokeObjectURL(url);
  }
});
grassDensity.addEventListener('change', () => {
  if (!grassMaterialImage || !gpuRenderer?.ready) return;
  gpuRenderer.setGrassDensity(Number(grassDensity.value));
  grassStatus.textContent = 'Grass 002 on actual voxel top faces · ' + grassDensity.value + ' px/voxel';
  dirty = true;
});
const canvas = document.querySelector('#view');
const gpuCanvas = document.querySelector('#gpu-view');
const actorCanvas = document.querySelector('#actor-view');
const actorCtx = actorCanvas.getContext('2d');
const actorToggle = document.querySelector('#actor-toggle');
const actorReset = document.querySelector('#actor-reset');
const actorExcavate = document.querySelector('#actor-excavate');
const actorDpad = document.querySelector('#actor-dpad');
const ctx = canvas.getContext('2d', { alpha: false });
const state = document.querySelector('#status');
const meshAuditStatus = document.querySelector('#mesh-audit');
const meshCompareButton = document.querySelector('#mesh-compare-button');
const controlsToggle = document.querySelector('#lab-controls-toggle');
const controlsPanel = document.querySelector('#lab-controls');

function setLabControlsOpen(open) {
  controlsPanel.hidden = !open;
  controlsToggle.setAttribute('aria-expanded',String(open));
  controlsToggle.textContent = open ? 'Close ✕' : 'Controls ▾';
}

controlsToggle.addEventListener('click', () => {
  setLabControlsOpen(controlsPanel.hidden);
});
controlsPanel.addEventListener('click', event => {
  // Keep configuration selects open for multi-step test setup; dismiss the
  // overlay after buttons so the terrain is visible immediately.
  if (event.target.closest('button')) setLabControlsOpen(false);
});
document.addEventListener('pointerdown', event => {
  if (!controlsPanel.hidden && !controlsPanel.contains(event.target) &&
      !controlsToggle.contains(event.target)) {
    setLabControlsOpen(false);
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !controlsPanel.hidden) {
    setLabControlsOpen(false);
    controlsToggle.focus();
  }
});
const terrainMeshMode = document.querySelector('#terrain-mesh-mode');
const restoreReplayButton = document.querySelector('#checkpoint-restore');
const replayExportButton = document.querySelector('#replay-export');
const replayImportFile = document.querySelector('#replay-import-file');
const scenePicker = document.querySelector('#scene');
const seedPicker = document.querySelector('#seed');
const chunkPicker = document.querySelector('#chunks');
const cameraPicker = document.querySelector('#camera');
const terrainTargetMode = document.querySelector('#terrain-target-mode');
let activeCamera = getCameraPreset(cameraPicker.value).id;
let activeSeed = 7;
let activeScene = 'hill';
let world = createScene(activeScene, activeSeed, { chunkEdge: Number(chunkPicker.value) });
// A single authoritatively backed V2 port handles all lab terrain commands:
 // projectile hits, normal carves, partial damage, bursts and underfoot edits.
 // Its six subscriber fakes are V2.6 integration proof, not gameplay systems.
let terrainEpoch = 0;
let terrainEdits = null;
let terrainConsumers = null;
function installTerrainPort(nextWorld, ledger) {
  if (terrainConsumers) terrainConsumers.dispose();
  if (terrainEdits) terrainEdits.dispose();
  terrainEdits = new V2TerrainPort(nextWorld, ledger, {epoch:++terrainEpoch});
  terrainConsumers = attachTerrainConsumerProbes(terrainEdits);
}
installTerrainPort(world, new TerrainEditLedger(world));
let nextTerrainEditId = 0, nextDamageId = 0;
let cameraX = 0, cameraY = 0, baseScale = 11, scale = 11, zoomFactor = 1;
const gestures = new PointerGestures();
const terrainTaps = new TerrainTapRecognizer();
let actorEnabled = false, actor = null, actorFallen = false;
let actorPrevious = null, actorAccumulator = 0, actorSteps = 0, actorOverflowFrames = 0;
let actorStepUps = 0, actorSupportTest = null;
let actorWallContacts = 0, actorCeilingHits = 0;
let actorOverlayKey = null;
const heldActorKeys = new Set();
const heldActorButtons = new Set();

function actorInput() {
  const active = dir => heldActorKeys.has(dir) || heldActorButtons.has(dir);
  return {
    moveX: Number(active('right'))-Number(active('left')),
    moveZ: Number(active('back'))-Number(active('forward'))
  };
}

function resetActorPilot() {
  actorPrevious = null;
  actorAccumulator = 0;
  actorFallen = false;
  actorOverlayKey = null;
  actorSupportTest = null;
  actorStepUps = 0;
  actorWallContacts = 0;
  actorCeilingHits = 0;
  heldActorKeys.clear();
  heldActorButtons.clear();
  // For the arch fixture, start INSIDE its actual Z=1..3 corridor, not
  // in the foreground at Z=-5.5 where projected pixels misleadingly
  // overlap the arch even though no physical pillar is present.
  // searchTopY=6 begins below the roof at Y=8 so spawn selects the
  // opening's floor (Y=1), not the top of the lintel.
  const spawnOptions = activeScene === 'arch'
    ? { x:0.5, z:2.5, searchTopY:6 }
    : { x:-7.5, z:-5.5 };
  actor = spawnTerrainActor(world,spawnOptions);
  if (!actor) {
    actorEnabled = false;
    actorToggle.textContent = 'Actor pilot: No safe spawn';
    actorToggle.setAttribute('aria-pressed','false');
    actorReset.hidden = true;
    actorDpad.hidden = true;
    actorExcavate.disabled = true;
    meshAuditStatus.textContent = 'Actor pilot: no supported spawn found in this terrain.';
    return;
  }
  actorToggle.textContent = 'Actor pilot: On';
  actorToggle.setAttribute('aria-pressed','true');
  actorReset.hidden = false;
  actorDpad.hidden = false;
  actorExcavate.disabled = false;
  meshAuditStatus.textContent = activeScene === 'arch'
    ? 'Arch collision lane: move LEFT or RIGHT into the stone pillars. ' +
      'Their collision is at Z=1..3; up/down can exit the opening.'
    : 'Actor pilot active: move with touch arrows or WASD. ' +
      'Excavate underneath to test falling.';
}

function updateActorPhysics(now) {
  if (!actorEnabled || !actor || actorFallen || document.hidden) {
    actorPrevious = null;
    actorAccumulator = 0;
    return;
  }
  if (actorPrevious===null) {
    actorPrevious=now;
    return;
  }
  const elapsed=Math.min(0.10,Math.max(0,(now-actorPrevious)/1000));
  actorPrevious=now;
  actorAccumulator+=elapsed;
  let steps=0;
  while(actorAccumulator >= 1/60 && steps < 4) {
    const current=simulateTerrainActor(world,actor,{
      ...actorInput(),dt:1/60
    });
    if(current.error) {
      actorFallen=true;
      meshAuditStatus.textContent = 'Actor collision rejected a blocked position: ' +
        current.error + '. Press Respawn actor.';
      break;
    }
    const wasGrounded = actor.grounded;
    const previousCeilingContact = actor.ceilingContact;
    const previousWallContact = actor.wallContact;
    actor = current;
    actorSteps++;
    if (current.stepUp) actorStepUps++;
    if (current.wallContact) actorWallContacts++;
    if (current.ceilingContact && !previousCeilingContact) {
      actorCeilingHits++;
      meshAuditStatus.textContent = 'Actor head contacted solid voxel ceiling; ascent stopped.';
    }
    if (activeScene === 'arch' && current.wallContact && !previousWallContact) {
      meshAuditStatus.textContent = 'Arch pillar COLLISION: actor stopped at x=' +
        current.x.toFixed(2) + ', z=' + current.z.toFixed(2) +
        '. Exit the corridor using up/down to walk around it.';
    }
    if (actorSupportTest?.status === 'committed') {
      if (!current.grounded) {
        actorSupportTest.status = 'falling';
        actorSupportTest.firstAirborneStep = actorSteps;
        actorSupportTest.physicsStepsUntilFall = actorSteps -
          actorSupportTest.stepsAtCommit;
        actorSupportTest.fallStartLatencyMs = Math.max(0, now -
          actorSupportTest.committedAtMs);
        actorSupportTest.meshPendingWhenFell = activeTerrainJob !== null;
      } else if (actorSteps - actorSupportTest.stepsAtCommit >= 4) {
        actorSupportTest.status = 'still-grounded';
      }
    }
    if (actorSupportTest?.status === 'falling' && !wasGrounded && current.grounded) {
      actorSupportTest.status = 'landed';
      actorSupportTest.landingY = current.y;
      actorSupportTest.fallDistance = Math.max(0,
        actorSupportTest.actorPosition.y - current.y);
      actorSupportTest.stepsUntilLanding = actorSteps - actorSupportTest.stepsAtCommit;
      actorSupportTest.landedWorldRevision = world.revision;
      meshAuditStatus.textContent = 'Actor landed after a ' +
        actorSupportTest.fallDistance.toFixed(2) + '-voxel fall on committed terrain.';
    }
    actorAccumulator-=1/60;
    steps++;
    if (actor.y < -12) {
      if (actorSupportTest?.status === 'falling') {
        actorSupportTest.status = 'fell-out';
        actorSupportTest.fallDistance = actorSupportTest.actorPosition.y-actor.y;
      }
      actorFallen=true;
      meshAuditStatus.textContent = 'Actor fell below the test world. ' +
        'Collision followed committed terrain; press Respawn actor.';
      break;
    }
  }
  if (actorAccumulator >= 1/60) {
    actorOverflowFrames++;
    actorAccumulator = 0; // Bounded catch-up; never freeze a slow iPhone.
  }
}

function drawActorOverlay() {
  const pos=actorEnabled && actor ? actor : null;
  const key=pos ? [
    pos.x.toFixed(4),pos.y.toFixed(4),pos.z.toFixed(4),
    activeCamera,scale,cameraX,cameraY,
    actorCanvas.width,actorCanvas.height,actorFallen
  ].join('|') : 'off';
  if (key===actorOverlayKey) return;
  actorOverlayKey=key;
  actorCtx.clearRect(0,0,actorCanvas.width,actorCanvas.height);
  if (!pos || actorFallen) return;

  const proxy=projectActorDiagnostic(pos,{
    width:actorCanvas.width,height:actorCanvas.height,
    scale,panX:cameraX,panY:cameraY,camera:activeCamera
  });
  const dpr=actorCanvas.width/Math.max(1,actorCanvas.clientWidth);

  // Lab-only physics debug prism. These 12 projected edges are exactly
  // the swept actor's X/Y/Z box, not a Character Visibility/occlusion mask.
  // Render it on the Arch scene to make the true solid volume inspectable.
  if (activeScene === 'arch') {
    actorCtx.save();
    actorCtx.strokeStyle='rgba(165,230,238,0.55)';
    actorCtx.lineWidth=Math.max(0.75,dpr*0.6);
    actorCtx.setLineDash([2*dpr,2*dpr]);
    for (const [a,b] of proxy.boxEdges) {
      actorCtx.beginPath();
      actorCtx.moveTo(a.x,a.y);
      actorCtx.lineTo(b.x,b.y);
      actorCtx.stroke();
    }
    actorCtx.restore();
  }

  // The complete character marker fits inside the collider's projected
  // vertical height. Never use a minimum-height sprite or add a head above
  // the box: those two previous shortcuts made the head appear inside rock.
  actorCtx.lineWidth=Math.max(0.8,dpr*0.65);
  actorCtx.strokeStyle='#10222b';
  actorCtx.fillStyle=pos.grounded ? '#f3d48d' : '#ffb982';
  const {torso,head,foot}=proxy;
  actorCtx.beginPath();
  actorCtx.roundRect(torso.x,torso.y,torso.width,torso.height,
    Math.min(head.radius,torso.width/3));
  actorCtx.fill();
  actorCtx.stroke();
  actorCtx.fillStyle='#f4f8ff';
  actorCtx.beginPath();
  actorCtx.arc(head.x,head.y,head.radius,0,Math.PI*2);
  actorCtx.fill();
  actorCtx.stroke();
  // Thin foot locator distinguishes the tiny true-scale proxy, without
  // making a fake head or changing any authoritative collision geometry.
  actorCtx.beginPath();
  actorCtx.strokeStyle='rgba(197,250,234,0.65)';
  actorCtx.ellipse(foot.x,foot.y,Math.max(1.5,torso.width*.5),
    Math.max(0.7,torso.width*.15),0,0,Math.PI*2);
  actorCtx.stroke();
}

let dirty = true, previous = null, lastStatusAt = 0, visibleSurfaces = 0;
const frameMetrics = new FrameMetrics();
// CPU-side work executed inside requestAnimationFrame, not browser wait or GPU driver execution.
const frameWorkMetrics = new FrameMetrics();
const sustainedTelemetry = new SustainedTelemetry();
let lastMeshAudit = null;
let lastMeshComparison = null;
let lastMeshWorker = null;
let compareWorker = null, compareJob = null, compareJobId = 0;
let lastCarve = null;
let lastCrater = null;
let lastTunnel = null;
let lastBurst = null, nextBurstId = 0;
let lastDamage = null;
let lastTargetedImpact = null;
let replayCheckpoint = null, replayCounters = null, lastReplay = null;

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
let lastTerrainWorker = null;
let terrainWorkerWarmupMs = null, terrainWorkerSession = null;
let activeTerrainJob = null, terrainJobId = 0;
let queuedUploadStartedAt = null;
const pendingTerrainDirty = new Set();

function fallbackTerrainMeshes(reason) {
  const affectedChunks = new Set(pendingTerrainDirty);
  meshCompareButton.disabled = false;
  if (affectedChunks.size) rebuildGpuMeshes(affectedChunks);
  pendingTerrainDirty.clear();
  lastTerrainWorker = { status:'fallback', reason, chunksUpdated:affectedChunks.size };
  meshAuditStatus.textContent = 'Background unavailable (' + reason +
    '); safe synchronous terrain meshing restored.';
}

function terrainSession() {
  if (terrainWorkerSession) return terrainWorkerSession;
  terrainWorkerSession = new TerrainWorkerSession({
    createWorker:() => new Worker(new URL('./src/terrain-mesh.worker.mjs', import.meta.url),
      {type:'module'}),
    now:() => performance.now(),
    onWarm:warmMs => {
      terrainWorkerWarmupMs = warmMs;
      if (terrainMeshMode.value === 'worker' && !activeTerrainJob) {
        meshAuditStatus.textContent = 'Background terrain worker ready (' +
          warmMs.toFixed(1) + 'ms warm-up). Carve sphere to compare.';
      }
    },
    onResult:(reply,job,timing) => {
      const active = activeTerrainJob;
      if (!active || active.job !== job) return; // Reset, edit, or mode change.
      activeTerrainJob = null;
      meshCompareButton.disabled = false;
      if (world !== active.originWorld || terrainMeshMode.value !== 'worker') return;
      if (!isCurrentTerrainMeshReply(reply,job,world.revision)) {
        fallbackTerrainMeshes('Stale/invalid worker mesh result');
        return;
      }
      try {
        gpuRenderer.queueReplacementMeshes(new Set(job.dirtyIds), reply.meshes);
        queuedUploadStartedAt = active.startedAt;
        const gpuUploadMs = null;
        const endToEndMs = null;
        gpuBuildMs = null;
        lastMeshUpdate = {
          mode:'worker-localized', chunksUpdated:job.dirtyIds.length,
          worldChunks:world.chunkCount, elapsedMs:endToEndMs,
          workerCpuMs:reply.cpuMs, gpuUploadMs,
          uploadedCpuMeshBytes:reply.meshBytes
        };
        lastTerrainWorker = {
          status:'upload-queued', snapshotBytes:job.snapshotBytes,
          chunksUpdated:job.dirtyIds.length, snapshotPrepareMs:active.snapshotPrepareMs,
          wasWarmAtSubmission:timing.wasWarmAtSubmission,
          workerWarmupMs:timing.warmupMs,
          waitForReadyMs:timing.waitForReadyMs,
          workerRoundTripMs:timing.workerRoundTripMs,
          workerCpuMs:reply.cpuMs, gpuUploadMs, endToEndMs
        };
        pendingTerrainDirty.clear();
        meshAuditStatus.textContent =
          'Background mesh (' + (timing.wasWarmAtSubmission ? 'warm' : 'cold') +
          '): ' + job.dirtyIds.length + ' chunks · CPU ' +
          reply.cpuMs.toFixed(1) + 'ms · GPU upload queued (2ms/frame budget)';
        dirty = true;
      } catch (error) {
        fallbackTerrainMeshes(error.message);
      }
    },
    onFailure:(reason,job) => {
      const active = activeTerrainJob;
      activeTerrainJob = null;
      meshCompareButton.disabled = false;
      if (terrainMeshMode.value !== 'worker') return;
      // Do not keep retrying a failing worker on every subsequent edit.
      terrainMeshMode.value = 'sync';
      if (active && (!job || active.job === job) && world === active.originWorld) {
        fallbackTerrainMeshes(reason);
      } else {
        meshAuditStatus.textContent = 'Background worker failed (' + reason +
          '); switched to safe Baseline mode.';
      }
    }
  });
  return terrainWorkerSession;
}

function cancelTerrainWorker({ dispose = false } = {}) {
  gpuRenderer?.cancelQueuedUploads();
  queuedUploadStartedAt = null;
  terrainJobId++;
  activeTerrainJob = null;
  if (terrainWorkerSession) {
    if (dispose) {
      terrainWorkerSession.close();
      terrainWorkerSession = null;
      terrainWorkerWarmupMs = null;
    } else {
      // An idle worker remains prewarmed. Any in-flight work is terminated.
      if (terrainWorkerSession.cancel()) terrainWorkerWarmupMs = null;
    }
  }
  meshCompareButton.disabled = false;
}

function updateTerrainMeshes() {
  if (!pendingTerrainDirty.size) return;
  const affectedChunks = new Set(pendingTerrainDirty);
  if (terrainMeshMode.value !== 'worker' || typeof Worker !== 'function' || !gpuRenderer) {
    fallbackTerrainMeshes(terrainMeshMode.value !== 'worker'
      ? 'baseline selected' : 'worker or WebGL2 unavailable');
    return;
  }
  const startedAt = performance.now();
  try {
    const job = createTerrainMeshJob(world, affectedChunks, ++terrainJobId);
    const snapshotPrepareMs = performance.now() - startedAt;
    const session = terrainSession();
    activeTerrainJob = { job, originWorld:world, startedAt, snapshotPrepareMs };
    meshCompareButton.disabled = true;
    lastTerrainWorker = {
      status:'running', snapshotBytes:job.snapshotBytes,
      chunksUpdated:job.dirtyIds.length,
      wasWarmAtSubmission:session.ready, snapshotPrepareMs
    };
    session.submit(job);
  } catch (error) {
    cancelTerrainWorker({dispose:true});
    terrainMeshMode.value = 'sync';
    fallbackTerrainMeshes(error.message);
  }
}

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
    ` · >50ms: ${frames.hitchesOver50Ms}/${frames.count}` +
    (actorEnabled && actor
      ? ` · actor x=${actor.x.toFixed(2)} y=${actor.y.toFixed(2)} z=${actor.z.toFixed(2)} ${actorFallen?'fell':actor.grounded?'grounded':'falling'}${actor.wallContact?' · WALL':''}` +
        (activeScene === 'arch'
          ? ` · overhead clearance ${actorHeadClearance(world,actor).distance.toFixed(2)}v`
          : '')
      : '');
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
  actorCanvas.width = canvas.width;
  actorCanvas.height = canvas.height;
  actorOverlayKey = null;
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

// Camera presets use the same live WebGL terrain, not image-based approximations.
for (const button of document.querySelectorAll('[data-grass-zoom]')) {
  button.addEventListener('click', () => {
    const target = Number(button.dataset.grassZoom);
    if (!Number.isFinite(target) || target < 0.55 || target > 2.5) return;
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, target / zoomFactor);
  });
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


const presetRunButton = document.querySelector('#preset-run');
const soakRunButton = document.querySelector('#soak-run');
const ambushRunButton = document.querySelector('#ambush-run');
const fissureRunButton = document.querySelector('#fissure-run');
const phoneStressLevel = document.querySelector('#phone-stress-level');
const PHONE_STRESS_PROFILES = Object.freeze({
  current:{label:'Current device',cpuContentionMs:0,uploadBudgetMs:2},
  older:{label:'Older mid-range (synthetic)',cpuContentionMs:2,uploadBudgetMs:1},
  low:{label:'Older low-end (synthetic)',cpuContentionMs:5,uploadBudgetMs:0.5}
});
const collisionPresetRunButton = document.querySelector('#collision-preset-run');
const collisionFixturesButton = document.querySelector('#collision-fixtures-run');
const dynamicCollisionButton = document.querySelector('#dynamic-collision-run');
const presetStopButton = document.querySelector('#preset-stop');
const presetProgress = document.querySelector('#preset-progress');
let preset = null;
let lastPresetReport = null;
let presetDamageTarget = null;
let ambush = null;
let lastAmbushReport = null;
let fissureRun = null;
let lastFissureReport = null;
function finishFissures(status, reason) {
  if (!fissureRun) return;
  lastFissureReport = {
    schema:'voxel-v2.fissure-acceptance.v1',status,reason,
    fissures:fissureRun.sites.length,stages:fissureRun.results,
    durationMs:Math.round(performance.now()-fissureRun.startedAt),
    removedVoxels:fissureRun.results.reduce((sum,s)=>sum+s.removedVoxels,0),
    workerMode:terrainMeshMode.value,scene:activeScene,
    stressProfile:fissureRun.profileName,stressConstraints:fissureRun.profile,
    simulationCaveat:'Synthetic main-thread contention and upload budget only; not a hardware or thermal emulator',
    gravityIncluded:false,enemyRenderingIncluded:false,vfxIncluded:false
  };
  fissureRun = null;
  fissureRunButton.disabled = false;
  presetProgress.textContent = 'Fissure test ' + status + ' · ' + reason;
  if (status === 'complete') document.querySelector('#report').click();
}
function advanceFissures(now) {
  if (!fissureRun) return;
  if (document.hidden || gpuError || terrainMeshMode.value !== 'worker') {
    finishFissures('stopped','Backgrounded, renderer error, or worker unavailable');
    return;
  }
  const stage = fissureRun.results.length;
  if (stage === 3) {
    if (!activeTerrainJob && pendingTerrainDirty.size === 0 && !gpuRenderer?.pendingUploads) {
      finishFissures('complete','Three synchronized stages and uploads drained');
    }
    return;
  }
  if (now < fissureRun.startedAt + 1000 + FISSURE_STAGE_TIMES_MS[stage]) return;
  try {
    const startedAt = performance.now();
    const result = applyFissureStage(world,terrainEdits,stage,fissureRun.sites);
    fissureRun.results.push({...result,editCpuMs:performance.now()-startedAt,
      stageElapsedMs:Math.round(now-fissureRun.startedAt-1000)});
    if (result.dirtyChunks.length) {
      cancelTerrainWorker();
      invalidateMeshAudit();
      for (const id of result.dirtyChunks) pendingTerrainDirty.add(id);
      updateTerrainMeshes();
      dirty = true;
    }
    presetProgress.textContent = 'Fissures · stage ' + (stage+1) + '/3 · ' +
      result.removedVoxels + ' voxels removed';
  } catch (error) {
    finishFissures('failed',error.message);
  }
}
fissureRunButton.addEventListener('click', () => {
  if (preset || ambush || fissureRun) return;
  scenePicker.value = 'hunt-load';
  seedPicker.value = '7';
  chunkPicker.value = '32';
  cameraPicker.value = 'hunt';
  terrainMeshMode.value = 'worker';
  chooseScene();
  cameraPicker.dispatchEvent(new Event('change'));
  if (terrainMeshMode.value !== 'worker' || !gpuRenderer?.ready) {
    presetProgress.textContent = 'Fissure test requires WebGL2 and worker';
    return;
  }
  lastFissureReport = null;
  const profileName = phoneStressLevel.value;
  const profile = PHONE_STRESS_PROFILES[profileName];
  if (!profile) throw new Error('Unknown phone stress profile');
  fissureRun = {startedAt:performance.now(),sites:fissureSites(18),results:[],profileName,profile};
  fissureRunButton.disabled = true;
  setLabControlsOpen(false);
  presetProgress.textContent = '18 fissures · ' + profile.label + ' · synchronized eruption';
});
function finishAmbush(status, reason) {
  if (!ambush) return;
  lastAmbushReport = {
    schema:'voxel-v2.ambush-stress.v1', status, reason,
    scene:'hunt-load', seed:activeSeed, waves:3, sitesPerWave:18,
    impacts:ambush.impacts, changedImpacts:ambush.changedImpacts,
    rejectedImpacts:ambush.rejectedImpacts,
    elapsedMs:Math.round(performance.now()-ambush.startedAt),
    workerMode:terrainMeshMode.value, chunks:world.chunkCount,
    voxelPayloadBytes:world.allocatedVoxelBytes,
    terrainOnly:true, enemyRenderingIncluded:false, vfxIncluded:false
  };
  ambush = null;
  ambushRunButton.disabled = false;
  presetProgress.textContent = 'Ambush ' + status + ' · ' + lastAmbushReport.impacts + '/54 impacts';
  if (status === 'complete') document.querySelector('#report').click();
}
function advanceAmbush(now) {
  if (!ambush) return;
  if (document.hidden || gpuError || terrainMeshMode.value !== 'worker') {
    finishAmbush('stopped','Backgrounded, renderer error, or worker unavailable');
    return;
  }
  if (ambush.impacts >= 54) {
    if (!activeTerrainJob && pendingTerrainDirty.size === 0 && !gpuRenderer?.pendingUploads) {
      finishAmbush('complete','All 3 waves completed and upload queue drained');
    }
    return;
  }
  if (now < ambush.nextImpactAt) return;
  const index = ambush.impacts;
  presetDamageTarget = spatialDamageTarget(world,index % 18);
  const before = terrainEdits.editRevision;
  const revision = world.revision;
  document.querySelector('#damage').click();
  presetDamageTarget = null;
  ambush.impacts++;
  if (terrainEdits.editRevision === before) ambush.rejectedImpacts++;
  if (world.revision > revision) ambush.changedImpacts++;
  ambush.nextImpactAt = now + (ambush.impacts % 18 === 0 ? 3500 : 650);
  presetProgress.textContent = 'Ambush wave ' + (Math.ceil(ambush.impacts/18)) +
    '/3 · ' + ambush.impacts + '/54 impacts · ' + ambush.changedImpacts + ' terrain changes';
}
ambushRunButton.addEventListener('click', () => {
  if (preset || ambush) return;
  scenePicker.value = 'hunt-load';
  seedPicker.value = '7';
  chunkPicker.value = '32';
  cameraPicker.value = 'hunt';
  terrainMeshMode.value = 'worker';
  terrainTargetMode.value = 'spell';
  chooseScene();
  cameraPicker.dispatchEvent(new Event('change'));
  if (terrainMeshMode.value !== 'worker' || !gpuRenderer?.ready) {
    presetProgress.textContent = 'Ambush requires WebGL2 and background worker';
    return;
  }
  lastAmbushReport = null;
  const now = performance.now();
  ambush = {startedAt:now,nextImpactAt:now+1000,impacts:0,changedImpacts:0,rejectedImpacts:0};
  ambushRunButton.disabled = true;
  controlsPanel.hidden = true;
  controlsToggle.setAttribute('aria-expanded','false');
  presetProgress.textContent = 'Ambush · starting 3 × 18 impact waves';
});
function stopPreset(reason = 'Stopped', completed = false) {
  if (!preset) return;
  const run = preset;
  // Preserve the final sample even if the duration boundary falls between ticks.
  if (run.profile.resetBetweenCycles) sampleSustainedTelemetry(performance.now(), true);
  const elapsedMs = Math.max(0, performance.now() - run.startedAt);
  const frameSession = frameMetrics.sessionSummary();
  const telemetryContinuity = sustainedTelemetry.report();
  const timingReviewNeeded = frameSession.longAnimationFrameGaps > 0 ||
    telemetryContinuity.samplingGapCount > 0;
  const queuesDrained = !activeTerrainJob && pendingTerrainDirty.size === 0 &&
    !gpuRenderer?.pendingUploads;
  const expectedResets = run.profile.resetBetweenCycles
    ? Math.ceil(run.profile.durationMs / SOAK_CYCLE_MS) - 1 : 0;
  const validCompletion = completed && elapsedMs >= run.profile.durationMs &&
    run.cycleResets === expectedResets && queuesDrained &&
    run.changedImpacts > 0 && run.rejectedImpacts === 0 && !gpuError;
  lastPresetReport = {
    schema: run.profile.resetBetweenCycles ? 'voxel-v2.mobile-soak.v1' : 'voxel-v2.preset.v1',
    status: completed ? 'complete' : 'stopped',
    reason, elapsedMs: Math.round(elapsedMs), impacts: run.impacts,
    changedImpacts: run.changedImpacts, removedVoxels: run.removedVoxels,
    uniqueSites: run.sites.size, rejectedImpacts: run.rejectedImpacts,
    verdict: run.profile.resetBetweenCycles
      ? (validCompletion ? 'evidence-captured' : 'incomplete')
      : (validCompletion ? 'pass' : 'incomplete'),
    profile: run.profile.id, plannedDurationMs: run.profile.durationMs,
    completedSceneResets: run.cycleResets, expectedSceneResets: expectedResets,
    queuesDrained, seed: 7, scene: 'hill', meshing: 'worker',
    timingQuality: timingReviewNeeded ? 'review-gaps' : 'no-large-gaps-observed',
    sessionFrameHitchesOver50Ms: frameSession.hitchesOver50Ms,
    frameWorkP95Ms: frameWorkMetrics.summary().p95,
    frameWorkP99Ms: frameWorkMetrics.summary().p99,
    longAnimationFrameGaps: frameSession.longAnimationFrameGaps,
    largestSamplingGapMs: telemetryContinuity.largestSamplingGapMs,
    evidenceLimits: 'Terrain-only laboratory; no enemies, VFX, structural gravity, ' +
      'GPU driver timing or automatic thermal/performance acceptance'
  };
  preset = null;
  presetDamageTarget = null;
  presetRunButton.disabled = false;
  soakRunButton.disabled = false;
  presetStopButton.disabled = true;
  presetProgress.textContent = reason + ' · ' + lastPresetReport.impacts +
    ' impacts · ' + lastPresetReport.verdict;
  // A completion from the animation frame is automatically exported, matching
  // the original preset. Interrupted evidence remains available via Export benchmark.
  if (completed || reason === 'Stopped manually' ||
      reason === 'Scene changed during soak') document.querySelector('#report').click();
}

function advancePreset(now) {
  if (!preset) return;
  if (document.hidden || gpuError || terrainMeshMode.value !== 'worker' || !gpuRenderer?.ready) {
    stopPreset(document.hidden ? 'Stopped by backgrounding' :
      'Renderer error or worker unavailable');
    return;
  }
  const elapsed = now - preset.startedAt;
  const step = describeSoakProgress(preset.profile, elapsed, preset.cycleIndex);
  const queuesDrained = !activeTerrainJob && pendingTerrainDirty.size === 0 &&
    !gpuRenderer?.pendingUploads;
  if (step.finished) {
    if (queuesDrained) {
      stopPreset('Completed', true);
    } else if (elapsed >= preset.profile.durationMs + 30_000) {
      stopPreset('Timed out waiting for GPU or worker queues to drain');
    } else {
      presetProgress.textContent = 'Finishing soak · draining worker and GPU queues';
    }
    return;
  }
  if (step.resetDue) {
    if (step.cycleIndex !== preset.cycleIndex + 1) {
      stopPreset('Missed scheduled soak cycle; incomplete evidence');
      return;
    }
    if (!queuesDrained) {
      presetProgress.textContent = 'Soak cycle ' + (step.cycleIndex + 1) +
        ' · draining uploads before safe world reset';
      return;
    }
    // This rebuild must be measured, not hidden by clearing frame percentiles
    // or the one-second samples. The renderer stages uploads and GPU disposals.
    chooseScene({ preserveMeasurements: true });
    if (terrainMeshMode.value !== 'worker' || !gpuRenderer?.ready) {
      stopPreset('Worker or WebGL2 unavailable after scene reset');
      return;
    }
    preset.cycleIndex = step.cycleIndex;
    preset.cycleResets++;
    preset.cycleImpacts = 0;
    preset.nextImpactAt = now + 650;
  }
  if (step.attacking && now >= preset.nextImpactAt) {
    presetDamageTarget = spatialDamageTarget(world, preset.cycleImpacts);
    preset.sites.add(presetDamageTarget.x + ',' + presetDamageTarget.z);
    const beforeRevision = world.revision;
    const beforeEditRevision = terrainEdits.editRevision;
    document.querySelector('#damage').click();
    if (terrainEdits.editRevision === beforeEditRevision) preset.rejectedImpacts++;
    if (world.revision > beforeRevision) preset.changedImpacts++;
    preset.removedVoxels += terrainEdits.editRevision !== beforeEditRevision
      ? (lastDamage?.removedVoxels ?? 0) : 0;
    presetDamageTarget = null;
    preset.impacts++;
    preset.cycleImpacts++;
    preset.nextImpactAt = now + 650;
  }
  if (now >= preset.nextStatusAt) {
    presetProgress.textContent = Math.floor(elapsed / 1000) + '/' +
      (preset.profile.durationMs / 1000) + ' s · ' + preset.impacts +
      ' impacts · ' + preset.cycleResets + ' resets · ' +
      (step.attacking ? 'destruction' : 'recovery');
    preset.nextStatusAt = now + 1000;
  }
}

function startPreset(profile) {
  if (preset || ambush || fissureRun) return;
  scenePicker.value = 'hill';
  seedPicker.value = '7';
  chunkPicker.value = '32';
  cameraPicker.value = 'hunt';
  terrainMeshMode.value = 'worker';
  terrainTargetMode.value = 'spell';
  chooseScene();
  cameraPicker.dispatchEvent(new Event('change'));
  if (terrainMeshMode.value !== 'worker' || !gpuRenderer?.ready) {
    presetProgress.textContent = 'Worker and WebGL2 required; soak not started';
    return;
  }
  lastPresetReport = null;
  const now = performance.now();
  preset = {
    profile, startedAt: now, nextImpactAt: now + 1000,
    nextStatusAt: now, impacts: 0, cycleImpacts: 0, cycleIndex: 0,
    cycleResets: 0, changedImpacts: 0, removedVoxels: 0,
    rejectedImpacts: 0, sites: new Set()
  };
  presetRunButton.disabled = true;
  soakRunButton.disabled = true;
  presetStopButton.disabled = false;
  setLabControlsOpen(false);
  presetProgress.textContent = profile.label + ' · 0/' + (profile.durationMs / 1000) + ' s';
}
presetRunButton.addEventListener('click', () => startPreset(SOAK_PROFILES.short));
soakRunButton.addEventListener('click', () => startPreset(SOAK_PROFILES.sustained));
presetStopButton.addEventListener('click', () => stopPreset('Stopped manually'));
dynamicCollisionButton.addEventListener('click', () => {
  if (preset) {
    presetProgress.textContent = 'Stop the destruction preset before dynamic collision';
    return;
  }
  const startedAt=performance.now();
  const report=runDynamicCollisionSuite();
  lastPresetReport={...report,status:'complete',
    durationMs:Math.round(performance.now()-startedAt)};
  presetProgress.textContent='Dynamic collision: '+report.passed+'/'+report.total+
    ' passed · '+report.verdict;
  document.querySelector('#report').click();
});
collisionFixturesButton.addEventListener('click', () => {
  if (preset) {
    presetProgress.textContent = 'Stop the destruction preset before collision fixtures';
    return;
  }
  const startedAt=performance.now();
  const report=runCollisionFixtureSuite();
  lastPresetReport={...report,status:'complete',
    durationMs:Math.round(performance.now()-startedAt)};
  presetProgress.textContent='Collision fixtures: '+report.passed+'/'+report.total+
    ' passed · '+report.verdict;
  document.querySelector('#report').click();
});
collisionPresetRunButton.addEventListener('click', () => {
  if (preset) {
    presetProgress.textContent = 'Stop the destruction preset before collision checks';
    return;
  }
  // Reuse a fresh deterministic Hill fixture and authoritative collision world.
  scenePicker.value = 'hill';
  seedPicker.value = '7';
  chunkPicker.value = '32';
  cameraPicker.value = 'hunt';
  terrainMeshMode.value = 'worker';
  chooseScene();
  cameraPicker.dispatchEvent(new Event('change'));
  const startedAt = performance.now();
  const report = runCollisionProbe(world);
  lastPresetReport = {
    schema:'voxel-v2.collision-preset.v1',
    status:'complete',scene:'hill',seed:7,meshing:terrainMeshMode.value,
    durationMs:Math.round(performance.now()-startedAt),...report
  };
  presetProgress.textContent = 'Collision checks: ' + report.verdict +
    ' · ' + (report.steps ?? 0) + ' fixed steps · ' +
    (report.overlaps ?? 0) + ' overlaps';
  document.querySelector('#report').click();
});

// The terminal sample captures the exact last queue state before export.
function sampleSustainedTelemetry(now, force = false) {
  return sustainedTelemetry.record(now, {
    frames: frameMetrics.summary(),
    frameWork: frameWorkMetrics.summary(),
    queue: gpuRenderer?.uploadQueueStatistics ?? null,
    renderer: gpuRenderer?.ready ? gpuRenderer.statistics : null,
    voxelBytes: world.allocatedVoxelBytes,
    edits: terrainEdits.recordedEdits,
    pendingTerrainChunks: pendingTerrainDirty.size,
    heapBytes: performance.memory?.usedJSHeapSize ?? null
  }, { force });
}

function tick(now) {
  const frameWorkStartedAt = performance.now();
  if (fissureRun?.profile.cpuContentionMs) {
    // Deliberately synthetic contention, applied only during the acceptance run.
    const until = performance.now() + fissureRun.profile.cpuContentionMs;
    while (performance.now() < until) { /* simulated competing main-thread work */ }
  }
  // Detect an unresponsive worker before attempting any further GPU updates.
  // Host error handling switches to the existing safe baseline; never spin retries.
  if (!document.hidden) terrainWorkerSession?.pollTimeout();
  advancePreset(now);
  advanceFissures(now);
  advanceAmbush(now);
  // Observe before the upload drain; otherwise short-lived queues disappear from telemetry.
  if (!document.hidden) sustainedTelemetry.observeQueue(gpuRenderer?.uploadQueueStatistics);
  if (gpuRenderer?.pendingUploads) {
    try {
      const upload = gpuRenderer.flushQueuedUploads({budgetMs:fissureRun?.profile.uploadBudgetMs ?? 2});
      if (upload.chunks) dirty = true;
      if (!gpuRenderer.pendingUploads && lastTerrainWorker?.status === 'upload-queued') {
        const visibleMs = queuedUploadStartedAt === null ? null : performance.now() - queuedUploadStartedAt;
        lastTerrainWorker = { ...lastTerrainWorker, status:'complete',
          editToVisibleMs:visibleMs, endToEndMs:visibleMs,
          uploadQueuePeak:gpuRenderer.uploadQueueStatistics.peakChunks };
        lastMeshUpdate = { ...lastMeshUpdate, elapsedMs:visibleMs };
        meshAuditStatus.textContent = 'Background terrain uploaded · ' +
          lastTerrainWorker.chunksUpdated + ' chunks · edit-to-visible ' +
          (visibleMs === null ? 'unavailable' : visibleMs.toFixed(1) + 'ms');
        queuedUploadStartedAt = null;
      }
    } catch (error) {
      cancelTerrainWorker();
      gpuError = error.message;
      terrainMeshMode.value = 'sync';
      rebuildGpuMeshes();
    }
  }
  if (!document.hidden) sustainedTelemetry.observeQueue(gpuRenderer?.uploadQueueStatistics);
  if (previous !== null && !document.hidden) frameMetrics.record(now - previous);
  previous = document.hidden ? null : now;
  updateActorPhysics(now);
  draw();
  drawActorOverlay();
  if (!document.hidden && sustainedTelemetry.due(now)) {
    sampleSustainedTelemetry(now);
  }
  if (now - lastStatusAt >= 1000 && !document.hidden) {
    updateStatus();
    lastStatusAt = now;
  }
  // Do not include scheduling delay in the CPU-side frame-work measurement.
  if (!document.hidden) frameWorkMetrics.record(performance.now() - frameWorkStartedAt);
  requestAnimationFrame(tick);
}
function chooseScene({ preserveMeasurements = false } = {}) {
  if (preset && !preserveMeasurements) stopPreset('Scene changed during soak');
  if (ambush) finishAmbush('stopped','Scene reset');
  if (fissureRun) finishFissures('stopped','Scene reset');
  const rawSeed = seedPicker.value.trim();
  const seed = Number(rawSeed);
  if (!/^\d+$/.test(rawSeed) || !Number.isSafeInteger(seed) || seed > MAX_SCENE_SEED) {
    scenePicker.value = activeScene;
    state.textContent = `Invalid seed: enter a whole number from 0 to ${MAX_SCENE_SEED}`;
    return;
  }
  cancelTerrainWorker();
  pendingTerrainDirty.clear();
  lastTerrainWorker = null;
  world = createScene(scenePicker.value, seed, { chunkEdge: Number(chunkPicker.value) });
  installTerrainPort(world, new TerrainEditLedger(world));
  nextTerrainEditId = 0;
  nextDamageId = 0;
  nextBurstId = 0;
  lastCarve = null;
  lastCrater = null;
  lastTunnel = null;
  lastBurst = null;
  lastDamage = null;
  invalidateMeshAudit();
  rebuildGpuMeshes();
  activeScene = scenePicker.value;
  activeSeed = seed;
  if (!preserveMeasurements) {
    frameMetrics.reset();
    frameWorkMetrics.reset();
    sustainedTelemetry.reset();
    previous = null;
  }
  visibleSurfaces = 0;
  gestures.reset();
  if (actorEnabled) resetActorPilot();
  // A reset discards in-flight jobs but prewarms again for the next edit.
  if (terrainMeshMode.value === 'worker' && typeof Worker === 'function') {
    try {
      terrainSession().start();
    } catch (error) {
      terrainMeshMode.value = 'sync';
      cancelTerrainWorker({dispose:true});
      meshAuditStatus.textContent = 'Worker prewarm failed: ' + error.message;
    }
  }
  dirty = true;
}
scenePicker.addEventListener('change', chooseScene);
seedPicker.addEventListener('change', chooseScene);
chunkPicker.addEventListener('change', chooseScene);
terrainTargetMode.addEventListener('change', () => {
  terrainTaps.cancel();
  meshAuditStatus.textContent = terrainTargetMode.value === 'spell'
    ? 'Hunt targeting: tap terrain to apply a power-1 spell. Drag pans; pinch zooms.'
    : 'Terrain pan mode active. Select Target spell to test Wyrmforge projectile hits.';
});
cameraPicker.addEventListener('change', () => {
  activeCamera = getCameraPreset(cameraPicker.value).id;
  dirty = true;
  // Switching camera is presentation-only: no generation, remesh or GPU upload.
  updateStatus();
});
document.querySelector('#reset').addEventListener('click', chooseScene);
terrainMeshMode.addEventListener('change', () => {
  cancelTerrainWorker({dispose:terrainMeshMode.value !== 'worker'});
  if (terrainMeshMode.value === 'worker' && typeof Worker === 'function') {
    try {
      meshAuditStatus.textContent = 'Warming V2 terrain worker…';
      terrainSession().start();
    } catch (error) {
      terrainMeshMode.value = 'sync';
      cancelTerrainWorker({dispose:true});
      meshAuditStatus.textContent = 'Cannot warm worker (' + error.message +
        '); returned to Baseline mode.';
    }
  }
  if (pendingTerrainDirty.size) updateTerrainMeshes();
});
document.querySelector('#carve').addEventListener('click', () => {
  cancelTerrainWorker();
  const target = demoCarveTarget(activeScene);
  const edit = terrainEdits.apply({
    id: `lab-hit-${++nextTerrainEditId}`,
    type: 'carve-sphere', ...target,
    expectedRevision: world.revision
  });
  const { removedVoxels } = edit;
  lastDamage = null;
  lastCrater = null;
  lastTunnel = null;
  const dirtyChunks = new Set(edit.dirtyChunks);
  lastCarve = {
    scene: activeScene, ...target, removedVoxels,
    editId: edit.editId, editStatus: edit.status,
    changedBounds: edit.changedBounds,
    worldRevision: edit.worldRevision, dirtyChunks: edit.dirtyChunks
  };
  invalidateMeshAudit();
  // Coalesce all previously uncommitted dirty regions when a newer edit cancels
  // a worker. Otherwise earlier changed GPU chunks might be left stale.
  for (const id of dirtyChunks) pendingTerrainDirty.add(id);
  if (pendingTerrainDirty.size) updateTerrainMeshes();
  if (activeTerrainJob) {
    meshAuditStatus.textContent = `Carved ${removedVoxels} voxels. Background remesh pending for ${pendingTerrainDirty.size}/${world.chunkCount} chunks…`;
  } else if (removedVoxels === 0 && !pendingTerrainDirty.size) {
    meshAuditStatus.textContent = 'No solid voxels remain in that demo impact area; select Reset to restore terrain.';
  } else if (lastTerrainWorker?.status === 'fallback' && terrainMeshMode.value === 'sync') {
    meshAuditStatus.textContent = `Carved ${removedVoxels} voxels. Remeshed ${dirtyChunks.size}/${world.chunkCount} chunks (baseline).`;
  }
  dirty = true;
});

document.querySelector('#tunnel').addEventListener('click', () => {
  // First deterministic V2.3 tunnel fixture. No game-side tunnel tools
  // or new source of terrain truth: one command and one change event.
  const target = demoTunnelTarget(activeScene);
  const startedAt = performance.now();
  let edit;
  try {
    edit = terrainEdits.apply({
      id:`lab-hit-${++nextTerrainEditId}`, type:'carve-tunnel',
      ...target,expectedRevision:world.revision,
      expectedEditRevision:terrainEdits.editRevision
    });
  } catch (error) {
    meshAuditStatus.textContent = 'Tunnel rejected: ' + error.message;
    return;
  }
  lastTunnel = {
    scene:activeScene, ...target, ...edit,
    editCpuMs:performance.now()-startedAt
  };
  lastCarve = null;
  lastCrater = null;
  lastBurst = null;
  lastDamage = null;
  if (!edit.dirtyChunks.length) {
    meshAuditStatus.textContent = 'Tunnel found no remaining destructible stone. ' +
      'Choose Reset or another scene.';
    return;
  }
  cancelTerrainWorker();
  invalidateMeshAudit();
  for (const id of edit.dirtyChunks) pendingTerrainDirty.add(id);
  updateTerrainMeshes();
  meshAuditStatus.textContent = 'Tunnel removed ' + edit.removedVoxels +
    ' voxels in one authoritative edit. ' +
    edit.dirtyChunks.length + ' chunks invalidated; ' +
    (activeTerrainJob ? 'background geometry pending.' : 'geometry updated.');
  dirty = true;
});

document.querySelector('#crater').addEventListener('click', () => {
  const target = demoCraterTarget(activeScene);
  const startedAt = performance.now();
  let edit;
  try {
    edit = terrainEdits.apply({
      id:`lab-hit-${++nextTerrainEditId}`, type:'carve-crater',
      ...target,expectedRevision:world.revision,
      expectedEditRevision:terrainEdits.editRevision
    });
  } catch (error) {
    meshAuditStatus.textContent = 'Crater rejected: ' + error.message;
    return;
  }
  lastCrater = {
    scene:activeScene, ...target, ...edit,
    editCpuMs:performance.now()-startedAt
  };
  lastCarve = null;
  lastTunnel = null;
  lastBurst = null;
  lastDamage = null;
  if (!edit.dirtyChunks.length) {
    meshAuditStatus.textContent = 'No destructible terrain remains at the crater target. ' +
      'Choose Reset or another scene.';
    return;
  }
  cancelTerrainWorker();
  invalidateMeshAudit();
  // Keep earlier canceled worker dirty IDs in the same bounded remesh batch.
  for (const id of edit.dirtyChunks) pendingTerrainDirty.add(id);
  updateTerrainMeshes();
  meshAuditStatus.textContent = 'Real 3D crater removed ' + edit.removedVoxels +
    ' voxels; ' + edit.dirtyChunks.length + ' dirty chunks; ' +
    (activeTerrainJob ? 'worker geometry pending.' : 'mesh updated.');
  dirty = true;
});

document.querySelector('#damage').addEventListener('click', () => {
  const target = presetDamageTarget ?? demoCarveTarget(activeScene);
  const startedAt = performance.now();
  let damage;
  try {
    damage = terrainEdits.apply({
      id: `lab-damage-${++nextDamageId}`, type: 'damage-sphere',
      ...target, power: 1,
      expectedRevision: world.revision,
      expectedEditRevision: terrainEdits.editRevision
    });
  } catch (error) {
    meshAuditStatus.textContent = 'Damage pulse rejected: ' + error.message;
    return;
  }
  lastDamage = { ...target, power: 1, ...damage,
    editCpuMs: performance.now() - startedAt };
  lastCarve = null;
  lastCrater = null;
  lastTunnel = null;
  lastBurst = null;

  // Partial damage is authoritative ledger state but changes no voxel geometry.
  // Do not cancel a valid in-flight mesh job just because damage was accumulated.
  if (!damage.dirtyChunks.length) {
    meshAuditStatus.textContent = 'Damage pulse: ' + damage.damagedVoxels +
      ' voxels weakened, none destroyed; ' + damage.pendingDamageCells +
      ' partial-damage cells retained. Press again.';
    return;
  }
  cancelTerrainWorker();
  invalidateMeshAudit();
  for (const id of damage.dirtyChunks) pendingTerrainDirty.add(id);
  updateTerrainMeshes();
  if (activeTerrainJob) {
    meshAuditStatus.textContent = 'Damage pulse destroyed ' + damage.removedVoxels +
      ' voxels, weakened ' + damage.damagedVoxels + '. Background mesh pending…';
  } else if (terrainMeshMode.value === 'sync') {
    meshAuditStatus.textContent = 'Damage pulse destroyed ' + damage.removedVoxels +
      ' voxels and updated ' + damage.dirtyChunks.length + ' chunks.';
  }
  dirty = true;
});

document.querySelector('#burst').addEventListener('click', () => {
  cancelTerrainWorker();
  const startedAt = performance.now();
  let result;
  try {
    result = applyDemoBurst(world, terrainEdits, {
      scene: activeScene, runId: ++nextBurstId
    });
  } catch (error) {
    // A failed batch is not a promised atomic multi-chunk transaction.
    // Restore the renderer from authoritative voxels if an unexpected error
    // occurred partway through a batch.
    pendingTerrainDirty.clear();
    rebuildGpuMeshes();
    meshAuditStatus.textContent = 'Terrain burst failed: ' + error.message;
    return;
  }

  const editCpuMs = performance.now() - startedAt;
  lastBurst = { ...result, editCpuMs };
  lastCarve = null;
  lastCrater = null;
  lastTunnel = null;
  lastDamage = null;
  invalidateMeshAudit();
  // Exactly one mesh-update request for the union of three distinct impacts.
  // Merge with any dirty chunks carried over from canceled worker work.
  for (const id of result.dirtyChunks) pendingTerrainDirty.add(id);
  if (pendingTerrainDirty.size) updateTerrainMeshes();
  if (activeTerrainJob) {
    meshAuditStatus.textContent = `3-hit burst removed ${result.removedVoxels} voxels.
      Remeshing ${pendingTerrainDirty.size} chunks in background…`;
  } else if (result.removedVoxels === 0) {
    meshAuditStatus.textContent = '3-hit burst made no further changes; Reset to restore terrain.';
  } else {
    meshAuditStatus.textContent = `3-hit burst committed ${result.removedVoxels} voxels
      across ${result.dirtyChunks.length} dirty chunks with one geometry update.`;
  }
  dirty = true;
});

document.querySelector('#checkpoint-save').addEventListener('click', () => {
  const startedAt = performance.now();
  try {
    const checkpoint = createReplayCheckpoint({
      scene:activeScene, seed:activeSeed, world, ledger:terrainEdits
    });
    // Verify by independent V2 generator + command replay BEFORE advertising it
    // as usable. If this fails, retain any previously saved good checkpoint.
    restoreReplayCheckpoint(checkpoint);
    replayCheckpoint = checkpoint;
    replayCounters = {
      nextTerrainEditId, nextDamageId, nextBurstId
    };
    restoreReplayButton.disabled = false;
    lastReplay = {
      status:'saved-and-verified',
      schema:checkpoint.schema,
      commands:checkpoint.journal.commands.length,
      pendingDamageCells:checkpoint.pendingDamageCells,
      worldChecksum:checkpoint.checksums.world,
      damageChecksum:checkpoint.checksums.damage,
      elapsedMs:performance.now()-startedAt
    };
    meshAuditStatus.textContent = 'Replay point verified and saved in this tab: ' +
      lastReplay.commands + ' edits / ' + lastReplay.pendingDamageCells +
      ' partially damaged cells. Restore after additional edits or Reset.';
  } catch (error) {
    lastReplay = {status:'error',operation:'save',message:error.message};
    meshAuditStatus.textContent = 'Cannot save replay point: ' + error.message;
  }
});

// Only install a checkpoint after full generator + journal + geometry + partial
// damage verification. Both in-tab restore and portable-file import share this
// authority transition, so neither can apply an old worker result or GPU mesh.
function installVerifiedReplay(checkpoint, restored, counters, operation, startedAt, bytes = null) {
  cancelTerrainWorker();
  pendingTerrainDirty.clear();
  world = restored.world;
  installTerrainPort(world, restored.ledger);
  activeScene = restored.source.scene;
  activeSeed = restored.source.seed;
  scenePicker.value = activeScene;
  seedPicker.value = String(activeSeed);
  chunkPicker.value = String(restored.source.chunkEdge);
  nextTerrainEditId = counters.nextTerrainEditId;
  nextDamageId = counters.nextDamageId;
  nextBurstId = counters.nextBurstId;
  replayCheckpoint = checkpoint;
  replayCounters = { ...counters };
  restoreReplayButton.disabled = false;
  lastCarve = null;
  lastCrater = null;
  lastTunnel = null;
  lastBurst = null;
  lastDamage = null;
  lastTerrainWorker = null;
  invalidateMeshAudit();
  rebuildGpuMeshes();
  frameMetrics.reset();
  previous = null;
  gestures.reset();
  if (actorEnabled) resetActorPilot();
  if (terrainMeshMode.value === 'worker' && typeof Worker === 'function') {
    try {
      terrainSession().start();
    } catch (error) {
      terrainMeshMode.value = 'sync';
      cancelTerrainWorker({dispose:true});
    }
  }
  lastReplay = {
    status: operation,
    schema: checkpoint.schema,
    commands: checkpoint.journal.commands.length,
    pendingDamageCells: checkpoint.pendingDamageCells,
    worldChecksum: checkpoint.checksums.world,
    damageChecksum: checkpoint.checksums.damage,
    elapsedMs: performance.now() - startedAt,
    ...(bytes === null ? {} : { portableFileBytes: bytes })
  };
  meshAuditStatus.textContent = 'Verified ' +
    (operation === 'file-imported' ? 'portable file imported' : 'replay restored') +
    ': ' + lastReplay.commands + ' edits and ' +
    lastReplay.pendingDamageCells + ' partial-damage cells. Terrain rebuilt.';
  dirty = true;
}

restoreReplayButton.addEventListener('click', () => {
  if (!replayCheckpoint) return;
  const startedAt = performance.now();
  let restored;
  try {
    // Fail closed without changing current world or live buffers.
    restored = restoreReplayCheckpoint(replayCheckpoint);
  } catch (error) {
    lastReplay = {status:'error', operation:'restore', message:error.message};
    meshAuditStatus.textContent = 'Replay restore rejected: ' + error.message;
    return;
  }
  installVerifiedReplay(replayCheckpoint, restored, replayCounters, 'restored', startedAt);
});

// Keep export a normal click, and import a real visible native file control.
 // iPhone Safari must receive its file-picker gesture directly; a select
 // change -> hidden input.click() is not a reliable gesture chain.
replayExportButton.addEventListener('click', () => {
  const startedAt = performance.now();
  try {
    const text = createReplayFile({
      scene:activeScene, seed:activeSeed, world, ledger:terrainEdits
    });
    const bytes = new TextEncoder().encode(text).byteLength;
    const url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `voxel-v2-${activeScene}-s${activeSeed}-c${world.chunkEdge}-replay.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    lastReplay = {
      status:'file-exported', commands:terrainEdits.recordedEdits,
      pendingDamageCells:terrainEdits.pendingDamageCells,
      portableFileBytes:bytes, elapsedMs:performance.now()-startedAt
    };
    meshAuditStatus.textContent = 'Portable replay exported: ' +
      lastReplay.commands + ' edits / ' + bytes + ' bytes. Keep the JSON file.';
  } catch (error) {
    lastReplay = {status:'file-error',operation:'export',message:error.message};
    meshAuditStatus.textContent = 'Replay export rejected: ' + error.message;
  }
});

replayImportFile.addEventListener('change', async () => {
  const file = replayImportFile.files?.[0];
  if (!file) return;
  const startedAt = performance.now();
  replayImportFile.disabled = true;
  try {
    if (!file.size || file.size > MAX_REPLAY_FILE_BYTES) {
      throw new RangeError('Replay file must be 1–256 KiB');
    }
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder('utf-8', {fatal:true}).decode(buffer);
    // parseReplayFile verifies schema, limits, journal fingerprints, voxel
    // geometry and pending damage, creating a separate fresh V2 world.
    const parsed = parseReplayFile(text);
    installVerifiedReplay(parsed.checkpoint, parsed.restored, parsed.counters,
      'file-imported', startedAt, parsed.bytes);
  } catch (error) {
    // No live authority, renderer or last-good replay point is changed.
    lastReplay = {status:'file-error',operation:'import',message:error.message};
    meshAuditStatus.textContent = 'Replay import rejected: ' + error.message +
      '. Current terrain was retained.';
  } finally {
    replayImportFile.disabled = false;
    replayImportFile.value = ''; // Allow reselecting the same file.
  }
});

const contextRecoveryButton = document.querySelector('#context-recovery-test');
let contextRecoveryTest = { supported: null, attempts: 0, lastAction: null };
contextRecoveryButton.addEventListener('click', () => {
  const action = gpuRenderer?.ready ? 'lose' : 'restore';
  const supported = gpuRenderer?.simulateContextTransition(action) ?? false;
  contextRecoveryTest = {
    supported, attempts: contextRecoveryTest.attempts + 1,
    lastAction: supported ? action : 'unsupported'
  };
  contextRecoveryButton.textContent = action === 'lose' ? 'Restore WebGL context' : 'Lose WebGL context';
  if (!supported) {
    contextRecoveryButton.textContent = 'Context loss unsupported';
    contextRecoveryButton.disabled = true;
  }
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
    frames, frameSession:frameMetrics.sessionSummary(),
    frameWork:frameWorkMetrics.summary(),
    frameWorkSession:frameWorkMetrics.sessionSummary(),
    sustainedTelemetry:sustainedTelemetry.report(), fissureScenario:lastFissureReport ?? (fissureRun ? {schema:'voxel-v2.fissure-acceptance.v1',status:'running',stages:fissureRun.results} : null),
    ambushScenario:lastAmbushReport ?? (ambush ? {schema:'voxel-v2.ambush-stress.v1',status:'running',impacts:ambush.impacts,changedImpacts:ambush.changedImpacts,elapsedMs:Math.round(performance.now()-ambush.startedAt)} : null),
    presetScenario:lastPresetReport ?? (preset ? {schema:'voxel-v2.preset.v1',status:'running',impacts:preset.impacts,elapsedMs:Math.round(performance.now()-preset.startedAt)} : null),
    chunkEdge:world.chunkEdge, chunks:world.chunkCount,
    voxelPayloadBytes:world.allocatedVoxelBytes, revision:world.revision,
    meshAudit:lastMeshAudit, meshComparison:lastMeshComparison, meshWorker:lastMeshWorker, lastCarve, lastCrater, lastTunnel, lastBurst,
    lastDamage, lastTargetedImpact, terrainInteractionMode:terrainTargetMode.value,
    labControlsOpen: !controlsPanel.hidden,
    actorPilot:{schema:ACTOR_PHYSICS_SCHEMA,enabled:actorEnabled,
      actor,fallen:actorFallen,simulatedSteps:actorSteps,stepUps:actorStepUps,
      wallContactSteps:actorWallContacts,ceilingHits:actorCeilingHits,
      archFixtureLane:activeScene === 'arch' ? 'z=1..3' : null,
      headClearance:actorEnabled && actor ? actorHeadClearance(world,actor) : null,
      visualProxy:'true projected V2 collider; no pixel occlusion',
      supportExcavation:actorSupportTest,
      catchUpOverflowFrames:actorOverflowFrames,
      input:actorInput(), model:'bounded swept AABB / fixed 60Hz',
      overlay:'diagnostic Canvas2D, not final actor art'},
    lastReplay, replayPointAvailable:replayCheckpoint !== null,
    terrainIntegration:{...terrainEdits.metrics(),
      probes:terrainConsumers.report()},
    damageLedger:{ editRevision:terrainEdits.editRevision,
      pendingDamageCells:terrainEdits.pendingDamageCells,
      resistanceByMaterial:MATERIAL_RESISTANCE },
    terrainMeshingMode:terrainMeshMode.value, terrainWorker:lastTerrainWorker,
    terrainWorkerWarmupMs, pendingTerrainChunks:pendingTerrainDirty.size,
    contextRecoveryTest,
    gpuUploadQueue:gpuRenderer?.uploadQueueStatistics ?? null,
    acceptedTerrainEditIds:terrainEdits.recordedEdits,
    renderer: gpuRenderer?.ready ? gpuRenderer.statistics : { renderer:'Canvas2D fallback' },
    cpuMeshAndUploadMs:gpuBuildMs, lastMeshUpdate, rendererError:gpuError,
    caveat:'Portable replay files can be exported/imported, but require manual file storage. Imports are bounded and checksum-verified, not cryptographically authenticated. GPU operations are synchronous individually; uploads and scene disposal use bounded per-frame queues but are not GPU-time guarantees.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download='voxel-v2-report.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
function applyHuntSpellTap(tap) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const start = performance.now();
  try {
    const ray = terrainRayFromScreen({
      x:tap.x*canvas.width/rect.width,
      y:tap.y*canvas.height/rect.height,
      width:canvas.width,height:canvas.height,scale,
      panX:cameraX,panY:cameraY,camera:activeCamera
    });
    const impact = applyTerrainSpellHit(world, terrainEdits, {
      id:`lab-damage-${++nextDamageId}`,
      ray, radius:2.5, power:1
    });
    lastTargetedImpact = {
      ...impact, screenCss:tap, editCpuMs:performance.now()-start
    };
    lastCarve = null;
    lastBurst = null;
    lastDamage = null;
    if (impact.status === 'miss') {
      meshAuditStatus.textContent = 'Spell missed solid terrain. Try tapping a visible hill or cliff.';
      return;
    }
    if (!impact.dirtyChunks.length) {
      meshAuditStatus.textContent = 'Spell hit voxel (' +
        [impact.hit.cell.x,impact.hit.cell.y,impact.hit.cell.z].join(',') +
        '): ' + impact.damagedVoxels + ' partially damaged, no geometry removed yet.';
      return;
    }
    cancelTerrainWorker();
    invalidateMeshAudit();
    for (const chunkId of impact.dirtyChunks) pendingTerrainDirty.add(chunkId);
    updateTerrainMeshes();
    meshAuditStatus.textContent = 'Targeted spell removed ' +
      impact.removedVoxels + ' voxels at (' +
      [impact.hit.cell.x,impact.hit.cell.y,impact.hit.cell.z].join(',') +
      '), ' + impact.dirtyChunks.length + ' dirty chunks.';
    dirty = true;
  } catch (error) {
    meshAuditStatus.textContent = 'Terrain spell targeting failed: ' + error.message;
  }
}

actorToggle.addEventListener('click', () => {
  actorEnabled = !actorEnabled;
  if (actorEnabled) {
    resetActorPilot();
  } else {
    actor = null;
    actorFallen = false;
    heldActorKeys.clear();
    heldActorButtons.clear();
    actorToggle.textContent = 'Actor pilot: Off';
    actorToggle.setAttribute('aria-pressed','false');
    actorReset.hidden = true;
    actorDpad.hidden = true;
    actorExcavate.disabled = true;
    actorSupportTest = null;
    actorOverlayKey = null;
  }
  drawActorOverlay();
});
actorReset.addEventListener('click', () => {
  actorEnabled = true;
  resetActorPilot();
  drawActorOverlay();
});
actorExcavate.addEventListener('click', () => {
  if (!actorEnabled || !actor || actorFallen || !actor.grounded) {
    meshAuditStatus.textContent = 'Excavation requires a grounded actor. Respawn first.';
    return;
  }
  const startedAt = performance.now();
  let changedSupport;
  try {
    // Use an existing journal ID family so saves/restores preserve uniqueness.
    changedSupport = excavateActorSupport(world,terrainEdits,actor,
      `lab-hit-${++nextTerrainEditId}`);
  } catch (error) {
    meshAuditStatus.textContent = 'Cannot excavate actor support: ' + error.message;
    return;
  }
  actorSupportTest = {
    ...changedSupport,
    status:changedSupport.status === 'accepted' && changedSupport.supportAfter === 0
      ? 'committed' : changedSupport.status,
    committedAtMs:performance.now(),
    editCpuMs:performance.now()-startedAt,
    stepsAtCommit:actorSteps
  };
  if (changedSupport.dirtyChunks.length) {
    cancelTerrainWorker();
    invalidateMeshAudit();
    for (const id of changedSupport.dirtyChunks) pendingTerrainDirty.add(id);
    updateTerrainMeshes();
  }
  meshAuditStatus.textContent = changedSupport.supportAfter === 0
    ? 'Removed ' + changedSupport.removedVoxels +
      ' voxels beneath the actor; next physics step must lose support.'
    : 'Excavation committed, but the actor still has ' +
      changedSupport.supportAfter + ' supporting cells.';
  dirty=true;
});

for(const button of actorDpad.querySelectorAll('[data-actor-dir]')) {
  const dir=button.dataset.actorDir;
  button.addEventListener('pointerdown',event => {
    if (!actorEnabled) return;
    event.preventDefault();
    heldActorButtons.add(dir);
    button.setPointerCapture(event.pointerId);
  });
  const release=() => heldActorButtons.delete(dir);
  button.addEventListener('pointerup',release);
  button.addEventListener('pointercancel',release);
  button.addEventListener('lostpointercapture',release);
}
const actorKeyDirections={
  arrowup:'forward',w:'forward',
  arrowdown:'back',s:'back',
  arrowleft:'left',a:'left',
  arrowright:'right',d:'right'
};
window.addEventListener('keydown',event => {
  if (!actorEnabled || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  const direction=actorKeyDirections[event.key.toLowerCase()];
  if (!direction) return;
  event.preventDefault();
  heldActorKeys.add(direction);
});
window.addEventListener('keyup',event => {
  const direction=actorKeyDirections[event.key.toLowerCase()];
  if (direction) heldActorKeys.delete(direction);
});

canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const point = pointerPosition(event);
  if (gestures.begin(event.pointerId, point.x, point.y)) {
    if (terrainTargetMode.value === 'spell') {
      if (gestures.activeCount === 1) {
        terrainTaps.begin(event.pointerId,point.x,point.y,performance.now());
      } else {
        terrainTaps.cancel(); // Never target with a finger while pinching.
      }
    }
    canvas.setPointerCapture(event.pointerId);
  }
});
canvas.addEventListener('pointermove', event => {
  const point = pointerPosition(event);
  terrainTaps.move(event.pointerId,point.x,point.y);
  const delta = gestures.move(event.pointerId, point.x, point.y);
  if (!delta) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  cameraX += delta.panX * canvas.width / rect.width;
  cameraY += delta.panY * canvas.height / rect.height;
  zoomAt(delta.centerX, delta.centerY, delta.zoomRatio);
  dirty = true;
});
canvas.addEventListener('pointerup', event => {
  const point = pointerPosition(event);
  const tap = terrainTargetMode.value === 'spell'
    ? terrainTaps.end(event.pointerId,point.x,point.y,performance.now())
    : null;
  gestures.end(event.pointerId);
  if (tap) applyHuntSpellTap(tap);
});
canvas.addEventListener('pointercancel', event => {
  terrainTaps.cancel();
  gestures.end(event.pointerId);
});
canvas.addEventListener('lostpointercapture', event => {
  terrainTaps.cancel();
  gestures.end(event.pointerId);
});
canvas.addEventListener('wheel', event => {
  if (event.cancelable) event.preventDefault();
  const point = pointerPosition(event);
  const unit = event.deltaMode === 1 ? 0.03 : event.deltaMode === 2 ? 0.25 : 0.002;
  zoomAt(point.x, point.y, Math.exp(-event.deltaY * unit));
}, { passive: false });
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange', () => {
  terrainWorkerSession?.setPaused(document.hidden);
  previous = null;
  actorPrevious = null;
  actorAccumulator = 0;
  if (document.hidden) {
    gestures.reset();
    terrainTaps.cancel();
    heldActorKeys.clear();
    heldActorButtons.clear();
  }
});
window.addEventListener('blur', () => {
  gestures.reset();
  terrainTaps.cancel();
  heldActorKeys.clear();
  heldActorButtons.clear();
  actorPrevious = null;
  actorAccumulator = 0;
});
try {
  gpuRenderer = new WebGLVoxelView(gpuCanvas, {
    onAvailabilityChange(available, error) {
      gpuCanvas.style.display = available ? 'block' : 'none';
      gpuError = error?.message ?? null;
      contextRecoveryButton.textContent = available ? 'Lose WebGL context' : 'Restore WebGL context';
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
