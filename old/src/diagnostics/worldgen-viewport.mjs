// Viewer-only geometry. Never changes World Generation V2 plans or Voxel V2.
// Fit the actual 3D bounds, including elevation, inside a portrait/mobile view.
import { getCameraPreset } from '../camera-presets.mjs';

export const WORLDGEN_VIEW_ZOOM_MIN=0.55;
export const WORLDGEN_VIEW_ZOOM_MAX=3.5;

export function clampWorldgenViewZoom(value) {
  if(!Number.isFinite(value)) throw new RangeError('Zoom must be finite');
  return Math.min(WORLDGEN_VIEW_ZOOM_MAX,Math.max(WORLDGEN_VIEW_ZOOM_MIN,value));
}

export function fitWorldgenSiteView({
  width,height,footprint,camera='inspection',horizontalFill=0.91,verticalFill=0.82
}) {
  if(!Number.isFinite(width) || !Number.isFinite(height) ||
      width<=0 || height<=0 ||
      !Number.isFinite(horizontalFill) || horizontalFill<=0 || horizontalFill>1 ||
      !Number.isFinite(verticalFill) || verticalFill<=0 || verticalFill>1) {
    throw new RangeError('Expected positive viewport and bounded margins');
  }
  const fields=['minX','maxX','minY','maxY','minZ','maxZ'];
  if(!footprint || !fields.every(field=>Number.isSafeInteger(footprint[field])) ||
      footprint.minX>footprint.maxX ||
      footprint.minY>footprint.maxY ||
      footprint.minZ>footprint.maxZ) {
    throw new TypeError('Expected actual World Generation V2 site footprint');
  }
  const basis=getCameraPreset(camera);
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  // Account for all solid voxel corners, not just ground-level map corners.
  for(const x of [footprint.minX,footprint.maxX+1]) {
    for(const y of [footprint.minY,footprint.maxY+1]) {
      for(const z of [footprint.minZ,footprint.maxZ+1]) {
        const px=basis.right[0]*x+basis.right[1]*y+basis.right[2]*z;
        const py=basis.down[0]*x+basis.down[1]*y+basis.down[2]*z;
        left=Math.min(left,px);
        right=Math.max(right,px);
        top=Math.min(top,py);
        bottom=Math.max(bottom,py);
      }
    }
  }
  const spanX=Math.max(1,right-left);
  const spanY=Math.max(1,bottom-top);
  const scale=Math.min(width*horizontalFill/spanX,height*verticalFill/spanY);
  return Object.freeze({
    scale,panX:-(left+right)*scale/2,
    panY:-(top+bottom)*scale/2,
    widthPixels:spanX*scale,heightPixels:spanY*scale
  });
}
