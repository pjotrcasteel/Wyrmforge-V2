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

test('V2.5 jump uses native touch/keyboard input and records ceiling contacts', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(html, /id="actor-jump"[^>]*type="button"[^>]*aria-label="Jump"/);
  assert.match(html, /#actor-jump\{grid-column:3;grid-row:1/);
  assert.match(main, /actorJumpButton\.addEventListener\('click'/);
  assert.match(main, /jump:jumpQueued,dt:1\/60/);
  assert.match(main, /jumpQueued = false; \/\/ One press generates at most one jump impulse/);
  assert.match(main, /event\.code === 'Space'/);
  assert.match(main, /if \(!event\.repeat\) jumpQueued = true/);
  assert.match(main, /if \(current\.ceilingContact && !actor\.ceilingContact\)/);
  assert.match(main, /jumps:actorJumps,ceilingHits:actorCeilingHits/);
});
