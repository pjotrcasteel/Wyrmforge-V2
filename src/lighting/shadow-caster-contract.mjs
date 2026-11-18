// Shared read-only directional caster descriptors for scene composition.
// A cutout sprite casts an alpha silhouette; any physical collider can cast
// a bounded volumetric proxy. Neither source needs a Lighting-specific class.
export function describeDirectionalCaster(instance,image=null){
  if(!instance||instance.castsShadow===false||
    typeof instance.id!=='string'||!instance.id||
    ![instance.x,instance.y,instance.z].every(Number.isFinite))return null;
  const silhouette=instance.shadow?.silhouette??instance.silhouette??instance.sprite??null;
  const radius=instance.radius;
  const extent=Number.isFinite(radius)?radius+(instance.halfLength??0):null;
  const bounds=instance.shadow?.bounds??instance.collider?.bounds??(
    !silhouette&&extent>0&&Number.isFinite(instance.height)&&instance.height>0?{
      min:[instance.x-extent,instance.y,instance.z-radius],
      max:[instance.x+extent,instance.y+instance.height,instance.z+radius]
    }:null);
  if(!silhouette&&!bounds)return null;
  return {id:instance.id,x:instance.x,y:instance.y,z:instance.z,
    scale:instance.scale??1,shadowRevision:instance.shadowRevision??0,
    ...(silhouette?{silhouette,image}:{}),
    ...(bounds?{bounds}: {})};
}
