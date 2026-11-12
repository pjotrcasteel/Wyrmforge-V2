// V2-native orthographic 2.5D camera presets. No V1 camera code, assets, or shaders.
// World X/Z are the ground plane; Y is elevation. Coefficients are deliberately
// separate from terrain authority so camera changes never mutate world state.
// "hunt" is an initial visual candidate, not an approved match to the live game.
export const CAMERA_PRESETS = Object.freeze({
  hunt: Object.freeze({
    id: 'hunt',
    label: 'Hunt-style (candidate)',
    right: Object.freeze([1, 0, 0]),
    // Taller one-voxel steps in Hunt, without rotating the player's X/Z axes.
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
