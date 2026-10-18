"use strict";
// Module WOD : logique pure, sans accès à la page. Indépendant de l’app Hyrox.
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
    // En WOD, les niveaux sont RX et Scaled (Pro / Open, c’est l’Hyrox).
    Wod.LEVEL_PRESETS = { none: [], rx: ['Scaled', 'RX'] };
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
    // Changement de niveaux : un niveau qui existe encore est gardé ; sinon Pro devient RX et Open devient Scaled.
    function remapLevel(level, to) {
        if (!to.length)
            return undefined;
        if (level && to.includes(level))
            return level;
        const old = { Pro: 'RX', Open: 'Scaled' };
        const mapped = old[level ?? ''];
        return mapped && to.includes(mapped) ? mapped : to[0];
    }
    Wod.remapLevel = remapLevel;
    // Groupes d’un niveau (« RX · Solo H »…), ou tous les groupes si aucun niveau n’est choisi.
    function groupsForLevel(c, level) {
        return usedGroups(c).filter(g => !level || g.startsWith(`${level} · `));
    }
    Wod.groupsForLevel = groupsForLevel;
    // Import de participants depuis un fichier CSV ou Excel. Colonnes : Format, Participant 1, Participant 2, Niveau.
    Wod.IMPORT_HEADERS = ['Format', 'Participant 1', 'Participant 2', 'Niveau'];
    const plain = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const IMPORT_ALIASES = {
        format: ['format', 'categorie', 'type'],
        name1: ['participant 1', 'participant1', 'participant', 'nom', 'nom 1', 'athlete', 'name'],
        name2: ['participant 2', 'participant2', 'nom 2', 'partenaire', 'binome'],
        level: ['niveau', 'level', 'division'],
    };
    // « Solo H », « Duo HF », « HH », « FH »… → format et genres.
    function parseCategory(text) {
        const t = plain(text).replace(/\b(solo|duo)\b/g, '').replace(/[^hf]/g, '');
        if (t === 'h' || t === 'f')
            return { format: 'SOLO', gender1: t.toUpperCase(), gender2: '' };
        if (t === 'hh' || t === 'ff' || t === 'hf' || t === 'fh')
            return { format: 'DUO', gender1: t[0].toUpperCase(), gender2: t[1].toUpperCase() };
        return null;
    }
    Wod.parseCategory = parseCategory;
    function importAthletes(rows, c, makeId) {
        const header = (rows[0] ?? []).map(plain);
        const col = (key) => header.findIndex(h => IMPORT_ALIASES[key].includes(h));
        const cols = { format: col('format'), name1: col('name1'), name2: col('name2'), level: col('level') };
        if (cols.format < 0 || cols.name1 < 0)
            return { athletes: [], errors: ['La première ligne doit contenir au moins les colonnes « Format » et « Participant 1 ». Téléchargez le modèle CSV.'], duplicates: 0 };
        const cell = (row, i) => i < 0 ? '' : String(row[i] ?? '').trim();
        const seen = new Set(c.athletes.map(a => plain(athleteLabel(a))));
        let bib = Number(nextBib(c));
        const athletes = [], errors = [];
        let duplicates = 0;
        rows.slice(1).forEach((row, index) => {
            const line = index + 2;
            if (!row.some(v => String(v ?? '').trim()))
                return;
            const cat = parseCategory(cell(row, cols.format)), name1 = cell(row, cols.name1), name2 = cell(row, cols.name2), rawLevel = cell(row, cols.level);
            if (!cat) {
                errors.push(`Ligne ${line} : format « ${cell(row, cols.format)} » inconnu (Solo H, Solo F, Duo HH, Duo FF ou Duo HF).`);
                return;
            }
            if (c.format !== 'MIXED' && cat.format !== c.format) {
                errors.push(`Ligne ${line} : ${cat.format === 'DUO' ? 'Duo' : 'Solo'} non accepté, l’événement est en ${eventFormatLabel(c.format)}.`);
                return;
            }
            if (!name1) {
                errors.push(`Ligne ${line} : nom du participant 1 manquant.`);
                return;
            }
            if (cat.format === 'DUO' && !name2) {
                errors.push(`Ligne ${line} : nom du participant 2 manquant pour un duo.`);
                return;
            }
            const level = c.levels.find(l => plain(l) === plain(rawLevel));
            if (c.levels.length && !level) {
                errors.push(`Ligne ${line} : niveau ${rawLevel ? `« ${rawLevel} » inconnu` : 'manquant'} (${c.levels.join(' ou ')}).`);
                return;
            }
            const athlete = { id: makeId(), bib: String(bib).padStart(3, '0'), format: cat.format, name1, name2: cat.format === 'DUO' ? name2 : '', gender1: cat.gender1, gender2: cat.gender2, ...(level ? { level } : {}) };
            const key = plain(athleteLabel(athlete));
            if (seen.has(key)) {
                duplicates++;
                return;
            }
            seen.add(key);
            athletes.push(athlete);
            bib++;
        });
        return { athletes, errors, duplicates };
    }
    Wod.importAthletes = importAthletes;
    // Modèle vierge : les colonnes, avec leurs codes pour la légende et les listes déroulantes du fichier Excel.
    function importColumns(c) {
        const formats = ['Solo H', 'Solo F', 'Duo HH', 'Duo FF', 'Duo HF'].filter(f => c.format === 'MIXED' || f.startsWith(c.format === 'DUO' ? 'Duo' : 'Solo'));
        return [
            { header: 'Format', choices: formats, help: 'Solo H ou F, Duo HH, FF ou HF (HF quel que soit l’ordre des noms).', width: 18 },
            { header: 'Participant 1', help: 'Prénom et nom.', width: 26 },
            { header: 'Participant 2', help: 'Prénom et nom du partenaire, pour un duo. Laisser vide pour un solo.', width: 26 },
            ...(c.levels.length ? [{ header: 'Niveau', choices: c.levels, help: 'Scaled (version allégée) ou RX (charges et mouvements officiels).', width: 12 }] : []),
        ];
    }
    Wod.importColumns = importColumns;
    function importTemplate(c) { return [importColumns(c).map(col => col.header)]; }
    Wod.importTemplate = importTemplate;
    // Séparateur « ; » pour Excel en français, BOM pour les accents.
    function toCsv(rows) {
        return '\uFEFF' + rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(';')).join('\r\n') + '\r\n';
    }
    Wod.toCsv = toCsv;
    // Fichiers CSV : UTF-8 (avec ou sans BOM), sinon Windows-1252 comme les anciens Excel.
    function decodeText(buffer) {
        const bytes = new Uint8Array(buffer);
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        }
        catch {
            return new TextDecoder('windows-1252').decode(bytes);
        }
    }
    Wod.decodeText = decodeText;
    function nextBib(c) {
        const max = c.athletes.reduce((m, a) => Math.max(m, Number(a.bib) || 0), 0);
        return String(max + 1).padStart(3, '0');
    }
    Wod.nextBib = nextBib;
    // Vérifie chaque participant, WOD et score : une sauvegarde abîmée est refusée avant de remplacer quoi que ce soit.
    const isText = (x) => typeof x === 'string';
    const positive = (x, what) => {
        if (x === null || x === undefined || x === '')
            return null;
        if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0)
            throw Error(`${what} invalide.`);
        return x;
    };
    function validateAthlete(value, levels, line) {
        const a = value;
        const where = `Participant n° ${line}`;
        if (!a || typeof a !== 'object')
            throw Error(`${where} illisible.`);
        if (!isText(a.id) || !a.id)
            throw Error(`${where} sans identifiant.`);
        if (a.format !== 'SOLO' && a.format !== 'DUO')
            throw Error(`${where} : format inconnu.`);
        if (!isText(a.name1) || !a.name1.trim())
            throw Error(`${where} : nom manquant.`);
        if (a.gender1 !== 'H' && a.gender1 !== 'F')
            throw Error(`${where} : H ou F manquant.`);
        const duo = a.format === 'DUO';
        const name2 = isText(a.name2) ? a.name2 : '';
        if (duo && (!name2.trim() || (a.gender2 !== 'H' && a.gender2 !== 'F')))
            throw Error(`${where} : partenaire du duo incomplet.`);
        const athlete = { id: a.id, bib: isText(a.bib) ? a.bib : '', format: a.format, name1: a.name1, name2: duo ? name2 : '', gender1: a.gender1, gender2: duo ? a.gender2 : '' };
        if (levels.length) {
            const level = remapLevel(isText(a.level) ? a.level : undefined, levels);
            if (level)
                athlete.level = level;
        }
        return athlete;
    }
    function validateWorkout(value, line) {
        const w = value;
        const where = `WOD n° ${line}`;
        if (!w || typeof w !== 'object')
            throw Error(`${where} illisible.`);
        if (!isText(w.id) || !w.id)
            throw Error(`${where} sans identifiant.`);
        if (!w.type || !(w.type in Wod.TYPE_LABELS))
            throw Error(`${where} : type de classement inconnu.`);
        return { id: w.id, name: isText(w.name) && w.name.trim() ? w.name : `WOD ${line}`, description: isText(w.description) ? w.description : '', type: w.type,
            capMinutes: positive(w.capMinutes, `${where} : time cap`), totalReps: positive(w.totalReps, `${where} : reps au total`), repsPerRound: positive(w.repsPerRound, `${where} : reps par tour`) };
    }
    function validateScore(value) {
        const s = value;
        if (!s || typeof s !== 'object')
            throw Error('Score illisible.');
        const score = {};
        for (const key of ['timeMs', 'reps', 'kg']) {
            const x = s[key];
            if (x === undefined)
                continue;
            if (typeof x !== 'number' || !Number.isFinite(x) || x < 0)
                throw Error('Score invalide.');
            score[key] = x;
        }
        return score;
    }
    function validate(value) {
        const v = value;
        if (!v || typeof v !== 'object' || !Array.isArray(v.athletes) || !Array.isArray(v.workouts) || typeof v.scores !== 'object' || v.scores === null || Array.isArray(v.scores))
            throw Error('Ce fichier n’est pas une sauvegarde WOD Soundcrossing.');
        const format = v.format === 'SOLO' || v.format === 'DUO' ? v.format : 'MIXED';
        // Niveaux toujours dans l’ordre Scaled puis RX. Anciens événements en Pro / Open : Pro → RX, Open → Scaled.
        const levels = Array.isArray(v.levels) && v.levels.length ? [...Wod.LEVEL_PRESETS.rx] : [];
        const athletes = v.athletes.map((a, i) => validateAthlete(a, levels, i + 1));
        const workouts = v.workouts.map((w, i) => validateWorkout(w, i + 1));
        const unique = (ids, what) => { if (new Set(ids).size !== ids.length)
            throw Error(`Deux ${what} ont le même identifiant : sauvegarde abîmée.`); };
        unique(athletes.map(a => a.id), 'participants');
        unique(workouts.map(w => w.id), 'WOD');
        // Un score ne garde que les WOD et participants qui existent encore.
        const athleteIds = new Set(athletes.map(a => a.id));
        const scores = {};
        for (const w of workouts) {
            const raw = v.scores[w.id];
            if (raw === undefined)
                continue;
            if (!raw || typeof raw !== 'object' || Array.isArray(raw))
                throw Error(`Scores du ${w.name} illisibles.`);
            const list = {};
            for (const [id, s] of Object.entries(raw))
                if (athleteIds.has(id))
                    list[id] = validateScore(s);
            scores[w.id] = list;
        }
        return {
            id: isText(v.id) && v.id ? v.id : 'wod-1', title: isText(v.title) && v.title.trim() ? v.title : 'Compétition WOD', date: isText(v.date) ? v.date : '', format,
            method: v.method === 'points' ? 'points' : 'places',
            levels, athletes, workouts, scores,
        };
    }
    Wod.validate = validate;
    // Accepte aussi l’ancienne sauvegarde de la version test (une seule compétition).
    function validateStore(value) {
        const v = value;
        const meta = { revision: v && isText(v.revision) ? v.revision : '', savedAt: v && typeof v.savedAt === 'number' && Number.isFinite(v.savedAt) ? v.savedAt : 0 };
        if (v && typeof v === 'object' && Array.isArray(v.events)) {
            const events = v.events.map(validate);
            if (new Set(events.map(e => e.id)).size !== events.length)
                throw Error('Deux événements ont le même identifiant : sauvegarde abîmée.');
            const selectedId = events.some(e => e.id === v.selectedId) ? String(v.selectedId) : events[0]?.id ?? '';
            return { version: 2, events, selectedId, ...meta };
        }
        const single = validate(value);
        return { version: 2, events: [single], selectedId: single.id, ...meta };
    }
    Wod.validateStore = validateStore;
    function exportRows(c) {
        const sheets = [];
        const general = [['Catégorie', 'Rang', 'Participant', ...c.workouts.map(w => w.name), c.method === 'places' ? 'Total places' : 'Total points']];
        for (const key of usedGroups(c))
            for (const row of generalRanking(c, key))
                general.push([key, row.rank, athleteLabel(row.athlete), ...c.workouts.map(w => row.places[w.id] ?? '—'), row.total]);
        sheets.push({ name: 'Général', rows: general });
        c.workouts.forEach((w, i) => {
            const rows = [['Catégorie', 'Rang', 'Participant', 'Score']];
            for (const key of usedGroups(c))
                for (const p of workoutRanking(c, w, key))
                    rows.push([key, p.rank, athleteLabel(p.athlete), scoreText(w, p.score)]);
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
        return { id: 'exemple', title: 'Exemple — Soundcrossing WOD Challenge', date, format: 'MIXED', method: 'places', levels: ['Scaled', 'RX'], athletes, workouts, scores };
    }
    Wod.demo = demo;
})(Wod || (Wod = {}));
