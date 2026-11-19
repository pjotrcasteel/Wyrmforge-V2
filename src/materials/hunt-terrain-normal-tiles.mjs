// Materials-owned preview normals for real Hunt terrain. All six tiles are
// generated ONCE from existing 64px pixel-art studies. They are temporary
// albedo-derived relief previews, NOT authored height/PBR data.
// Renderer receives an ordinary HTMLCanvasElement TexImageSource and uploads
// through the existing 1-tile/frame texture-array queue.
export const HUNT_NORMAL_TILE_SIZE=64;
export const HUNT_NORMAL_STUDIES=Object.freeze([
  Object.freeze({slot:'grass/meadow',source:'grass-clearing',slope:1.25}),
  Object.freeze({slot:'grass/meadow-dark',source:'grass-shade',slope:1.25}),
  Object.freeze({slot:'grass/rooted-soil',source:'roots',slope:2.8}),
  Object.freeze({slot:'dirt/earth',source:'earth',slope:3.2}),
  Object.freeze({slot:'dirt/earth-dark',source:'mud',slope:3.2}),
  Object.freeze({slot:'stone/bedrock',source:'stone',slope:3.7})
]);

const size=HUNT_NORMAL_TILE_SIZE;
const wrap=n=>(n+size)%size;
const index=(x,y)=>wrap(y)*size+wrap(x);
const byte=n=>Math.max(0,Math.min(255,Math.round(n)));

export function deriveHuntNormalPixels(rgba,{slope=2.5}={}){
  if(!(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray)||
      rgba.length!==size*size*4||!Number.isFinite(slope)||slope<=0||slope>5){
    throw new TypeError('Expected bounded 64px material pixels and normal-map slope');
  }
  const heights=new Float32Array(size*size);
  for(let i=0;i<heights.length;i++){
    const p=i*4;
    heights[i]=(.2126*rgba[p]+.7152*rgba[p+1]+.0722*rgba[p+2])/255;
  }
  // Toroidal 3x3 low-pass makes authored pixel grain into material-scale
  // bumps without new seam edges or shimmering one-pixel normal spikes.
  const filtered=new Float32Array(heights.length);
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      let total=0;
      for(let dy=-1;dy<=1;dy++){
        for(let dx=-1;dx<=1;dx++){
          const weight=(dx===0?2:1)*(dy===0?2:1);
          total+=heights[index(x+dx,y+dy)]*weight;
        }
      }
      filtered[index(x,y)]=total/16;
    }
  }
  const pixels=new Uint8ClampedArray(rgba.length);
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      // Values are tangent-space offsets; the geometric face normal remains
      // the authority for physical shadowing, height and collision.
      const dx=(filtered[index(x+1,y)]-filtered[index(x-1,y)])*slope;
      const dy=(filtered[index(x,y+1)]-filtered[index(x,y-1)])*slope;
      const tx=Math.max(-.62,Math.min(.62,-dx));
      const ty=Math.max(-.62,Math.min(.62,-dy));
      const length=Math.hypot(tx,ty,1);
      const p=index(x,y)*4;
      pixels[p]=byte((tx/length*.5+.5)*255);
      pixels[p+1]=byte((ty/length*.5+.5)*255);
      pixels[p+2]=byte((1/length*.5+.5)*255);
      pixels[p+3]=255;
    }
  }
  return pixels;
}

/** One-time DOM adapter. The returned canvas is a retained WebGL2 TexImageSource. */
export function createHuntNormalTileCanvas(image,{slope=2.5,createCanvas}={}){
  if(!image||image.width!==size||image.height!==size){
    throw new RangeError('Hunt normal-map source must be 64x64');
  }
  const canvas=createCanvas?createCanvas():document.createElement('canvas');
  canvas.width=size;
  canvas.height=size;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('2D normal-map preparation context unavailable');
  context.drawImage(image,0,0,size,size);
  const tile=context.getImageData(0,0,size,size);
  tile.data.set(deriveHuntNormalPixels(tile.data,{slope}));
  context.putImageData(tile,0,0);
  return canvas;
}
