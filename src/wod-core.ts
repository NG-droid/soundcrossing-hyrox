// Module WOD : logique pure, sans accès à la page. Indépendant de l’app Hyrox.
namespace Wod {
  export type ScoreType = 'time' | 'amrap' | 'load' | 'reps';
  export type Method = 'places' | 'points';
  export type Category = 'H' | 'F' | 'HH' | 'FF' | 'HF';
  export interface Athlete {
    id: string; bib: string; format: 'SOLO' | 'DUO';
    name1: string; name2: string; gender1: 'H' | 'F'; gender2: '' | 'H' | 'F';
    level?: string;
  }
  export interface Workout {
    id: string; name: string; description: string; type: ScoreType;
    capMinutes: number | null; totalReps: number | null; repsPerRound: number | null;
  }
  // time : temps en ms si terminé, sinon reps faites avant le time cap. amrap/reps : reps. load : kg.
  export interface Score { timeMs?: number; reps?: number; kg?: number; }
  export type EventFormat = 'SOLO' | 'DUO' | 'MIXED';
  export interface Competition {
    id: string; title: string; date: string; format: EventFormat; method: Method;
    // Niveaux (divisions) : chacun a son propre classement, par ex. RX et Scaled. Vide = un seul niveau.
    levels: string[];
    athletes: Athlete[]; workouts: Workout[];
    scores: Record<string, Record<string, Score>>;
  }
  // Comme dans l’app Hyrox : plusieurs événements, chacun avec son format Solo, Duo ou Solo + Duo.
  export interface Store { version: 2; events: Competition[]; selectedId: string; }
  export interface Placed { athlete: Athlete; rank: number; score: Score; }
  export interface GeneralRow { athlete: Athlete; rank: number; total: number; places: Record<string, number | null>; }

  export const TYPE_LABELS: Record<ScoreType, string> = {
    time: 'For Time (le plus vite)',
    amrap: 'AMRAP (max de tours / reps)',
    load: 'Charge max (kg)',
    reps: 'Max reps / calories / mètres',
  };
  export const CATEGORIES: Category[] = ['H', 'F', 'HH', 'FF', 'HF'];

  export function emptyCompetition(id: string, title: string, date: string, format: EventFormat): Competition {
    return { id, title, date, format, method: 'places', levels: [], athletes: [], workouts: [], scores: {} };
  }
  export function eventFormatLabel(format: EventFormat): string { return format === 'MIXED' ? 'Solo + Duo' : format === 'DUO' ? 'Duo' : 'Solo'; }
  export function emptyStore(): Store { return { version: 2, events: [], selectedId: '' }; }
  export function category(a: Athlete): Category {
    if (a.format === 'SOLO') return a.gender1;
    return a.gender1 === a.gender2 ? a.gender1 === 'H' ? 'HH' : 'FF' : 'HF';
  }
  export function categoryLabel(c: Category): string { return c.length === 1 ? `Solo ${c}` : `Duo ${c}`; }
  export const LEVEL_PRESETS: Record<string, string[]> = { none: [], rx: ['RX', 'Scaled'], pro: ['Pro', 'Open'], all: ['RX', 'Scaled', 'Pro', 'Open'] };
  // Groupe de classement : niveau + catégorie, par ex. « RX · Solo H ».
  export function group(a: Athlete): string { return `${a.level ? `${a.level} · ` : ''}${categoryLabel(category(a))}`; }
  export function athleteLabel(a: Athlete): string { return a.format === 'DUO' ? `${a.name1} & ${a.name2}` : a.name1; }

  export function clock(ms: number): string {
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  // Accepte « 7:45 », « 07:45 », « 1:02:30 », « 7m45 » ou « 465 » (secondes).
  export function parseTime(text: string): number | null {
    const t = text.trim().replace(/\s+/g, '').replace(/[hm']/gi, ':').replace(/s$|"$/i, '');
    if (!t) return null;
    if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) throw Error(`Temps illisible : « ${text} ». Écrivez par ex. 7:45.`);
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some(n => n > 59)) throw Error(`Temps illisible : « ${text} ».`);
    const seconds = parts.reduce((total, n) => total * 60 + n, 0);
    return seconds * 1000;
  }
  export function parseNumber(text: string, what: string): number | null {
    const t = text.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) throw Error(`${what} illisible : « ${text} ».`);
    return n;
  }

