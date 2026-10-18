const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('../vendor/xlsx.full.min.js');
const context = vm.createContext({ XLSX, TextEncoder, TextDecoder });
vm.runInContext(fs.readFileSync('dist/modele.js', 'utf8') + ';this.Modele = Modele;', context);
const M = context.Modele;

test('modèle Excel vierge : en-têtes, listes déroulantes et onglet Légende', () => {
  const data = M.workbook([{ header: 'Format', choices: ['Solo H', 'Duo HF'], help: 'Le format', width: 18 }, { header: 'Participant 1', help: 'Nom', width: 26 }, { header: 'Niveau', choices: ['Open', 'Pro'], help: 'Le niveau', width: 12 }]);
  const book = XLSX.read(data, { type: 'array' });
  assert.deepEqual(book.SheetNames, ['Participants', 'Légende']);
  assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets.Participants, { header: 1 }), [['Format', 'Participant 1', 'Niveau']]);
  assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets['Légende'], { header: 1 })[3], ['Niveau', 'Le niveau', 'Open · Pro']);
  const xml = new TextDecoder().decode(XLSX.CFB.find(XLSX.CFB.read(Buffer.from(data), { type: 'buffer' }), '/xl/worksheets/sheet1.xml').content);
  assert.match(xml, /<\/sheetData><dataValidations count="2">.*sqref="A2:A1000"><formula1>"Solo H,Duo HF"<\/formula1>.*sqref="C2:C1000"><formula1>"Open,Pro"<\/formula1>.*<\/dataValidations><ignoredErrors>/);
});

test('les listes déroulantes se placent avant les marges ou à la fin de la feuille', () => {
  const cols = [{ header: 'A', choices: ['x'], help: '', width: 5 }];
  assert.match(M.addDropdowns('<worksheet><sheetData/><pageMargins/></worksheet>', cols), /<sheetData\/><dataValidations count="1">.*<\/dataValidations><pageMargins\/>/);
  assert.match(M.addDropdowns('<worksheet><sheetData/></worksheet>', cols), /<\/dataValidations><\/worksheet>$/);
  assert.equal(M.addDropdowns('<worksheet/>', [{ header: 'A', help: '', width: 5 }]), '<worksheet/>');
});
