// Module WOD (version test) : logique pure, sans accès à la page. Indépendant de l’app Hyrox.
namespace Wod {
  export type ScoreType = 'time' | 'amrap' | 'load' | 'reps';
  export type Method = 'places' | 'points';
  export type Category = 'H' | 'F' | 'HH' | 'FF' | 'HF';
  export interface Athlete {
    id: string; bib: string; format: 'SOLO' | 'DUO';
    name1: string; name2: string; gender1: 'H' | 'F'; gender2: '' | 'H' | 'F';
  }
  export interface Workout {
    id: string; name: string; description: string; type: ScoreType;
    capMinutes: number | null; totalReps: number | null; repsPerRound: number | null;
  }
  // time : temps en ms si terminé, sinon reps faites avant le time cap. amrap/reps : reps. load : kg.
  export interface Score { timeMs?: number; reps?: number; kg?: number; }
  export interface Competition {
    title: string; date: string; method: Method;
    athletes: Athlete[]; workouts: Workout[];
    scores: Record<string, Record<string, Score>>;
  }
  export interface Placed { athlete: Athlete; rank: number; score: Score; }
  export interface GeneralRow { athlete: Athlete; rank: number; total: number; places: Record<string, number | null>; }

  export const TYPE_LABELS: Record<ScoreType, string> = {
    time: 'For Time (le plus vite)',
    amrap: 'AMRAP (max de tours / reps)',
    load: 'Charge max (kg)',
    reps: 'Max reps / calories / mètres',
  };
  export const CATEGORIES: Category[] = ['H', 'F', 'HH', 'FF', 'HF'];

  export function emptyCompetition(date: string): Competition {
    return { title: 'Ma compétition WOD', date, method: 'places', athletes: [], workouts: [], scores: {} };
  }
  export function category(a: Athlete): Category {
    if (a.format === 'SOLO') return a.gender1;
    return a.gender1 === a.gender2 ? a.gender1 === 'H' ? 'HH' : 'FF' : 'HF';
  }
  export function categoryLabel(c: Category): string { return c.length === 1 ? `Solo ${c}` : `Duo ${c}`; }
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

  export function workoutRanking(c: Competition, w: Workout, cat: Category): Placed[] {
    const scores = c.scores[w.id] ?? {};
    const rows = c.athletes.filter(a => category(a) === cat && hasScore(w, scores[a.id]))
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
  export function generalRanking(c: Competition, cat: Category): GeneralRow[] {
    const athletes = c.athletes.filter(a => category(a) === cat);
    const byWod = c.workouts.map(w => ({ w, places: new Map(workoutRanking(c, w, cat).map(p => [p.athlete.id, p.rank])) }));
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

  export function usedCategories(c: Competition): Category[] {
    const used = new Set(c.athletes.map(category));
    return CATEGORIES.filter(cat => used.has(cat));
  }

  export function nextBib(c: Competition): string {
    const max = c.athletes.reduce((m, a) => Math.max(m, Number(a.bib) || 0), 0);
    return String(max + 1).padStart(3, '0');
  }

  export function validate(value: unknown): Competition {
    const v = value as Partial<Competition> | null;
    if (!v || typeof v !== 'object' || !Array.isArray(v.athletes) || !Array.isArray(v.workouts) || typeof v.scores !== 'object' || v.scores === null)
      throw Error('Ce fichier n’est pas une sauvegarde WOD Soundcrossing.');
    return {
      title: String(v.title ?? 'Compétition WOD'), date: String(v.date ?? ''),
      method: v.method === 'points' ? 'points' : 'places',
      athletes: v.athletes, workouts: v.workouts, scores: v.scores,
    };
  }

  export function exportRows(c: Competition): { name: string; rows: (string | number | null)[][] }[] {
    const sheets: { name: string; rows: (string | number | null)[][] }[] = [];
    const general: (string | number | null)[][] = [['Catégorie', 'Rang', 'Dossard', 'Participant', ...c.workouts.map(w => w.name), c.method === 'places' ? 'Total places' : 'Total points']];
    for (const cat of usedCategories(c)) for (const row of generalRanking(c, cat))
      general.push([categoryLabel(cat), row.rank, row.athlete.bib, athleteLabel(row.athlete), ...c.workouts.map(w => row.places[w.id] ?? '—'), row.total]);
    sheets.push({ name: 'Général', rows: general });
    c.workouts.forEach((w, i) => {
      const rows: (string | number | null)[][] = [['Catégorie', 'Rang', 'Dossard', 'Participant', 'Score']];
      for (const cat of usedCategories(c)) for (const p of workoutRanking(c, w, cat))
        rows.push([categoryLabel(cat), p.rank, p.athlete.bib, athleteLabel(p.athlete), scoreText(w, p.score)]);
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
    const athletes: Athlete[] = people.map(([n1, n2, g1, g2], i) => ({ id: id('a', i), bib: String(i + 1).padStart(3, '0'), format: n2 ? 'DUO' : 'SOLO', name1: n1, name2: n2, gender1: g1, gender2: g2 }));
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
    return { title: 'Exemple — Soundcrossing WOD Challenge', date, method: 'places', athletes, workouts, scores };
  }
}
