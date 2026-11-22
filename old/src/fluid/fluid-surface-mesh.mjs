// Pure Water V2 presentation geometry. Voxel owns solid terrain and
// ColumnFluidEngine owns liquid volume and free-surface height. Dry-shore
// contours and diagonal bank corners are quantized at 10cm; no visual
// geometry can extend into an actually dry Voxel/Water V2 column.
import {FLUID_SURFACE_SCHEMA,MAX_FLUID_COLUMNS} from './column-fluid-engine.mjs';

export const FLUID_SHORE_MICRO_STEPS=10;
const CELL_EPSILON=.006;
const SMOOTH_HEAD_DIFFERENCE=.5;
export const FLUID_FALL_MIN_DROP=.2;
export const FLUID_FALL_RIBBON_SECTIONS=2;
// Sparse 10cm surface chips around the impact. The pattern is asymmetric,
// giving pixel-art spray without an obviously repeating circular stamp.
export const FLUID_LANDING_SPLASH_TILES=Object.freeze([
  [-4,-1],[-3,-3],[-2,-4],[0,-4],[2,-3],[3,-1],[3,1],[2,3],
  [0,3],[-2,3],[-4,2],[-3,0],[-1,-3],[1,-2],[-1,2],[1,2]
].map(([across,downstream])=>Object.freeze([across,downstream])));
const DIRECTIONS=Object.freeze([
  {dx:1,dz:0,normal:[1,0,0],edge:'east'},
  {dx:-1,dz:0,normal:[-1,0,0],edge:'west'},
  {dx:0,dz:1,normal:[0,0,1],edge:'south'},
  {dx:0,dz:-1,normal:[0,0,-1],edge:'north'}
]);
const key=(x,z)=>x+','+z;

// Each full-metre water cell used to be almost entirely rectangular:
// shoreline cuts were 0cm most of the time and never exceeded 20cm.
// Sample a COHERENT, world-anchored 20-40cm physical-bank silhouette at
// 10cm intervals. Narrow 1m streams retain >=60cm of visible water; broad
// basins have a stronger natural margin. The exact fluid volume is unchanged.
function shoreCut(x,z,side,segment,narrow){
  const along=side<2?z*10+Math.floor(segment/2):
    x*10+Math.floor(segment/2);
  const across=side===0?x*10+10:side===1?x*10:
    side===2?z*10+10:z*10;
  let hash=Math.imul(along+1,73856093)^
    Math.imul(across+1,19349663);
  hash=Math.imul(hash^(hash>>>16),2246822507);
  hash=Math.imul(hash^(hash>>>13),3266489909);
  const value=(hash^(hash>>>16))>>>0;
  return narrow?1+(value%5===0?1:0):
    2+(value%3===0?1:0)+(value%13===0?1:0);
}

function topQuad(x0,x1,z0,z1,height){
  return [
    [x0,height(x0,z0),z0],
    [x0,height(x0,z1),z1],
    [x1,height(x1,z1),z1],
    [x1,height(x1,z0),z0]
  ];
}

