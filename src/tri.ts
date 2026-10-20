// Tri des tableaux partagé par l’Hyrox et le WOD : on clique sur l’en-tête d’une colonne.
// 1er clic : croissant ▲, 2e clic : décroissant ▼, 3e clic : retour à l’ordre habituel.
namespace Tri {
  export type Sens = 'asc' | 'desc';
  export interface Etat { key: string; dir: Sens; }
  export type Valeur = string | number | null | undefined;

  // Clic sur une colonne : avance d’un cran (croissant → décroissant → aucun tri).
  export function suivant(actuel: Etat | null, key: string): Etat | null {
    if (!actuel || actuel.key !== key) return { key, dir: 'asc' };
    return actuel.dir === 'asc' ? { key, dir: 'desc' } : null;
  }

  const esc = (v: string): string => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  // Contenu cliquable d’un en-tête : le libellé et la petite flèche (grise tant que la colonne ne trie pas).
  export function entete(label: string, key: string, actuel: Etat | null): string {
    const dir = actuel?.key === key ? actuel.dir : null;
    const titre = dir === 'asc' ? 'Trié en ordre croissant : cliquez pour l’ordre décroissant' : dir === 'desc' ? 'Trié en ordre décroissant : cliquez pour revenir à l’ordre habituel' : 'Cliquez pour trier';
    return `<button type="button" class="sort-head${dir ? ' active' : ''}" data-sort="${esc(key)}" title="${titre}">${label}<span class="sort-arrow" aria-hidden="true">${dir === 'desc' ? '▼' : '▲'}</span></button>`;
  }
  // Cellule d’en-tête complète (WOD : tableau construit en entier) ; sans clé, la colonne ne se trie pas.
  export function th(label: string, key: string | null | undefined, actuel: Etat | null): string {
    if (!key) return `<th>${label}</th>`;
    const dir = actuel?.key === key ? actuel.dir : null;
    return `<th${dir ? ` aria-sort="${dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${entete(label, key, actuel)}</th>`;
  }
  // En-têtes fixes (Hyrox) : chaque <th data-sort-key data-label> reçoit son bouton.
  export function marquer(ligne: ParentNode, actuel: Etat | null): void {
    ligne.querySelectorAll<HTMLElement>('th[data-sort-key]').forEach(cell => {
      const key = cell.dataset.sortKey ?? '', dir = actuel?.key === key ? actuel.dir : null;
      cell.innerHTML = entete(esc(cell.dataset.label ?? ''), key, actuel);
      if (dir) cell.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending'); else cell.removeAttribute('aria-sort');
    });
  }

  // Comparaison : nombres, ou texte dans l’ordre alphabétique français (accents et majuscules ignorés).
  function compare(a: Valeur, b: Valeur): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base', numeric: true });
  }
  const vide = (v: Valeur): boolean => v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));
  // Trie une liste sans toucher à l’original. Les cases vides (pas de score, pas de place) restent en bas dans les deux sens.
  // Avec `groupe`, chaque groupe (barre noire de catégorie) garde sa place : on trie à l’intérieur.
  // À valeur égale, l’ordre habituel est conservé.
  export function appliquer<T>(liste: T[], actuel: Etat | null, valeur: (item: T, key: string) => Valeur, groupe?: (item: T) => string): T[] {
    if (!actuel) return liste.slice();
    const sens = actuel.dir === 'asc' ? 1 : -1, ordreGroupes = new Map<string, number>();
    if (groupe) for (const item of liste) { const g = groupe(item); if (!ordreGroupes.has(g)) ordreGroupes.set(g, ordreGroupes.size); }
    return liste.map((item, index) => ({ item, index, v: valeur(item, actuel.key), g: groupe ? ordreGroupes.get(groupe(item))! : 0 }))
      .sort((a, b) => a.g - b.g || Number(vide(a.v)) - Number(vide(b.v)) || (vide(a.v) ? 0 : sens * compare(a.v, b.v)) || a.index - b.index)
      .map(x => x.item);
  }
}
