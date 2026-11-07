// Tiny in-memory stand-in for firebase-admin so payment logic can be tested without any real credentials.
const store=new Map();
const clone=x=>x===undefined?x:JSON.parse(JSON.stringify(x));
const deep=(a,b)=>{const o=Object.assign({},a);for(const k in b){o[k]=(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k]))?deep(a&&a[k],b[k]):b[k]}return o};
const stats={userWrites:0,deleted:[]};
const ref=(c,id)=>({c,id,k:c+'/'+id,
  async get(){const d=store.get(c+'/'+id);return{exists:!!d,id,data:()=>clone(d)}},
  async set(v,o){if(c==='users')stats.userWrites++;store.set(c+'/'+id,o&&o.merge?deep(store.get(c+'/'+id),clone(v)):clone(v))},
  async update(v){if(!store.has(c+'/'+id))throw new Error('NOT_FOUND');store.set(c+'/'+id,Object.assign({},store.get(c+'/'+id),clone(v)))},
  async delete(){store.delete(c+'/'+id)}});
const coll=c=>({doc:id=>ref(c,id),
  where(f,_,v){const fl=[[f,v]];const q={where(f2,_2,v2){fl.push([f2,v2]);return q},limit(){return q},async get(){const docs=[];for(const [k,d] of store)if(k.startsWith(c+'/')&&fl.every(([a,b])=>d[a]===b))docs.push({id:k.slice(c.length+1),data:()=>clone(d)});return{docs}}};return q},
  async get(){const docs=[];for(const [k,d] of store)if(k.startsWith(c+'/'))docs.push({id:k.slice(c.length+1),data:()=>clone(d)});return{docs}}});
const fs={collection:coll,async runTransaction(fn){const pend=[];const t={async get(r){return r.get()},update(r,v){pend.push(()=>store.set(r.k,Object.assign({},store.get(r.k),clone(v))))},set(r,v,o){pend.push(()=>{if(r.c==='users')stats.userWrites++;store.set(r.k,o&&o.merge?deep(store.get(r.k),clone(v)):clone(v))})}};const out=await fn(t);pend.forEach(f=>f());return out}};
module.exports={apps:[],initializeApp(){this.apps.push(1)},credential:{cert:x=>x},
  auth:()=>({async deleteUser(u){stats.deleted.push(u)},async verifyIdToken(t){const m=/^tok:([^:]+):(.*)$/.exec(t);if(!m)throw new Error('bad token');return{uid:m[1],email:m[2]||undefined}}}),
  firestore:()=>fs,__store:store,__stats:stats};