  export function hasScore(w: Workout, s: Score | undefined): s is Score {
    if (!s) return false;
    if (w.type === 'time') return s.timeMs !== undefined || s.reps !== undefined;
    if (w.type === 'load') return s.kg !== undefined;
    return s.reps !== undefined;
  }
  export function capped(w: Workout, s: Score): boolean { return w.type === 'time' && s.timeMs === undefined && s.reps !== undefined; }

  export function scoreText(w: Workout, s: Score | undefined): string {
    if (!hasScore(w, s)) return '';
    if (w.type === 'time') return s.timeMs !== undefined ? clock(s.timeMs) : `CAP + ${s.reps} reps`;
    if (w.type === 'load') return `${String(s.kg).replace('.', ',')} kg`;
    const reps = s.reps ?? 0;
    if (w.type === 'amrap' && w.repsPerRound) return `${Math.floor(reps / w.repsPerRound)} tours + ${reps % w.repsPerRound} reps`;
    return `${reps} reps`;
  }

  // Plus la clé est petite, meilleur est le score. Les athlètes stoppés par le time cap
  // passent après tous ceux qui ont terminé, puis se départagent au nombre de reps.
  function sortKey(w: Workout, s: Score): [number, number] {
    if (w.type === 'time') return s.timeMs !== undefined ? [0, s.timeMs] : [1, -(s.reps ?? 0)];
    if (w.type === 'load') return [0, -(s.kg ?? 0)];
    return [0, -(s.reps ?? 0)];
  }
  function same(a: [number, number], b: [number, number]): boolean { return a[0] === b[0] && a[1] === b[1]; }

  export function workoutRanking(c: Competition, w: Workout, key: string): Placed[] {
    const scores = c.scores[w.id] ?? {};
    const rows = c.athletes.filter(a => group(a) === key && hasScore(w, scores[a.id]))
      .map(a => ({ athlete: a, score: scores[a.id] as Score, key: sortKey(w, scores[a.id] as Score) }))
      .sort((x, y) => x.key[0] - y.key[0] || x.key[1] - y.key[1] || athleteLabel(x.athlete).localeCompare(athleteLabel(y.athlete)));
    const placed: Placed[] = [];
    rows.forEach((row, i) => {
      const prev = rows[i - 1], prevPlaced = placed[i - 1];
      const rank = prev && prevPlaced && same(prev.key, row.key) ? prevPlaced.rank : i + 1;
      placed.push({ athlete: row.athlete, rank, score: row.score });
    });
    return placed;
  }

  export function pointsFor(place: number): number { return Math.max(0, 100 - (place - 1) * 3); }

  // Classement général d’une catégorie. Sans score sur un WOD, l’athlète prend la dernière place
  // de la catégorie (méthode places) ou 0 point (méthode points).
  export function generalRanking(c: Competition, key: string): GeneralRow[] {
    const athletes = c.athletes.filter(a => group(a) === key);
    const byWod = c.workouts.map(w => ({ w, places: new Map(workoutRanking(c, w, key).map(p => [p.athlete.id, p.rank])) }));
    const rows = athletes.map(a => {
      const places: Record<string, number | null> = {};
      let total = 0;
      for (const { w, places: map } of byWod) {
        const place = map.get(a.id) ?? null;
        places[w.id] = place;
        total += c.method === 'places' ? place ?? athletes.length : place === null ? 0 : pointsFor(place);
      }
      return { athlete: a, rank: 0, total, places };
    });
    const better = (x: GeneralRow, y: GeneralRow): number => c.method === 'places' ? x.total - y.total : y.total - x.total;
    rows.sort((x, y) => better(x, y) || athleteLabel(x.athlete).localeCompare(athleteLabel(y.athlete)));
    rows.forEach((row, i) => { const prev = rows[i - 1]; row.rank = prev && prev.total === row.total ? prev.rank : i + 1; });
    return rows;
  }

