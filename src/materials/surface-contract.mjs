// Materials owns surface values. No world, solver, renderer or light transport.
export const SURFACE_SCHEMA='wyrmforge.surface.v1';
export const SURFACE_GLSL=`
struct V2Surface {
  vec3 albedo;
  vec3 normal;
  vec3 geometricNormal;
  vec3 orm;
  vec3 emission;
  bool hasDetailNormal;
  bool hasOrm;
};
`;
function vector(value,name,min,max){
  if(!Array.isArray(value)||value.length!==3||
      !value.every(n=>Number.isFinite(n)&&n>=min&&n<=max)){
    throw new RangeError('Invalid surface '+name);
  }
  return Object.freeze([...value]);
}
export function defineSurface({albedo,normal=[0,1,0],orm=[1,1,0],emission=[0,0,0]}={}){
  const n=vector(normal,'normal',-1,1);
  if(Math.abs(Math.hypot(...n)-1)>.001)throw new RangeError('Expected unit surface normal');
  return Object.freeze({schema:SURFACE_SCHEMA,
    albedo:vector(albedo,'linear albedo',0,1),normal:n,
    orm:vector(orm,'ORM',0,1),emission:vector(emission,'linear emission',0,64)});
}
