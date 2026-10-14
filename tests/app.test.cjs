const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const KEY='pace.hyrox.session.v1';

// Execute the compiled app functions; omit browser event wiring and stub rendering.
function appHarness() {
  const values=new Map(), elements=new Map(), listeners=new Map();
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{textContent:'',innerHTML:'',value:'',title:'',close(){},classList:{toggle(){},add(){},remove(){}}});
    return elements.get(id);
  };
  const context=vm.createContext({crypto:webcrypto,Date,TextDecoder,DOMException,
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},
    document:{getElementById:element},window:{clearTimeout(){},setTimeout(){return 1;},addEventListener(name,handler){listeners.set(name,handler);}}});
  vm.runInContext(fs.readFileSync('dist/core.js','utf8'),context);
  const source=fs.readFileSync('dist/app.js','utf8');
  const boundary=source.indexOf("    document.addEventListener('click', handleAction);");
  assert.ok(boundary>0,'Application bootstrap boundary must be present');
  const storageHandler=source.slice(source.indexOf("    window.addEventListener('storage',"),source.indexOf("    window.addEventListener('pageshow',"));
  vm.runInContext(source.slice(0,boundary)+`
    render = () => {};
    PaceApp.auditTest = {
      configure(store, raw, blocked=false) {state=JSON.parse(JSON.stringify(store)); loadedRaw=raw; storageBlocked=blocked;},
      state: () => state,
      freeze(form,snapshot) {editSnapshots.set(form,snapshot);},
      genders() {selectedEntryFormat='SOLO'; selectedGender1='H'; selectedGender2='';},
      persist, saveResult, saveEntry
    };
    ${storageHandler}
  })(PaceApp || (PaceApp = {}));`,context);
  const P=context.Pace, api=context.PaceApp.auditTest;
  const race=P.validateRace({id:'race',title:'Audit',date:'2026-10-12',format:'SOLO'});
  const entry=P.validateEntry({id:'a',bib:'',raceId:race.id,name1:'Alex',name2:'',gender1:'H',gender2:'',format:'SOLO',category:'H',scheduled:'09:00',startedAt:null,arrivedAt:null,durationMs:null,status:'waiting'});
  const store={version:4,revision:'before',savedAt:1,session:{title:'Audit',date:race.date,races:[race],entries:[entry]},history:[],settings:{photoTemplate:'club'}};
  const configure=(candidate=store,blocked=false)=>{
    const raw=JSON.stringify(candidate);values.set(KEY,raw);api.configure(candidate,raw,blocked);return raw;
  };
  const form=(id,fields)=>{
    const nodes=Object.fromEntries(Object.entries(fields).map(([name,value])=>[name,{value}]));
    const error=element(`${id}-error`);
    const node={elements:{namedItem:name=>nodes[name]},querySelector:()=>error};
    elements.set(id,node);return {node,error};
  };
  return {P,api,values,element,store,entry,race,configure,form,listeners};
}

