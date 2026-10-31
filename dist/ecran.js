"use strict";
// Écran public : classements en plein écran pour un projecteur ou une télé. Lecture seule.
// ecran.html?source=hyrox ou ?source=wod. Les catégories défilent toutes seules ; les données se relisent
// en continu, donc un score saisi dans la fenêtre principale apparaît ici quelques secondes plus tard.
// Hyrox : entre les classements, une page « Prochains départs » montre les vagues qui ne sont pas encore parties.
// Thème : celui de l’app (Paramètres → Apparence), ou ?theme=black / ?theme=blanc pour forcer.
var Ecran;
(function (Ecran) {
    const HYROX_KEY = 'pace.hyrox.session.v1', WOD_KEY = 'soundcrossing-wod.v1';
    const params = new URLSearchParams(location.search);
    const source = params.get('source') === 'wod' ? 'wod' : 'hyrox';
    const SLIDE_MS = Math.min(60, Math.max(4, Number(params.get('duree')) || 10)) * 1000;
    // Une page « Prochains départs » toutes les NEXT_EVERY catégories, pour que le public la revoie souvent.
    const ROWS = 8, REFRESH_MS = 3000, NEXT_EVERY = 3;
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const longDate = (date) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toLocaleUpperCase('fr-FR')) : '';
    function readRaw(key) {
        try {
            return localStorage.getItem(key) ?? localStorage.getItem(`${key}.recovery`);
        }
        catch {
            return null;
        }
    }
    // Navigateur vide (données effacées) : la copie sur le disque, gardée par server.py, prend le relais.
    async function readDisk(path) {
        try {
            const response = await fetch(path, { cache: 'no-store' });
            return response.ok ? await response.json() : null;
        }
        catch {
            return null;
        }
    }
    // Écart avec le premier, court pour être lu de loin : +5:52, ou +1:02:10 au-delà d’une heure.
    function gap(ms) {
        const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, pad = (n) => String(n).padStart(2, '0');
        return `+${h ? `${h}:${pad(m)}` : m}:${pad(s % 60)}`;
    }
    const nameParts = (format, name1, name2) => format === 'DUO' ? [name1, name2] : [name1];
    const rankLead = (rank, final) => `<b class="rank${final ? ` rank-${rank}` : ' provisional'}">${rank}</b>`;
    function theme() {
        let name = params.get('theme') ?? '';
        if (name !== 'black' && name !== 'blanc')
            try {
                name = localStorage.getItem('soundcrossing-theme') ?? '';
            }
            catch { /* Sombre par défaut. */ }
        if (name !== 'blanc')
            document.documentElement.dataset.theme = 'black';
        else
            delete document.documentElement.dataset.theme;
        document.querySelector('link[rel="icon"]')?.setAttribute('href', name !== 'blanc' ? 'assets/favicon-black.png' : 'assets/favicon.png');
    }
    // Vagues pas encore parties (heure de départ dans le futur), des plus proches aux suivantes.
    // On montre des vagues entières, sur deux pages au plus ; celles déjà parties disparaissent toutes seules.
    function nextDepartures(session, entries, now) {
        const waves = new Map();
        for (const e of entries) {
            if (Pace.isResolved(e))
                continue;
            const race = session.races.find(r => r.id === e.raceId);
            let at = null;
            try {
                at = race ? Pace.departureAt(race, e) : null;
            }
            catch { /* Heure impossible : ignorée ici. */ }
            if (at === null || at <= now)
                continue;
            const minute = Math.floor(at / 60000) * 60000;
            waves.set(minute, [...(waves.get(minute) ?? []), e]);
        }
        const times = [...waves.keys()].sort((a, b) => a - b);
        if (!times.length)
            return null;
        const rows = [];
        for (const time of times) {
            const wave = waves.get(time).sort((a, b) => Pace.label(a).localeCompare(Pace.label(b), 'fr'));
            if (rows.length && rows.length + wave.length > ROWS * 2)
                break;
            const first = time === times[0];
            rows.push(...wave.map(e => ({ lead: `<b class="wave${first ? ' next' : ''}">${Pace.timeOfDay(time).slice(0, 5)}</b>`, top: 0,
                names: nameParts(e.format, e.name1, e.name2), cells: [esc(Pace.groupLabel(e.level, Pace.formatLabel(e)))] })));
        }
        const first = times[0], wait = Math.ceil((first - now) / 60000);
        return { key: 'next', next: true, kicker: 'PROCHAINS DÉPARTS', columns: ['DÉPART', 'PARTICIPANT', 'CATÉGORIE'], rows, empty: '',
            title: `Prochaine vague à ${Pace.timeOfDay(first).slice(0, 5).replace(':', ' h ')} · ${wait <= 1 ? 'dans 1 min' : `dans ${wait} min`}` };
    }
    function hyroxBoard(store, now) {
        const session = store.session;
        let selected = '';
        try {
            selected = localStorage.getItem(`${HYROX_KEY}.event`) ?? '';
        }
        catch { /* Premier événement par défaut. */ }
        const race = session.races.find(r => r.id === selected) ?? session.races[0];
        if (!race)
            return null;
        const ids = new Set(session.races.filter(r => r.date === race.date).map(r => r.id));
        const entries = session.entries.filter(e => ids.has(e.raceId) && (race.format === 'MIXED' || e.format === race.format));
        const final = Pace.eventResultsFinal(session, race);
        const slides = Pace.eventRankingGroups(race, entries).flatMap(({ level, format }) => {
            const inGroup = entries.filter(e => Pace.formatKey(e) === format && (e.level ?? '') === level);
            if (!inGroup.length)
                return [];
            const ranking = Pace.rankingFor(session, format, race.date, level), best = ranking[0] ? Pace.finalMs(ranking[0].entry) ?? 0 : 0;
            const sample = inGroup[0];
            return [{
                    key: `${level}:${format}`, kicker: final ? 'CLASSEMENT FINAL' : 'CLASSEMENT PROVISOIRE',
                    title: Pace.groupLabel(level, Pace.formatLabel(sample)), columns: ['RANG', sample.format === 'DUO' ? 'DUO' : 'PARTICIPANT', 'TEMPS', 'ÉCART'],
                    rows: ranking.map(({ entry, rank }) => ({ lead: rankLead(rank, final), top: rank, names: nameParts(entry.format, entry.name1, entry.name2),
                        cells: [Pace.clock(Pace.finalMs(entry) ?? 0), Pace.finalMs(entry) === best ? '—' : gap((Pace.finalMs(entry) ?? 0) - best)] })),
                    empty: `${inGroup.length} inscrit(s) · premières arrivées à venir`,
                }];
        });
        // Les prochains départs reviennent régulièrement entre les catégories : au début, puis toutes les NEXT_EVERY catégories.
        const next = nextDepartures(session, entries, now), ranked = slides.filter(s => s.rows.length);
        const shown = ranked.length ? ranked : next ? [] : slides;
        const all = next ? shown.flatMap((s, i) => i % NEXT_EVERY === 0 ? [{ ...next, key: `next:${i}` }, s] : [s]) : shown;
        return { title: race.title, date: race.date, slides: all.length ? all : next ? [next] : [] };
    }
    function wodBoard(store) {
        let selected = '';
        try {
            selected = localStorage.getItem(`${WOD_KEY}.event`) ?? '';
        }
        catch { /* Événement enregistré par défaut. */ }
        const c = store.events.find(e => e.id === selected) ?? store.events.find(e => e.id === store.selectedId) ?? store.events[0];
        if (!c)
            return null;
        const final = Wod.hasFinal(c);
        const phases = final && Wod.phaseWorkouts(c, 'final').some(w => Object.keys(c.scores[w.id] ?? {}).length) ? ['final', 'qualif'] : ['qualif'];
        const slides = phases.flatMap(phase => Wod.usedGroups(c).flatMap((cat) => {
            const wods = Wod.phaseWorkouts(c, phase), rows = Wod.generalRanking(c, cat, phase);
            if (!rows.length)
                return [];
            const done = Wod.pendingScores(c, cat, phase) === 0;
            const scored = rows.some(r => Object.values(r.places).some(p => p !== null));
            const label = phase === 'final' ? 'FINALE' : final ? 'QUALIFICATIONS' : 'CLASSEMENT GÉNÉRAL';
            return [{
                    key: `${phase}:${cat}`, kicker: `${label} · ${done ? 'FINAL' : 'PROVISOIRE'}`, title: cat,
                    columns: ['RANG', 'PARTICIPANT', ...wods.map(w => w.name.toUpperCase()), c.method === 'places' ? 'TOTAL' : 'POINTS'],
                    rows: scored ? rows.map(r => ({ lead: rankLead(r.rank, done), top: r.rank, names: nameParts(r.athlete.format, r.athlete.name1, r.athlete.name2),
                        cells: [...wods.map(w => { const p = r.places[w.id]; return p === null || p === undefined ? '–' : `${p}<sup>${p === 1 ? 'er' : 'e'}</sup>`; }), String(r.total)] })) : [],
                    empty: `${rows.length} inscrit(s) · premiers scores à venir`,
                }];
        }));
        // Catégories sans score : on ne les montre que si aucune n’a encore de score (le public n’attend pas devant une page vide).
        const scoredSlides = slides.filter(s => s.rows.length);
        return { title: c.title, date: c.date, slides: scoredSlides.length ? scoredSlides : slides };
    }
    let board = null, lastRaw = null;
    async function refresh() {
        theme();
        const key = source === 'wod' ? WOD_KEY : HYROX_KEY;
        let raw = readRaw(key);
        if (raw === null) {
            const disk = await readDisk(source === 'wod' ? '/data/wod' : '/data');
            raw = disk ? JSON.stringify(disk) : null;
        }
        let selected = '';
        try {
            selected = localStorage.getItem(`${key}.event`) ?? '';
        }
        catch { /* Sans importance. */ }
        // La minute en cours fait partie de la signature : les vagues parties disparaissent sans attendre une saisie.
        const now = Date.now(), signature = `${selected}|${Math.floor(now / 60000)}|${raw}`;
        if (signature === lastRaw)
            return;
        lastRaw = signature;
        try {
            board = raw === null ? null : source === 'wod' ? wodBoard(Wod.validateStore(JSON.parse(raw))) : hyroxBoard(Pace.validateStore(JSON.parse(raw)), now);
        }
        catch {
            return;
        } // Écriture en cours ou données illisibles : on garde l’affichage précédent.
        render(false);
    }
    // Défilement : chaque catégorie, page par page (ROWS lignes), puis la suivante. On reste sur la même
    // catégorie quand les données changent, pour qu’un nouveau score ne fasse pas sauter l’écran.
    let slideKey = '', page = 0, paused = false, timer, startedAt = 0;
    function pages(slide) { return Math.max(1, Math.ceil(slide.rows.length / ROWS)); }
    function step(delta) {
        const slides = board?.slides ?? [];
        if (!slides.length)
            return;
        let index = Math.max(0, slides.findIndex(s => s.key === slideKey));
        page += delta;
        if (page >= pages(slides[index])) {
            index = (index + 1) % slides.length;
            page = 0;
        }
        else if (page < 0) {
            index = (index - 1 + slides.length) % slides.length;
            page = pages(slides[index]) - 1;
        }
        slideKey = slides[index].key;
        render(true);
    }
    function schedule() {
        window.clearTimeout(timer);
        startedAt = Date.now();
        const bar = $('progress');
        bar.style.transition = 'none';
        bar.style.width = '0';
        if (paused || !(board?.slides.length))
            return;
        void bar.offsetWidth;
        bar.style.transition = `width ${SLIDE_MS}ms linear`;
        bar.style.width = '100%';
        timer = window.setTimeout(() => step(1), SLIDE_MS);
    }
    function render(moved) {
        $('event').textContent = board?.title ?? '';
        $('date').textContent = longDate(board?.date ?? '');
        const slides = board?.slides ?? [];
        let index = slides.findIndex(s => s.key === slideKey);
        if (index < 0) {
            index = 0;
            page = 0;
            moved = true;
        }
        const slide = slides[index];
        $('screen').classList.toggle('is-waiting', !slide);
        $('screen').classList.toggle('is-next', !!slide?.next);
        if (!slide) {
            slideKey = '';
            $('kicker').textContent = source === 'wod' ? 'COMPÉTITION WOD' : 'HYROX';
            $('category').textContent = board ? 'Classements à venir' : 'Aucun événement';
            $('board').innerHTML = `<p class="board-empty">${board ? 'Les classements s’afficheront ici dès les premiers résultats.' : `Créez un événement dans l’app ${source === 'wod' ? 'WOD' : 'Hyrox'}.`}</p>`;
            $('position').textContent = '';
            schedule();
            return;
        }
        slideKey = slide.key;
        page = Math.min(page, pages(slide) - 1);
        $('kicker').textContent = slide.kicker;
        $('category').textContent = slide.title;
        const visible = slide.rows.slice(page * ROWS, page * ROWS + ROWS);
        const head = `<div class="board-row board-head">${slide.columns.map(c => `<span>${esc(c)}</span>`).join('')}</div>`;
        const body = visible.map(r => `<div class="board-row${r.top && r.top <= 3 ? ` top top-${r.top}` : ''}"><span>${r.lead}</span><span class="names">${r.names.map(esc).join('<i>&amp;</i>')}</span>${r.cells.map(c => `<span class="value">${c}</span>`).join('')}</div>`).join('');
        const grid = `grid-template-columns:${slide.next ? 'clamp(110px,12vw,220px)' : 'clamp(70px,8vw,140px)'} minmax(0,1fr) repeat(${slide.columns.length - 2},minmax(90px,${slide.columns.length > 5 ? '11vw' : slide.next ? '24vw' : '17vw'}))`;
        $('board').innerHTML = visible.length ? `<div class="board-table" style="${grid}">${head}${body}</div>` : `<p class="board-empty">${esc(slide.empty)}</p>`;
        const categories = slides.filter(s => !s.next), place = categories.indexOf(slide) + 1;
        $('position').textContent = `${slide.next ? 'Prochains départs' : `Catégorie ${place}/${categories.length}`}${pages(slide) > 1 ? ` · page ${page + 1}/${pages(slide)}` : ''}`;
        if (moved) {
            $('board').classList.remove('enter');
            void $('board').offsetWidth;
            $('board').classList.add('enter');
            schedule();
        }
        else if (!timer || Date.now() - startedAt >= SLIDE_MS)
            schedule();
    }
    function fullscreen() {
        if (document.fullscreenElement)
            void document.exitFullscreen().catch(() => undefined);
        else
            void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    function tick() { $('clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
    let idle;
    function wake() { document.body.classList.remove('idle'); window.clearTimeout(idle); idle = window.setTimeout(() => document.body.classList.add('idle'), 3000); }
    document.addEventListener('DOMContentLoaded', () => {
        theme();
        $('brand').textContent = source === 'wod' ? 'SOUND CROSSING / WOD' : 'SOUND CROSSING / HYROX';
        document.title = `Soundcrossing — Écran classement ${source === 'wod' ? 'WOD' : 'Hyrox'}`;
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight')
                step(1);
            else if (e.key === 'ArrowLeft')
                step(-1);
            else if (e.key === ' ') {
                e.preventDefault();
                paused = !paused;
                $('paused').hidden = !paused;
                schedule();
            }
            else if (e.key.toLowerCase() === 'f')
                fullscreen();
        });
        $('screen').addEventListener('click', fullscreen);
        document.addEventListener('mousemove', wake);
        window.addEventListener('storage', () => void refresh());
        window.setInterval(() => void refresh(), REFRESH_MS);
        window.setInterval(tick, 10000);
        tick();
        wake();
        void refresh();
    });
})(Ecran || (Ecran = {}));
