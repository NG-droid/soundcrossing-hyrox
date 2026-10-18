// Modèle Excel vierge partagé par l’app Hyrox et le module WOD : une ligne d’en-têtes,
// des listes déroulantes sur les colonnes à codes, et un onglet « Légende » qui explique chaque colonne.
namespace Modele {
  export interface Column { header: string; choices?: string[]; help: string; width: number; }
  const LAST_ROW = 1000;
  const xmlText = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const letter = (i: number): string => String.fromCharCode(65 + i);
  // SheetJS ne sait pas écrire les listes déroulantes : on les ajoute dans le XML de la feuille, à la place prévue par Excel.
  export function addDropdowns(sheetXml: string, columns: Column[]): string {
    const rules = columns.map((c, i) => c.choices ? `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="${xmlText(c.header)}" error="${xmlText(`Choisissez dans la liste : ${c.choices.join(', ')}`)}" sqref="${letter(i)}2:${letter(i)}${LAST_ROW}"><formula1>"${xmlText(c.choices.join(','))}"</formula1></dataValidation>` : '').filter(Boolean);
    if (!rules.length) return sheetXml;
    const block = `<dataValidations count="${rules.length}">${rules.join('')}</dataValidations>`;
    const next = sheetXml.search(/<(hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|ignoredErrors|drawing|legacyDrawing|tableParts|extLst)[\s>/]/);
    return next >= 0 ? sheetXml.slice(0, next) + block + sheetXml.slice(next) : sheetXml.replace('</worksheet>', `${block}</worksheet>`);
  }
  export function workbook(columns: Column[], sheetName = 'Participants'): Uint8Array {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([columns.map(c => c.header)]);
    sheet['!cols'] = columns.map(c => ({ wch: c.width }));
    XLSX.utils.book_append_sheet(book, sheet, sheetName);
    const legend = XLSX.utils.aoa_to_sheet([['Colonne', 'Ce qu’il faut mettre', 'Valeurs possibles'], ...columns.map(c => [c.header, c.help, c.choices?.join(' · ') ?? ''])]);
    legend['!cols'] = [{ wch: 18 }, { wch: 60 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(book, legend, 'Légende');
    const zip = XLSX.CFB.read(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })), { type: 'buffer' });
    const entry = XLSX.CFB.find(zip, '/xl/worksheets/sheet1.xml');
    if (entry) { entry.content = new TextEncoder().encode(addDropdowns(new TextDecoder().decode(entry.content), columns)); entry.size = entry.content.length; }
    return XLSX.CFB.write(zip, { type: 'array', fileType: 'zip', compression: true });
  }
  export function download(data: Uint8Array, name: string): void {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
