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

test('mobile lab defaults to an accessible collapsed control drawer over the terrain', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(html, /<div id="lab-controls" hidden>/);
  assert.match(html, /id="lab-controls-toggle"[^>]*aria-controls="lab-controls"[^>]*aria-expanded="false"/);
  assert.match(html, /#lab-controls\{[^}]*position:absolute;[^}]*overflow-y:auto/);
  assert.match(html, /#lab-controls\[hidden\]\{display:none\}/);
  assert.match(html, /#lab-topbar\{[^}]*min-height:42px/);
  assert.match(html, /id="build" aria-label="Engine version and deployed commit"/);
  assert.match(html, /id="actor-ui"/);
  assert.match(html, /id="terrain-target-mode"/);
  assert.match(html, /id="report"/);
  assert.match(main, /controlsToggle\.addEventListener\('click'/);
  assert.match(main, /controlsPanel\.hidden = !open/);
  assert.match(main, /controlsToggle\.setAttribute\('aria-expanded',String\(open\)\)/);
  assert.match(main, /if \(event\.target\.closest\('button'\)\) setLabControlsOpen\(false\)/);
  assert.match(main, /labControlsOpen: !controlsPanel\.hidden/);
});

test('all existing lab controls retain unique IDs in the collapsed mobile drawer', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for(const id of [
    'scene','camera','terrain-target-mode','chunks','seed','terrain-mesh-mode',
    'reset','carve','damage','burst','checkpoint-save','checkpoint-restore',
    'replay-export','replay-import-file','mesh-audit-button',
    'mesh-compare-button','report','actor-toggle','actor-reset','actor-dpad'
  ]) {
    assert.ok(ids.includes(id), `Preserve existing lab control ${id}`);
  }
});

test('Grass 002 uses the live voxel renderer and three real camera zoom presets', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../src/webgl-voxel-view.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="grass-texture-file"/);
  for (const zoom of ['0.65', '1', '2']) {
    assert.ok(html.includes('data-grass-zoom="' + zoom + '"'));
  }
  assert.match(main, /zoomAt\(rect\.width \/ 2, rect\.height \/ 2, target \/ zoomFactor\)/);
  assert.match(main, /gpuRenderer\.setGrassMaterial\(image, Number\(grassDensity\.value\)\)/);
  assert.match(renderer, /vWorld\.xz \* \(uGrassTexelsPerVoxel \/ 1024\.0\)/);
});