test('restoration works immediately after missing storage and retains a recovery copy',()=>{
  const h=appHarness(), raw=h.configure(h.store,true);
  h.values.delete(KEY);
  const restored=structuredClone(h.store);restored.revision='restored';
  assert.equal(h.api.persist(restored,true,raw),true);
  assert.equal(JSON.parse(h.values.get(KEY)).revision,'restored');
  assert.equal(JSON.parse(h.values.get(KEY+'.recovery')).session.entries.length,1);
});
test('a restore confirmation cannot overwrite a newer valid session',()=>{
  const h=appHarness(), expected=h.configure();
  const newer=structuredClone(h.store);newer.revision='newer';newer.session.entries[0].name1='Nouvelle valeur';
  const raw=JSON.stringify(newer);h.values.set(KEY,raw);h.api.configure(newer,raw);
  assert.equal(h.api.persist(h.store,true,expected),false);
  assert.equal(JSON.parse(h.values.get(KEY)).session.entries[0].name1,'Nouvelle valeur');
});
test('normal writes stay blocked after storage deletion while confirmed corrupt recovery is permitted',()=>{
  const h=appHarness();h.configure(h.store,true);h.values.delete(KEY);
  assert.equal(h.api.persist(h.store),false);
  h.values.set(KEY,'broken');h.api.configure(h.store,'broken',true);
  assert.equal(h.api.persist(h.store,true,'broken'),true);
});
test('a storage clear event preserves the visible session and allows confirmed restoration',()=>{
  const h=appHarness();h.configure();h.values.clear();
  h.listeners.get('storage')({key:null,newValue:null});
  assert.equal(h.api.state().session.entries.length,1);
  assert.equal(h.api.persist(h.store),false);
  assert.equal(h.api.persist(h.store,true),true);
});
test('an old result form cannot replace the updated result after storage synchronisation',()=>{
  const h=appHarness();h.configure();
  const {node,error}=h.form('result-form',{id:'a'});
  h.api.freeze(node,h.P.captureEdit(h.store.session,'entry','a',h.race.id));
  const newer=structuredClone(h.store);newer.revision='newer';
  Object.assign(newer.session.entries[0],h.P.calculateDuration(h.race,h.entry,'02:00:00'),{status:'finished'});
  h.configure(newer);
  h.api.saveResult({preventDefault(){}});
  assert.match(h.element('result-error').textContent,/formulaire ont changé/);
  assert.equal(JSON.parse(h.values.get(KEY)).session.entries[0].durationMs,7200000);
});
test('editing only a participant name keeps the duration input mode and result',()=>{
  const h=appHarness(), finished=structuredClone(h.store);
  Object.assign(finished.session.entries[0],h.P.calculateDuration(h.race,h.entry,'01:00:30'),{status:'finished',resultMode:'duration'});
  h.configure(finished);
  const {node}=h.form('entry-form',{id:'a',raceId:'race',name1:'Alex corrigé',name2:'',scheduled:'09:00:00'});
  h.api.freeze(node,h.P.captureEdit(finished.session,'entry','a','race'));h.api.genders();
  h.api.saveEntry({preventDefault(){}});
  const entry=JSON.parse(h.values.get(KEY)).session.entries[0];
  assert.equal(entry.name1,'Alex corrigé');assert.equal(entry.resultMode,'duration');assert.equal(entry.durationMs,3630000);
});
test('changing the departure keeps an entered total time and shifts the arrival',()=>{
  const h=appHarness(), finished=structuredClone(h.store);
  Object.assign(finished.session.entries[0],h.P.calculateDuration(h.race,h.entry,'01:00:00'),{status:'finished',resultMode:'duration'});
  h.configure(finished);
  const {node}=h.form('entry-form',{id:'a',raceId:'race',name1:'Alex',name2:'',scheduled:'09:10:00'});
  h.api.freeze(node,h.P.captureEdit(finished.session,'entry','a','race'));h.api.genders();
  h.api.saveEntry({preventDefault(){}});
  const entry=JSON.parse(h.values.get(KEY)).session.entries[0];
  assert.equal(entry.durationMs,3600000);assert.equal(h.P.timeOfDay(entry.startedAt),'09:10:00');assert.equal(h.P.timeOfDay(entry.arrivedAt),'10:10:00');
});
test('changing the departure recalculates the time of an entered arrival',()=>{
  const h=appHarness(), finished=structuredClone(h.store);
  Object.assign(finished.session.entries[0],h.P.calculateArrival(h.race,h.entry,'10:00:00',false),{status:'finished',resultMode:'arrival'});
  h.configure(finished);
  const {node}=h.form('entry-form',{id:'a',raceId:'race',name1:'Alex',name2:'',scheduled:'09:10:00'});
  h.api.freeze(node,h.P.captureEdit(finished.session,'entry','a','race'));h.api.genders();
  h.api.saveEntry({preventDefault(){}});
  const entry=JSON.parse(h.values.get(KEY)).session.entries[0];
  assert.equal(entry.durationMs,3000000);assert.equal(h.P.timeOfDay(entry.arrivedAt),'10:00:00');
});