// One compact top-face rectangle per span of *actually wet* 10cm pixels.
// Adjacent rows with equal spans merge, keeping mobile vertex counts bounded.
// Diagonal dry bank cells matter too: a one-metre corner cannot remain a
// visually square cutout merely because all four direct neighbors are wet.
function microShoreCaps(x,z,shore,diagonal,height){
  if(!shore.some(Boolean)&&!diagonal.some(Boolean)){
    return [topQuad(x,x+1,z,z+1,height)];
  }
  const narrowX=shore[0]&&shore[1],narrowZ=shore[2]&&shore[3];
  const spans=[],previous=new Map();
  for(let row=0;row<FLUID_SHORE_MICRO_STEPS;row++){
    const next=new Map();
    let start=-1;
    for(let col=0;col<=FLUID_SHORE_MICRO_STEPS;col++){
      const diagCut=col<FLUID_SHORE_MICRO_STEPS&&(
        (diagonal[0]&&col+row<3) ||
        (diagonal[1]&&9-col+row<3) ||
        (diagonal[2]&&col+9-row<3) ||
        (diagonal[3]&&9-col+9-row<3));
      const inside=col<FLUID_SHORE_MICRO_STEPS&&!diagCut &&
        (!shore[0]||col<FLUID_SHORE_MICRO_STEPS-shoreCut(x,z,0,row,narrowX)) &&
        (!shore[1]||col>=shoreCut(x,z,1,row,narrowX)) &&
        (!shore[2]||row<FLUID_SHORE_MICRO_STEPS-shoreCut(x,z,2,col,narrowZ)) &&
        (!shore[3]||row>=shoreCut(x,z,3,col,narrowZ));
      if(inside&&start<0)start=col;
      if((!inside||col===FLUID_SHORE_MICRO_STEPS)&&start>=0){
        const name=start+','+col;
        const span=previous.get(name);
        if(span){
          span.endRow=row+1;
        }else{
          const created={start,end:col,startRow:row,endRow:row+1};
          spans.push(created);
          next.set(name,created);
        }
        if(span)next.set(name,span);
        start=-1;
      }
    }
    previous.clear();
    for(const [k,v] of next)previous.set(k,v);
  }
  return spans.map(span=>topQuad(
    x+span.start/FLUID_SHORE_MICRO_STEPS,
    x+span.end/FLUID_SHORE_MICRO_STEPS,
    z+span.startRow/FLUID_SHORE_MICRO_STEPS,
    z+span.endRow/FLUID_SHORE_MICRO_STEPS,height));
}

// Independent wet surfaces that differ by <=50cm share a corner head, avoiding
// water walls at every 1m tile seam. A real cliff/large drop stays vertical.
function cornerHead(x,z,cell,at){
  const values=[];
  let highestSolid=-Infinity;
  for(let dz=-1;dz<=0;dz++)for(let dx=-1;dx<=0;dx++){
    const near=at(x+dx,z+dz);
    if(near?.depth>0&&Number.isFinite(near.surfaceY)){
      values.push(near.surfaceY);
      highestSolid=Math.max(highestSolid,near.floorY);
    }
  }
  if(!values.length)return cell.surfaceY;
  const min=Math.min(...values),max=Math.max(...values);
  if(max-min>SMOOTH_HEAD_DIFFERENCE)return cell.surfaceY;
  // Never let interpolation invent extra volume ABOVE any neighbor's
  // solver-owned head. On the same continuous wet stone plane, use the
  // shared lower corner head so independently emitted caps meet cleanly.
  // A real stone step is different: smoothing the upper wet face down below
  // the adjacent high bed would bury it inside Voxel and hide a waterfall.
  if(highestSolid>=min-CELL_EPSILON)return cell.surfaceY;
  return min;
}

