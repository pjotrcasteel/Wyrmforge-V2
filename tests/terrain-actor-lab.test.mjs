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
