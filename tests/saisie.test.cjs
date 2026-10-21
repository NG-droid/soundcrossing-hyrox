const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('dist/saisie.js', 'utf8'), context);
const S = context.Saisie;

test('la case hh:mm:ss place les « : » toute seule pendant la frappe', () => {
  assert.equal(S.mask('0'), '0');
  assert.equal(S.mask('074'), '07:4');
  assert.equal(S.mask('074512'), '07:45:12');
  assert.equal(S.mask('07451299'), '07:45:12');
  assert.equal(S.mask('7:45:3'), '07:45:3');
  assert.equal(S.mask('10h05'), '10:05');
  assert.equal(S.mask('ab'), '');
});

test('heure d’arrivée Hyrox : hh:mm:ss, secondes et minutes facultatives', () => {
  assert.equal(S.clockTime('104512'), '10:45:12');
  assert.equal(S.clockTime('10:45'), '10:45:00');
  assert.equal(S.clockTime(''), '');
  assert.throws(() => S.clockTime('25:00:00'), /00 à 23/);
  assert.throws(() => S.clockTime('10:75:00'), /entre 00 et 59/);
  assert.throws(() => S.clockTime('10:4'), /incomplet/);
});

test('temps du WOD : même case, résultat en millisecondes', () => {
  assert.equal(S.duration('00:07:45'), 465000);
  assert.equal(S.duration('010230'), 3750000);
  assert.equal(S.duration(''), null);
  assert.throws(() => S.duration('00:00:00'), /durée/);
  assert.equal(S.fromMs(465000), '00:07:45');
  assert.equal(S.fromMs(3750000), '01:02:30');
  assert.equal(S.fromMs(undefined), '');
});

test('WOD court (cap < 1 h) : case mm:ss', () => {
  assert.equal(S.mask('1230', 2), '12:30');
  assert.equal(S.mask('123045', 2), '12:30');
  assert.equal(S.duration('1230', true), 750000);
  assert.equal(S.duration('7:05', true), 425000);
  assert.equal(S.fromMs(750000, true), '12:30');
  assert.throws(() => S.duration('12:75', true), /entre 00 et 59/);
  assert.throws(() => S.duration('12:3', true), /mm:ss/);
});
test('fake training entries: solo, duo or both, up to 80 people, H and F balanced, all names different', () => {
  const cat = d => !d.name2 ? d.gender1 : d.gender1 === d.gender2 ? d.gender1 + d.gender2 : 'HF';
  const count = (list, c) => list.filter(d => cat(d) === c).length;
  const duos = S.inscriptionsFictives('DUO', 60);
  assert.equal(duos.length, 30);
  for (const c of ['HH', 'FF', 'HF']) assert.equal(count(duos, c), 10);
  const solos = S.inscriptionsFictives('SOLO', 9);
  assert.equal(solos.length, 9); assert.equal(count(solos, 'H'), 5); assert.equal(count(solos, 'F'), 4);
  const mixed = S.inscriptionsFictives('MIXED', 40);
  assert.equal(mixed.filter(d => !d.name2).length + 2 * mixed.filter(d => d.name2).length, 40);
  assert.equal(mixed.filter(d => d.name2).length, 10);
  assert.equal(S.inscriptionsFictives('SOLO', 500).length, 80);
  for (const format of ['SOLO', 'DUO', 'MIXED']) {
    const list = S.inscriptionsFictives(format, 80), names = list.flatMap(d => d.name2 ? [d.name1, d.name2] : [d.name1]);
    assert.equal(new Set(names).size, names.length);
  }
  assert.equal(S.resumeFictifs(duos), '30 duos (10 HH, 10 FF, 10 HF) · 60 personnes');
});

test('une seule case de temps partout : même classe, --:--:-- ou --:-- (départ hh:mm, WOD court mm:ss)', () => {
  const long = S.box('data-arrival="a"', '09:15:30', 'Arrivée'), short = S.box('data-field="time"', '12:30', 'Temps', 2);
  assert.match(long, /class="score-time time-box"/); assert.match(long, /data-blocks="3"/); assert.match(long, /placeholder="--:--:--"/); assert.match(long, /maxlength="8"/);
  assert.match(short, /class="score-time time-box"/); assert.match(short, /data-blocks="2"/); assert.match(short, /placeholder="--:--"/); assert.match(short, /maxlength="5"/);
  const html = fs.readFileSync('index.html', 'utf8');
  assert.doesNotMatch(html, /type="time"/);
  for (const name of ['scheduled', 'arrival', 'duration']) assert.match(html, new RegExp(`class="score-time time-box" name="${name}"`));
});

test('version des Paramètres : numéro et date en clair', () => {
  const T = context.Temoin;
  assert.equal(T.texteVersion({ numero: '57', date: '2026-10-21' }), 'Version 57 · 21 octobre 2026');
  assert.equal(T.texteVersion({ numero: '', date: '2026-08-01' }), 'Version du 1er août 2026');
  assert.equal(T.texteVersion({}), 'Version inconnue');
  assert.equal(T.texteVersion(), 'Version inconnue');
});