export function buildFluidSurfaceMesh(surface,{sampleAt}={}){
  if(surface?.schema!==FLUID_SURFACE_SCHEMA||
      !['water','lava'].includes(surface.kind)||!Array.isArray(surface.cells)||
      surface.cells.length>MAX_FLUID_COLUMNS||typeof sampleAt!=='function'){
    throw new TypeError('Expected bounded Water V2 surface and read-only column sampler');
  }
  const {minX,maxX,minZ,maxZ}=surface.bounds??{};
  if(![minX,maxX,minZ,maxZ].every(Number.isSafeInteger)||
      minX>maxX||minZ>maxZ||surface.cells.length>(maxX-minX+1)*(maxZ-minZ+1)){
    throw new RangeError('Invalid fluid resident bounds');
  }

  // An actual falling packet is sufficient physical evidence of a live
  // waterfall even before its lower receiving pool becomes wet. The old
  // renderer hid the curtain whenever neighbor.depth===0 during transit.
  const flights=surface.flights??[];
  if(!Array.isArray(flights)||flights.length>256){
    throw new RangeError('Invalid bounded real falling-fluid handoff');
  }
  const activeFlightEdges=new Set(flights.map(flight=>
    key(flight.x,flight.z)+'>'+key(flight.toX,flight.toZ)));
  const cache=new Map();
  const at=(x,z)=>{
    if(x<minX||x>maxX||z<minZ||z>maxZ)return null;
    const id=key(x,z);
    if(!cache.has(id))cache.set(id,sampleAt(x,z));
    return cache.get(id);
  };
  const positions=[],normals=[],flows=[],faceModes=[],landingHeights=[],indices=[];
  let faceCount=0,topFaces=0,sideFaces=0,refinedShoreColumns=0;
  let waterfallFaces=0,fallLipFaces=0,fallRibbonFaces=0,landingSplashFaces=0;
  let waterfallGroups=0,maxWaterfallWidth=0;
  let flightFaces=0,submergedFlightCount=0;
  const seen=new Set();
  // Translucent cap pixels are composited without depth writes. Queue
  // downstream foam until AFTER every pool cap so it cannot be painted over
  // by a later wet column in the deterministic resident scan order.
  const landingQuads=[];
  // Group only adjacent real falling edges lying on the SAME physical
  // stone plane and pointing downhill in the same direction. An unrelated
  // nearby stream or disconnected ledge must never join the waterfall.
  const fallingEdges=[];
  const pushFace=(quad,normal,flow,{mode=0,landingY=0}={})=>{
    const vertex=positions.length/3;
    for(const point of quad){
      positions.push(...point);
      normals.push(...normal);
      flows.push(flow[0],flow[1]);
      faceModes.push(mode);
      landingHeights.push(landingY);
    }
    indices.push(vertex,vertex+1,vertex+2,vertex,vertex+2,vertex+3);
    faceCount++;
  };

  for(const c of surface.cells){
    if(!c||![c.x,c.z,c.floorY,c.surfaceY,c.depth].every(Number.isFinite)||
        !Number.isInteger(c.x)||!Number.isInteger(c.z)||!Number.isInteger(c.floorY)||
        c.x<minX||c.x>maxX||c.z<minZ||c.z>maxZ||
        c.depth<1||c.depth>160||
        Math.abs(c.surfaceY-(c.floorY+c.depth/10))>1e-6){
      throw new RangeError('Invalid fluid surface column');
    }
    if(![c.flowX,c.flowZ].every(v=>Number.isInteger(v)&&Math.abs(v)<=1)){
      throw new RangeError('Fluid flow direction must be a signed cardinal vector');
    }
    const id=key(c.x,c.z);
    if(seen.has(id))throw new Error('Duplicate wet column in fluid mesh');
    seen.add(id);

    const x=c.x,z=c.z,flow=[c.flowX,c.flowZ];
    const neighbors=DIRECTIONS.map(side=>at(x+side.dx,z+side.dz));
    // Clip a real dry bank edge at 10cm even when its floor is lower than
    // the current water head. Otherwise low dry banks create full 1m square
    // floating caps before the falling parcel physically lands.
    const shoreline=neighbors.map(neighbor=>
      Boolean(neighbor&&neighbor.depth===0));
    const diagonal=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([dx,dz])=>{
      const neighbor=at(x+dx,z+dz);
      return Boolean(neighbor&&neighbor.depth===0);
    });
    if(shoreline.some(Boolean)||diagonal.some(Boolean))refinedShoreColumns++;
    // This is an existing physical lip with a lower, already wet receiving
    // column. Render a flowing fall only when Water V2 publishes that actual
    // downstream direction. A tall wall around a still pool is not a waterfall.
    const isRealFall=(side,neighbor)=>Boolean(neighbor &&
      c.floorY>neighbor.floorY &&
      (activeFlightEdges.has(key(x,z)+'>'+key(x+side.dx,z+side.dz)) ||
        (neighbor.depth>0 &&
          ((c.surfaceY-neighbor.surfaceY>=FLUID_FALL_MIN_DROP-1e-6 &&
            c.flowX===side.dx&&c.flowZ===side.dz) ||
            // A real WorldGen river current can carry liquid across a
            // physical ledge at nearly equal water heads. Rendering must
            // honor that actual conservative transfer, not hide its fall.
            (c.currentX===side.dx&&c.currentZ===side.dz&&
              c.surfaceY>=neighbor.surfaceY-.100001)))));
    const fallingIndex=DIRECTIONS.findIndex((side,i)=>isRealFall(side,neighbors[i]));
    const hasFallingEdge=fallingIndex>=0;

    const h00=cornerHead(x,z,c,at),h01=cornerHead(x,z+1,c,at);
    const h10=cornerHead(x+1,z,c,at),h11=cornerHead(x+1,z+1,c,at);
    const height=(px,pz)=>{
      const fx=px-x,fz=pz-z;
      return ((h00*(1-fx)+h10*fx)*(1-fz)+
        (h01*(1-fx)+h11*fx)*fz)+CELL_EPSILON;
    };
    // Left/right/south/north order is identical to DIRECTIONS. Cutting is
    // entirely inward from a wet column, never painted onto dry terrain.
    const caps=microShoreCaps(x,z,shoreline,diagonal,height);
    for(const quad of caps)pushFace(quad,[0,1,0],flow,{
      mode:hasFallingEdge?3:0,
      landingY:hasFallingEdge?neighbors[fallingIndex].surfaceY:0
    });
    topFaces+=caps.length;
    if(hasFallingEdge)fallLipFaces+=caps.length;

    for(let i=0;i<DIRECTIONS.length;i++){
      const side=DIRECTIONS[i],neighbor=neighbors[i];
      if(!neighbor||!Number.isFinite(neighbor.floorY))continue;
      // Small adjacent wet-level differences were joined by the corner
      // interpolation: no extra dark water wall between those caps.
      const waterfall=isRealFall(side,neighbor);
      if(neighbor.depth>0&&!waterfall&&
          Math.abs(c.surfaceY-neighbor.surfaceY)<=SMOOTH_HEAD_DIFFERENCE){
        continue;
      }
      // Only falling, connected water is allowed to extend below the upper
      // *solid floor* to the actual lower pool's surface. Other side walls
      // retain their original solid-floor clamp.
      const landingHead=neighbor.depth>0?neighbor.surfaceY:neighbor.floorY;
      const lower=waterfall?landingHead:Math.max(c.floorY,landingHead);
      const a=side.dx!==0
        ?[side.dx===1?x+1:x,z]
        :[x,side.dz===1?z+1:z];
      const b=side.dx!==0
        ?[side.dx===1?x+1:x,z+1]
        :[x+1,side.dz===1?z+1:z];
      const ha=height(a[0],a[1]),hb=height(b[0],b[1]);
      if(Math.max(ha,hb)<=lower+0.01)continue;
      let quad;
      if(i===0){quad=[[x+1,lower,z],[x+1,ha,z],[x+1,hb,z+1],[x+1,lower,z+1]];}
      else if(i===1){quad=[[x,lower,z],[x,lower,z+1],[x,hb,z+1],[x,ha,z]];}
      else if(i===2){quad=[[x,lower,z+1],[x+1,lower,z+1],[x+1,hb,z+1],[x,ha,z+1]];}
      else{quad=[[x,lower,z],[x,ha,z],[x+1,hb,z],[x+1,lower,z]];}
      // Lift falling sheets just outside the cliff face by 8mm to avoid
      // depth-fighting with the authoritative Voxel rock, not to add volume.
      const visibleQuad=waterfall
        ?quad.map(([px,py,pz])=>[px+side.dx*.008,py,pz+side.dz*.008])
        :quad;
      pushFace(visibleQuad,side.normal,flow,{
        mode:waterfall?2:1,
        landingY:waterfall?landingHead:0
      });
      sideFaces++;
      if(waterfall){
        waterfallFaces++;
        // Hold the render-only ribbon and lower-pool glints until all
        // physical edges are known. Rendering them together removes the
        // 20cm gaps and independently oscillating narrow waterfall strips.
        const edgeX=x+.5+side.dx*.5,edgeZ=z+.5+side.dz*.5;
        const acrossX=-side.dz,acrossZ=side.dx;
        const plane=side.dx!==0?edgeX:edgeZ;
        fallingEdges.push({
          dx:side.dx,dz:side.dz,plane,
          edgeX,edgeZ,acrossX,acrossZ,
          lateral:edgeX*acrossX+edgeZ*acrossZ,
          high:(ha+hb)*.5+.024,
          low:landingHead+.026,landingHead,
          flow,
          lowerWet:neighbor.depth>0
        });
      }
    }
  }
  const sorted=fallingEdges.sort((a,b)=>
    a.dx-b.dx||a.dz-b.dz||a.plane-b.plane||a.lateral-b.lateral);
  const groups=[];
  for(const edge of sorted){
    const last=groups.at(-1);
    const previous=last?.at(-1);
    if(last&&previous&&
        edge.dx===previous.dx&&edge.dz===previous.dz&&
        edge.plane===previous.plane&&
        Math.abs(edge.lateral-previous.lateral-1)<1e-6&&
        Math.abs(edge.high-previous.high)<=.35&&
        Math.abs(edge.low-previous.low)<=.35){
      last.push(edge);
    }else{
      groups.push([edge]);
    }
  }
  waterfallGroups=groups.length;
  for(const group of groups){
    const first=group[0],width=group.length;
    maxWaterfallWidth=Math.max(maxWaterfallWidth,width);
    const high=group.reduce((sum,edge)=>sum+edge.high,0)/width;
    const low=group.reduce((sum,edge)=>sum+edge.low,0)/width;
    const landing=group.reduce((sum,edge)=>sum+edge.landingHead,0)/width;
    const edgePoint=(distance,lateral,y)=>[
      first.edgeX+first.dx*distance+first.acrossX*lateral,
      y,
      first.edgeZ+first.dz*distance+first.acrossZ*lateral
    ];
    // One uninterrupted face band from the first real falling column to
    // the last: exactly five 20cm pixel strips per metre, with NO margins
    // or gaps at former 1m column borders. Each group has ONE shared upper
    // and lower height; no independent three-jet animation can develop.
    const offsets=[-.1,.2,.6];
    const heights=[high,Math.max(low+.08,high-.24),low];
    for(let span=0;span<FLUID_FALL_RIBBON_SECTIONS;span++){
      for(let strip=0;strip<width*5;strip++){
        const left=-.5+strip*.2,right=left+.2;
        pushFace([
          edgePoint(offsets[span],left,heights[span]),
          edgePoint(offsets[span+1],left,heights[span+1]),
          edgePoint(offsets[span+1],right,heights[span+1]),
          edgePoint(offsets[span],right,heights[span])
        ],[0,1,0],[first.dx,first.dz],{mode:4,landingY:landing});
        fallRibbonFaces++;
      }
    }
    // A broad fall has one dispersed receiving-pool splash footprint;
    // overlapping identical 16-pixel stamps on every metre made adjacent
    // columns look like separate waterfalls. Isolated 1m falls retain the
    // accepted 16-chip footprint and remain physically wet-to-wet.
    const wetEdges=group.filter(edge=>edge.lowerWet);
    if(!wetEdges.length)continue;
    const count=width===1?FLUID_LANDING_SPLASH_TILES.length:
      Math.max(16,Math.ceil(wetEdges.length*8));
    for(let i=0;i<count;i++){
      const [across,downstream]=FLUID_LANDING_SPLASH_TILES[
        i%FLUID_LANDING_SPLASH_TILES.length];
      const lateral=width===1?across/FLUID_SHORE_MICRO_STEPS:
        Math.round((-.5+(i+.5)/count*width)*10)/10;
      const edge=width===1?first:
        group[Math.min(width-1,Math.max(0,Math.floor(lateral+.5)))];
      if(!edge.lowerWet)continue;
      const lowerY=edge.landingHead;
      const originX=first.edgeX+first.dx*.5+first.acrossX*lateral;
      const originZ=first.edgeZ+first.dz*.5+first.acrossZ*lateral;
      const splashPoint=(distance,offset)=>[
        originX+first.dx*distance+first.acrossX*offset,
        lowerY+.036,
        originZ+first.dz*distance+first.acrossZ*offset
      ];
      const step=1/FLUID_SHORE_MICRO_STEPS;
      const distance=downstream/FLUID_SHORE_MICRO_STEPS;
      landingQuads.push({
        quad:[
          splashPoint(distance,0),
          splashPoint(distance,step),
          splashPoint(distance+step,step),
          splashPoint(distance+step,0)
        ],
        flow:[first.dx,first.dz],landingY:lowerY
      });
      landingSplashFaces++;
    }
  }
  for(const {quad,flow,landingY} of landingQuads){
    pushFace(quad,[0,1,0],flow,{mode:5,landingY});
  }
  // Real solver-owned parcels occupy space between two columns. A parcel
  // never appears for a mere static height difference: only actual fluid
  // units removed from the source and pending arrival are rendered here.
  for(const parcel of flights){
    const {x,z,toX,toZ,units,progress,startY,landingY}=parcel??{};
    const dx=toX-x,dz=toZ-z;
    if(![x,z,toX,toZ,units,progress,startY,landingY].every(Number.isFinite)||
        ![x,z,toX,toZ,units].every(Number.isSafeInteger)||
        Math.abs(dx)+Math.abs(dz)!==1||
        x<minX||x>maxX||toX<minX||toX>maxX||
        z<minZ||z>maxZ||toZ<minZ||toZ>maxZ||
        units<1||units>10||progress<0||progress>1){
      throw new RangeError('Invalid physically traveling liquid parcel');
    }
    // A receiving pool can rise while an already-departed packet is airborne.
    // The packet's *reserved volume* remains owned by the solver, but it is
    // now below the visible water surface. Don't terminate Play Hunt for this
    // perfectly legal hydrologic event; just cull submerged spray geometry.
    if(startY<=landingY){
      submergedFlightCount++;
      continue;
    }
    const acrossX=-dz,acrossZ=dx;
    const forward=.05+.78*progress;
    const px=x+.5+dx*(.5+forward);
    const pz=z+.5+dz*(.5+forward);
    const y=startY+(landingY-startY)*progress;
    const half=Math.min(.18,.07+units*.02);
    const point=(along,across,height)=>[
      px+dx*along+acrossX*across,
      height,
      pz+dz*along+acrossZ*across
    ];
    pushFace([
      point(-.12,-half,y+.11),
      point(.12,-half,y-.11),
      point(.12,half,y-.11),
      point(-.12,half,y+.11)
    ],[0,1,0],[dx,dz],{mode:6,landingY});
    flightFaces++;
  }
  return Object.freeze({
    schema:'wyrmforge.fluid-surface-mesh.v1',
    kind:surface.kind,step:surface.step,faceCount,topFaces,sideFaces,
    wetColumns:surface.cells.length,refinedShoreColumns,
    waterfallFaces,fallLipFaces,fallRibbonFaces,landingSplashFaces,
    waterfallGroups,maxWaterfallWidth,flightFaces,submergedFlightCount,
    vertexCount:faceCount*4,triangleCount:faceCount*2,
    positions:new Float32Array(positions),
    normals:new Int8Array(normals),
    flows:new Int8Array(flows),
    faceModes:new Uint8Array(faceModes),
    landingHeights:new Float32Array(landingHeights),
    indices:new Uint32Array(indices)
  });
}
