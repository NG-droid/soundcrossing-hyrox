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

test('the demo exports one general sheet plus one sheet per WOD and the rules', () => {
  const sheets = W.exportRows(W.demo('2026-10-17'));
  assert.deepEqual(Array.from(sheets, s => s.name), ['Général', '1. WOD 1 — Fran', '2. WOD 2 — Cindy', '3. WOD 3 — Clean max', 'Règles']);
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

test('import CSV: formats, niveaux, doublons et erreurs ligne par ligne', () => {
  let n = 0; const id = () => `id${++n}`;
  const c = { ...W.emptyCompetition('c', 'Test', '2026-10-18', 'MIXED'), levels: ['RX', 'Scaled'], athletes: [{ ...athlete('Alex Martin'), bib: '001', level: 'RX' }] };
  const rows = [['Format', 'Participant 1', 'Participant 2', 'Niveau'], ['Solo F', 'Manon Simon', '', 'rx'], ['duo fh', 'Léa Moreau', 'Hugo Robert', 'Scaled'], ['', '', '', ''], ['Solo H', 'alex martin', '', 'RX']];
  const ok = W.importAthletes(rows, c, id);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.duplicates, 1);
  assert.deepEqual(Array.from(ok.athletes, a => `${a.bib}:${W.category(a)}:${a.level}`), ['002:F:RX', '003:HF:Scaled']);
  const bad = W.importAthletes([['Format', 'Participant 1', 'Participant 2', 'Niveau'], ['Duo XX', 'A', 'B', 'RX'], ['Duo HH', 'A', '', 'RX'], ['Solo H', 'B', '', 'Elite']], c, id);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0], /Ligne 2/);
  const solo = W.importAthletes([['Format', 'Participant 1'], ['Duo HH', 'A']], W.emptyCompetition('s', 'S', '', 'SOLO'), id);
  assert.match(solo.errors[0], /non accepté/);
  assert.match(W.importAthletes([['Nom'], ['A']], c, id).errors[0], /Format/);
});

test('modèle vierge : seulement les colonnes, séparateur point-virgule, Niveau si besoin', () => {
  const duo = W.emptyCompetition('d', 'D', '', 'DUO');
  assert.equal(W.toCsv(W.importTemplate(duo)), '﻿"Format";"Participant 1";"Participant 2"\r\n');
  const cols = W.importColumns({ ...duo, levels: ['Scaled', 'RX'] });
  assert.deepEqual(Array.from(cols, c => c.header), ['Format', 'Participant 1', 'Participant 2', 'Niveau']);
  assert.deepEqual(Array.from(cols[0].choices), ['Duo HH', 'Duo FF', 'Duo HF']);
  assert.deepEqual(Array.from(cols[3].choices), ['Scaled', 'RX']);
});