  // Groupes présents, dans l’ordre des niveaux puis H, F, HH, FF, HF.
  export function usedGroups(c: Competition): string[] {
    const levelIndex = (a: Athlete): number => { const i = c.levels.indexOf(a.level ?? ''); return i < 0 ? c.levels.length : i; };
    const sorted = [...c.athletes].sort((x, y) => levelIndex(x) - levelIndex(y) || CATEGORIES.indexOf(category(x)) - CATEGORIES.indexOf(category(y)));
    return [...new Set(sorted.map(group))];
  }

  // Changement de niveaux : un niveau qui existe encore est gardé ; sinon RX ↔ Pro et Scaled ↔ Open.
  export function remapLevel(level: string | undefined, from: string[], to: string[]): string | undefined {
    if (!to.length) return undefined;
    if (level && to.includes(level)) return level;
    const i = from.indexOf(level ?? '');
    return to[i < 0 ? 0 : i % 2] ?? to[0];
  }
  // Groupes d’un niveau (« RX · Solo H »…), ou tous les groupes si aucun niveau n’est choisi.
  export function groupsForLevel(c: Competition, level: string): string[] {
    return usedGroups(c).filter(g => !level || g.startsWith(`${level} · `));
  }
  // Import de participants depuis un fichier CSV ou Excel. Colonnes : Format, Participant 1, Participant 2, Niveau.
  export const IMPORT_HEADERS = ['Format', 'Participant 1', 'Participant 2', 'Niveau'];
  export interface ImportResult { athletes: Athlete[]; errors: string[]; duplicates: number; }
  const plain = (v: unknown): string => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const IMPORT_ALIASES: Record<string, string[]> = {
    format: ['format', 'categorie', 'type'],
    name1: ['participant 1', 'participant1', 'participant', 'nom', 'nom 1', 'athlete', 'name'],
    name2: ['participant 2', 'participant2', 'nom 2', 'partenaire', 'binome'],
    level: ['niveau', 'level', 'division'],
  };
  // « Solo H », « Duo HF », « HH », « FH »… → format et genres.
  export function parseCategory(text: unknown): { format: 'SOLO' | 'DUO'; gender1: 'H' | 'F'; gender2: '' | 'H' | 'F' } | null {
    const t = plain(text).replace(/\b(solo|duo)\b/g, '').replace(/[^hf]/g, '');
    if (t === 'h' || t === 'f') return { format: 'SOLO', gender1: t.toUpperCase() as 'H' | 'F', gender2: '' };
    if (t === 'hh' || t === 'ff' || t === 'hf' || t === 'fh') return { format: 'DUO', gender1: t[0]!.toUpperCase() as 'H' | 'F', gender2: t[1]!.toUpperCase() as 'H' | 'F' };
    return null;
  }
  export function importAthletes(rows: unknown[][], c: Competition, makeId: () => string): ImportResult {
    const header = (rows[0] ?? []).map(plain);
    const col = (key: string): number => header.findIndex(h => IMPORT_ALIASES[key]!.includes(h));
    const cols = { format: col('format'), name1: col('name1'), name2: col('name2'), level: col('level') };
    if (cols.format < 0 || cols.name1 < 0) return { athletes: [], errors: ['La première ligne doit contenir au moins les colonnes « Format » et « Participant 1 ». Téléchargez le modèle CSV.'], duplicates: 0 };
    const cell = (row: unknown[], i: number): string => i < 0 ? '' : String(row[i] ?? '').trim();
    const seen = new Set(c.athletes.map(a => plain(athleteLabel(a))));
    let bib = Number(nextBib(c));
    const athletes: Athlete[] = [], errors: string[] = []; let duplicates = 0;
    rows.slice(1).forEach((row, index) => {
      const line = index + 2;
      if (!row.some(v => String(v ?? '').trim())) return;
      const cat = parseCategory(cell(row, cols.format)), name1 = cell(row, cols.name1), name2 = cell(row, cols.name2), rawLevel = cell(row, cols.level);
      if (!cat) { errors.push(`Ligne ${line} : format « ${cell(row, cols.format)} » inconnu (Solo H, Solo F, Duo HH, Duo FF ou Duo HF).`); return; }
      if (c.format !== 'MIXED' && cat.format !== c.format) { errors.push(`Ligne ${line} : ${cat.format === 'DUO' ? 'Duo' : 'Solo'} non accepté, l’événement est en ${eventFormatLabel(c.format)}.`); return; }
      if (!name1) { errors.push(`Ligne ${line} : nom du participant 1 manquant.`); return; }
      if (cat.format === 'DUO' && !name2) { errors.push(`Ligne ${line} : nom du participant 2 manquant pour un duo.`); return; }
      const level = c.levels.find(l => plain(l) === plain(rawLevel));
      if (c.levels.length && !level) { errors.push(`Ligne ${line} : niveau ${rawLevel ? `« ${rawLevel} » inconnu` : 'manquant'} (${c.levels.join(' ou ')}).`); return; }
      const athlete: Athlete = { id: makeId(), bib: String(bib).padStart(3, '0'), format: cat.format, name1, name2: cat.format === 'DUO' ? name2 : '', gender1: cat.gender1, gender2: cat.gender2, ...(level ? { level } : {}) };
      const key = plain(athleteLabel(athlete));
      if (seen.has(key)) { duplicates++; return; }
      seen.add(key); athletes.push(athlete); bib++;
    });
    return { athletes, errors, duplicates };
  }
  export function importTemplate(c: Competition): string[][] {
    const level = c.levels[0] ?? '';
    const rows = [['Solo H', 'Alex Martin', '', level], ['Solo F', 'Manon Simon', '', level], ['Duo HH', 'Hugo Robert', 'Tom Garcia', level], ['Duo FF', 'Emma Durand', 'Léa Moreau', level], ['Duo HF', 'Lucas Petit', 'Zoé Bernard', level]]
      .filter(r => c.format === 'MIXED' || r[0]!.startsWith(c.format === 'DUO' ? 'Duo' : 'Solo'));
    return [c.levels.length ? IMPORT_HEADERS : IMPORT_HEADERS.slice(0, 3), ...rows.map(r => c.levels.length ? r : r.slice(0, 3))];
  }
  // Séparateur « ; » pour Excel en français, BOM pour les accents.
  export function toCsv(rows: string[][]): string {
    return '\uFEFF' + rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(';')).join('\r\n') + '\r\n';
  }
  // Fichiers CSV : UTF-8 (avec ou sans BOM), sinon Windows-1252 comme les anciens Excel.
  export function decodeText(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('windows-1252').decode(bytes); }
  }
  export function nextBib(c: Competition): string {
    const max = c.athletes.reduce((m, a) => Math.max(m, Number(a.bib) || 0), 0);
    return String(max + 1).padStart(3, '0');
  }

  export function validate(value: unknown): Competition {
    const v = value as Partial<Competition> | null;
    if (!v || typeof v !== 'object' || !Array.isArray(v.athletes) || !Array.isArray(v.workouts) || typeof v.scores !== 'object' || v.scores === null)
      throw Error('Ce fichier n’est pas une sauvegarde WOD Soundcrossing.');
    const format: EventFormat = v.format === 'SOLO' || v.format === 'DUO' ? v.format : 'MIXED';
    return {
      id: String(v.id || 'wod-1'), title: String(v.title ?? 'Compétition WOD'), date: String(v.date ?? ''), format,
      method: v.method === 'points' ? 'points' : 'places',
      levels: Array.isArray(v.levels) ? v.levels.map(String) : [],
      athletes: v.athletes, workouts: v.workouts, scores: v.scores,
    };
  }

  // Accepte aussi l’ancienne sauvegarde de la version test (une seule compétition).
  export function validateStore(value: unknown): Store {
    const v = value as Partial<Store> | null;
    if (v && typeof v === 'object' && Array.isArray(v.events)) {
      const events = v.events.map(validate);
      const selectedId = events.some(e => e.id === v.selectedId) ? String(v.selectedId) : events[0]?.id ?? '';
      return { version: 2, events, selectedId };
    }
    const single = validate(value);
    return { version: 2, events: [single], selectedId: single.id };
  }

  export function exportRows(c: Competition): { name: string; rows: (string | number | null)[][] }[] {
    const sheets: { name: string; rows: (string | number | null)[][] }[] = [];
    const general: (string | number | null)[][] = [['Catégorie', 'Rang', 'Dossard', 'Participant', ...c.workouts.map(w => w.name), c.method === 'places' ? 'Total places' : 'Total points']];
    for (const key of usedGroups(c)) for (const row of generalRanking(c, key))
      general.push([key, row.rank, row.athlete.bib, athleteLabel(row.athlete), ...c.workouts.map(w => row.places[w.id] ?? '—'), row.total]);
    sheets.push({ name: 'Général', rows: general });
    c.workouts.forEach((w, i) => {
      const rows: (string | number | null)[][] = [['Catégorie', 'Rang', 'Dossard', 'Participant', 'Score']];
      for (const key of usedGroups(c)) for (const p of workoutRanking(c, w, key))
        rows.push([key, p.rank, p.athlete.bib, athleteLabel(p.athlete), scoreText(w, p.score)]);
      const safe = w.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 25).trim() || 'WOD';
      sheets.push({ name: `${i + 1}. ${safe}`, rows });
    });
    return sheets;
  }

  export function demo(date: string): Competition {
    const id = (p: string, i: number): string => `${p}${i}`;
    const people: [string, string, 'H' | 'F', '' | 'H' | 'F'][] = [
      ['Alex Martin', '', 'H', ''], ['Hugo Robert', '', 'H', ''], ['Tom Garcia', '', 'H', ''], ['Lucas Petit', '', 'H', ''],
      ['Emma Durand', '', 'F', ''], ['Léa Moreau', '', 'F', ''], ['Manon Simon', '', 'F', ''],
      ['Jules Blanc', 'Zoé Bernard', 'H', 'F'], ['Nina Roux', 'Paul Faure', 'F', 'H'], ['Inès Morel', 'Max Girard', 'F', 'H'],
    ];
    const scaled = new Set([3, 6]);
    const athletes: Athlete[] = people.map(([n1, n2, g1, g2], i) => ({ id: id('a', i), bib: String(i + 1).padStart(3, '0'), format: n2 ? 'DUO' : 'SOLO', name1: n1, name2: n2, gender1: g1, gender2: g2, level: scaled.has(i) ? 'Scaled' : 'RX' }));
    const workouts: Workout[] = [
      { id: 'w1', name: 'WOD 1 — Fran', description: '21-15-9 : Thrusters 43/30 kg, Pull-ups. Time cap 8 min.', type: 'time', capMinutes: 8, totalReps: 90, repsPerRound: null },
      { id: 'w2', name: 'WOD 2 — Cindy', description: 'AMRAP 12 min : 5 Pull-ups, 10 Push-ups, 15 Air squats.', type: 'amrap', capMinutes: 12, totalReps: null, repsPerRound: 30 },
      { id: 'w3', name: 'WOD 3 — Clean max', description: '6 min pour trouver la charge max en Clean.', type: 'load', capMinutes: 6, totalReps: null, repsPerRound: null },
    ];
    const s1: Score[] = [{ timeMs: 312000 }, { timeMs: 405000 }, { reps: 78 }, { timeMs: 455000 }, { timeMs: 389000 }, { reps: 81 }, { timeMs: 470000 }, { timeMs: 350000 }, { timeMs: 420000 }, { reps: 70 }];
    const s2 = [212, 198, 225, 180, 190, 205, 176, 240, 231, 199];
    const s3 = [110, 95, 102.5, 100, 70, 65, 72.5, 120, 115, 112.5];
    const scores: Record<string, Record<string, Score>> = { w1: {}, w2: {}, w3: {} };
    athletes.forEach((a, i) => {
      scores.w1![a.id] = s1[i]!; scores.w2![a.id] = { reps: s2[i]! }; scores.w3![a.id] = { kg: s3[i]! };
    });
    return { id: 'exemple', title: 'Exemple — Soundcrossing WOD Challenge', date, format: 'MIXED', method: 'places', levels: ['RX', 'Scaled'], athletes, workouts, scores };
  }
}
