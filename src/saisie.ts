// Case de temps unique partagée par l’Hyrox (heure d’arrivée) et le WOD (temps réalisé) :
// on tape les chiffres, les « : » se placent tout seuls (074512 → 07:45:12).
namespace Saisie {
  const pad = (n: number): string => String(n).padStart(2, '0');
  // Met en forme ce qui est tapé : deux chiffres par bloc, au plus hh:mm:ss.
  // Un séparateur tapé après un seul chiffre complète le bloc (7: → 07:).
  // Pour un WOD court (cap de moins d’une heure), la case n’a que deux blocs : mm:ss.
  export function mask(raw: string, max = 3): string {
    const blocks: string[] = []; let current = '';
    for (const ch of raw) {
      if (blocks.length === max) break;
      if (/\d/.test(ch)) { current += ch; if (current.length === 2) { blocks.push(current); current = ''; } }
      else if (/[:hm.,\s]/i.test(ch) && current.length === 1) { blocks.push(`0${current}`); current = ''; }
    }
    if (current && blocks.length < max) blocks.push(current);
    return blocks.join(':');
  }
  // Heures, minutes, secondes lues dans la case ; null si elle est vide.
  export function parts(text: string, short = false): [number, number, number] | null {
    const value = mask(text.trim(), short ? 2 : 3);
    if (!value) return null;
    if (!/^\d{2}(:\d{2}){0,2}$/.test(value)) throw Error(`Temps incomplet : « ${text.trim()} ». Écrivez ${short ? 'mm:ss, par ex. 12:30' : 'hh:mm:ss, par ex. 01:05:30'}.`);
    const nums = value.split(':').map(Number);
    if (short) { const [m, s = 0] = nums as [number, number?]; if (s > 59) throw Error('Les secondes doivent être entre 00 et 59.'); return [0, m, s]; }
    const [h, m = 0, s = 0] = nums as [number, number?, number?];
    if (m > 59 || s > 59) throw Error('Minutes et secondes doivent être entre 00 et 59.');
    return [h, m, s];
  }
  // Heure d’arrivée « HH:MM:SS » pour l’Hyrox ('' si vide).
  export function clockTime(text: string): string {
    const p = parts(text); if (!p) return '';
    if (p[0] > 23) throw Error('Heure d’arrivée : les heures vont de 00 à 23.');
    return p.map(pad).join(':');
  }
  // Durée en millisecondes pour le WOD (null si vide) ; short = case mm:ss.
  export function duration(text: string, short = false): number | null {
    const p = parts(text, short); if (!p) return null;
    const ms = ((p[0] * 60 + p[1]) * 60 + p[2]) * 1000;
    if (ms <= 0) throw Error('Temps : saisissez une durée.');
    return ms;
  }
  export function fromMs(ms: number | null | undefined, short = false): string {
    if (ms === null || ms === undefined) return '';
    const s = Math.round(ms / 1000);
    if (short) return [Math.floor(s / 60), s % 60].map(pad).join(':');
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(pad).join(':');
  }
  // Même apparence que la case d’arrivée de l’Hyrox (.score-time).
  export function box(attrs: string, value: string, label: string, short = false): string {
    return `<input class="time-box score-time" ${attrs}${short ? ' data-short="1"' : ''} value="${value}" placeholder="${short ? 'mm:ss' : 'hh:mm:ss'}" inputmode="numeric" maxlength="${short ? 5 : 8}" autocomplete="off" aria-label="${label}">`;
  }
  // Met en forme pendant la frappe, dans toutes les cases .time-box de la page.
  export function install(root: Document | HTMLElement = document): void {
    root.addEventListener('input', event => {
      const input = event.target as HTMLInputElement;
      if (!input.classList?.contains('time-box')) return;
      const atEnd = input.selectionStart === input.value.length, next = mask(input.value, input.dataset.short ? 2 : 3);
      if (next !== input.value) { input.value = next; if (atEnd) input.setSelectionRange(next.length, next.length); }
      input.classList.remove('invalid');
    });
  }
}

// Témoin de sauvegarde, partagé par l’Hyrox et le WOD : la pastille de l’en-tête dit si la copie
// sur l’ordinateur (dossier Documents/Soundcrossing, écrit par server.py) est à jour.
namespace Temoin {
  export type Disque = 'attente' | 'ok' | 'erreur' | 'conflit' | 'navigateur';
  let disque: Disque = 'attente', local = true, depuis = 0, dossier = '', lenteur = 0;
  const heure = (ms: number): string => new Date(ms).toLocaleTimeString('fr-FR');
  function afficher(): void {
    const el = document.getElementById('save-status');
    if (!el) return;
    const ou = dossier || 'Documents/Soundcrossing';
    const [css, texte, titre] = !local ? ['erreur', 'Enregistrement indisponible', 'Le navigateur refuse d’enregistrer. Exportez une sauvegarde : aucune modification non sauvegardée n’est appliquée.']
      : disque === 'ok' ? ['ok', 'Enregistré sur l’ordinateur', depuis ? `Dernière copie à ${heure(depuis)} dans ${ou}` : `Copie à jour dans ${ou}`]
      : disque === 'attente' ? ['attente', 'Enregistrement…', `Copie en cours dans ${ou}`]
      : disque === 'navigateur' ? ['attente', 'Navigateur seulement', 'Page ouverte sans le lanceur Soundcrossing : rien n’est copié sur l’ordinateur. Exportez une sauvegarde.']
      : disque === 'conflit' ? ['erreur', 'Non enregistré sur l’ordinateur', 'La copie sur l’ordinateur a été modifiée par un autre navigateur : rien n’a été écrasé. Rechargez la page.']
      : ['erreur', 'Non enregistré sur l’ordinateur', 'Le lanceur Soundcrossing ne répond plus. Rouvrez-le : la copie reprendra toute seule. En attendant, les données restent dans ce navigateur.'];
    el.className = `save-badge ${css}`; el.title = titre;
    el.innerHTML = `<i></i>${texte}`;
  }
  // false : le navigateur lui-même n’enregistre plus (stockage bloqué ou illisible).
  export function navigateur(ok: boolean): void { local = ok; afficher(); }
  // L’état « attente » n’apparaît que si la copie traîne : une écriture rapide ne fait pas clignoter la pastille.
  export function etat(valeur: Disque, savedAt = 0): void {
    window.clearTimeout(lenteur);
    if (valeur === 'attente') { lenteur = window.setTimeout(() => { disque = 'attente'; afficher(); }, 600); return; }
    disque = valeur; if (valeur === 'ok' && savedAt) depuis = savedAt; afficher();
  }
  // Vérifie toutes les 10 s que le lanceur répond ; quand il revient, relancer() recopie les données.
  export function surveiller(relancer: () => void): void {
    if (typeof fetch !== 'function' || location.protocol === 'file:') { etat('navigateur'); return; }
    const ping = async (): Promise<void> => {
      try {
        const response = await fetch('/health', { cache: 'no-store' });
        if (!response.ok) throw Error();
        const info = await response.json() as { data?: unknown };
        if (typeof info.data === 'string' && info.data !== dossier) { dossier = info.data; afficher(); }
        if (disque === 'erreur') relancer();
      } catch { etat('erreur'); }
    };
    void ping(); window.setInterval(() => { void ping(); }, 10000);
  }
}
