import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScene } from '../src/voxel-world.mjs';
import { compareMeshing } from '../src/meshing-comparison.mjs';

test('V2 lab reserves fixed height for both status panels', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /main\{flex:1;min-height:0;position:relative\}/);
  const rules = html.match(/#status,#mesh-audit\{([^}]+)\}/);
  assert.ok(rules, 'shared status-panel CSS must exist');
  const style = rules[1];
  assert.match(style, /height:52px/);
  assert.match(style, /flex:0 0 52px/);
  assert.match(style, /box-sizing:border-box/);
  assert.match(style, /overflow-y:auto/);
  assert.match(html, /id="mesh-compare-button"/);
  assert.match(html, /id="mesh-audit"/);
});

test('running comparison never changes authoritative terrain or revision', () => {
  for (const chunkEdge of [16, 32]) {
    const world = createScene('hill', 7, { chunkEdge });
    const revision = world.revision;
    const before = world.snapshots();
    const result = compareMeshing(world);
    assert.equal(result.worldRevision, revision);
    assert.equal(world.revision, revision);
    assert.deepEqual(world.snapshots(), before);
    assert.equal(result.exposed.unitFaces, result.greedy.unitFaces);
  }
});
