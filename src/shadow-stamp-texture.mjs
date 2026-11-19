// Rendering-owned, reusable soft shadow footprint for the real Hunt.
// Contact roots and generic canopy/volume casts already validate physical
// Voxel receiver/occlusion. The final Canvas2D paint must not turn each valid
// 7x8 or 13-sample receiver into a hard-edged square.
// One tiny CPU-side canvas is created per page; never per caster/frame.
export const SHADOW_STAMP_PIXELS=24;
let sharedStamp=null;

export function shadowStampAlpha(x,y,size=SHADOW_STAMP_PIXELS){
  if(!Number.isInteger(size)||size<4||size>64){
    throw new RangeError('Invalid bounded shadow-stamp dimensions');
  }
  // Transparent outer pixel ring prevents a visible tile seam at every
  // 2D receiver boundary, even under nearest-neighbour sprite scaling.
  if(x<=0||y<=0||x>=size-1||y>=size-1)return 0;
  const u=(x+.5-size*.5)/(size*.5);
  const v=(y+.5-size*.5)/(size*.5);
  const distance=Math.hypot(u,v);
  if(distance>=1)return 0;
  // C2 continuous edge attenuation. At the rim alpha is zero; at the
  // center it remains bright enough for a rooted, legible pixel-art shadow.
  const t=1-distance*distance;
  return Math.round(255*t*t);
}

export function makeShadowStampPixels(size=SHADOW_STAMP_PIXELS){
  if(!Number.isInteger(size)||size<4||size>64){
    throw new RangeError('Invalid bounded shadow-stamp dimensions');
  }
  const pixels=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const i=(y*size+x)*4;
      pixels[i]=7;
      pixels[i+1]=13;
      pixels[i+2]=18;
      pixels[i+3]=shadowStampAlpha(x,y,size);
    }
  }
  return pixels;
}

export function getShadowStampTexture(){
  if(sharedStamp)return sharedStamp;
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');
  canvas.width=SHADOW_STAMP_PIXELS;
  canvas.height=SHADOW_STAMP_PIXELS;
  const context=canvas.getContext('2d');
  if(!context)return null;
  const image=context.createImageData(SHADOW_STAMP_PIXELS,SHADOW_STAMP_PIXELS);
  image.data.set(makeShadowStampPixels());
  context.putImageData(image,0,0);
  sharedStamp=canvas;
  return sharedStamp;
}

export function paintSoftShadowStamp(ctx,x,y,w,h,alpha){
  if(!Number.isFinite(alpha)||alpha<=0)return false;
  const tile=typeof ctx?.drawImage==='function'?getShadowStampTexture():null;
  ctx.globalAlpha=Math.min(1,alpha);
  if(tile){
    ctx.drawImage(tile,x,y,w,h);
  }else{
    // Headless/older Canvas contract: preserve fallback; geometry/stamps
    // remain correct even if a 2D helper context cannot be allocated.
    ctx.fillRect(x,y,w,h);
  }
  return true;
}
