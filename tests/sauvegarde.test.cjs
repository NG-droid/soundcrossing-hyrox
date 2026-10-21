const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

// Module de sauvegarde commun, avec un faux navigateur (pas de serveur : file://).
function harness() {
  const values=new Map();
  const context=vm.createContext({crypto:webcrypto,Date,TextDecoder,location:{protocol:'file:'},
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}});
  for (const file of ['core.js','wod-core.js','sauvegarde.js']) vm.runInContext(fs.readFileSync(`dist/${file}`,'utf8'),context);
  vm.runInContext('this.api={Sauvegarde,Pace,Wod};',context);
  return {values,...context.api};
}
const hyroxStore=()=>({version:4,revision:'h1',savedAt:10,history:[],settings:{photoTemplate:'club'},session:{title:'Soundcrossing',date:'2026-10-21',races:[{id:'r1',title:'Course',date:'2026-10-21',format:'SOLO'}],entries:[]}});
const wodStore=()=>({version:2,revision:'w1',savedAt:20,selectedId:'e1',history:[],events:[{id:'e1',title:'WOD',date:'2026-10-21',format:'MIXED',method:'places',athletes:[],workouts:[],scores:{}}]});

test('the file name says what it is and when it was made',()=>{
  const {Sauvegarde}=harness(), when=new Date(2026,9,21,8,5);
  assert.equal(Sauvegarde.nom(false,when),'Soundcrossing-sauvegarde-2026-10-21-08h05.json');
  assert.equal(Sauvegarde.nom(true,when),'Soundcrossing-copie-avant-restauration-2026-10-21-08h05.json');
});

test('one file holds Hyrox and WOD, and an app without events leaves its part empty',()=>{
  const {Sauvegarde,Pace,Wod}=harness();
  const h=Pace.validateStore(hyroxStore()), w=Wod.validateStore(wodStore());
  const file=JSON.parse(Sauvegarde.contenu(h,w));
  assert.equal(file.format,'soundcrossing-sauvegarde');
  assert.equal(file.hyrox.session.races.length,1); assert.equal(file.wod.events.length,1);
  const parts=Sauvegarde.lire(JSON.stringify(file));
  assert.equal(Pace.validateStore(parts.hyrox).session.title,'Soundcrossing');
  assert.equal(Wod.validateStore(parts.wod,true).events[0].id,'e1');
  const empty=JSON.parse(Sauvegarde.contenu(h,Wod.validateStore({...wodStore(),events:[]})));
  assert.equal(empty.wod,null);
});

test('old single-app files still restore their own app only',()=>{
  const {Sauvegarde}=harness();
  const h=Sauvegarde.lire(JSON.stringify(hyroxStore())), w=Sauvegarde.lire(JSON.stringify(wodStore()));
  assert.equal(h.wod,null); assert.equal(h.hyrox.revision,'h1');
  assert.equal(w.hyrox,null); assert.equal(w.wod.revision,'w1');
  assert.throws(()=>Sauvegarde.lire('pas du json'),/pas une sauvegarde Soundcrossing/);
  assert.throws(()=>Sauvegarde.lire(JSON.stringify({format:'soundcrossing-sauvegarde',version:1,hyrox:null,wod:null})),/vide/);
});

test('a broken part is refused and named before anything is replaced',()=>{
  const {Sauvegarde,Wod}=harness();
  assert.equal(Sauvegarde.verifier('wod',null,v=>Wod.validateStore(v,true)),null);
  assert.throws(()=>Sauvegarde.verifier('wod',{events:[{}]},v=>Wod.validateStore(v,true)),/^Error: Partie WOD du fichier : /);
});

test('the other app is read from the browser and replaced with its old version kept as recovery',()=>{
  const {Sauvegarde,Wod,values}=harness();
  values.set('soundcrossing-wod.v1',JSON.stringify(wodStore()));
  assert.equal(Sauvegarde.autre('wod',v=>Wod.validateStore(v)).revision,'w1');
  const next=Wod.validateStore({...wodStore(),revision:'w2',events:[{...wodStore().events[0],title:'Nouveau'}]});
  assert.equal(Sauvegarde.remplacer('wod',next,v=>Wod.validateStore(v)),true);
  const saved=JSON.parse(values.get('soundcrossing-wod.v1'));
  assert.equal(saved.events[0].title,'Nouveau'); assert.notEqual(saved.revision,'w2'); assert.ok(saved.savedAt>20);
  assert.equal(JSON.parse(values.get('soundcrossing-wod.v1.recovery')).revision,'w1');
});
