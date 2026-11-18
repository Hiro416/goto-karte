/* Minimal in-memory DOM adapter for extraction unit tests. This does not emulate a browser. */
class Element {
  constructor(raw, parent=null) {
    this.tagName=raw.tag;this.attrs={...raw.attrs};this.parent=parent;
    this.children=raw.children.map(c=>typeof c==='string'?c:new Element(c,this));
    this.checked='checked' in this.attrs;
  }
  get id(){return this.attrs.id||''}
  get parentElement(){return this.parent}
  get value(){return this.attrs.value||''}
  get alt(){return this.attrs.alt||''}
  get textContent(){return this.children.map(c=>typeof c==='string'?c:c.textContent).join('')}
  get classList(){return {contains:c=>(this.attrs.class||'').split(/\s+/).includes(c)}}
  getAttribute(name){return this.attrs[name]??null}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
  replaceWith(s){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1,s)}
  append(s){this.children.push(s)}
  cloneNode(){return new Element(this.raw())}
  raw(){return {tag:this.tagName,attrs:this.attrs,children:this.children.map(c=>typeof c==='string'?c:c.raw())}}
  descendants(){return this.children.filter(c=>typeof c!=='string').flatMap(c=>[c,...c.descendants()])}
  querySelectorAll(selector){const selectors=selector.split(',').map(x=>x.trim());return this.descendants().filter(n=>selectors.some(s=>matches(n,s)))}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  closest(selector){for(let n=this;n;n=n.parent)if(matches(n,selector))return n;return null}
}
function simple(node,selector){
  let ok=true;
  selector=selector.replace(/\[([\w-]+)(\^=|=)?(?:"([^"]*)"|'([^']*)'|([^\]]*))?\]/g,(_,key,op,dq,sq,unquoted)=>{
    const value=dq??sq??unquoted??'';const actual=node.getAttribute(key);
    if(op==='=')ok=ok&&actual===value;else if(op==='^=')ok=ok&&actual!==null&&actual.startsWith(value);else ok=ok&&actual!==null;
    return '';
  });
  if(!ok)return false;
  const tag=selector.match(/^[\w-]+/);if(tag&&node.tagName!==tag[0])return false;
  for(const m of selector.matchAll(/([.#])([\w-]+)/g))if(m[1]==='#'?node.id!==m[2]:!node.classList.contains(m[2]))return false;
  return true;
}
function matches(node,selector){
  const pieces=selector.replace(/\s*>\s*/g,' > ').trim().split(/\s+/);
  function walk(n,i){
    if(!n||!simple(n,pieces[i]))return false;
    if(i===0)return true;
    if(pieces[i-1]==='>')return walk(n.parent,i-2);
    for(let p=n.parent;p;p=p.parent)if(walk(p,i-1))return true;
    return false;
  }
  return walk(node,pieces.length-1);
}
module.exports={Element};
