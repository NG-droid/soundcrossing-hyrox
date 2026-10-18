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
