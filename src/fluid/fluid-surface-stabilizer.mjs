// Water V2 presentation-only temporal filter: never changes the solver,
// material engine, saved fluid volume or the authoritative terrain.
// A cell must ACTUALLY be wet in the current snapshot to be rendered.
// Small 10cm head oscillations are held; larger changes catch up gradually.
const key=(x,z)=>x+','+z;

export function stabilizeFluidSurface(surface,sampleAt,previous=new Map()){
  if(!surface||!Array.isArray(surface.cells)||
      typeof sampleAt!=='function'||!(previous instanceof Map)){
    throw new TypeError('Expected real Water V2 cells and a sampler');
  }
  const history=new Map();
  const wet=new Map();
  const cells=surface.cells.map(cell=>{
    const id=key(cell.x,cell.z);
    const old=previous.get(id);
    let depth=cell.depth;
    if(old?.floorY===cell.floorY&&Number.isInteger(old.depth) &&
        old.depth>=1&&old.depth<=160){
      const delta=cell.depth-old.depth;
      if(Math.abs(delta)<=1){
        depth=old.depth;
      }else{
        depth=old.depth+Math.sign(delta)*Math.min(2,Math.abs(delta)-1);
      }
      depth=Math.max(1,Math.min(160,depth));
    }
    const shown=Object.freeze({
      ...cell,depth,surfaceY:cell.floorY+depth/10
    });
    history.set(id,{floorY:cell.floorY,depth});
    wet.set(id,shown);
    return shown;
  });
  const sample=(x,z)=>{
    const real=sampleAt(x,z);
    const visible=wet.get(key(x,z));
    if(!real||!visible||real.depth<1||real.floorY!==visible.floorY){
      return real;
    }
    return {
      ...real,depth:visible.depth,surfaceY:visible.surfaceY
    };
  };
  return Object.freeze({
    surface:Object.freeze({...surface,cells:Object.freeze(cells)}),
    sampleAt:sample,
    history
  });
}
