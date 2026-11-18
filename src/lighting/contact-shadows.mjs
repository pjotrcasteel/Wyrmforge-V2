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
  const radiusX=Math.min(1.65,Math.max(.34,(prop.radius+(prop.halfLength??0))*1.12));
  const radiusZ=Math.min(1.1,Math.max(.34,prop.radius*1.12));
  const intensity=prop.kind==='boulder'?.31:prop.kind==='log'?.26:.28;
  return {
    id:prop.id,x:prop.x,z:prop.z,radiusX,radiusZ,
    samples:OFFSETS.map(([u,v])=>({
      x:prop.x+u*radiusX,z:prop.z+v*radiusZ,
      halfX:radiusX*.24,halfZ:radiusZ*.24,
      alpha:intensity*(1-.7*Math.hypot(u,v))
    }))
  };
}
