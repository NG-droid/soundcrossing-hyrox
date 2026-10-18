// Case de temps unique partagée par l’Hyrox (heure d’arrivée) et le WOD (temps réalisé) :
// on tape les chiffres, les « : » se placent tout seuls (074512 → 07:45:12).
namespace Saisie {
  const pad = (n: number): string => String(n).padStart(2, '0');
  // Met en forme ce qui est tapé : deux chiffres par bloc, au plus hh:mm:ss.
  // Un séparateur tapé après un seul chiffre complète le bloc (7: → 07:).
  export function mask(raw: string): string {
    const blocks: string[] = []; let current = '';
    for (const ch of raw) {
      if (blocks.length === 3) break;
      if (/\d/.test(ch)) { current += ch; if (current.length === 2) { blocks.push(current); current = ''; } }
      else if (/[:hm.,\s]/i.test(ch) && current.length === 1) { blocks.push(`0${current}`); current = ''; }
    }
    if (current && blocks.length < 3) blocks.push(current);
    return blocks.join(':');
  }
  // Heures, minutes, secondes lues dans la case ; null si elle est vide.
  export function parts(text: string): [number, number, number] | null {
    const value = mask(text.trim());
    if (!value) return null;
    if (!/^\d{2}(:\d{2}){0,2}$/.test(value)) throw Error(`Temps incomplet : « ${text.trim()} ». Écrivez hh:mm:ss, par ex. 01:05:30.`);
    const [h, m = 0, s = 0] = value.split(':').map(Number) as [number, number?, number?];
    if (m > 59 || s > 59) throw Error('Minutes et secondes doivent être entre 00 et 59.');
    return [h, m, s];
  }
  // Heure d’arrivée « HH:MM:SS » pour l’Hyrox ('' si vide).
  export function clockTime(text: string): string {
    const p = parts(text); if (!p) return '';
    if (p[0] > 23) throw Error('Heure d’arrivée : les heures vont de 00 à 23.');
    return p.map(pad).join(':');
  }
  // Durée en millisecondes pour le WOD (null si vide).
  export function duration(text: string): number | null {
    const p = parts(text); if (!p) return null;
    const ms = ((p[0] * 60 + p[1]) * 60 + p[2]) * 1000;
    if (ms <= 0) throw Error('Temps : saisissez une durée.');
    return ms;
  }
  export function fromMs(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return '';
    const s = Math.round(ms / 1000);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(pad).join(':');
  }
  export function box(attrs: string, value: string, label: string): string {
    return `<input class="time-box" ${attrs} value="${value}" placeholder="hh:mm:ss" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="${label}">`;
  }
  // Met en forme pendant la frappe, dans toutes les cases .time-box de la page.
  export function install(root: Document | HTMLElement = document): void {
    root.addEventListener('input', event => {
      const input = event.target as HTMLInputElement;
      if (!input.classList?.contains('time-box')) return;
      const atEnd = input.selectionStart === input.value.length, next = mask(input.value);
      if (next !== input.value) { input.value = next; if (atEnd) input.setSelectionRange(next.length, next.length); }
      input.classList.remove('invalid');
    });
  }
}
