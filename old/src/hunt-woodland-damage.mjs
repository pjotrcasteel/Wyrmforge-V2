// Damage belongs to the live prop, keyed by its authored placement ID.
const MAX_DAMAGED_PROPS=4096;
const VALID_ID=/^[\w:-]{1,160}$/;

export class HuntWoodlandDamage {
  #hits=new Map();
  #storage;
  #key;

  constructor(storage,identity){
    this.#storage=storage;
    this.#key='wyrmforge.hunt-tree-damage.v1:'+identity;
    try{
      const raw=storage?.getItem(this.#key);
      if(!raw||raw.length>MAX_DAMAGED_PROPS*168)return;
      const entries=JSON.parse(raw);
      if(Array.isArray(entries)&&entries.length<=MAX_DAMAGED_PROPS&&entries.every(entry=>
        Array.isArray(entry)&&entry.length===2&&typeof entry[0]==='string'&&VALID_ID.test(entry[0])&&
        (entry[1]===1||entry[1]===2)))this.#hits=new Map(entries);
    }catch{}
  }

  hits(id){return this.#hits.get(id)??0;}

  hit(id){
    const previous=this.hits(id);
    if(previous>=2||(!previous&&this.#hits.size>=MAX_DAMAGED_PROPS))return null;
    const hits=previous+1;
    this.#hits.set(id,hits);
    try{this.#storage?.setItem(this.#key,JSON.stringify([...this.#hits]));}catch{}
    return hits;
  }
}