test('WOD : Scaled puis RX ; un ancien événement Pro / Open ou RX / Scaled est remis dans cet ordre', () => {
  assert.deepEqual(Object.keys(W.LEVEL_PRESETS), ['none', 'rx']);
  assert.deepEqual(Array.from(W.LEVEL_PRESETS.rx), ['Scaled', 'RX']);
  const old = { ...W.emptyCompetition('c', 'T', '', 'SOLO'), levels: ['Pro', 'Open'], athletes: [{ ...athlete('a'), level: 'Pro' }, { ...athlete('b', 'F'), level: 'Open' }] };
  const c = W.validate(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(Array.from(c.levels), ['Scaled', 'RX']);
  assert.deepEqual(Array.from(c.athletes, a => a.level), ['RX', 'Scaled']);
  assert.deepEqual(Array.from(W.validate({ ...old, levels: ['RX', 'Scaled'], athletes: [{ ...athlete('a'), level: 'RX' }] }).levels), ['Scaled', 'RX']);
  assert.deepEqual(Array.from(W.groupsForLevel(c, 'RX')), ['RX · Solo H']);
  assert.deepEqual(Array.from(W.groupsForLevel(c, '')), ['Scaled · Solo F', 'RX · Solo H']);
  assert.equal(W.remapLevel('Scaled', []), undefined);
});


test('a damaged backup is refused before replacing anything', () => {
  const base = { ...W.emptyCompetition('c', 'Test', '', 'MIXED'), athletes: [athlete('a')], workouts: [], scores: {} };
  assert.equal(W.validateStore({ version: 2, events: [base], selectedId: 'c' }).events[0].athletes.length, 1);
  const broken = [
    { ...base, athletes: [{ id: 'a', format: 'SOLO', name1: '', gender1: 'H' }] },
    { ...base, athletes: [{ id: 'a', format: 'DUO', name1: 'A', name2: '', gender1: 'H', gender2: '' }] },
    { ...base, athletes: [athlete('a'), athlete('a')] },
    { ...base, athletes: [null] },
    { ...base, workouts: [{ id: 'w', name: 'W', type: 'inconnu' }] },
    { ...base, workouts: [{ id: 'w', name: 'W', type: 'time' }], scores: { w: { a: { timeMs: -5 } } } },
  ];
  for (const event of broken) assert.throws(() => W.validateStore({ version: 2, events: [event], selectedId: 'c' }));
  assert.throws(() => W.validateStore({ version: 2, events: [base, base], selectedId: 'c' }));
});

test('scores of removed athletes or WOD are dropped, and save metadata is kept', () => {
  const w = { id: 'w', name: 'W', description: '', type: 'reps', capMinutes: null, totalReps: null, repsPerRound: null };
  const event = { ...W.emptyCompetition('c', 'Test', '', 'MIXED'), athletes: [athlete('a')], workouts: [w], scores: { w: { a: { reps: 3 }, ghost: { reps: 9 } }, old: { a: { reps: 1 } } } };
  const store = W.validateStore({ version: 2, events: [event], selectedId: 'c', revision: 'r1', savedAt: 42 });
  assert.deepEqual(JSON.parse(JSON.stringify(store.events[0].scores)), { w: { a: { reps: 3 } } });
  assert.equal(store.savedAt, 42); assert.equal(store.revision, 'r1');
  assert.equal(W.validateStore(W.demo('2026-10-18')).events[0].athletes.length, 10);
});

test('scores are refused when ambiguous instead of being rounded or guessed', () => {
  const fran = { id: 'w', name: 'Fran', description: '', type: 'time', capMinutes: 8, totalReps: 90, repsPerRound: null };
  const cindy = { id: 'c', name: 'Cindy', description: '', type: 'amrap', capMinutes: 20, totalReps: null, repsPerRound: 30 };
  const max = { id: 'm', name: 'Max', description: '', type: 'reps', capMinutes: null, totalReps: null, repsPerRound: null };
  const clean = { id: 'l', name: 'Clean', description: '', type: 'load', capMinutes: null, totalReps: null, repsPerRound: null };
  assert.throws(() => W.buildScore(fran, { timeMs: 300000, reps: '70' }), /pas les deux/);
  assert.throws(() => W.buildScore(fran, { timeMs: null, reps: '70.5' }), /entier/);
  assert.equal(JSON.stringify(W.buildScore(fran, { timeMs: null, reps: '70' })), '{"reps":70}');
  assert.throws(() => W.buildScore(cindy, { timeMs: null, rounds: '5,5', rest: '' }), /entier/);
  assert.throws(() => W.buildScore(cindy, { timeMs: null, rounds: '5', rest: '30' }), /moins de 30/);
  assert.equal(JSON.stringify(W.buildScore(cindy, { timeMs: null, rounds: '5', rest: '2' })), '{"reps":152}');
  assert.throws(() => W.buildScore(max, { timeMs: null, reps: '12.4' }), /entier/);
  assert.equal(JSON.stringify(W.buildScore(clean, { timeMs: null, kg: '102,5' })), '{"kg":102.5}');
  assert.equal(W.buildScore(max, { timeMs: null, reps: '' }), null);
});

test('statuses separate scores to enter from forfeits, and the ranking stays provisional until all are entered', () => {
  const t = { id: 't', name: 'T', description: '', type: 'time', capMinutes: 8, totalReps: 90, repsPerRound: null };
  const c = { ...W.emptyCompetition('c', 'Test', '', 'MIXED'), athletes: [athlete('a'), athlete('b'), athlete('c')], workouts: [t],
    scores: { t: { a: { timeMs: 100 }, b: { forfeit: true } } } };
  assert.equal(W.scoreStatus(t, c.scores.t.a), 'done');
  assert.equal(W.scoreStatus(t, { reps: 50 }), 'capped');
  assert.equal(W.scoreStatus(t, c.scores.t.b), 'forfeit');
  assert.equal(W.scoreStatus(t, undefined), 'todo');
  assert.equal(W.pendingScores(c), 1);
  assert.deepEqual(ids(W.workoutRanking(c, t, 'Solo H')), ['a:1']);
  assert.deepEqual(Array.from(W.generalRanking(c, 'Solo H'), r => `${r.athlete.id}:${r.total}`), ['a:1', 'b:3', 'c:3']);
  c.scores.t.c = { reps: 40 };
  assert.equal(W.pendingScores(c), 0);
  assert.equal(W.hasAnyScore(c), true);
  const restored = W.validate(JSON.parse(JSON.stringify(c)));
  assert.equal(restored.scores.t.b.forfeit, true);
  assert.throws(() => W.validate({ ...c, scores: { t: { a: { reps: 1.5 } } } }), /entières/);
  const sheets = W.exportRows(c);
  assert.equal(sheets.at(-1).name, 'Règles');
  assert.ok(sheets[1].rows.some(r => r[3] === 'Forfait'));
});

test('one business rule for scores: zero time, time over the cap, time with reps are refused everywhere', () => {
  const w = { id: 'w', name: 'Fran', description: '', type: 'time', capMinutes: 10, totalReps: 90, repsPerRound: null };
  assert.equal(W.scoreProblem(w, { timeMs: 540000 }), null);
  assert.match(W.scoreProblem(w, { timeMs: 0 }), /nul/);
  assert.match(W.scoreProblem(w, { timeMs: 660000 }), /time cap/);
  assert.match(W.scoreProblem(w, { timeMs: 300000, reps: 40 }), /en même temps/);
  assert.match(W.scoreProblem(w, { reps: 90 }), /c’est un temps/);
  assert.throws(() => W.buildScore(w, { timeMs: 0 }), /nul/);
  const c = { ...W.emptyCompetition('c', 'Test', '', 'MIXED'), athletes: [athlete('a'), athlete('b')], workouts: [w], scores: { w: { a: { timeMs: 540000 }, b: { reps: 50 } } } };
  // Réduire le cap de 10 à 5 min : le temps de 9 min ne peut plus rester « terminé ».
  assert.deepEqual(Array.from(W.workoutConflicts(c, { ...w, capMinutes: 5 })), ['a : temps 09:00 au-delà du time cap de 5 min']);
  assert.deepEqual(Array.from(W.workoutConflicts(c, w)), []);
});

test('restoring a backup applies the entry rules, browser data stays readable', () => {
  const w = { id: 'w', name: 'Fran', description: '', type: 'time', capMinutes: 8, totalReps: null, repsPerRound: null };
  const bad = { version: 2, selectedId: 'c', events: [{ ...W.emptyCompetition('c', 'Test', '', 'MIXED'), athletes: [athlete('a'), athlete('b'), athlete('d')], workouts: [w],
    scores: { w: { a: { timeMs: 0 }, b: { timeMs: 600000 }, d: { timeMs: 300000, reps: 12 } } } }] };
  assert.throws(() => W.validateStore(bad, true), error => /3 score\(s\) invalide/.test(error.message) && /Fran, a : temps nul/.test(error.message) && /time cap/.test(error.message));
  assert.equal(W.validateStore(bad).events.length, 1);
  assert.throws(() => W.validateStore({ ...bad, events: [{ ...bad.events[0], scores: { w: { a: { forfeit: true, timeMs: 1000 } } } }] }, true), /forfait et score/);
  assert.equal(W.validateStore({ ...bad, events: [{ ...bad.events[0], scores: { w: { a: { timeMs: 300000 }, b: { reps: 20 }, d: { forfeit: true } } } }] }, true).events.length, 1);
});

test('an event without any WOD has no ranking and no podium', () => {
  const c = { ...W.emptyCompetition('c', 'Test', '', 'MIXED'), athletes: [athlete('a'), athlete('b')] };
  assert.deepEqual(Array.from(W.generalRanking(c, 'Solo H')), []);
  const rules = W.exportRows(c).find(s => s.name === 'Règles').rows.flat();
  assert.ok(rules.includes('Aucun WOD : pas encore de classement.'));
});
