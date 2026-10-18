"use strict";
// Module WOD (version test) : logique pure, sans accès à la page. Indépendant de l’app Hyrox.
var Wod;
(function (Wod) {
    Wod.TYPE_LABELS = {
        time: 'For Time (le plus vite)',
        amrap: 'AMRAP (max de tours / reps)',
        load: 'Charge max (kg)',
        reps: 'Max reps / calories / mètres',
    };
    Wod.CATEGORIES = ['H', 'F', 'HH', 'FF', 'HF'];
    function emptyCompetition(id, title, date, format) {
        return { id, title, date, format, method: 'places', levels: [], athletes: [], workouts: [], scores: {} };
    }
    Wod.emptyCompetition = emptyCompetition;
    function eventFormatLabel(format) { return format === 'MIXED' ? 'Solo + Duo' : format === 'DUO' ? 'Duo' : 'Solo'; }
    Wod.eventFormatLabel = eventFormatLabel;
    function emptyStore() { return { version: 2, events: [], selectedId: '' }; }
    Wod.emptyStore = emptyStore;
    function category(a) {
        if (a.format === 'SOLO')
            return a.gender1;
        return a.gender1 === a.gender2 ? a.gender1 === 'H' ? 'HH' : 'FF' : 'HF';
    }
    Wod.category = category;
    function categoryLabel(c) { return c.length === 1 ? `Solo ${c}` : `Duo ${c}`; }
    Wod.categoryLabel = categoryLabel;
    Wod.LEVEL_PRESETS = { none: [], rx: ['RX', 'Scaled'], pro: ['Pro', 'Open'] };
    // Groupe de classement : niveau + catégorie, par ex. « RX · Solo H ».
    function group(a) { return `${a.level ? `${a.level} · ` : ''}${categoryLabel(category(a))}`; }
    Wod.group = group;
    function athleteLabel(a) { return a.format === 'DUO' ? `${a.name1} & ${a.name2}` : a.name1; }
    Wod.athleteLabel = athleteLabel;
    function clock(ms) {
        const s = Math.round(ms / 1000);
        const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
        const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
        return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    }
    Wod.clock = clock;
    // Accepte « 7:45 », « 07:45 », « 1:02:30 », « 7m45 » ou « 465 » (secondes).
    function parseTime(text) {
        const t = text.trim().replace(/\s+/g, '').replace(/[hm']/gi, ':').replace(/s$|"$/i, '');
        if (!t)
            return null;
        if (!/^\d+(:\d{1,2}){0,2}$/.test(t))
            throw Error(`Temps illisible : « ${text} ». Écrivez par ex. 7:45.`);
        const parts = t.split(':').map(Number);
        if (parts.slice(1).some(n => n > 59))
            throw Error(`Temps illisible : « ${text} ».`);
        const seconds = parts.reduce((total, n) => total * 60 + n, 0);
        return seconds * 1000;
    }
    Wod.parseTime = parseTime;
    function parseNumber(text, what) {
        const t = text.trim().replace(',', '.');
        if (!t)
            return null;
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0)
            throw Error(`${what} illisible : « ${text} ».`);
        return n;
    }
    Wod.parseNumber = parseNumber;
    function hasScore(w, s) {
        if (!s)
            return false;
        if (w.type === 'time')
            return s.timeMs !== undefined || s.reps !== undefined;
        if (w.type === 'load')
            return s.kg !== undefined;
        return s.reps !== undefined;
    }
    Wod.hasScore = hasScore;
    function capped(w, s) { return w.type === 'time' && s.timeMs === undefined && s.reps !== undefined; }
    Wod.capped = capped;
    function scoreText(w, s) {
        if (!hasScore(w, s))
            return '';
        if (w.type === 'time')
            return s.timeMs !== undefined ? clock(s.timeMs) : `CAP + ${s.reps} reps`;
        if (w.type === 'load')
            return `${String(s.kg).replace('.', ',')} kg`;
        const reps = s.reps ?? 0;
        if (w.type === 'amrap' && w.repsPerRound)
            return `${Math.floor(reps / w.repsPerRound)} tours + ${reps % w.repsPerRound} reps`;
        return `${reps} reps`;
    }
    Wod.scoreText = scoreText;
    // Plus la clé est petite, meilleur est le score. Les athlètes stoppés par le time cap
    // passent après tous ceux qui ont terminé, puis se départagent au nombre de reps.
    function sortKey(w, s) {
        if (w.type === 'time')
            return s.timeMs !== undefined ? [0, s.timeMs] : [1, -(s.reps ?? 0)];
        if (w.type === 'load')
            return [0, -(s.kg ?? 0)];
        return [0, -(s.reps ?? 0)];
    }
    function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
    function workoutRanking(c, w, key) {
        const scores = c.scores[w.id] ?? {};
        const rows = c.athletes.filter(a => group(a) === key && hasScore(w, scores[a.id]))
            .map(a => ({ athlete: a, score: scores[a.id], key: sortKey(w, scores[a.id]) }))
            .sort((x, y) => x.key[0] - y.key[0] || x.key[1] - y.key[1] || athleteLabel(x.athlete).localeCompare(athleteLabel(y.athlete)));
        const placed = [];
        rows.forEach((row, i) => {
            const prev = rows[i - 1], prevPlaced = placed[i - 1];
            const rank = prev && prevPlaced && same(prev.key, row.key) ? prevPlaced.rank : i + 1;
            placed.push({ athlete: row.athlete, rank, score: row.score });
        });
        return placed;
    }
    Wod.workoutRanking = workoutRanking;
    function pointsFor(place) { return Math.max(0, 100 - (place - 1) * 3); }
    Wod.pointsFor = pointsFor;
    // Classement général d’une catégorie. Sans score sur un WOD, l’athlète prend la dernière place
    // de la catégorie (méthode places) ou 0 point (méthode points).
    function generalRanking(c, key) {
        const athletes = c.athletes.filter(a => group(a) === key);
        const byWod = c.workouts.map(w => ({ w, places: new Map(workoutRanking(c, w, key).map(p => [p.athlete.id, p.rank])) }));
        const rows = athletes.map(a => {
            const places = {};
            let total = 0;
            for (const { w, places: map } of byWod) {
                const place = map.get(a.id) ?? null;
                places[w.id] = place;
                total += c.method === 'places' ? place ?? athletes.length : place === null ? 0 : pointsFor(place);
            }
            return { athlete: a, rank: 0, total, places };
        });
        const better = (x, y) => c.method === 'places' ? x.total - y.total : y.total - x.total;
        rows.sort((x, y) => better(x, y) || athleteLabel(x.athlete).localeCompare(athleteLabel(y.athlete)));
        rows.forEach((row, i) => { const prev = rows[i - 1]; row.rank = prev && prev.total === row.total ? prev.rank : i + 1; });
        return rows;
    }
    Wod.generalRanking = generalRanking;
    // Groupes présents, dans l’ordre des niveaux puis H, F, HH, FF, HF.
    function usedGroups(c) {
        const levelIndex = (a) => { const i = c.levels.indexOf(a.level ?? ''); return i < 0 ? c.levels.length : i; };
        const sorted = [...c.athletes].sort((x, y) => levelIndex(x) - levelIndex(y) || Wod.CATEGORIES.indexOf(category(x)) - Wod.CATEGORIES.indexOf(category(y)));
        return [...new Set(sorted.map(group))];
    }
    Wod.usedGroups = usedGroups;
    function nextBib(c) {
        const max = c.athletes.reduce((m, a) => Math.max(m, Number(a.bib) || 0), 0);
        return String(max + 1).padStart(3, '0');
    }
    Wod.nextBib = nextBib;
    function validate(value) {
        const v = value;
        if (!v || typeof v !== 'object' || !Array.isArray(v.athletes) || !Array.isArray(v.workouts) || typeof v.scores !== 'object' || v.scores === null)
            throw Error('Ce fichier n’est pas une sauvegarde WOD Soundcrossing.');
        const format = v.format === 'SOLO' || v.format === 'DUO' ? v.format : 'MIXED';
        return {
            id: String(v.id || 'wod-1'), title: String(v.title ?? 'Compétition WOD'), date: String(v.date ?? ''), format,
            method: v.method === 'points' ? 'points' : 'places',
            levels: Array.isArray(v.levels) ? v.levels.map(String) : [],
            athletes: v.athletes, workouts: v.workouts, scores: v.scores,
        };
    }
    Wod.validate = validate;
    // Accepte aussi l’ancienne sauvegarde de la version test (une seule compétition).
    function validateStore(value) {
        const v = value;
        if (v && typeof v === 'object' && Array.isArray(v.events)) {
            const events = v.events.map(validate);
            const selectedId = events.some(e => e.id === v.selectedId) ? String(v.selectedId) : events[0]?.id ?? '';
            return { version: 2, events, selectedId };
        }
        const single = validate(value);
        return { version: 2, events: [single], selectedId: single.id };
    }
    Wod.validateStore = validateStore;
    function exportRows(c) {
        const sheets = [];
        const general = [['Catégorie', 'Rang', 'Dossard', 'Participant', ...c.workouts.map(w => w.name), c.method === 'places' ? 'Total places' : 'Total points']];
        for (const key of usedGroups(c))
            for (const row of generalRanking(c, key))
                general.push([key, row.rank, row.athlete.bib, athleteLabel(row.athlete), ...c.workouts.map(w => row.places[w.id] ?? '—'), row.total]);
        sheets.push({ name: 'Général', rows: general });
        c.workouts.forEach((w, i) => {
            const rows = [['Catégorie', 'Rang', 'Dossard', 'Participant', 'Score']];
            for (const key of usedGroups(c))
                for (const p of workoutRanking(c, w, key))
                    rows.push([key, p.rank, p.athlete.bib, athleteLabel(p.athlete), scoreText(w, p.score)]);
            const safe = w.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 25).trim() || 'WOD';
            sheets.push({ name: `${i + 1}. ${safe}`, rows });
        });
        return sheets;
    }
    Wod.exportRows = exportRows;
    function demo(date) {
        const id = (p, i) => `${p}${i}`;
        const people = [
            ['Alex Martin', '', 'H', ''], ['Hugo Robert', '', 'H', ''], ['Tom Garcia', '', 'H', ''], ['Lucas Petit', '', 'H', ''],
            ['Emma Durand', '', 'F', ''], ['Léa Moreau', '', 'F', ''], ['Manon Simon', '', 'F', ''],
            ['Jules Blanc', 'Zoé Bernard', 'H', 'F'], ['Nina Roux', 'Paul Faure', 'F', 'H'], ['Inès Morel', 'Max Girard', 'F', 'H'],
        ];
        const scaled = new Set([3, 6]);
        const athletes = people.map(([n1, n2, g1, g2], i) => ({ id: id('a', i), bib: String(i + 1).padStart(3, '0'), format: n2 ? 'DUO' : 'SOLO', name1: n1, name2: n2, gender1: g1, gender2: g2, level: scaled.has(i) ? 'Scaled' : 'RX' }));
        const workouts = [
            { id: 'w1', name: 'WOD 1 — Fran', description: '21-15-9 : Thrusters 43/30 kg, Pull-ups. Time cap 8 min.', type: 'time', capMinutes: 8, totalReps: 90, repsPerRound: null },
            { id: 'w2', name: 'WOD 2 — Cindy', description: 'AMRAP 12 min : 5 Pull-ups, 10 Push-ups, 15 Air squats.', type: 'amrap', capMinutes: 12, totalReps: null, repsPerRound: 30 },
            { id: 'w3', name: 'WOD 3 — Clean max', description: '6 min pour trouver la charge max en Clean.', type: 'load', capMinutes: 6, totalReps: null, repsPerRound: null },
        ];
        const s1 = [{ timeMs: 312000 }, { timeMs: 405000 }, { reps: 78 }, { timeMs: 455000 }, { timeMs: 389000 }, { reps: 81 }, { timeMs: 470000 }, { timeMs: 350000 }, { timeMs: 420000 }, { reps: 70 }];
        const s2 = [212, 198, 225, 180, 190, 205, 176, 240, 231, 199];
        const s3 = [110, 95, 102.5, 100, 70, 65, 72.5, 120, 115, 112.5];
        const scores = { w1: {}, w2: {}, w3: {} };
        athletes.forEach((a, i) => {
            scores.w1[a.id] = s1[i];
            scores.w2[a.id] = { reps: s2[i] };
            scores.w3[a.id] = { kg: s3[i] };
        });
        return { id: 'exemple', title: 'Exemple — Soundcrossing WOD Challenge', date, format: 'MIXED', method: 'places', levels: ['RX', 'Scaled'], athletes, workouts, scores };
    }
    Wod.demo = demo;
})(Wod || (Wod = {}));
