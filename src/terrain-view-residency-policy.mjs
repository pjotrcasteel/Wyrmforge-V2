// Voxel streaming policy. The host supplies a conservative world-space X/Z
// rectangle covering the camera and physical dependencies from its consumers.
// A decision changes no terrain; publication still follows write/mesh/upload.
const MAX_CATALOG_CELLS=4096;
const MAX_RESIDENT_CELLS=128;
const compareId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;

function rect(value){
  if(!value||![value.minX,value.maxX,value.minZ,value.maxZ].every(Number.isFinite)||
      value.minX>value.maxX||value.minZ>value.maxZ)throw new TypeError('Invalid terrain view bounds');
  return value;
}

function touches(cell,view,padding=0){
  // Cell maxima are inclusive voxel indices. Include their full metre of area.
  return cell.minX<=view.maxX+padding&&cell.maxX+1>=view.minX-padding&&
    cell.minZ<=view.maxZ+padding&&cell.maxZ+1>=view.minZ-padding;
}

export class TerrainViewResidencyPolicy {
  #cells;
  #limit;
  #preload;
  #retain;

  constructor(cells,{limit=48,preload=8,retain=16}={}){
    if(!Array.isArray(cells)||!cells.length||cells.length>MAX_CATALOG_CELLS||
      !Number.isSafeInteger(limit)||limit<1||limit>MAX_RESIDENT_CELLS||
      ![preload,retain].every(Number.isFinite)||preload<0||retain<preload||retain>128){
      throw new RangeError('Invalid terrain residency budget or padding');
    }
    this.#cells=new Map();
    for(const {id,bounds} of cells){
      if(typeof id!=='string'||!id||this.#cells.has(id))throw new Error('Duplicate or invalid terrain cell ID');
      this.#cells.set(id,{id,bounds:{...rect(bounds)}});
    }
    this.#limit=limit;
    this.#preload=preload;
    this.#retain=retain;
  }

  next({view,residentIds,protectedIds=[],busy=false}){
    rect(view);
    const resident=new Set(residentIds);
    const physical=new Set(protectedIds);
    if(resident.size>this.#limit||[...resident,...physical].some(id=>!this.#cells.has(id))){
      throw new RangeError('Resident or protected terrain is outside the catalog or budget');
    }
    if(busy)return {job:null,reason:'transition-in-flight'};

    const centerX=(view.minX+view.maxX)/2,centerZ=(view.minZ+view.maxZ)/2;
    const missing=[],retire=[];
    for(const cell of this.#cells.values()){
      const {id,bounds}=cell;
      const dx=Math.max(bounds.minX-centerX,0,centerX-bounds.maxX-1);
      const dz=Math.max(bounds.minZ-centerZ,0,centerZ-bounds.maxZ-1);
      const distance=dx*dx+dz*dz;
      const required=physical.has(id),visible=touches(bounds,view);
      if(resident.has(id)){
        if(!required&&!visible)retire.push({id,distance,retained:touches(bounds,view,this.#retain)});
      }else if(required||visible||touches(bounds,view,this.#preload)){
        missing.push({id,distance,priority:required?0:visible?1:2});
      }
    }

    missing.sort((a,b)=>a.priority-b.priority||a.distance-b.distance||compareId(a,b));
    retire.sort((a,b)=>Number(a.retained)-Number(b.retained)||b.distance-a.distance||compareId(a,b));
    const incoming=missing[0],outgoing=retire[0];
    if(incoming&&resident.size<this.#limit)return {job:{action:'load',id:incoming.id},reason:'requested'};
    // Keep offscreen neighbors in the retention ring to avoid churn on
    // reversals. An urgent load can use an unprotected offscreen slot.
    if(outgoing&&(!outgoing.retained||(incoming&&incoming.priority<2))){
      return {job:{action:'evict',id:outgoing.id},reason:'offscreen'};
    }
    if(incoming)return {job:null,reason:incoming.priority<2?'required-capacity':'preload-capacity'};
    return {job:null,reason:'settled'};
  }
}
