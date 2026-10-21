// Sauvegarde fichier commune à l’Hyrox et au WOD : un seul fichier contient les deux, quelle que soit l’app
// qui l’exporte, et la restauration remet les deux en place. Les anciens fichiers d’une seule app restent lisibles.
namespace Sauvegarde {
  export type App = 'hyrox' | 'wod';
  export const FORMAT = 'soundcrossing-sauvegarde';
  const CLES: Record<App, string> = { hyrox: 'pace.hyrox.session.v1', wod: 'soundcrossing-wod.v1' };
  const DISQUE: Record<App, string> = { hyrox: '/data', wod: '/data/wod' };
  export const NOMS: Record<App, string> = { hyrox: 'Hyrox', wod: 'WOD' };
  interface Donnees { revision?: unknown; savedAt?: unknown; history?: unknown }
  const pad = (n: number): string => String(n).padStart(2, '0');
  const savedAt = (d: Donnees | null): number => typeof d?.savedAt === 'number' ? d.savedAt : -1;
  const disque = typeof fetch === 'function' && typeof location !== 'undefined' && location.protocol !== 'file:';

  // Nom parlant, trié par date dans le dossier : Soundcrossing-sauvegarde-2026-10-21-20h15.json.
  export function nom(securite = false, quand = new Date()): string {
    const date = `${quand.getFullYear()}-${pad(quand.getMonth() + 1)}-${pad(quand.getDate())}-${pad(quand.getHours())}h${pad(quand.getMinutes())}`;
    return `Soundcrossing-${securite ? 'copie-avant-restauration' : 'sauvegarde'}-${date}.json`;
  }
  // Ce que chaque app a à sauvegarder ; une app sans événement laisse sa partie vide (null),
  // et une partie vide ne remplace rien à la restauration.
  interface PartHyrox extends Donnees { session: { title?: unknown; races: unknown[]; entries: unknown[] } }
  interface PartWod extends Donnees { events: { athletes: unknown[] }[] }
  export function contenu(hyrox: PartHyrox | null, wod: PartWod | null): string {
    return JSON.stringify({
      format: FORMAT, version: 1, creeLe: new Date().toISOString(),
      hyrox: hyrox && (hyrox.session.races.length || hyrox.session.entries.length) ? hyrox : null,
      wod: wod && wod.events.length ? { ...wod, history: [] } : null,
    }, null, 2);
  }
  // Texte de confirmation, identique dans les deux apps.
  export function message(hyrox: PartHyrox | null, wod: PartWod | null): string {
    const h = hyrox ? `${hyrox.session.races.length} événement(s), ${hyrox.session.entries.length} départ(s)` : 'absent du fichier, rien ne change';
    const w = wod ? `${wod.events.length} événement(s), ${wod.events.reduce((n, e) => n + e.athletes.length, 0)} inscription(s)` : 'absent du fichier, rien ne change';
    return `Hyrox : ${h}. WOD : ${w}. Les données actuelles seront remplacées par celles du fichier. Avant cela, une copie de sécurité de vos données actuelles (Hyrox et WOD) est téléchargée : elle permet de revenir en arrière.`;
  }
  export function restaure(hyrox: unknown, wod: unknown): string {
    return `Sauvegarde restaurée : ${[hyrox ? 'Hyrox' : '', wod ? 'WOD' : ''].filter(Boolean).join(' et ')}.`;
  }
  // Vérifie une partie du fichier avec les règles de son app ; l’erreur dit quelle partie est refusée.
  export function verifier<T>(app: App, value: unknown, valider: (value: unknown) => T): T | null {
    if (value === null) return null;
    try { return valider(value); } catch (error) { throw Error(`Partie ${NOMS[app]} du fichier : ${error instanceof Error ? error.message : 'invalide.'}`); }
  }
  // Fichier commun : ses deux parties. Ancien fichier : seulement l’app qui l’a créé (l’Hyrox a une « session »).
  export function lire(texte: string): Record<App, unknown | null> {
    let value: unknown;
    try { value = JSON.parse(texte); } catch { throw Error('Ce fichier n’est pas une sauvegarde Soundcrossing.'); }
    if (!value || typeof value !== 'object') throw Error('Ce fichier n’est pas une sauvegarde Soundcrossing.');
    const v = value as { format?: unknown; hyrox?: unknown; wod?: unknown; session?: unknown };
    if (v.format === FORMAT) {
      if (v.hyrox == null && v.wod == null) throw Error('Cette sauvegarde est vide : rien à restaurer.');
      return { hyrox: v.hyrox ?? null, wod: v.wod ?? null };
    }
    return 'session' in v ? { hyrox: value, wod: null } : { hyrox: null, wod: value };
  }

  // Dernière copie disque connue de l’autre app : relue à l’ouverture de la page et des paramètres,
  // pour que le fichier la contienne même si le navigateur a oublié ses données.
  const copies: Partial<Record<App, unknown>> = {};
  export function precharger(app: App): void {
    if (!disque) return;
    void fetch(DISQUE[app], { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(raw => { copies[app] = raw; }).catch(() => { /* Pas de copie disque. */ });
  }
  // Données de l’autre app pour le fichier : la plus récente entre le navigateur et la copie disque.
  export function autre<T extends Donnees>(app: App, valider: (value: unknown) => T): T | null {
    const lu = (raw: unknown): T | null => { try { return raw == null ? null : valider(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { return null; } };
    let local: T | null = null;
    try { local = lu(localStorage.getItem(CLES[app])) ?? lu(localStorage.getItem(`${CLES[app]}.recovery`)); } catch { /* Navigateur inaccessible. */ }
    const copie = lu(copies[app]);
    return savedAt(copie) > savedAt(local) ? copie : local;
  }

  // Remplace les données de l’autre app (navigateur puis copie disque). L’ancienne version reste en secours,
  // comme lors d’un enregistrement normal ; une page de l’autre app déjà ouverte se met à jour toute seule.
  export function remplacer(app: App, donnees: Donnees, valider: (value: unknown) => Donnees): boolean {
    const cle = CLES[app];
    const texte = JSON.stringify({ ...donnees, revision: crypto.randomUUID(), savedAt: Date.now() });
    try {
      const ancien = localStorage.getItem(cle);
      if (ancien) {
        let secours: string | null = null;
        try { secours = JSON.stringify({ ...valider(JSON.parse(ancien)), history: [] }); } catch { /* Illisible : gardée à part. */ }
        localStorage.setItem(secours === null ? `${cle}.damaged` : `${cle}.recovery`, secours ?? ancien);
      }
      localStorage.setItem(cle, texte);
    } catch { return false; }
    if (disque) void (async () => {
      try {
        const actuelle = await fetch(DISQUE[app], { cache: 'no-store' });
        const base = actuelle.ok ? (await actuelle.json() as Donnees).revision : '';
        await fetch(DISQUE[app], { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Base-Revision': typeof base === 'string' ? base : '' }, body: texte });
      } catch { /* L’autre app recopie ses données sur le disque à sa prochaine ouverture. */ }
    })();
    return true;
  }
}
