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
    // Épreuve de la Finale (réservée aux qualifiés). Absent : épreuve de qualification.
    phase?: 'final';
  }
  export type Phase = 'qualif' | 'final';
  // time : temps en ms si terminé, sinon reps faites avant le time cap. amrap/reps : reps. load : kg.
  // forfeit : forfait déclaré sur ce WOD (aucune performance). Pas de score du tout : à saisir.
  export interface Score { timeMs?: number; reps?: number; kg?: number; forfeit?: true; }
  export type ScoreStatus = 'todo' | 'done' | 'capped' | 'forfeit';
  export const STATUS_LABELS: Record<ScoreStatus, string> = { todo: 'À saisir', done: 'Terminé', capped: 'Arrêté au cap', forfeit: 'Forfait' };
  export type EventFormat = 'SOLO' | 'DUO' | 'MIXED';
  export interface Competition {
    id: string; title: string; date: string; format: EventFormat; method: Method;
    // Niveaux (divisions) : chacun a son propre classement, par ex. RX et Scaled. Vide = un seul niveau.
    levels: string[];
    athletes: Athlete[]; workouts: Workout[];
    scores: Record<string, Record<string, Score>>;
    // Qualifiés pour la Finale (identifiants des participants).
    finalists?: string[];
    // Événement d’entraînement : participants fictifs, pour s’exercer sans toucher aux vrais événements.
    training?: true;
  }
  // Comme dans l’app Hyrox : plusieurs événements, chacun avec son format Solo, Duo ou Solo + Duo.
  // revision et savedAt : comme dans l’app Hyrox, pour repérer une écriture plus récente faite ailleurs.
  // Historique pour « Annuler », comme dans l’Hyrox : l’état complet d’avant chaque modification (15 au maximum).
  export interface Snapshot { label: string; selectedId: string; events: Competition[]; }
  export const MAX_HISTORY = 15;
  export interface Store { version: 2; events: Competition[]; selectedId: string; revision?: string; savedAt?: number; history?: Snapshot[]; }
  export interface Placed { athlete: Athlete; rank: number; score: Score; }
  export interface GeneralRow { athlete: Athlete; rank: number; total: number; places: Record<string, number | null>; }
  export const phaseOf = (w: Workout): Phase => w.phase === 'final' ? 'final' : 'qualif';
  export function phaseWorkouts(c: Competition, phase: Phase): Workout[] { return c.workouts.filter(w => phaseOf(w) === phase); }
  export function hasFinal(c: Competition): boolean { return c.workouts.some(w => w.phase === 'final'); }
  export function isFinalist(c: Competition, a: Athlete): boolean { return (c.finalists ?? []).includes(a.id); }
  // Participants concernés par un WOD : tout le monde en qualif, seulement les qualifiés en finale.
  export function competitors(c: Competition, w: Workout): Athlete[] { return w.phase === 'final' ? c.athletes.filter(a => isFinalist(c, a)) : c.athletes; }

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
  // En WOD, les niveaux sont RX et Scaled (Pro / Open, c’est l’Hyrox).
  export const LEVEL_PRESETS: Record<string, string[]> = { none: [], rx: ['Scaled', 'RX'] };
  // Groupe de classement : niveau + catégorie, par ex. « RX · Solo H ».
  export function group(a: Athlete): string { return `${a.level ? `${a.level} · ` : ''}${categoryLabel(category(a))}`; }
  export function athleteLabel(a: Athlete): string { return a.format === 'DUO' ? `${a.name1} & ${a.name2}` : a.name1; }
  // Recherche par nom, comme dans l’Hyrox : sans accents ni majuscules, sur le nom affiché (les deux noms d’un duo).
  export function matchesSearch(a: Athlete, query: string): boolean {
    const q = String(query ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return !q || athleteLabel(a).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q);
  }

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
  // Tours et répétitions : nombre entier uniquement. Une faute de frappe est refusée, jamais arrondie.
  export function parseInteger(text: string, what: string): number | null {
    const t = text.trim();
    if (!t) return null;
    if (!/^\d+$/.test(t)) throw Error(`${what} : nombre entier attendu, pas « ${text} ».`);
    return Number(t);
  }
  export function parseNumber(text: string, what: string): number | null {
    const t = text.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) throw Error(`${what} illisible : « ${text} ».`);
    return n;
  }

  export function hasScore(w: Workout, s: Score | undefined): s is Score {
    if (!s || s.forfeit) return false;
    if (w.type === 'time') return s.timeMs !== undefined || s.reps !== undefined;
    if (w.type === 'load') return s.kg !== undefined;
    return s.reps !== undefined;
  }
  export function capped(w: Workout, s: Score): boolean { return w.type === 'time' && s.timeMs === undefined && s.reps !== undefined; }

  export function scoreStatus(w: Workout, s: Score | undefined): ScoreStatus {
    if (s?.forfeit) return 'forfeit';
    if (!hasScore(w, s)) return 'todo';
    return capped(w, s) ? 'capped' : 'done';
  }
  // Champs tapés dans la saisie (timeMs déjà lu par la case hh:mm:ss). Renvoie null si tout est vide.
  // Un score ambigu est refusé : rien n'est deviné ni arrondi.
  export interface ScoreInput { timeMs: number | null; reps?: string; rounds?: string; rest?: string; kg?: string; }
  export function buildScore(w: Workout, input: ScoreInput): Score | null {
    if (w.type === 'time') {
      const t = input.timeMs, reps = parseInteger(input.reps ?? '', 'Reps');
      if (t !== null && reps !== null) throw Error('Saisissez soit le temps (terminé), soit les reps faites au cap, pas les deux.');
      if (t !== null) {
        if (t <= 0) throw Error('Temps nul : saisissez le temps réalisé.');
        if (w.capMinutes && t > w.capMinutes * 60000) throw Error(`Ce temps dépasse le time cap de ${w.capMinutes} min : saisissez plutôt les reps faites.`);
        return { timeMs: t };
      }
      if (reps === null) return null;
      if (w.totalReps && reps >= w.totalReps) throw Error(`Avec ${reps} reps le WOD est terminé : saisissez le temps.`);
      return { reps };
    }
    if (w.type === 'load') { const kg = parseNumber(input.kg ?? '', 'Charge'); return kg === null ? null : { kg }; }
    if (w.type === 'amrap' && w.repsPerRound) {
      const rounds = parseInteger(input.rounds ?? '', 'Tours'), rest = parseInteger(input.rest ?? '', 'Reps');
      if (rounds === null && rest === null) return null;
      if (rest !== null && rest >= w.repsPerRound) throw Error(`Reps en plus : moins de ${w.repsPerRound} (sinon c'est un tour de plus).`);
      return { reps: (rounds ?? 0) * w.repsPerRound + (rest ?? 0) };
    }
    const reps = parseInteger(input.reps ?? '', 'Reps'); return reps === null ? null : { reps };
  }

  // Règles métier d’un score, communes à la saisie, à la restauration d’une sauvegarde et aux modifications de WOD.
  // Renvoie le problème en clair, ou null si le score respecte les réglages du WOD.
  export function scoreProblem(w: Workout, s: Score): string | null {
    const has = (k: keyof Score): boolean => s[k] !== undefined;
    if (s.forfeit) return has('timeMs') || has('reps') || has('kg') ? 'forfait et score en même temps' : null;
    if (has('reps') && !Number.isInteger(s.reps)) return 'reps non entières';
    if (w.type === 'time') {
      if (has('kg')) return 'charge en kg sur un WOD For Time';
      if (has('timeMs') && has('reps')) return 'temps et reps en même temps (soit le temps, soit les reps au cap)';
      if (has('timeMs')) {
        if (!(s.timeMs! > 0)) return 'temps nul';
        if (w.capMinutes && s.timeMs! > w.capMinutes * 60000) return `temps ${clock(s.timeMs!)} au-delà du time cap de ${w.capMinutes} min`;
        return null;
      }
      if (!has('reps')) return 'score vide';
      return w.totalReps && s.reps! >= w.totalReps ? `${s.reps} reps au cap alors que le WOD en compte ${w.totalReps} (c’est un temps)` : null;
    }
    if (w.type === 'load') return has('timeMs') || has('reps') ? 'temps ou reps sur un WOD de charge' : has('kg') ? null : 'score vide';
    return has('timeMs') || has('kg') ? 'temps ou charge sur un WOD en reps' : has('reps') ? null : 'score vide';
  }
  // Scores déjà saisis qui ne respecteraient plus les nouveaux réglages d’un WOD (cap réduit, reps au total…).
  export function workoutConflicts(c: Competition, w: Workout): string[] {
    const scores = c.scores[w.id] ?? {};
    return c.athletes.flatMap(a => {
      const s = scores[a.id], problem = s && scoreProblem(w, s);
      return problem ? [`${athleteLabel(a)} : ${problem}`] : [];
    });
  }

  export function scoreText(w: Workout, s: Score | undefined): string {
    if (s?.forfeit) return 'Forfait';
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
    const rows = competitors(c, w).filter(a => group(a) === key && hasScore(w, scores[a.id]))
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

  // Classement général d’une catégorie. Sans score (à saisir ou forfait) sur un WOD, l’athlète prend la dernière place
  // de la catégorie (méthode places) ou 0 point (méthode points). Tant qu’un score est à saisir, le classement est provisoire.
  // phase « qualif » : WOD de qualification (tous les WOD s’il n’y a pas de finale).
  // phase « final » : WOD de finale, qualifiés seulement, points remis à zéro. Égalité : meilleure place sur le
  // dernier WOD de finale, puis meilleur rang en qualif.
  export function generalRanking(c: Competition, key: string, phase: Phase = 'qualif'): GeneralRow[] {
    const workouts = phaseWorkouts(c, phase);
    // Sans aucun WOD dans cette phase, il n’y a rien à classer : pas de classement ni de podium.
    if (!workouts.length) return [];
    const athletes = c.athletes.filter(a => group(a) === key && (phase === 'qualif' || isFinalist(c, a)));
    const byWod = workouts.map(w => ({ w, places: new Map(workoutRanking(c, w, key).map(p => [p.athlete.id, p.rank])) }));
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
    let tie = (_x: GeneralRow, _y: GeneralRow): number => 0;
    if (phase === 'final') {
      const last = workouts[workouts.length - 1];
      const qualif = new Map(generalRanking(c, key, 'qualif').map(r => [r.athlete.id, r.rank]));
      const lastPlace = (r: GeneralRow): number => (last ? r.places[last.id] : null) ?? Infinity;
      tie = (x, y) => (lastPlace(x) - lastPlace(y) || 0) || (qualif.get(x.athlete.id) ?? Infinity) - (qualif.get(y.athlete.id) ?? Infinity) || 0;
    }
    rows.sort((x, y) => better(x, y) || tie(x, y) || athleteLabel(x.athlete).localeCompare(athleteLabel(y.athlete)));
    rows.forEach((row, i) => { const prev = rows[i - 1]; row.rank = prev && prev.total === row.total && !tie(prev, row) ? prev.rank : i + 1; });
    return rows;
  }
  // Qualifie les n premiers du classement des qualifs de ce groupe (les ex æquo à la n-ième place passent aussi).
  export function qualifyTop(c: Competition, key: string, n: number): string[] {
    const inGroup = new Set(c.athletes.filter(a => group(a) === key).map(a => a.id));
    const top = generalRanking(c, key, 'qualif').filter(r => r.rank <= n).map(r => r.athlete.id);
    return [...(c.finalists ?? []).filter(id => !inGroup.has(id)), ...top];
  }

  // Scores encore à saisir (ni score ni forfait), pour tout l’événement ou un groupe.
  export function pendingScores(c: Competition, key?: string, phase?: Phase): number {
    const workouts = phase ? phaseWorkouts(c, phase) : c.workouts;
    return workouts.reduce((n, w) => n + competitors(c, w).filter(a => (!key || group(a) === key) && scoreStatus(w, c.scores[w.id]?.[a.id]) === 'todo').length, 0);
  }
  export function hasAnyScore(c: Competition): boolean { return Object.values(c.scores).some(list => Object.keys(list).length > 0); }
  // Règles affichées avant et pendant la compétition, et dans l’export.
  export function rulesText(c: Competition): string[] {
    return [
      c.method === 'places' ? 'Addition des places sur tous les WOD : le plus petit total gagne.' : 'Table de points : 1er = 100, puis −3 par place (minimum 0). Le plus gros total gagne.',
      'Ex æquo : même score = même place ; même total = même rang.',
      c.method === 'places' ? 'Forfait ou score manquant sur un WOD : dernière place de la catégorie.' : 'Forfait ou score manquant sur un WOD : 0 point.',
      'For Time : arrêté au cap = classé après tous ceux qui ont terminé, au nombre de reps.',
      ...(hasFinal(c) ? ['Finale : seuls les qualifiés y participent, les points repartent de zéro. Égalité : meilleure place sur le dernier WOD de finale, puis classement des qualifs.'] : []),
    ];
  }

  // Groupes présents, dans l’ordre des niveaux puis H, F, HH, FF, HF.
  export function usedGroups(c: Competition): string[] {
    const levelIndex = (a: Athlete): number => { const i = c.levels.indexOf(a.level ?? ''); return i < 0 ? c.levels.length : i; };
    const sorted = [...c.athletes].sort((x, y) => levelIndex(x) - levelIndex(y) || CATEGORIES.indexOf(category(x)) - CATEGORIES.indexOf(category(y)));
    return [...new Set(sorted.map(group))];
  }

  // Changement de niveaux : un niveau qui existe encore est gardé ; sinon Pro devient RX et Open devient Scaled.
  export function remapLevel(level: string | undefined, to: string[]): string | undefined {
    if (!to.length) return undefined;
    if (level && to.includes(level)) return level;
    const old: Record<string, string> = { Pro: 'RX', Open: 'Scaled' };
    const mapped = old[level ?? ''];
    return mapped && to.includes(mapped) ? mapped : to[0];
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
  // Modèle vierge : les colonnes, avec leurs codes pour la légende et les listes déroulantes du fichier Excel.
  export function importColumns(c: Competition): { header: string; choices?: string[]; help: string; width: number }[] {
    const formats = ['Solo H', 'Solo F', 'Duo HH', 'Duo FF', 'Duo HF'].filter(f => c.format === 'MIXED' || f.startsWith(c.format === 'DUO' ? 'Duo' : 'Solo'));
    return [
      { header: 'Format', choices: formats, help: 'Solo H ou F, Duo HH, FF ou HF (HF quel que soit l’ordre des noms).', width: 18 },
      { header: 'Participant 1', help: 'Prénom et nom.', width: 26 },
      { header: 'Participant 2', help: 'Prénom et nom du partenaire, pour un duo. Laisser vide pour un solo.', width: 26 },
      ...(c.levels.length ? [{ header: 'Niveau', choices: c.levels, help: 'Scaled (version allégée) ou RX (charges et mouvements officiels).', width: 12 }] : []),
    ];
  }
  export function importTemplate(c: Competition): string[][] { return [importColumns(c).map(col => col.header)]; }
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

  // Vérifie chaque participant, WOD et score : une sauvegarde abîmée est refusée avant de remplacer quoi que ce soit.
  const isText = (x: unknown): x is string => typeof x === 'string';
  const positive = (x: unknown, what: string): number | null => {
    if (x === null || x === undefined || x === '') return null;
    if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) throw Error(`${what} invalide.`);
    return x;
  };
  function validateAthlete(value: unknown, levels: string[], line: number): Athlete {
    const a = value as Partial<Athlete> | null;
    const where = `Participant n° ${line}`;
    if (!a || typeof a !== 'object') throw Error(`${where} illisible.`);
    if (!isText(a.id) || !a.id) throw Error(`${where} sans identifiant.`);
    if (a.format !== 'SOLO' && a.format !== 'DUO') throw Error(`${where} : format inconnu.`);
    if (!isText(a.name1) || !a.name1.trim()) throw Error(`${where} : nom manquant.`);
    if (a.gender1 !== 'H' && a.gender1 !== 'F') throw Error(`${where} : H ou F manquant.`);
    const duo = a.format === 'DUO';
    const name2 = isText(a.name2) ? a.name2 : '';
    if (duo && (!name2.trim() || (a.gender2 !== 'H' && a.gender2 !== 'F'))) throw Error(`${where} : partenaire du duo incomplet.`);
    const athlete: Athlete = { id: a.id, bib: isText(a.bib) ? a.bib : '', format: a.format, name1: a.name1, name2: duo ? name2 : '', gender1: a.gender1, gender2: duo ? a.gender2 as 'H' | 'F' : '' };
    if (levels.length) {
      const level = remapLevel(isText(a.level) ? a.level : undefined, levels);
      if (level) athlete.level = level;
    }
    return athlete;
  }
  function validateWorkout(value: unknown, line: number): Workout {
    const w = value as Partial<Workout> | null;
    const where = `WOD n° ${line}`;
    if (!w || typeof w !== 'object') throw Error(`${where} illisible.`);
    if (!isText(w.id) || !w.id) throw Error(`${where} sans identifiant.`);
    if (!w.type || !(w.type in TYPE_LABELS)) throw Error(`${where} : type de classement inconnu.`);
    return { id: w.id, name: isText(w.name) && w.name.trim() ? w.name : `WOD ${line}`, description: isText(w.description) ? w.description : '', type: w.type,
      capMinutes: positive(w.capMinutes, `${where} : time cap`), totalReps: positive(w.totalReps, `${where} : reps au total`), repsPerRound: positive(w.repsPerRound, `${where} : reps par tour`),
      ...(w.phase === 'final' ? { phase: 'final' as const } : {}) };
  }
  function validateScore(value: unknown, strict: boolean): Score {
    const s = value as Record<string, unknown> | null;
    if (!s || typeof s !== 'object') throw Error('Score illisible.');
    const score: Score = {};
    for (const key of ['timeMs', 'reps', 'kg'] as const) {
      const x = s[key];
      if (x === undefined) continue;
      if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw Error('Score invalide.');
      if (key === 'reps' && !Number.isInteger(x)) throw Error('Score invalide : reps non entières.');
      score[key] = x;
    }
    if (s.forfeit === true) {
      if (strict && Object.keys(score).length) throw Error('forfait et score en même temps');
      return { forfeit: true };
    }
    return score;
  }

  // strict : sauvegarde fichier à restaurer. Chaque score doit aussi respecter les règles de son WOD (scoreProblem),
  // comme à la saisie. Sans strict (données du navigateur), seule la forme est vérifiée pour ne jamais bloquer l’app.
  export function validate(value: unknown, strict = false): Competition {
    const v = value as Partial<Competition> | null;
    if (!v || typeof v !== 'object' || !Array.isArray(v.athletes) || !Array.isArray(v.workouts) || typeof v.scores !== 'object' || v.scores === null || Array.isArray(v.scores))
      throw Error('Ce fichier n’est pas une sauvegarde WOD Soundcrossing.');
    const format: EventFormat = v.format === 'SOLO' || v.format === 'DUO' ? v.format : 'MIXED';
    // Niveaux toujours dans l’ordre Scaled puis RX. Anciens événements en Pro / Open : Pro → RX, Open → Scaled.
    const levels = Array.isArray(v.levels) && v.levels.length ? [...LEVEL_PRESETS.rx!] : [];
    const athletes = v.athletes.map((a, i) => validateAthlete(a, levels, i + 1));
    const workouts = v.workouts.map((w, i) => validateWorkout(w, i + 1));
    const unique = (ids: string[], what: string): void => { if (new Set(ids).size !== ids.length) throw Error(`Deux ${what} ont le même identifiant : sauvegarde abîmée.`); };
    unique(athletes.map(a => a.id), 'participants'); unique(workouts.map(w => w.id), 'WOD');
    // Un score ne garde que les WOD et participants qui existent encore.
    const athleteIds = new Set(athletes.map(a => a.id));
    const scores: Record<string, Record<string, Score>> = {}, problems: string[] = [];
    for (const w of workouts) {
      const raw = (v.scores as Record<string, unknown>)[w.id];
      if (raw === undefined) continue;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(`Scores du ${w.name} illisibles.`);
      const list: Record<string, Score> = {};
      for (const [id, s] of Object.entries(raw)) {
        if (!athleteIds.has(id)) continue;
        try {
          const score = validateScore(s, strict), problem = strict ? scoreProblem(w, score) : null;
          if (problem) throw Error(problem);
          list[id] = score;
        } catch (error) {
          if (!strict) throw error;
          const a = athletes.find(x => x.id === id)!;
          problems.push(`${w.name}, ${athleteLabel(a)} : ${(error as Error).message}`);
        }
      }
      scores[w.id] = list;
    }
    if (problems.length) throw Error(`Sauvegarde refusée, ${problems.length} score(s) invalide(s) :\n${problems.slice(0, 6).join('\n')}${problems.length > 6 ? `\n… et ${problems.length - 6} autre(s).` : ''}`);
    return {
      id: isText(v.id) && v.id ? v.id : 'wod-1', title: isText(v.title) && v.title.trim() ? v.title : 'Compétition WOD', date: isText(v.date) ? v.date : '', format,
      method: v.method === 'points' ? 'points' : 'places',
      levels, athletes, workouts, scores,
      ...(v.training === true ? { training: true as const } : {}),
      ...(Array.isArray(v.finalists) ? { finalists: [...new Set(v.finalists.filter((id): id is string => isText(id) && athleteIds.has(id)))] } : {}),
    };
  }

  // Accepte aussi l’ancienne sauvegarde de la version test (une seule compétition).
  // Un historique abîmé ne bloque jamais les données : les étapes illisibles sont simplement oubliées.
  function validateHistory(value: unknown): Snapshot[] {
    if (!Array.isArray(value)) return [];
    const kept: Snapshot[] = [];
    for (const item of value.slice(-MAX_HISTORY)) {
      try {
        const h = item as Partial<Snapshot> | null;
        if (!h || !isText(h.label) || !Array.isArray(h.events)) continue;
        const events = h.events.map(e => validate(e));
        if (new Set(events.map(e => e.id)).size !== events.length) continue;
        kept.push({ label: h.label, selectedId: isText(h.selectedId) ? h.selectedId : '', events });
      } catch { /* Étape ignorée. */ }
    }
    return kept;
  }
  export function validateStore(value: unknown, strict = false): Store {
    const v = value as Partial<Store> | null;
    const meta = { revision: v && isText(v.revision) ? v.revision : '', savedAt: v && typeof v.savedAt === 'number' && Number.isFinite(v.savedAt) ? v.savedAt : 0 };
    if (v && typeof v === 'object' && Array.isArray(v.events)) {
      const events = v.events.map(e => validate(e, strict));
      if (new Set(events.map(e => e.id)).size !== events.length) throw Error('Deux événements ont le même identifiant : sauvegarde abîmée.');
      const selectedId = events.some(e => e.id === v.selectedId) ? String(v.selectedId) : events[0]?.id ?? '';
      return { version: 2, events, selectedId, ...meta, history: validateHistory(v.history) };
    }
    const single = validate(value, strict);
    return { version: 2, events: [single], selectedId: single.id, ...meta };
  }

  export function exportRows(c: Competition): { name: string; rows: (string | number | null)[][] }[] {
    const sheets: { name: string; rows: (string | number | null)[][] }[] = [];
    const phases: Phase[] = hasFinal(c) ? ['qualif', 'final'] : ['qualif'];
    for (const phase of phases) {
      const wods = phaseWorkouts(c, phase);
      const general: (string | number | null)[][] = [['Catégorie', 'Rang', 'Participant', ...wods.map(w => w.name), c.method === 'places' ? 'Total places' : 'Total points', ...(phase === 'qualif' && hasFinal(c) ? ['Finale'] : [])]];
      for (const key of usedGroups(c)) for (const row of generalRanking(c, key, phase))
        general.push([key, row.rank, athleteLabel(row.athlete), ...wods.map(w => row.places[w.id] ?? STATUS_LABELS[scoreStatus(w, c.scores[w.id]?.[row.athlete.id])]), row.total, ...(phase === 'qualif' && hasFinal(c) ? [isFinalist(c, row.athlete) ? 'Qualifié' : ''] : [])]);
      sheets.push({ name: phase === 'final' ? 'Finale' : hasFinal(c) ? 'Qualifs' : 'Général', rows: general });
    }
    c.workouts.forEach((w, i) => {
      const rows: (string | number | null)[][] = [['Catégorie', 'Rang', 'Participant', 'Score']];
      for (const key of usedGroups(c)) for (const p of workoutRanking(c, w, key))
        rows.push([key, p.rank, athleteLabel(p.athlete), scoreText(w, p.score)]);
      for (const a of competitors(c, w)) if (c.scores[w.id]?.[a.id]?.forfeit) rows.push([group(a), '—', athleteLabel(a), 'Forfait']);
      const safe = w.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 25).trim() || 'WOD';
      sheets.push({ name: `${i + 1}. ${safe}`, rows });
    });
    const pending = pendingScores(c);
    sheets.push({ name: 'Règles', rows: [['Règles du classement'], ...rulesText(c).map(r => [r]), [], [!c.workouts.length ? 'Aucun WOD : pas encore de classement.' : pending ? `Classement provisoire : ${pending} score(s) à saisir.` : 'Classement définitif : tous les scores sont saisis.']] });
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
    return { id: 'exemple', title: 'Exemple — Soundcrossing WOD Challenge', date, format: 'MIXED', method: 'places', levels: ['Scaled', 'RX'], athletes, workouts, scores, training: true };
  }
  // Mode entraînement : participants fictifs (Solo, Duo ou les deux), les WOD de l’exemple, aucun score, pour s’exercer à la saisie.
  // Niveaux (Scaled + RX, un groupe de 3 sur deux) et méthode de classement au choix, pour simuler différents événements.
  export function training(date: string, existing: Competition[], people: { name1: string; name2: string; gender1: 'H' | 'F'; gender2: '' | 'H' | 'F' }[], format: EventFormat, withLevels: boolean, method: Method): Competition {
    let title = 'Entraînement — Soundcrossing WOD';
    for (let n = 2; existing.some(e => e.date === date && e.title === title); n++) title = `Entraînement ${n} — Soundcrossing WOD`;
    const athletes: Athlete[] = people.map((p, i) => ({ id: `a${i}`, bib: '', format: p.name2 ? 'DUO' : 'SOLO', ...p, ...(withLevels ? { level: Math.floor(i / 3) % 2 ? 'RX' : 'Scaled' } : {}) }));
    return { ...demo(date), id: 'entrainement', title, format, method, levels: withLevels ? ['Scaled', 'RX'] : [], athletes, scores: {}, training: true };
  }
}
