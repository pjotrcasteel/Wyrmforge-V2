import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_PRESETS, PLAY_HUNT_CAMERA, getCameraPreset, projectVoxel } from '../src/camera-presets.mjs';
import { createScene } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';

const view = { width: 800, height: 600, scale: 12, panX: 15, panY: -8 };

test('Hunt camera is north-up and shows elevation without diagonal tile rotation', () => {
  const origin = projectVoxel(0, 0, 0, { ...view, camera: 'hunt' });
  const east = projectVoxel(1, 0, 0, { ...view, camera: 'hunt' });
  const south = projectVoxel(0, 0, 1, { ...view, camera: 'hunt' });
  const above = projectVoxel(0, 1, 0, { ...view, camera: 'hunt' });
  assert.deepEqual([origin.x, origin.y], [415, 292]);
  assert.ok(east.x > origin.x);
  assert.equal(east.y, origin.y, 'horizontal world travel must stay horizontal');
  assert.equal(south.x, origin.x, 'north/south world travel must stay vertical');
  assert.ok(south.y > origin.y);
  assert.equal(above.x, origin.x);
  assert.ok(above.y < origin.y, 'elevated surfaces must be screen-up');
});

test('Hunt camera near/far depth agrees with the orthographic view basis', () => {
  const far = projectVoxel(0, 0, 0, { ...view, camera: 'hunt' });
  const near = projectVoxel(0, .77, .64, { ...view, camera: 'hunt' });
  assert.ok(Math.abs(near.x - far.x) < 1e-8);
  assert.ok(Math.abs(near.y - far.y) < 1e-8);
  assert.ok(near.depth < far.depth, 'near terrain must win depth testing');
});

test('inspection camera preserves the existing V2 fixed oblique view', () => {
  const origin = projectVoxel(0, 0, 0, view);
  assert.equal(origin.x, 415);
  assert.equal(origin.y, 292);
  assert.ok(Math.abs(origin.depth) === 0, 'signed zero is not a geometry difference');
  const east = projectVoxel(1, 0, 0, view);
  const north = projectVoxel(0, 0, 1, view);
  assert.equal(east.x - origin.x, 9);
  assert.equal(north.x - origin.x, -9);
  assert.ok(east.y > origin.y && north.y > origin.y);
  assert.deepEqual(projectVoxel(3, 4, -1, { ...view, camera: 'inspection' }),
    projectVoxel(3, 4, -1, view));
});

test('camera switching does not edit, regenerate or remesh authoritative voxels', () => {
  const world = createScene('arch', 7, { chunkEdge: 32 });
  const before = world.snapshots();
  const worldRevision = world.revision;
  const mesh = buildExposedFaceMeshes(world);
  const originalTriangles = mesh.reduce((sum, m) => sum + m.triangleCount, 0);
  assert.ok(originalTriangles > 0);
  for (const camera of ['hunt', 'inspection', 'hunt']) {
    const screen = projectVoxel(5, 5, 2, { ...view, camera });
    assert.ok(Number.isFinite(screen.x) && Number.isFinite(screen.y));
  }
  assert.equal(world.revision, worldRevision);
  assert.deepEqual(world.snapshots(), before);
  assert.equal(mesh.reduce((sum, m) => sum + m.triangleCount, 0), originalTriangles);
});

test('presets are immutable and unknown values are rejected', () => {
  assert.deepEqual(Object.keys(CAMERA_PRESETS).sort(), ['hunt', 'inspection']);
  assert.equal(getCameraPreset('hunt').id, 'hunt');
  assert.ok(Object.isFrozen(CAMERA_PRESETS.hunt.right));
  assert.throws(() => getCameraPreset('unrecognized'), RangeError);
  assert.throws(() => getCameraPreset('__proto__'), RangeError);
});

test('Hunt preserves north-up controls and projects 1-voxel cliffs more clearly',()=>{
  const options={...view,camera:'hunt'};
  const base=projectVoxel(1,0,1,options);
  const elevated=projectVoxel(1,1,1,options);
  const difference=base.y-elevated.y;
  assert.ok(difference >= 0.60 * view.scale,'each raised block needs meaningful screen height');
  assert.ok(difference <= 0.70 * view.scale,'preserve the top-down Hunt identity');
  assert.equal(base.x,elevated.x,'elevation never shifts X');
  assert.ok(Math.abs(getCameraPreset('hunt').down[2] - 0.77)<1e-10);
  const camera=getCameraPreset('hunt');
  const orthogonality=camera.down.reduce((sum,n,i)=>sum+n*camera.depth[i],0);
  assert.ok(Math.abs(orthogonality)<1e-10,'depth and screen-up stay perpendicular');
  // Projection alone changes; the world, snapshots and chunk meshes do not.
  const world=createScene('hill',7,{chunkEdge:32});
  const oldRevision=world.revision;
  const oldMeshes=buildExposedFaceMeshes(world);
  for(const voxel of [[0,0,0],[7,8,7],[-3,2,-4]]) {
    const values=projectVoxel(...voxel,options);
    assert.ok(Number.isFinite(values.x) && Number.isFinite(values.y));
  }
  assert.equal(world.revision,oldRevision);
  assert.deepEqual(buildExposedFaceMeshes(world),oldMeshes);
});


test('the Wyrmforge 2.5D Hunt camera is north-up with genuine voxel height',()=>{
  assert.equal(PLAY_HUNT_CAMERA,'hunt');
  const camera=getCameraPreset(PLAY_HUNT_CAMERA);
  assert.match(camera.label,/2\.5D/);
  const options={...view,camera:PLAY_HUNT_CAMERA};
  const level=projectVoxel(0,4,0,options);
  const east=projectVoxel(1,4,0,options);
  const south=projectVoxel(0,4,1,options);
  const oneMetreHigher=projectVoxel(0,5,0,options);
  const tenCmHigher=projectVoxel(0,4.1,0,options);
  assert.ok(east.x>level.x && Math.abs(east.y-level.y)<1e-9,
    'horizontal joystick movement stays horizontal on the screen');
  assert.ok(south.y>level.y && Math.abs(south.x-level.x)<1e-9,
    'vertical joystick movement stays north/south on the screen');
  assert.ok(level.y>oneMetreHigher.y,
    'real raised cliffs remain visible in 2.5D');
  assert.ok(level.y>tenCmHigher.y &&
    level.y-tenCmHigher.y<level.y-oneMetreHigher.y,
  'the actual 10cm terrain elevation must project continuously');
  assert.ok(Math.abs(camera.down[1])>0.1 &&
    Math.abs(camera.down[2])>0.5,
    '2.5D uses both physical elevation and world-plane depth, not a 2D flat map');
});
