// Render-only spatial presentation for any sprite/cutout object.
// Object systems supply identity/pose/art metadata, not Lighting-specific
// species or building names. No terrain, Water, or shader imports.
export const MAX_SPRITE_LIGHT_BANDS=3;
export const MIN_SPRITE_LIGHT_SOURCE_HEIGHT=96;
export const MIN_SPRITE_LIGHT_SCREEN_HEIGHT=54;

export function describeSpriteLightProfile(instance,sprite){
  if(!instance||!sprite||![instance.x,instance.y,instance.z].every(Number.isFinite)||
      !Number.isFinite(sprite.ay)||sprite.ay<=0||
      !Number.isFinite(instance.scale??1)||(instance.scale??1)<=0)return null;
  const impliedHeight=sprite.ay*(instance.scale??1)/32;
  const statedHeight=instance.lightPresentation?.height??instance.height??0;
  if(!Number.isFinite(statedHeight)||statedHeight<0)return null;
  const metersPerPixel=Math.max(impliedHeight,statedHeight)/sprite.ay;
  return Object.freeze({x:instance.x,y:instance.y,z:instance.z,metersPerPixel});
}

// Destination slices use consecutive integer edges (no gaps or overlap);
// source slices cover exactly the original cutout bitmap. Three smaller tint
// crops cost at most the pixels of one full tinted sprite for a cold profile.
export function projectSpriteLightBands(sprite,rect,profile){
  if(!profile||!sprite||!Array.isArray(rect)||rect.length!==4||
      ![sprite.x,sprite.y,sprite.w,sprite.h,sprite.ay,...rect,profile.x,
        profile.y,profile.z,profile.metersPerPixel].every(Number.isFinite)||
      sprite.h<MIN_SPRITE_LIGHT_SOURCE_HEIGHT||
      rect[3]<MIN_SPRITE_LIGHT_SCREEN_HEIGHT||
      sprite.ay<=0||profile.metersPerPixel<=0)return null;
  const bands=[];
  for(let band=0;band<MAX_SPRITE_LIGHT_BANDS;band++){
    const from=Math.floor(band*sprite.h/MAX_SPRITE_LIGHT_BANDS);
    const to=band===MAX_SPRITE_LIGHT_BANDS-1?sprite.h:
      Math.floor((band+1)*sprite.h/MAX_SPRITE_LIGHT_BANDS);
    const y0=Math.round(rect[1]+rect[3]*from/sprite.h);
    const y1=band===MAX_SPRITE_LIGHT_BANDS-1?Math.round(rect[1]+rect[3]):
      Math.round(rect[1]+rect[3]*to/sprite.h);
    if(to<=from||y1<=y0)return null;
    const at=(from+to)/2;
    bands.push(Object.freeze({
      crop:Object.freeze({x:sprite.x,y:sprite.y+from,w:sprite.w,h:to-from}),
      rect:Object.freeze([rect[0],y0,rect[2],y1-y0]),
      position:Object.freeze([profile.x,
        profile.y+(sprite.ay-at)*profile.metersPerPixel,profile.z])
    }));
  }
  return Object.freeze(bands);
}
