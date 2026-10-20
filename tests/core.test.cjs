const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const context = vm.createContext({ crypto: webcrypto, Date, TextDecoder });
vm.runInContext(fs.readFileSync('dist/core.js', 'utf8'), context);
const P = context.Pace;
const entry = (overrides = {}) => ({ id: 'a', bib: '001', raceId: 'legacy-SOLO-solo', autoStartBlocked: false, name1: 'Alex', name2: '', format: 'SOLO', category: '', scheduled: '09:00', startedAt: null, durationMs: null, status: 'waiting', ...overrides });
const session = (entries = [entry()]) => ({ title: 'Test', date: P.localDate(), entries });
const race = (overrides = {}) => ({ id: 'race-a', title: 'Course du dimanche', date: '2026-10-12', format: 'MIXED', category: '', ...overrides });
test('final podium returns the first three ranks of one category and retains ties', () => {
  const r = race({ format: 'DUO' });
  const e = (id, durationMs, category = 'HH') => P.validateEntry(entry({ id, raceId: r.id, name1: id, name2: 'Partenaire', format: 'DUO', category, durationMs, status: 'finished' }));
  const s = { ...session([]), races: [r], entries: [e('fourth', 80000), e('second-b', 70000), e('first', 60000), e('second-a', 70000), e('mixed', 50000, 'HF'), P.setOutcome(e('out', 40000), 'withdrawn')] };
  const podium = P.podiumFor(s, r, 'HH');
  assert.deepEqual(Array.from(podium, p => p.rank), [1, 2]);
  assert.deepEqual(Array.from(podium[0].entries, e => e.id), ['first']);
  assert.deepEqual(Array.from(podium[1].entries, e => e.id), ['second-a', 'second-b']);
  assert.equal(P.podiumFor(s, r, 'HF')[0].entries[0].id, 'mixed');
  assert.equal(P.podiumFor(s, r, 'FF').length, 0);
  assert.throws(() => P.podiumFor(s, r, 'H'), /catégorie/);
  s.entries.push(P.validateEntry(entry({ id: 'pending', raceId: r.id, format: 'DUO', category: 'HH', name2: 'En attente' })));
  assert.throws(() => P.podiumFor(s, r, 'HH'), /Complétez/);
});
test('duration fields accept hours, minutes and seconds without typed separators', () => {
  assert.equal(P.durationFromFields({ hours: '1', minutes: '0', seconds: '30' }), '01:00:30');
  assert.equal(P.durationFromFields({ hours: '01', minutes: '00', seconds: '30' }), '01:00:30');
  assert.equal(P.durationFromFields({ hours: '0', minutes: '1', seconds: '' }), '00:01:00');
  assert.equal(P.durationFromFields({ hours: '1', minutes: '', seconds: '' }), '01:00:00');
  assert.equal(P.durationFromFields({ hours: '25', minutes: '0', seconds: '0' }), '25:00:00');
  assert.equal(P.durationFromFields({ hours: '48', minutes: '0', seconds: '0' }), '48:00:00');
  const r = race(), e = P.validateEntry(entry({ raceId: r.id }));
  assert.equal(P.calculateDuration(r, e, P.durationFromFields({ hours: '1', minutes: '0', seconds: '30' })).durationMs, 3630000);
});
test('duration fields reject missing hours, decimals, negative values and range overflow', () => {
  for (const fields of [
    { hours: '', minutes: '1', seconds: '0' }, { hours: '1.5', minutes: '0', seconds: '0' },
    { hours: '-1', minutes: '0', seconds: '0' }, { hours: '0', minutes: '60', seconds: '0' },
    { hours: '0', minutes: '0', seconds: '60' }, { hours: '0', minutes: '0', seconds: '0' },
    { hours: '49', minutes: '0', seconds: '0' }, { hours: '48', minutes: '0', seconds: '1' }
  ]) assert.throws(() => P.durationFromFields(fields));
});
test('result entry accepts an arrival hour or a total duration with seconds', () => {
  const r = race(), e = P.validateEntry(entry({ raceId: r.id }));
  const duration = P.calculateDuration(r, e, '1h00min30s');
  assert.equal(duration.durationMs, 3630000);
  assert.equal(P.timeOfDay(duration.arrivedAt), '10:00:30');
  assert.equal(P.calculateArrival(r, e, '10h00', false).durationMs, 3600000);
  assert.equal(P.calculateDuration(r, e, '01:00:30').durationMs, 3630000);
  assert.equal(e.durationMs, null);
});
test('duration entry handles midnight and rejects invalid or missing inputs', () => {
  const r = race(), e = P.validateEntry(entry({ raceId: r.id, scheduled: '23:30' }));
  const result = P.calculateDuration(r, e, '1h00min30s');
  assert.equal(P.timeOfDay(result.arrivedAt), '00:30:30');
  assert.equal(P.localDate(new Date(result.arrivedAt)), '2026-10-13');
  for (const value of ['', '0s', '1h60min', '49h', 'bonjour']) assert.throws(() => P.calculateDuration(r, e, value));
  assert.throws(() => P.calculateDuration(r, { ...e, scheduled: '' }, '1h'), /départ/);
});
test('result input mode survives validation, and legacy final times default to duration', () => {
  const e = P.validateEntry(entry({ resultMode: 'duration', status: 'finished', durationMs: 3630000 }));
  assert.equal(P.validateEntry(JSON.parse(JSON.stringify(e))).resultMode, 'duration');
  assert.equal(P.validateEntry(entry({ status: 'finished', durationMs: 60000 })).resultMode, 'duration');
  assert.equal(P.validateEntry(entry()).resultMode, 'arrival');
  assert.throws(() => P.validateEntry(entry({ resultMode: 'automatic' })), /Mode/);
});
test('CSV encoding preserves accents, delimiters, quotes and line breaks, with formula protection', () => {
  const text = P.encodeCSV([['Format', 'Nom'], ['Duo HF', 'Léa; "Équipe"\nTroyes'], ['Solo H', '=1+1'], ['Solo F', '  @test'], ['Solo H', '+123'], ['Solo H', '-test']]);
  assert(text.startsWith('\uFEFF'));
  const X = require('../vendor/xlsx.full.min.js');
  const book = X.read(text, { type: 'string', raw: true });
  const rows = X.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 });
  assert.equal(rows[1][1], 'Léa; "Équipe"\nTroyes');
  assert.equal(rows[2][1], "'=1+1");
  assert.equal(rows[3][1], "'  @test");
  assert.equal(rows[4][1], "'+123");
  assert.equal(rows[5][1], "'-test");
});
test('final CSV refuses pending results and exports all category ranks and forfeits', () => {
  const r = race({ format: 'DUO' }), solo = race({ id: 'solo', format: 'SOLO' });
  const e = overrides => P.validateEntry(entry({ raceId: r.id, format: 'DUO', category: 'HH', name2: 'Tom', ...overrides }));
  const s = { ...session([]), races: [r, solo], entries: [e({ id: 'slow', name1: 'Lent', status: 'finished', durationMs: 7200000 }), e({ id: 'fast', name1: 'Rapide', status: 'finished', durationMs: 3630000 }), e({ id: 'out', name1: 'Forfait' }), entry({ id: 'other', raceId: solo.id })] };
  assert.throws(() => P.finalResultsCSV(s, r), /Complétez/);
  s.entries[2] = P.setOutcome(s.entries[2], 'withdrawn');
  const X = require('../vendor/xlsx.full.min.js');
  const book = X.read(P.finalResultsCSV(s, r), { type: 'string', raw: true });
  const rows = X.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.slice(1).map(row => row[2]), ['Rapide', 'Lent', 'Forfait']);
  assert.deepEqual(rows.slice(1).map(row => row[0]), ['1', '2', '']);
  assert.equal(rows[3][6], ''); assert.equal(rows[3][7], 'Forfait');
  assert.equal(rows[1][6], '01:00:30');
});
test('abandon and forfait preserve the registration but cannot retain a timed result', () => {
  const finished = P.validateEntry(entry({ status: 'finished', startedAt: 1000000, arrivedAt: 1060000, durationMs: 60000 }));
  const abandoned = P.setOutcome(finished, 'abandoned'), withdrawn = P.setOutcome(finished, 'withdrawn');
  assert.equal(abandoned.startedAt, finished.startedAt);
  assert.equal(withdrawn.startedAt, null);
  for (const outcome of [abandoned, withdrawn]) {
    assert.equal(outcome.id, finished.id); assert.equal(outcome.name1, finished.name1);
    assert.equal(outcome.scheduled, finished.scheduled);
    assert.equal(outcome.arrivedAt, null); assert.equal(outcome.durationMs, null);
    assert.equal(P.ranking([outcome]).length, 0);
    assert.throws(() => P.validateEntry({ ...outcome, durationMs: 60000 }), /abandon ou forfait/);
    assert.throws(() => P.validateEntry({ ...outcome, arrivedAt: 1060000 }), /abandon ou forfait/);
    assert.equal(P.setOutcome(outcome, 'waiting').status, 'waiting');
  }
  assert.throws(() => P.validateEntry({ ...withdrawn, startedAt: 1000000 }), /forfait/);
  assert.equal(finished.status, 'finished'); assert.equal(finished.durationMs, 60000);
});
test('final rankings wait for every registration, including other categories of the event', () => {
  const r = race({ format: 'DUO' });
  const completed = entry({ raceId: r.id, format: 'DUO', category: 'HF', name2: 'Zoé', status: 'finished', durationMs: 60000 });
  const pending = entry({ id: 'b', raceId: r.id, format: 'DUO', category: 'HH', name2: 'Hugo' });
  const s = { ...session([]), races: [r], entries: [completed, pending] };
  assert.equal(P.eventResultsFinal(s, r), false);
  for (const status of ['abandoned', 'withdrawn', 'finished']) {
    s.entries[1] = { ...pending, status, durationMs: status === 'finished' ? 80000 : null };
    assert.equal(P.eventResultsFinal(s, r), true);
  }
  s.entries.push(entry({ id: 'c', raceId: r.id, format: 'DUO', category: 'FF', name2: 'Emma' }));
  assert.equal(P.eventResultsFinal(s, r), false);
  assert.equal(P.eventResultsFinal({ ...s, entries: [] }, r), false);
  assert.equal(P.eventResultsFinal(s, undefined), false);
});
test('day rankings remain provisional when another event in the same family is unfinished', () => {
  const r = race({ format: 'DUO' }), sibling = race({ id: 'race-b', format: 'DUO' });
  const solo = race({ id: 'solo', format: 'SOLO' }), otherDay = race({ id: 'later', date: '2026-10-13' });
  const s = { ...session([]), races: [r, sibling, solo, otherDay], entries: [
    entry({ raceId: r.id, format: 'DUO', category: 'HF', name2: 'Zoé', status: 'finished', durationMs: 60000 }),
    entry({ id: 'b', raceId: sibling.id, format: 'DUO', category: 'HH', name2: 'Hugo' }),
    entry({ id: 'c', raceId: solo.id }), entry({ id: 'd', raceId: otherDay.id })
  ] };
  assert.equal(P.eventResultsFinal(s, r), false);
  s.entries[1] = P.setOutcome(s.entries[1], 'withdrawn');
  assert.equal(P.eventResultsFinal(s, r), true);
  assert.equal(P.eventResultsFinal(s, { ...r, format: 'MIXED' }), false);
});
test('outcomes survive backup and undo snapshots without losing the previous result', () => {
  const r = race(); const original = P.validateEntry(entry({ raceId: r.id, status: 'finished', durationMs: 60000 }));
  const s = { ...session([]), races: [r], entries: [P.setOutcome(original, 'abandoned')] };
  const store = P.validateStore({ version: 4, revision: 'outcome', savedAt: 1, session: s, history: [{ label: 'abandon', session: { ...s, entries: [original] } }] });
  const restored = P.validateStore(JSON.parse(JSON.stringify(store)));
  assert.equal(restored.session.entries[0].status, 'abandoned');
  assert.equal(restored.history[0].session.entries[0].durationMs, 60000);
  assert.equal(P.statusLabel(restored.session.entries[0]), 'Forfait');
  assert.equal(P.statusLabel(P.setOutcome(original, 'withdrawn')), 'Forfait');
});
test('durations: hours, minutes, units and numeric Excel cells', () => {
  for (const text of ['01:03:00', '63:00', '1h03min', '1 h 03 min']) assert.equal(P.parseDuration(text), 3780000);
  assert.equal(P.parseDuration('1h03min15s'), 3795000);
  assert.equal(P.parseDuration(3780 / 86400), 3780000);
  assert.equal(P.parseDuration(''), null);
  assert.equal(P.parseDuration('48:00:00'), 172800000);
});
test('durations reject ambiguous, negative and out-of-range values', () => {
  for (const text of ['1:60:00', '01:03:60', '00:00:00', '-1:00', '49:00:00', '60', '1h60min', 'abc', 0, NaN, Infinity, 1]) assert.throws(() => P.parseDuration(text));
});
test('scheduled times: text, numeric Excel cells, midnight, boundaries', () => {
  assert.equal(P.parseScheduled('9:05'), '09:05');
  assert.equal(P.parseScheduled('09h05'), '09:05');
  assert.equal(P.parseScheduled(545 / 1440), '09:05');
  assert.equal(P.parseScheduled(0), '00:00');
  assert.equal(P.parseScheduled('23:59'), '23:59');
  for (const value of ['24:00', '09:60', '9', -0.1, 1, NaN]) assert.throws(() => P.parseScheduled(value));
});
test('recorded departure survives reload and computes an arrival after midnight', () => {
  const start = new Date('2026-10-12T23:59:50').getTime();
  const restored = JSON.parse(JSON.stringify(entry({ status: 'running', startedAt: start })));
  assert.equal(P.calculateArrival(race(), restored, '00:01:20', true).durationMs, 90000);
  assert.equal(P.clock(3785000), '01:03:05');
  assert.equal(P.words(3785000), '1 h 03 min 05 s');
});
test('legacy final time is retained without inventing an arrival time', () => {
  const finished = entry({ status: 'finished', startedAt: 1000, durationMs: 3780000 });
  const validated = P.validateEntry(finished);
  assert.equal(validated.durationMs, 3780000); assert.equal(validated.arrivedAt, null);
});
test('duo requires two names and HH / FF / HF', () => {
  for (const category of ['HH', 'FF', 'HF']) assert.equal(P.validateEntry(entry({ format: 'DUO', category, name2: 'Sam' })).category, category);
  assert.throws(() => P.validateEntry(entry({ format: 'DUO', category: 'HF' })));
  assert.throws(() => P.validateEntry(entry({ format: 'DUO', category: 'XX', name2: 'Sam' })));
  assert.throws(() => P.validateEntry(entry({ name2: 'Sam' })));
});
test('reject inconsistent timer states and invalid persisted data', () => {
  for (const invalid of [{ status: 'running' }, { status: 'finished' }, { status: 'waiting', durationMs: 5000 }, { status: 'running', startedAt: Date.now(), durationMs: 10 }, { startedAt: Infinity }, { durationMs: NaN }, { name1: '   ' }, { format: 'TRIO' }]) assert.throws(() => P.validateEntry(entry(invalid)));
  assert.throws(() => P.validateSession({ ...session(), date: '2026-02-30' }));
});
test('reject duplicate ids; retain historical registrations even when names or bibs repeat', () => {
  assert.equal(P.validateSession(session([entry(), entry({ id: 'b' })])).entries.length, 2);
  assert.throws(() => P.validateSession(session([entry(), entry({ bib: '002' })])));
  assert.equal(P.validateSession(session([entry(), entry({ id: 'b', bib: '002' })])).entries.length, 2);
});
test('import correctly maps columns and validates every row', () => {
  const map = { bib: 0, name1: 1, name2: 2, format: 3, category: 4, scheduled: 5, duration: 6 };
  const rows = [ ['001', 'Alex', '', 'SOLO', '', '09:00', ''], ['002', 'Emma', 'Léa', 'DUO', 'FF', '09:05', '1h03min'], ['003', 'Tom', '', 'DUO', 'HH', '09:10', ''], ['004', 'A', '', 'TRIO', '', '09:15', ''] ];
  const result = P.importRows(rows, map, []);
  assert.equal(result[0].entry.status, 'waiting'); assert.equal(result[1].entry.durationMs, 3780000); assert.equal(result[1].entry.status, 'finished');
  assert.ok(result[2].error); assert.ok(result[3].error); assert.equal(result[3].line, 5);
});
test('import detects duplicates in file and in current session', () => {
  const map = { bib: 0, name1: 1, name2: -1, format: -1, category: -1, scheduled: 2, duration: -1 };
  const result = P.importRows([['001', 'Alex', '09:00'], ['002', 'Emma', '09:05'], ['002', 'Emma', '09:05']], map, [entry()]);
  assert.equal(result[0].duplicate, true); assert.equal(result[1].duplicate, false); assert.equal(result[2].duplicate, true);
});
test('backup round-trip keeps active timers and undo history', () => {
  const active = entry({ status: 'running', startedAt: Date.now() - 3600000 });
  const store = { version: 1, revision: 'r', savedAt: Date.now(), session: session([active]), history: [{ label: 'départ', session: session() }] };
  const restored = P.validateStore(JSON.parse(JSON.stringify(store)));
  assert.equal(restored.session.entries[0].startedAt, active.startedAt);
  assert.equal(restored.history[0].session.entries[0].status, 'waiting');
  assert.throws(() => P.validateStore({ ...store, version: 5 }));
});
test('SheetJS export/import preserves zeros, names, schedules and final times', () => {
  const XLSX = require('../vendor/xlsx.full.min.js');
  const rows = [['Dossard', 'Participant 1', 'Participant 2', 'Format', 'Catégorie', 'Heure de passage', 'Temps final'], ['001', 'Emma', 'Léa', 'DUO', 'FF', '09:05', '01:03:00']];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Participants');
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const read = XLSX.read(bytes, { type: 'buffer' });
  const actual = XLSX.utils.sheet_to_json(read.Sheets.Participants, { header: 1, defval: '', raw: true });
  const map = { bib: 0, name1: 1, name2: 2, format: 3, category: 4, scheduled: 5, duration: 6 };
  const imported = P.importRows(actual.slice(1), map, []);
  assert.equal(imported[0].entry.bib, '001'); assert.equal(imported[0].entry.name2, 'Léa'); assert.equal(imported[0].entry.scheduled, '09:05'); assert.equal(imported[0].entry.durationMs, 3780000);
});
test('CSV preserves UTF-8 accents, legacy Excel encoding and leading zeros', () => {
  const XLSX = require('../vendor/xlsx.full.min.js');
  const csv = fs.readFileSync('tests/import-valid.csv');
  const text = P.decodeDelimited(csv.buffer.slice(csv.byteOffset, csv.byteOffset + csv.byteLength));
  const wb = XLSX.read(text, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  assert.equal(rows[0][4], 'Catégorie'); assert.equal(rows[1][0], '001');
  const legacy = Uint8Array.from([76, 233, 97]);
  assert.equal(P.decodeDelimited(legacy.buffer), 'Léa');
  const map = { bib: 0, name1: 1, name2: 2, format: 3, category: 4, scheduled: 5, duration: 6 };
  const imported = P.importRows(rows.slice(1), map, [entry({ name1: 'Alex Martin' })]);
  assert.equal(imported[0].duplicate, true); assert.equal(imported[1].entry.durationMs, 3780000);
});
const raceSession = (r = race(), entries = [entry({ raceId: r.id })]) => ({ title: 'Courses', date: '2026-10-12', races: [r], entries });
test('arrival calculation uses recorded hours including seconds, without a live timer', () => {
  const e = entry({ scheduled: '10:00:15' });
  const result = P.calculateArrival(race(), e, '11:03:30', false);
  assert.equal(result.durationMs, 3795000); assert.equal(P.clock(result.durationMs), '01:03:15');
  assert.equal(result.arrivedAt, new Date('2026-10-12T11:03:30').getTime());
  assert.equal(e.startedAt, null); assert.equal(e.durationMs, null);
});
test('arrival after midnight must be explicit, not silently inferred from an earlier time', () => {
  const e = entry({ scheduled: '23:40' });
  assert.throws(() => P.calculateArrival(race(), e, '00:43', false));
  assert.equal(P.calculateArrival(race(), e, '00:43', true).durationMs, 3780000);
});
test('arrival rejects missing departure, missing time, zero duration and malformed clocks', () => {
  assert.throws(() => P.calculateArrival(race(), entry({ scheduled: '' }), '11:00', false));
  for (const time of ['', 'abc', '09:00', '24:00', '10:60', '10:00:60']) assert.throws(() => P.calculateArrival(race(), entry(), time, false));
});
test('legacy actual departure takes precedence over the planned time, with second precision', () => {
  const start = new Date('2026-10-12T10:02:15').getTime() + 789;
  const e = entry({ scheduled: '10:00', startedAt: start, status: 'running' });
  const result = P.calculateArrival(race(), e, '11:05:15', false);
  assert.equal(result.durationMs, 3780000); assert.equal(result.startedAt, start - 789);
});
test('one event accepts different solo and duo formats', () => {
  const r = race({ format: 'MIXED' });
  assert.equal(P.validateSession(raceSession(r, [entry({ raceId: r.id, category: 'H' })])).entries.length, 1);
  assert.equal(P.validateSession(raceSession(r, [entry({ raceId: r.id, format: 'DUO', category: 'FF', name2: 'Sam' })])).entries.length, 1);
  assert.throws(() => P.validateRace(race({ date: '2026-02-30' })));
});
test('same names can compete in different courses; swapped duo is duplicate within a race', () => {
  const r1 = race(), r2 = race({ id: 'race-b' });
  assert.equal(P.validateSession({ ...raceSession(r1), races: [r1, r2], entries: [entry({ raceId: r1.id, bib: '' }), entry({ id: 'b', raceId: r2.id, bib: '' })] }).entries.length, 2);
  const duo = race({ format: 'DUO', category: 'HF' });
  const first = entry({ raceId: duo.id, bib: '', format: 'DUO', category: 'HF', name1: 'Alex', name2: 'Sam' });
  assert.equal(P.identity(first), P.identity({ ...first, id: 'b', name1: 'Sam', name2: 'Alex', scheduled: '09:00:00' }));
  assert.notEqual(P.identity(first), P.identity({ ...first, scheduled: '09:05' }));
});
test('registration import chooses format per row without bib or final time', () => {
  const r = race({ format: 'DUO', category: 'HF' });
  const map = { bib: -1, name1: 0, name2: 1, format: 3, category: -1, scheduled: 2, duration: -1 };
  const rows = P.importRows([['Emma', 'Paul', '10:00', 'Duo HF'], ['Nora', '', '10:05', 'Duo HF']], map, [], r);
  assert.equal(rows[0].entry.raceId, r.id); assert.equal(rows[0].entry.category, 'HF');
  assert.equal(rows[0].entry.bib, ''); assert.equal(rows[0].entry.durationMs, null); assert.equal(rows[0].entry.status, 'waiting');
  assert.ok(rows[1].error);
});
test('V1 migration preserves names, ids, timers and undo history while grouping by date', () => {
  const asLegacy = ({ raceId, autoStartBlocked, ...legacy }) => legacy;
  const entries = [asLegacy(entry({ bib: '', status: 'finished', durationMs: 1000 })), asLegacy(entry({ id: 'b', bib: '', format: 'DUO', category: 'FF', name1: 'Emma', name2: 'Léa' }))];
  const raw = { version: 1, revision: 'original', savedAt: Date.now(), session: session(entries), history: [{ label: 'inscription', session: session(entries.slice(0, 1)) }] };
  const migrated = P.validateStore(JSON.parse(JSON.stringify(raw)));
  assert.equal(migrated.version, 4); assert.equal(migrated.session.races.length, 1);
  assert.equal(migrated.session.entries[0].id, 'a'); assert.equal(migrated.session.entries[0].durationMs, 1000);
  assert.equal(migrated.session.entries[1].name2, 'Léa'); assert.equal(migrated.history[0].session.entries.length, 1);
  assert.equal(P.validateStore(JSON.parse(JSON.stringify(migrated))).session.entries.length, 2);
});
test('recorded arrival and calculated duration must remain consistent in backups', () => {
  const result = P.calculateArrival(race(), entry({ scheduled: '10:00' }), '11:03', false);
  const finished = entry({ ...result, status: 'finished' });
  assert.equal(P.validateEntry(finished).arrivedAt, result.arrivedAt);
  assert.throws(() => P.validateEntry({ ...finished, durationMs: result.durationMs + 1000 }));
  assert.throws(() => P.validateEntry({ ...finished, arrivedAt: NaN }));
});
test('five results rank from fastest to slowest, and unfinished participants are excluded', () => {
  const durations = [3600000, 3300000, 3780000, 3480000, 4080000];
  const entries = durations.map((durationMs, i) => entry({ id: String(i), status: 'finished', durationMs }));
  const ranked = P.ranking([...entries, entry({ id: 'unfinished' })]);
  assert.deepEqual(Array.from(ranked, r => r.entry.id), ['1', '3', '0', '2', '4']);
  assert.deepEqual(Array.from(ranked, r => r.rank), [1, 2, 3, 4, 5]);
  assert.equal(entries[0].id, '0');
});
test('ties share the same competition rank', () => {
  const ranked = P.ranking([1000, 2000, 2000, 3000].map((durationMs, i) => entry({ id: String(i), status: 'finished', durationMs })));
  assert.deepEqual(Array.from(ranked, r => r.rank), [1, 2, 2, 4]);
});
test('rankings separate HH, FF, HF and Solo, as well as event dates', () => {
  const races = [race({ id: 'hh', format: 'DUO', category: 'HH' }), race({ id: 'ff', format: 'DUO', category: 'FF' }), race({ id: 'hf', format: 'DUO', category: 'HF' }), race({ id: 'solo', format: 'SOLO' }), race({ id: 'hh-tomorrow', format: 'DUO', category: 'HH', date: '2026-10-13' }), race({ id: 'hh-wave2', format: 'DUO', category: 'HH' })];
  const entries = races.map((r, i) => entry({ id: String(i), raceId: r.id, format: r.format, category: r.category, name2: r.format === 'DUO' ? 'Sam' : '', status: 'finished', durationMs: 60000 + i * 1000 }));
  const s = { ...raceSession(), races, entries };
  assert.deepEqual(Array.from(P.rankingFor(s, 'HH', '2026-10-12'), r => r.entry.id), ['0', '5']);
  for (const format of ['FF', 'HF', 'SOLO']) assert.equal(P.rankingFor(s, format, '2026-10-12').length, 1);
});

test('V2 migration groups categories by date, preserves each time and undo snapshot', () => {
  const races = [race({ id: 'h', title: 'Solo' }), race({ id: 'hh', title: 'Hommes' }), race({ id: 'ff', title: 'Femmes', date: '2026-10-13' })];
  const entries = [entry({ raceId: 'h', status: 'finished', durationMs: 5000 }), entry({ id: 'b', raceId: 'hh', format: 'DUO', category: 'HH', name2: 'Sam' }), entry({ id: 'c', raceId: 'ff', format: 'DUO', category: 'FF', name2: 'Léa' })];
  const data = { title: 'Test', date: '2026-10-12', races, entries };
  const store = P.validateStore({ version: 2, revision: 'r', savedAt: 1, session: data, history: [{ label: 'avant', session: data }] });
  assert.equal(store.session.races.length, 2); assert.equal(store.history[0].session.races.length, 2);
  assert.deepEqual(Array.from(store.session.entries, e => e.raceId), ['h', 'h', 'ff']);
  assert.equal(store.session.entries[0].durationMs, 5000); assert.equal(store.session.entries[0].category, '');
  assert.deepEqual(Array.from(store.session.races[0].previousTitles), ['Solo', 'Hommes']);
  assert.equal(store.settings.photoTemplate, 'club');
  assert.equal(P.validateStore(JSON.parse(JSON.stringify(store))).session.races.length, 2);
});
test('all five formats import into one event and rank separately', () => {
  const r = race(), map = { bib: -1, name1: 1, name2: 2, format: 0, category: -1, scheduled: 3, duration: 4 };
  const rows = [['Solo H', 'A', '', '09:00', '01:00:00'], ['F', 'B', '', '09:05', '00:58:00'], ['HH', 'C', 'D', '09:10', '00:57:00'], ['Duo FF', 'E', 'F', '09:15', '01:03:00'], ['Duo HF', 'G', 'H', '09:20', '01:04:00'], ['Duo HH', 'I', 'J', '09:25', '00:55:00']];
  const result = P.importRows(rows, map, [], r); assert.equal(result.filter(row => row.error).length, 0);
  const s = P.validateSession(raceSession(r, result.map(row => row.entry)));
  for (const format of ['H','F','FF','HF']) assert.equal(P.rankingFor(s, format, r.date).length, 1);
  assert.deepEqual(Array.from(P.rankingFor(s, 'HH', r.date), row => row.entry.name1), ['I', 'C']);
  assert.equal(P.importRows([['', 'A', '', '09:00', '']], map, [], r)[0].entry, null);
  assert.throws(() => P.validateStore({ version: 3, revision: 'r', savedAt: 1, session: s, history: [], settings: { photoTemplate: 'unknown' } }));
});
test('V3 event preferences migrate to enforced formats without losing mixed registrations', () => {
  const oldRace = { id: 'race-a', title: 'Duo', date: '2026-10-12', defaultFormat: 'DUO' };
  const oldSession = { title: 'Test', date: oldRace.date, races: [oldRace], entries: [entry({ raceId: oldRace.id, category: 'F' })] };
  const original = { version: 3, revision: 'r', savedAt: 1, session: oldSession, history: [{ label: 'avant', session: oldSession }], settings: { photoTemplate: 'club' } };
  const restored = P.validateStore(JSON.parse(JSON.stringify(original)));
  assert.equal(restored.version, 4);
  assert.equal(restored.session.races[0].format, 'MIXED');
  assert.equal(restored.history[0].session.races[0].format, 'MIXED');
  assert.equal(restored.session.entries[0].category, 'F');
  const empty = P.validateStore({ ...original, session: { ...oldSession, entries: [] }, history: [] });
  assert.equal(empty.session.races[0].format, 'DUO');
  for (const format of ['SOLO', 'DUO', 'MIXED']) assert.equal(P.validateRace(race({ format })).format, format);
  assert.throws(() => P.validateRace(race({ format: 'TRIO' })));
});
test('fixed event formats reject incompatible registrations and imports', () => {
  const duo = P.validateRace(race({ format: 'DUO' })), solo = P.validateRace(race({ format: 'SOLO' }));
  assert.throws(() => P.validateSession(raceSession(duo, [entry({ raceId: duo.id, category: 'H' })])));
  assert.throws(() => P.validateSession(raceSession(solo, [entry({ raceId: solo.id, format: 'DUO', category: 'HH', name2: 'Sam' })])));
  const mapping = { bib: -1, name1: 0, name2: 1, format: 2, category: -1, scheduled: 3, duration: -1 };
  assert.match(P.importRows([['Alex', '', 'Solo H', '09:00']], mapping, [], duo)[0].error, /uniquement des duos/);
  assert.match(P.importRows([['Alex', 'Sam', 'Duo HH', '09:00']], mapping, [], solo)[0].error, /uniquement des solos/);
  assert.equal(P.importRows([['Alex', 'Sam', 'Duo HF', '09:00']], mapping, [], duo)[0].entry.category, 'HF');
  const v4 = { version: 4, revision: 'r', savedAt: 1, session: raceSession(duo, [entry({ raceId: duo.id, category: 'H' })]), history: [], settings: { photoTemplate: 'club' } };
  assert.throws(() => P.validateStore(v4));
});
test('event format controls visible ranking filters', () => {
  const entries = [entry()];
  assert.deepEqual(Array.from(P.eventRankingFormats(race({ format: 'DUO' }), entries)), ['HH', 'FF', 'HF']);
  assert.deepEqual(Array.from(P.eventRankingFormats(race({ format: 'SOLO' }), [])), ['H', 'F']);
  assert.deepEqual(Array.from(P.eventRankingFormats(race({ format: 'SOLO' }), entries)), ['H', 'F', 'SOLO']);
  assert.deepEqual(Array.from(P.eventRankingFormats(race({ format: 'MIXED' }), [])), ['H', 'F', 'HH', 'FF', 'HF']);
});
test('H/F buttons derive the same mixed category for either participant order', () => {
  assert.equal(P.categoryFromGenders('SOLO', 'H', ''), 'H');
  assert.equal(P.categoryFromGenders('SOLO', 'F', ''), 'F');
  assert.equal(P.categoryFromGenders('DUO', 'H', 'H'), 'HH');
  assert.equal(P.categoryFromGenders('DUO', 'F', 'F'), 'FF');
  for (const [gender1, gender2] of [['H', 'F'], ['F', 'H']]) {
    const e = P.validateEntry(entry({ format: 'DUO', category: P.categoryFromGenders('DUO', gender1, gender2), name2: 'Sam', gender1, gender2 }));
    const restored = P.validateEntry(JSON.parse(JSON.stringify(e)));
    assert.equal(P.formatLabel(restored), 'Duo HF');
    assert.equal(P.formatKey(restored), 'HF');
    assert.equal(restored.gender1, gender1); assert.equal(restored.gender2, gender2);
  }
  assert.throws(() => P.categoryFromGenders('DUO', 'H', ''));
  assert.throws(() => P.categoryFromGenders('SOLO', '', ''));
  assert.throws(() => P.categoryFromGenders('SOLO', 'H', 'F'));
  assert.throws(() => P.validateEntry(entry({ format: 'DUO', category: 'HH', name2: 'Sam', gender1: 'F', gender2: 'H' })));
});
test('legacy mixed duos keep unknown participant order; MF and HF imports share one ranking', () => {
  const legacy = P.validateEntry(entry({ format: 'DUO', category: 'HF', name2: 'Sam' }));
  assert.equal(legacy.gender1, ''); assert.equal(legacy.gender2, '');
  assert.equal(P.formatLabel(legacy), 'Duo HF');
  const hh = P.validateEntry(entry({ format: 'DUO', category: 'HH', name2: 'Sam' }));
  assert.equal(hh.gender1, 'H'); assert.equal(hh.gender2, 'H');
  const r = race(), mapping = { bib: -1, name1: 0, name2: 1, format: 2, category: -1, scheduled: 3, duration: 4 };
  const result = P.importRows([['A', 'B', 'Duo MF', '09:00', '01:00:00'], ['C', 'D', 'MF', '09:05', '00:58:00'], ['E', 'F', 'Duo HF', '09:10', '01:03:00']], mapping, [], r);
  assert.equal(result.filter(row => row.error).length, 0);
  const ranked = P.rankingFor(P.validateSession(raceSession(r, result.map(row => row.entry))), 'HF', r.date);
  assert.deepEqual(Array.from(ranked, row => row.entry.name1), ['C', 'A', 'E']);
});
test('arrival now captures second precision without mutating the registration', () => {
  const e = entry({ scheduled: '10:00:15' }), now = new Date('2026-10-12T11:03:15').getTime() + 987;
  const result = P.arrivalNow(race(), e, now);
  assert.equal(result.arrivalTime, '11:03:15'); assert.equal(result.nextDay, false);
  assert.equal(result.arrivedAt, now - 987); assert.equal(result.durationMs, 3780000);
  assert.equal(e.startedAt, null); assert.equal(e.durationMs, null); assert.equal(e.status, 'waiting');
});
test('arrival now uses the actual calendar day after midnight', () => {
  const result = P.arrivalNow(race(), entry({ scheduled: '23:55:45' }), new Date('2026-10-13T00:03:10').getTime());
  assert.equal(result.arrivalTime, '00:03:10'); assert.equal(result.nextDay, true); assert.equal(result.durationMs, 445000);
});
test('arrival now rejects a future start, an old event, missing departure and an invalid clock', () => {
  for (const time of ['2026-10-12T08:59:59', '2026-10-12T09:00:00', '2026-10-11T11:00:00', '2026-10-14T11:00:00']) assert.throws(() => P.arrivalNow(race(), entry(), new Date(time).getTime()));
  assert.throws(() => P.arrivalNow(race(), entry({ scheduled: '' }), new Date('2026-10-12T11:00:00').getTime()));
  for (const now of [NaN, Infinity, 0, -1, 1e30]) assert.throws(() => P.arrivalNow(race(), entry(), now));
});
test('arrival now accounts for a DST night and refuses an ambiguous repeated hour', () => {
  const { spawnSync } = require('node:child_process');
  const child = spawnSync(process.execPath, ['-e', `
    const fs=require('fs'),vm=require('vm'),c=vm.createContext({Date,TextDecoder});
    vm.runInContext(fs.readFileSync('dist/core.js','utf8'),c);
    const race={date:'2026-10-24'},entry={scheduled:'23:00',startedAt:null};
    const unique=c.Pace.arrivalNow(race,entry,new Date('2026-10-25T03:30:00+01:00').getTime());
    let error='';try{c.Pace.arrivalNow(race,entry,new Date('2026-10-25T02:30:00+01:00').getTime());}catch(e){error=e.message;}
    process.stdout.write(JSON.stringify({duration:unique.durationMs,nextDay:unique.nextDay,error}));
  `], { env: { ...process.env, TZ: 'Europe/Paris' }, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.duration, 19800000); assert.equal(result.nextDay, true); assert.match(result.error, /ambiguë/);
});

test('edit snapshots reject changed results, deleted entries and changed event formats', () => {
  const r = P.validateRace(race()), e = P.validateEntry(entry({ raceId: r.id }));
  const s = { ...session([e]), races: [r] };
  const snapshot = P.captureEdit(s, 'entry', e.id, r.id);
  const changed = structuredClone(s);
  changed.entries[0] = P.validateEntry({ ...e, status: 'finished', durationMs: 3600000 });
  assert.throws(() => P.assertEditUnchanged(changed, snapshot), /formulaire ont changé/);
  assert.throws(() => P.assertEditUnchanged({ ...s, entries: [] }, snapshot), /formulaire ont changé/);
  assert.throws(() => P.assertEditUnchanged({ ...s, races: [{ ...r, format: 'SOLO' }] }, snapshot), /formulaire ont changé/);
});
test('edit snapshots permit changes to an unrelated participant', () => {
  const r = P.validateRace(race()), a = P.validateEntry(entry({ raceId: r.id }));
  const b = P.validateEntry({ ...a, id: 'b', name1: 'Autre participant' });
  const s = { ...session([a,b]), races: [r] }, snapshot = P.captureEdit(s, 'entry', a.id, r.id);
  const changed = structuredClone(s); changed.entries[1].name1 = 'Nom corrigé';
  assert.doesNotThrow(() => P.assertEditUnchanged(changed, snapshot));
});
test('event edits detect newly registered athletes and new registrations detect a removed event', () => {
  const r = P.validateRace(race()), s = { ...session([]), races: [r] };
  const edit = P.captureEdit(s, 'race', r.id), registration = P.captureEdit(s, 'entry', '', r.id);
  assert.throws(() => P.assertEditUnchanged({ ...s, entries: [P.validateEntry(entry({ raceId: r.id }))] }, edit), /formulaire ont changé/);
  assert.throws(() => P.assertEditUnchanged({ ...s, races: [] }, registration), /formulaire ont changé/);
});
test('arrival correction returns to the departure day instead of retaining a hidden next day', () => {
  const r = P.validateRace(race()), e = P.validateEntry(entry({ raceId: r.id, scheduled: '23:30' }));
  const finished = P.validateEntry({ ...e, ...P.calculateDuration(r,e,'01:00:00'), status:'finished', resultMode:'duration' });
  const corrected = P.calculateResultArrival(r,finished,'23:45');
  assert.equal(corrected.durationMs,15*60000);
  assert.equal(P.localDate(new Date(corrected.arrivedAt)),r.date);
  assert.equal(P.calculateResultArrival(r,finished,'00:15').durationMs,45*60000);
  assert.equal(P.calculateResultArrival(r,finished,'00:30').arrivedAt,finished.arrivedAt);
});
test('arrival correction preserves long results and guides new overnight arrivals toward duration', () => {
  const r = P.validateRace(race()), e = P.validateEntry(entry({ raceId:r.id }));
  const long = P.validateEntry({ ...e,...P.calculateDuration(r,e,'25:00:00'),status:'finished' });
  assert.equal(P.calculateResultArrival(r,long,'10:00').arrivedAt,long.arrivedAt);
  assert.throws(() => P.calculateResultArrival(r,long,'10:15'),/supérieur à 24 heures/);
  assert.throws(() => P.calculateResultArrival(r,e,'08:30'),/après minuit/);
  const capture = P.arrivalNow(r,e,new Date(`${r.date}T10:00:00`).getTime());
  assert.equal(P.calculateResultArrival(r,e,capture.arrivalTime,capture).arrivedAt,capture.arrivedAt);
});
test('Open et Pro dans un même événement : import, classements, podium et CSV séparés', () => {
  const r = P.validateRace(race({ levels: ['Open', 'Pro'] })), map = { bib: -1, name1: 1, name2: -1, format: 0, category: -1, level: 4, scheduled: 2, duration: 3 };
  assert.deepEqual(Array.from(r.levels), ['Open', 'Pro']);
  assert.deepEqual(Array.from(P.validateRace(race({ levels: ['Pro', 'Open'] })).levels), ['Open', 'Pro']);
  assert.deepEqual(Array.from(P.validateRace(race()).levels), []);
  assert.throws(() => P.validateRace(race({ levels: ['RX'] })), /Open et Pro/);
  const rows = [['Solo H', 'A', '09:00', '01:00:00', 'Pro'], ['Solo H', 'B', '09:05', '00:58:00', 'open'], ['Solo H', 'C', '09:10', '00:59:00', 'Pro']];
  const result = P.importRows(rows, map, [], r); assert.equal(result.filter(row => row.error).length, 0);
  assert.equal(P.importRows([['Solo H', 'D', '09:00', '', '']], map, [], r)[0].error, 'Précisez le niveau : Open ou Pro.');
  assert.match(P.importRows([['Solo H', 'D', '09:00', '', 'RX']], map, [], r)[0].error, /inconnu/);
  const s = P.validateSession(raceSession(r, result.map(row => row.entry)));
  assert.deepEqual(Array.from(P.rankingFor(s, 'H', r.date, 'Pro'), row => `${row.entry.name1}:${row.rank}`), ['C:1', 'A:2']);
  assert.deepEqual(Array.from(P.rankingFor(s, 'H', r.date, 'Open'), row => `${row.entry.name1}:${row.rank}`), ['B:1']);
  assert.equal(P.rankingFor(s, 'H', r.date).length, 0);
  assert.deepEqual(Array.from(P.eventRankingGroups(r, s.entries), g => `${g.level}:${g.format}`), ['Open:H', 'Open:F', 'Open:HH', 'Open:FF', 'Open:HF', 'Pro:H', 'Pro:F', 'Pro:HH', 'Pro:FF', 'Pro:HF']);
  assert.equal(P.podiumFor(s, r, 'H', 'Open')[0].entries[0].name1, 'B');
  const csv = P.finalResultsCSV(s, r).split('\r\n');
  assert.match(csv[0], /^﻿"Rang";"Niveau";"Format"/);
  assert.match(csv[1], /^"1";"Open";"Solo H";"B"/);
  assert.match(csv[2], /^"1";"Pro";"Solo H";"C"/);
  assert.equal(P.groupLabel('Pro', 'Duo HH'), 'Pro · Duo HH');
  assert.throws(() => P.validateEntry(entry({ level: 'RX' })), /Open ou Pro/);
});
test('training event: chosen format and size, departures from 8:00 in waves of 3, dated the day before until the last wave left', () => {
  const people = Array.from({ length: 30 }, (_, i) => i % 2 ? { name1: `S${i}`, name2: '', gender1: 'F', gender2: '' } : { name1: `A${i}`, name2: `B${i}`, gender1: 'H', gender2: 'F' });
  const evening = new Date(2026, 9, 20, 20, 0);
  const { race: r, entries } = P.trainingEvent([], people, 'MIXED', true, evening);
  assert.equal(r.training, true);
  assert.equal(r.format, 'MIXED');
  assert.equal(r.date, '2026-10-20');
  assert.deepEqual(Array.from(r.levels), ['Open', 'Pro']);
  assert.equal(entries.length, 30);
  assert.equal(entries.filter(e => e.format === 'SOLO').length, 15);
  assert.equal(entries[0].scheduled, '08:00');
  assert.equal(entries[3].scheduled, '08:05');
  assert.equal(entries[29].scheduled, '08:45');
  assert.equal(entries[3].level, 'Pro');
  assert.equal(entries.filter(e => e.status === 'finished').length, 3);
  assert.equal(P.validateSession({ title: 'Test', date: r.date, races: [r], entries }).races[0].training, true);
  const early = P.trainingEvent([r], people, 'MIXED', false, new Date(2026, 9, 20, 8, 30));
  assert.equal(early.race.date, '2026-10-19');
  assert.equal(early.race.levels.length, 0);
  assert.ok(early.entries.every(e => e.level === ''));
  assert.equal(P.trainingEvent([r], people, 'MIXED', false, evening).race.title, 'Entraînement 2 — Soundcrossing');
});
