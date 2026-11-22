// Read-only CPU twin of the 24x24 GPU emissive irradiance field.
// Sprite/prop/material class names never participate in this sampler.
// No terrain, Water, renderers or atlas imports; four constant-time texels.
export function sampleStaticFieldIrradiance(position,field){
  if(!field?.hasEmission||field.schema!=='wyrmforge.local-light-field.v2'||
      !Array.isArray(position)||position.length!==3||
      !position.every(Number.isFinite)||
      !(field.data instanceof Float32Array)||
      field.size?.[0]!==24||field.size?.[1]!==24||
      !Array.isArray(field.emission)||field.emission.length!==3||
      !field.emission.every(Number.isFinite)){
    return [0,0,0];
  }
  const [x,y,z]=position;
  const [ox,oz]=field.origin??[];
  if(!Number.isFinite(ox)||!Number.isFinite(oz))return [0,0,0];
  const atX=Math.floor(x-ox),atZ=Math.floor(z-oz);
  const here=atX>=0&&atX<24&&atZ>=0&&atZ<24?
    field.data[(atZ*24+atX)*4+3]:0;
  if(here<.5)return [0,0,0];

  function column(cx,cz){
    const ix=cx-ox,iz=cz-oz;
    if(ix<0||iz<0||ix>=24||iz>=24)return [0,0,0,0];
    const at=(iz*24+ix)*4;
    return field.data.subarray(at,at+4);
  }
  const gridX=Math.floor(x-.5),gridZ=Math.floor(z-.5);
  const fx=x-.5-gridX,fz=z-.5-gridZ;
  const a=column(gridX,gridZ),b=column(gridX+1,gridZ),
    c=column(gridX,gridZ+1),d=column(gridX+1,gridZ+1);
  const mix=(p,q,f)=>p+(q-p)*f;
  const interpolate=index=>mix(
    mix(a[index],b[index],fx),mix(c[index],d[index],fx),fz);
  const smoother=(lo,hi,v)=>{
    const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));
    return t*t*(3-2*t);
  };
  const topEnergy=interpolate(2);
  const sideEnergy=mix(mix(Math.max(0,a[3]-1),Math.max(0,b[3]-1),fx),
    mix(Math.max(0,c[3]-1),Math.max(0,d[3]-1),fx),fz);
  const topY=interpolate(0),sourceY=interpolate(1);
  const sideWeight=smoother(.12,1.1,Math.max(0,topY-y));
  const energy=mix(topEnergy,sideEnergy,sideWeight);
  const edge=Math.min(x-ox,z-oz,ox+24-x,oz+24-z);
  const fade=smoother(0,2,edge);
  const warm=energy*1.65*fade*Math.pow(2,-Math.abs(y-sourceY-.4)*.35);
  return field.emission.map(value=>Math.max(0,value*warm));
}
