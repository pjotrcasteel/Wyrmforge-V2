// Lighting owns the cosmetic attenuation profile, not terrain support or prop state.
// Thirteen small, individually grounded samples form a restrained root/rock/log
// contact proxy. Directional canopy and cliff shadows belong to L10-06.
export const CONTACT_SHADOW_SAMPLE_COUNT=13;
const OFFSETS=Object.freeze([
  [0,0],[-.5,0],[.5,0],[0,-.5],[0,.5],
  [-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5],
  [-1,0],[1,0],[0,-1],[0,1]
]);
export function describeContactShadow(prop){
  if(!prop||![prop.x,prop.y,prop.z,prop.radius].every(Number.isFinite)||
      prop.radius<=0||!Number.isFinite(prop.halfLength??0))return null;
  // The former 34cm minimum made these stamps effectively invisible at
  // real Hunt pixel scale, particularly under darkened tree trunks.
  // Anchor a contiguous, still-localized ~1.5m root pool to actual ground.
  // Logs keep a narrow long footprint; L10-06 owns canopy cast shadows.
  const isLog=prop.kind==='log';
  const radiusX=Math.min(1.65,Math.max(.82,
    (prop.radius+(prop.halfLength??0))*1.18));
  const radiusZ=Math.min(1.1,Math.max(isLog?.42:.72,prop.radius*1.18));
  const intensity=prop.kind==='boulder'?.33:isLog?.29:.35;
  return {
    id:prop.id,x:prop.x,z:prop.z,radiusX,radiusZ,
    samples:OFFSETS.map(([u,v])=>({
      x:prop.x+u*radiusX,z:prop.z+v*radiusZ,
      halfX:radiusX*.27,halfZ:radiusZ*.27,
      alpha:intensity*(1-.48*Math.hypot(u,v))
    }))
  };
}
