const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context=vm.createContext({});
vm.runInContext(fs.readFileSync('dist/tri.js','utf8')+';globalThis.Tri=Tri;',context);
const Tri=context.Tri;

test('header click cycles ascending, descending, then back to the usual order',()=>{
  let s=Tri.suivant(null,'name'); assert.equal(s.dir,'asc');
  s=Tri.suivant(s,'name'); assert.equal(s.dir,'desc');
  assert.equal(Tri.suivant(s,'name'),null);
  assert.equal(Tri.suivant({key:'name',dir:'desc'},'rank').dir,'asc');
});

test('sorting keeps blanks last both ways, ties in usual order, and groups in place',()=>{
  const rows=[{n:'Émile',p:3,g:'A'},{n:'adam',p:null,g:'A'},{n:'Zoé',p:1,g:'B'},{n:'Bob',p:1,g:'A'},{n:'Alice',p:2,g:'B'}];
  const val=(r,k)=>k==='name'?r.n:r.p;
  assert.deepEqual(Tri.appliquer(rows,{key:'name',dir:'asc'},val).map(r=>r.n),['adam','Alice','Bob','Émile','Zoé']);
  assert.deepEqual(Tri.appliquer(rows,{key:'rank',dir:'desc'},val).map(r=>r.n),['Émile','Alice','Zoé','Bob','adam']);
  assert.deepEqual(Tri.appliquer(rows,{key:'rank',dir:'asc'},val,r=>r.g).map(r=>r.n),['Bob','Émile','adam','Zoé','Alice']);
  assert.deepEqual(Tri.appliquer(rows,null,val).map(r=>r.n),rows.map(r=>r.n));
});
