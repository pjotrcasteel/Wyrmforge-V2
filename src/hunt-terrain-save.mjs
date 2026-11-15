// Exact committed removals, rather than re-targeted Fireballs. Terrain that
// was absent at cast time must stay untouched when it streams in later.
const MAX_CELLS=32768;
const MAX_SAVED_CHARS=750000;
const COORDINATES=/^-?\d{1,7},-?\d{1,7},-?\d{1,7}$/;

export class HuntTerrainSave {
  #storage;
  #key;
  #removedCells=new Set();
  #status='ready';
  get removedCells(){return this.#removedCells;}
  get status(){return this.#status;}

  constructor(storage,identity){
    this.#storage=storage;
    this.#key='wyrmforge.hunt-terrain.v1:'+identity;
    if(!storage){this.#status='unavailable';return;}
    try{
      const raw=storage.getItem(this.#key);
      if(!raw)return;
      if(raw.length>MAX_SAVED_CHARS)throw new Error('Save exceeds size limit');
      const cells=JSON.parse(raw);
      if(!Array.isArray(cells)||cells.length>MAX_CELLS||
          cells.some(cell=>typeof cell!=='string'||!COORDINATES.test(cell))){
        throw new Error('Invalid terrain save');
      }
      this.#removedCells=new Set(cells);
    }catch{this.#status='unreadable';}
  }

  commit(removedCells){
    if(!removedCells?.length||!['ready','saved'].includes(this.#status))return;
    const added=removedCells.filter(cell=>!this.#removedCells.has(cell));
    if(this.#removedCells.size+added.length>MAX_CELLS){
      this.#status='full';
      return;
    }
    for(const cell of added)this.#removedCells.add(cell);
    try{
      this.#storage.setItem(this.#key,JSON.stringify([...this.#removedCells]));
      this.#status='saved';
    }catch{this.#status='unavailable';}
  }
}
