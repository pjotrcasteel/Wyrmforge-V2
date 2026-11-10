import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('actor pilot is off by default, uses overlay and touch controls without changing Hunt canvas', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(html,/id="actor-view" aria-hidden="true"/);
  assert.match(html,/id="actor-toggle"[^>]*aria-pressed="false"/);
  assert.match(html,/id="actor-dpad" hidden/);
  assert.match(html,/data-actor-dir="forward"/);
  assert.match(html,/data-actor-dir="left"/);
  assert.match(html,/data-actor-dir="back"/);
  assert.match(html,/data-actor-dir="right"/);
  assert.match(main,/let actorEnabled = false, actor = null/);
  assert.match(main,/spawnTerrainActor\(world/);
  assert.match(main,/simulateTerrainActor\(world,actor/);
  assert.match(main,/actorAccumulator >= 1\/60 && steps < 4/);
  assert.match(main,/heldActorKeys\.clear\(\)/);
  assert.match(main,/button\.addEventListener\('pointercancel',release\)/);
  assert.match(main,/if \(actorEnabled\) resetActorPilot\(\)/);
  assert.match(main,/actorPilot:\{schema:ACTOR_PHYSICS_SCHEMA/);
  assert.match(main,/drawActorOverlay\(\)/);
  assert.match(main,/player|Actor|actor/i);
});

test('actor collision never uses GPU meshes or Canvas 2D for physics authority', () => {
  const physics=readFileSync(new URL('../src/terrain-actor.mjs',import.meta.url),'utf8');
  assert.match(physics,/world\.get\(x,y,z\)/);
  assert.match(physics,/raycastTerrain\(world/);
  assert.doesNotMatch(physics,/WebGLVoxelView|CanvasRenderingContext2D|gpuRenderer|document\./);
  assert.doesNotMatch(physics,/set\(x,y,z/);
});

test('underfoot test is opt-in and records fall before asynchronous mesh completion', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(html,/id="actor-excavate"[^>]*disabled/);
  assert.match(main,/actorExcavate\.addEventListener\('click'/);
  assert.match(main,/excavateActorSupport\(world,terrainEdits,actor/);
  assert.match(main,/if \(changedSupport\.dirtyChunks\.length\)/);
  assert.match(main,/for \(const id of changedSupport\.dirtyChunks\) pendingTerrainDirty\.add\(id\)/);
  assert.match(main,/physicsStepsUntilFall/);
  assert.match(main,/fallStartLatencyMs/);
  assert.match(main,/meshPendingWhenFell/);
  assert.match(main,/stepsUntilLanding/);
  assert.match(main,/supportExcavation:actorSupportTest/);
  assert.match(main,/actorExcavate\.disabled = false/);
  assert.match(main,/actorExcavate\.disabled = true/);
});

test('Arch pilot spawns in the actual 3D corridor and reports wall contact', () => {
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(main,/activeScene === 'arch'/);
  assert.match(main,/x:0\.5, z:2\.5, searchTopY:6/);
  assert.match(main,/Arch collision lane: move LEFT or RIGHT into the stone pillars/);
  assert.match(main,/current\.wallContact && !previousWallContact/);
  assert.match(main,/Arch pillar COLLISION/);
  assert.match(main,/actor x=\$\{actor\.x\.toFixed\(2\)\}/);
  assert.match(main,/z=\$\{actor\.z\.toFixed\(2\)\}/);
  assert.match(main,/wallContactSteps:actorWallContacts/);
});

test('Wyrmforge actor has no jump control or player jump simulation input', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  const physics=readFileSync(new URL('../src/terrain-actor.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(html,/id="actor-jump"/);
  assert.doesNotMatch(main,/actorJumpButton|jumpQueued|actorJumps/);
  assert.doesNotMatch(main,/jump:jumpQueued|event\.code === 'Space'/);
  assert.doesNotMatch(physics,/ACTOR_JUMP_SPEED|jump=false|jumping/);
  assert.match(physics,/const canStep=initialSupport/);
  assert.match(physics,/ACTOR_MAX_UPWARD_SPEED/);
});

test('the diagnostic actor can never draw a head above its actual collision volume', () => {
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  const proxy=readFileSync(
    new URL('../src/diagnostics/actor-proxy.mjs',import.meta.url),'utf8');
  assert.match(main,/projectActorDiagnostic\(pos/);
  assert.match(main,/actorHeadClearance\(world,actor\)/);
  assert.match(main,/headClearance:actorEnabled && actor/);
  assert.match(main,/proxy\.boxEdges/);
  assert.match(proxy,/const height=foot\.y-top\.y/);
  assert.doesNotMatch(main,/Math\.max\(15\*dpr,foot\.y-top\.y\)/);
  assert.doesNotMatch(main,/foot\.y-height-radius\*0\.7/);
  assert.doesNotMatch(proxy,/canvas\.getContext|WebGL|document\./);
});
