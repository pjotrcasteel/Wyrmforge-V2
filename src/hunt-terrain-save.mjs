// Exact committed writes. The v1 storage key also accepts old removal arrays.
const MAX_CELLS=32768;
const MAX_ADDITIONS=4096;
const MAX_SAVED_CHARS=1250000;
const COORDINATES=/^-?\d{1,7},-?\d{1,7},-?\d{1,7}$/;
const OWNER=/^[\w:-]{1,128}$/;
const keyOf=({x,y,z})=>x+','+y+','+z;
const validAddition=cell=>cell&&typeof cell.owner==='string'&&OWNER.test(cell.owner)&&
  [cell.x,cell.y,cell.z].every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=9999999)&&
  Number.isInteger(cell.material)&&cell.material>0&&cell.material<=255&&cell.material!==4;

function exceedsOwnerCapacity(additions){
  const counts=new Map();
  for(const {owner} of additions){
    const next=(counts.get(owner)??0)+1;
    if(next>512)return true;
    counts.set(owner,next);
  }
  return false;
}

export class HuntTerrainSave {
  #storage;
  #key;
  #removedCells=new Set();
  #additions=new Map();
  #status='ready';
  get removedCells(){return this.#removedCells;}
  get additions(){return [...this.#additions.values()];}
  get status(){return this.#status;}

  constructor(storage,identity){
    this.#storage=storage;
    this.#key='wyrmforge.hunt-terrain.v1:'+identity;
    if(!storage){this.#status='unavailable';return;}
    try{
      const raw=storage.getItem(this.#key);
      if(!raw)return;
      if(raw.length>MAX_SAVED_CHARS)throw new Error('Save exceeds size limit');
      const entry=JSON.parse(raw);
      const cells=Array.isArray(entry)?entry:entry?.version===2?entry.removed:null;
      const additions=Array.isArray(entry)?[]:entry?.added;
      if(!Array.isArray(cells)||cells.length>MAX_CELLS||
          cells.some(cell=>typeof cell!=='string'||!COORDINATES.test(cell))||
          !Array.isArray(additions)||additions.length>MAX_ADDITIONS||!additions.every(validAddition)){
        throw new Error('Invalid terrain save');
      }
      const removals=new Set(cells);
      const placed=new Map(additions.map(cell=>[keyOf(cell),Object.freeze(cell)]));
      if(placed.size!==additions.length||exceedsOwnerCapacity(placed.values())||[...placed.keys()].some(key=>!removals.has(key))){
        throw new Error('Conflicting terrain additions');
      }
      this.#removedCells=removals;
      this.#additions=placed;
    }catch{this.#status='unreadable';}
  }

  countAdditionsAfterRemoving(removals){
    let remaining=this.#additions.size;
    for(const key of removals){
      if(this.#additions.has(key))remaining--;
    }
    return remaining;
  }

  commit(removedCells){
    if(removedCells?.length)this.commitCollapse(removedCells,[]);
  }

  commitCollapse(removedCells,additions){
    if(this.#status==='full')return false;
    if(!Array.isArray(removedCells)||!Array.isArray(additions)||!additions.every(validAddition)||
        removedCells.some(cell=>typeof cell!=='string'||!COORDINATES.test(cell))){
      throw new TypeError('Invalid committed terrain delta');
    }
    const next=new Map(this.#additions);
    const changed=new Set(removedCells);
    for(const id of changed)next.delete(id);
    for(const cell of additions){
      const id=keyOf(cell);
      changed.add(id);
      next.set(id,Object.freeze({...cell}));
    }
    const newlyRemoved=[...changed].filter(id=>!this.#removedCells.has(id));
    if(this.#removedCells.size+newlyRemoved.length>MAX_CELLS||next.size>MAX_ADDITIONS||exceedsOwnerCapacity(next.values())){
      this.#status='full';
      return false;
    }
    // Keep the original Set live for all residency consumers.
    for(const id of newlyRemoved)this.#removedCells.add(id);
    this.#additions=next;
    if(!['ready','saved'].includes(this.#status))return false;
    try{
      const payload=next.size?{version:2,removed:[...this.#removedCells],added:[...next.values()]}:[...this.#removedCells];
      this.#storage.setItem(this.#key,JSON.stringify(payload));
      this.#status='saved';
      return true;
    }catch{this.#status='unavailable';return false;}
  }
}
