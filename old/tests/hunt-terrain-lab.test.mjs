import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Hunt-targeting mode is opt-in and does not replace default pan/zoom', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.match(html,/id="terrain-target-mode"/);
  assert.match(html,/<option value="pan" selected>Pan terrain/);
  assert.match(html,/<option value="spell">Target spell/);
  assert.match(main,/terrainTargetMode\.value === 'spell'/);
  assert.match(main,/terrainTaps\.begin\(event.pointerId/);
  assert.match(main,/terrainTaps\.move\(event.pointerId/);
  assert.match(main,/terrainTaps\.end\(event.pointerId/);
  assert.match(main,/terrainTaps\.cancel\(\)/);
  assert.match(main,/if \(tap\) applyHuntSpellTap\(tap\)/);
  assert.match(main,/terrainRayFromScreen\(\{/);
  assert.match(main,/applyTerrainSpellHit\(world, terrainEdits/);
  assert.match(main,/for \(const chunkId of impact.dirtyChunks\) pendingTerrainDirty.add/);
  assert.match(main,/terrainInteractionMode:terrainTargetMode.value/);
  assert.match(main,/lastTargetedImpact/);
});
