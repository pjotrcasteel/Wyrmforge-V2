// Rendering-owned, reusable soft shadow footprint for the real Hunt.
// Contact roots and generic canopy/volume casts already validate physical
// Voxel receiver/occlusion. The final Canvas2D paint must not turn each valid
// 7x8 or 13-sample receiver into a hard-edged square.
// One tiny CPU-side canvas is created per page; never per caster/frame.
export const SHADOW_STAMP_PIXELS=24;
const sharedStamps=new Map();
export const SHADOW_STAMP_STYLES=Object.freeze(['contact','canopy']);

export function shadowStampAlpha(x,y,size=SHADOW_STAMP_PIXELS,style='contact'){
  if(!Number.isInteger(size)||size<4||size>64){
    throw new RangeError('Invalid bounded shadow-stamp dimensions');
  }
  // Transparent outer pixel ring prevents a visible tile seam at every
  // 2D receiver boundary, even under nearest-neighbour sprite scaling.
  if(x<=0||y<=0||x>=size-1||y>=size-1)return 0;
  const u=(x+.5-size*.5)/(size*.5);
  const v=(y+.5-size*.5)/(size*.5);
  if(!SHADOW_STAMP_STYLES.includes(style))throw new RangeError('Invalid shadow-stamp style');
  // Canopy shadows are the directional silhouette of grouped physical
  // cutout receivers, not one circular contact pool. Unequal sun-stretched
  // lobes break the uniform discs without any per-caster rasterization.
  // Fixed world-oriented shape prevents the kernel rotating while walking.
  if(style==='canopy'){
    const along=(u*.86+v*.51)*.83;
    const across=(-u*.51+v*.86)*1.34;
    const first=Math.hypot(along+.16,across);
    const second=Math.hypot((along-.31)*1.18,(across+.20)*1.48);
    const third=Math.hypot((along+.34)*1.46,(across-.24)*1.39);
    const lobe=d=>d>=1?0:(1-d*d)**1.35;
    const rim=Math.max(0,1-Math.max(Math.abs(u),Math.abs(v)));
    return Math.round(255*Math.min(1,Math.max(
      lobe(first),lobe(second)*.73,lobe(third)*.56))*Math.min(1,rim*5));
  }
  const distance=Math.hypot(u,v);
  if(distance>=1)return 0;
  // Smooth zero-alpha perimeter, but keep a broad enough attenuation
  // footprint that a root still visibly grounds its trunk in mobile Hunt.
  // Squaring t removed too many middle-distance pixels in the real browser.
  const t=1-distance*distance;
  return Math.round(255*Math.pow(t,1.15));
}

export function makeShadowStampPixels(size=SHADOW_STAMP_PIXELS,style='contact'){
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
      pixels[i+3]=shadowStampAlpha(x,y,size,style);
    }
  }
  return pixels;
}

export function getShadowStampTexture(style='contact'){
  if(!SHADOW_STAMP_STYLES.includes(style))throw new RangeError('Invalid shadow-stamp style');
  if(sharedStamps.has(style))return sharedStamps.get(style);
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');
  canvas.width=SHADOW_STAMP_PIXELS;
  canvas.height=SHADOW_STAMP_PIXELS;
  const context=canvas.getContext('2d');
  if(!context)return null;
  const image=context.createImageData(SHADOW_STAMP_PIXELS,SHADOW_STAMP_PIXELS);
  image.data.set(makeShadowStampPixels(SHADOW_STAMP_PIXELS,style));
  context.putImageData(image,0,0);
  sharedStamps.set(style,canvas);
  return canvas;
}

export function paintSoftShadowStamp(ctx,x,y,w,h,alpha,style='contact'){
  if(!Number.isFinite(alpha)||alpha<=0)return false;
  const tile=typeof ctx?.drawImage==='function'?getShadowStampTexture(style):null;
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
