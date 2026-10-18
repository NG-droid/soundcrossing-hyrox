const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('dist/wod-core.js', 'utf8'), context);
const W = context.Wod;
const athlete = (id, gender1 = 'H') => ({ id, bib: id, format: 'SOLO', name1: id, name2: '', gender1, gender2: '' });
const ids = rows => Array.from(rows, r => `${r.athlete.id}:${r.rank}`);

test('for time ranks finishers by time, then capped athletes by reps, and keeps ties', () => {
  const w = { id: 'w', name: 'Fran', description: '', type: 'time', capMinutes: 8, totalReps: 90, repsPerRound: null };
  const c = { ...W.emptyCompetition('c', 'Test', '2026-10-17', 'MIXED'), athletes: ['a', 'b', 'c', 'd', 'e'].map(id => athlete(id)), workouts: [w],
    scores: { w: { a: { reps: 70 }, b: { timeMs: 300000 }, c: { reps: 80 }, d: { timeMs: 250000 }, e: { timeMs: 300000 } } } };
  assert.deepEqual(ids(W.workoutRanking(c, w, 'Solo H')), ['d:1', 'b:2', 'e:2', 'c:4', 'a:5']);
  assert.equal(W.scoreText(w, { reps: 70 }), 'CAP + 70 reps');
});

test('amrap, load and reps rank the biggest number first', () => {
  const amrap = { id: 'w', name: 'Cindy', description: '', type: 'amrap', capMinutes: 20, totalReps: null, repsPerRound: 30 };
  const c = { ...W.emptyCompetition('c', 'Test', '', 'MIXED'), athletes: [athlete('a'), athlete('b')], workouts: [amrap], scores: { w: { a: { reps: 152 }, b: { reps: 160 } } } };
  assert.deepEqual(ids(W.workoutRanking(c, amrap, 'Solo H')), ['b:1', 'a:2']);
  assert.equal(W.scoreText(amrap, { reps: 152 }), '5 tours + 2 reps');
});

test('general ranking adds places, missing scores take the last place, and points mode reverses the order', () => {
  const t = { id: 't', name: 'T', description: '', type: 'time', capMinutes: null, totalReps: null, repsPerRound: null };
  const l = { id: 'l', name: 'L', description: '', type: 'load', capMinutes: null, totalReps: null, repsPerRound: null };
  const c = { ...W.emptyCompetition('c', 'Test', '', 'MIXED'), athletes: [athlete('a'), athlete('b'), athlete('c'), athlete('f', 'F')], workouts: [t, l],
    scores: { t: { a: { timeMs: 100 }, b: { timeMs: 200 }, c: { timeMs: 300 } }, l: { a: { kg: 80 }, b: { kg: 100 } } } };
  const general = W.generalRanking(c, 'Solo H');
  assert.deepEqual(Array.from(general, r => `${r.athlete.id}:${r.rank}:${r.total}`), ['a:1:3', 'b:1:3', 'c:3:6']);
  const points = W.generalRanking({ ...c, method: 'points' }, 'Solo H');
  assert.deepEqual(Array.from(points, r => `${r.athlete.id}:${r.total}`), ['a:197', 'b:197', 'c:94']);
  assert.deepEqual(Array.from(W.usedGroups(c)), ['Solo H', 'Solo F']);
});

test('time entry accepts common formats and rejects nonsense', () => {
  assert.equal(W.parseTime('7:45'), 465000);
  assert.equal(W.parseTime('1:02:30'), 3750000);
  assert.equal(W.parseTime('7m45'), 465000);
  assert.equal(W.parseTime(''), null);
  assert.throws(() => W.parseTime('7:75'), /illisible/);
  assert.throws(() => W.parseTime('abc'), /illisible/);
});

test('the demo exports one general sheet plus one sheet per WOD', () => {
  const sheets = W.exportRows(W.demo('2026-10-17'));
  assert.deepEqual(Array.from(sheets, s => s.name), ['Général', '1. WOD 1 — Fran', '2. WOD 2 — Cindy', '3. WOD 3 — Clean max']);
  assert.equal(sheets[0].rows.length, 11);
});

test('an old single-competition backup becomes one Solo + Duo event', () => {
  const store = W.validateStore({ title: 'Ancien', date: '2026-10-17', method: 'points', athletes: [], workouts: [], scores: {} });
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].format, 'MIXED');
  assert.equal(store.events[0].method, 'points');
  assert.equal(store.selectedId, store.events[0].id);
  const two = W.validateStore({ version: 2, events: [W.emptyCompetition('a', 'A', '', 'SOLO'), W.emptyCompetition('b', 'B', '', 'DUO')], selectedId: 'b' });
  assert.equal(two.selectedId, 'b');
  assert.throws(() => W.validateStore({ nope: true }), /sauvegarde WOD/);
});

test('levels split the rankings: RX and Scaled athletes never share a ranking', () => {
  const l = { id: 'l', name: 'L', description: '', type: 'load', capMinutes: null, totalReps: null, repsPerRound: null };
  const c = { ...W.emptyCompetition('c', 'Test', '', 'SOLO'), levels: ['RX', 'Scaled'], workouts: [l],
    athletes: [{ ...athlete('s'), level: 'Scaled' }, { ...athlete('r'), level: 'RX' }, { ...athlete('f', 'F'), level: 'RX' }],
    scores: { l: { s: { kg: 120 }, r: { kg: 100 }, f: { kg: 60 } } } };
  assert.deepEqual(Array.from(W.usedGroups(c)), ['RX · Solo H', 'RX · Solo F', 'Scaled · Solo H']);
  assert.deepEqual(ids(W.workoutRanking(c, l, 'RX · Solo H')), ['r:1']);
  assert.deepEqual(ids(W.workoutRanking(c, l, 'Scaled · Solo H')), ['s:1']);
});
