// V2-native orthographic 2.5D camera presets. No V1 camera code, assets, or shaders.
// World X/Z are the ground plane; Y is elevation. Coefficients are deliberately
// separate from terrain authority so camera changes never mutate world state.
// Game camera is 2.5D: north-up, mostly overhead, orthographic pixel-art
// gameplay with physically projected cliff height. This is a *view of* the
// existing 3D Voxel V2 world, NEVER a flattened 2D terrain replacement.
// The isometric inspection camera is strictly a lab/comparison option.
export const PLAY_HUNT_CAMERA = 'hunt';
export const CAMERA_PRESETS = Object.freeze({
  hunt: Object.freeze({
    id: 'hunt',
    label: 'Wyrmforge Hunt · 2.5D',
    right: Object.freeze([1, 0, 0]),
    // Render north-up gameplay: X = horizontal screen movement, Z = vertical.
    // Y shifts only screen height, preserving real 10cm/1m terrain relief.
    // Keep down/depth perpendicular so cliffs and spell impacts remain aligned.
    down: Object.freeze([0, -0.64, 0.77]),
    depth: Object.freeze([0, -0.77 / 128, -0.64 / 128])
  }),
  inspection: Object.freeze({
    id: 'inspection',
    label: 'Voxel inspection',
    right: Object.freeze([0.75, 0, -0.75]),
    down: Object.freeze([0.35, -1, 0.35]),
    depth: Object.freeze([-1 / 128, -0.7 / 128, -1 / 128])
  })
});

export function getCameraPreset(id = 'inspection') {
  if (typeof id !== 'string' || !Object.hasOwn(CAMERA_PRESETS, id)) {
    throw new RangeError('Unknown V2 camera preset');
  }
  return CAMERA_PRESETS[id];
}

// The browser's Canvas2D fallback and WebGL2 shader must use the same axes.
export function projectVoxel(x, y, z, {
  width, height, scale, panX = 0, panY = 0, camera = 'inspection'
}) {
  const basis = getCameraPreset(camera);
  const dot = vector => vector[0] * x + vector[1] * y + vector[2] * z;
  return {
    x: width / 2 + dot(basis.right) * scale + panX,
    y: height / 2 + dot(basis.down) * scale + panY,
    depth: dot(basis.depth)
  };
}
