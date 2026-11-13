// Builder pattern: a strategy declares routes, landmark clearings and broad
// landform intent. It never writes voxels, meshes, collisions, or object art.
const IDENTIFIER=/^[a-z][a-z0-9-]{2,47}$/;
const integer=(n)=>Number.isSafeInteger(n);
const freezePoint=(point)=>Object.freeze({x:point.x,z:point.z});

export class SitePlanBuilder {
  #recipe;
  #terrain=null;
  #routes=[];
  #clearings=[];
  #landmarks=[];
  #features=[];
  #ids=new Set();
  #built=false;

  constructor(recipe) {this.#recipe=recipe;}
  #checkOpen(id) {
    if(this.#built) throw new Error('Site plan has already been built');
    if(!IDENTIFIER.test(id) || this.#ids.has(id)) {
      throw new RangeError('Invalid or duplicated site feature identifier');
    }
    this.#ids.add(id);
  }
  #point(point,margin=1) {
    if(!point || !integer(point.x) || !integer(point.z) ||
        Math.abs(point.x)>this.#recipe.radius-margin ||
        Math.abs(point.z)>this.#recipe.radius-margin) {
      throw new RangeError('Site feature is outside the generation footprint');
    }
    return freezePoint(point);
  }
  setTerrain({elevation,exposedStone}) {
    if(this.#built || this.#terrain) throw new Error('Terrain intent already specified');
    if(typeof elevation!=='function' ||
        !Number.isFinite(exposedStone) ||
        exposedStone<0 || exposedStone>1) {
      throw new TypeError('Terrain intent needs elevation and a stone exposure threshold');
    }
    this.#terrain=Object.freeze({elevation,exposedStone});
    return this;
  }
  addRoute(id,nodes,width=2) {
    this.#checkOpen(id);
    if(!Array.isArray(nodes) || nodes.length<2 || nodes.length>10 ||
        !integer(width) || width<1 || width>3) {
      throw new RangeError('Routes need bounded nodes and width');
    }
    this.#routes.push(Object.freeze({
      id,width,nodes:Object.freeze(nodes.map(node=>this.#point(node)))
    }));
    return this;
  }
  addClearing({id,x,z,radius}) {
    this.#checkOpen(id);
    if(!integer(radius) || radius<2 || radius>7) {
      throw new RangeError('Invalid clearing radius');
    }
    this.#clearings.push(Object.freeze({
      id,...this.#point({x,z},radius+1),radius
    }));
    return this;
  }
  addLandmark({id,kind,x,z,clearance}) {
    this.#checkOpen(id);
    if(!IDENTIFIER.test(kind) ||
        !integer(clearance) || clearance<1 || clearance>5) {
      throw new RangeError('Invalid landmark descriptor');
    }
    this.#landmarks.push(Object.freeze({
      id,kind,...this.#point({x,z},clearance+1),clearance
    }));
    return this;
  }
  addFeature({id,kind,x,z,radius}) {
    this.#checkOpen(id);
    if(!IDENTIFIER.test(kind) || !integer(radius) ||
        radius<1 || radius>12) {
      throw new RangeError('Invalid terrain design feature');
    }
    this.#features.push(Object.freeze({
      id,kind,...this.#point({x,z}),radius
    }));
    return this;
  }
  build() {
    if(this.#built) throw new Error('Site plan already built');
    this.#built=true;
    if(!this.#terrain || !this.#routes.some(route=>route.id==='entry-to-exit') ||
        this.#landmarks.length===0 || this.#clearings.length===0) {
      throw new Error('Site strategy must define landform, entry-to-exit route, and landmark');
    }
    return Object.freeze({
      recipe:this.#recipe,terrain:this.#terrain,
      routes:Object.freeze([...this.#routes]),
      clearings:Object.freeze([...this.#clearings]),
      landmarks:Object.freeze([...this.#landmarks]),
      features:Object.freeze([...this.#features])
    });
  }
}
