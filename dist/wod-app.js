"use strict";
// Module WOD : interface de wod.html. Stockage séparé de l’app Hyrox.
var Wod;
(function (Wod) {
    const KEY = 'soundcrossing-wod.v1', BACKUP = `${KEY}.recovery`, EVENT_KEY = `${KEY}.event`;
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now() + Math.random());
    let store = Wod.emptyStore();
    // Événement affiché : toutes les vues travaillent dessus, comme l’événement choisi dans l’app Hyrox.
    let state = Wod.emptyCompetition('', '', today(), 'MIXED');
    function selectEvent(id) {
        const found = store.events.find(e => e.id === id) ?? store.events[0];
        store.selectedId = found?.id ?? '';
        state = found ?? Wod.emptyCompetition('', '', today(), 'MIXED');
    }
    const LEVEL_HELP = { RX: 'Charges et mouvements officiels', Scaled: 'Version allégée' };
    const dateLabel = (date) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR') : 'sans date';
    let view = 'athletes';
    let selectedWod = '';
    let rankingTab = 'general';
    let rankingCat = '';
    let scoreGroup = 'all';
    let scoreLevel = '';
    let onlyTodo = false;
    let rankingLevel = '';
    let entryLevel = '';
    let onlyFinalists = false;
    // Mêmes protections que l’app Hyrox : on n’écrase jamais une version plus récente d’une autre fenêtre,
    // l’écran n’affiche une modification qu’une fois enregistrée, et la version précédente reste en secours.
    let loadedRaw = null, storageBlocked = false;
    let committed = JSON.stringify(store); // dernier état réellement enregistré, pour annuler une modification refusée
    function adopt(raw) {
        store = Wod.validateStore(JSON.parse(raw));
        committed = JSON.stringify(store);
        let remembered = '';
        try {
            remembered = localStorage.getItem(EVENT_KEY) ?? '';
        }
        catch { /* Vue facultative. */ }
        selectEvent(state.id && store.events.some(e => e.id === state.id) ? state.id : remembered || store.selectedId);
    }
    function load() {
        let raw = null;
        try {
            raw = localStorage.getItem(KEY);
            if (raw)
                adopt(raw);
            else {
                const recovery = localStorage.getItem(BACKUP);
                if (recovery) {
                    adopt(recovery);
                    raw = JSON.stringify(store);
                    localStorage.setItem(KEY, raw);
                }
            }
            loadedRaw = raw;
        }
        catch {
            try {
                const recovery = localStorage.getItem(BACKUP);
                if (!recovery)
                    throw Error();
                adopt(recovery);
                if (raw)
                    localStorage.setItem(`${KEY}.damaged`, raw);
                loadedRaw = JSON.stringify(store);
                localStorage.setItem(KEY, loadedRaw);
                toast('Copie précédente des données WOD récupérée. Vérifiez les derniers scores.');
            }
            catch {
                storageBlocked = true;
                toast('Les données WOD enregistrées sont illisibles. Restaurez une sauvegarde (Paramètres).');
            }
        }
        selectEvent(state.id || store.selectedId);
    }
    // Enregistre store ; en cas d’échec, l’écran revient au dernier état enregistré. recovery : restauration volontaire.
    // label : nom de la modification, gardée dans l’historique pour « Annuler » (état d’avant = dernier état enregistré).
    // undoing : l’historique de store est déjà celui voulu (dernière étape retirée).
    function save(recovery = false, label = '', undoing = false) {
        try {
            if (storageBlocked && !recovery)
                throw Error('Stockage illisible : restaurez une sauvegarde avant de modifier.');
            const latest = localStorage.getItem(KEY);
            if (!recovery && latest !== loadedRaw) {
                if (latest) {
                    loadedRaw = latest;
                    adopt(latest);
                }
                throw Error('Les données WOD ont changé dans une autre fenêtre. Vérifiez puis recommencez.');
            }
            const before = JSON.parse(committed);
            let history = recovery || undoing ? store.history ?? [] : [...before.history ?? []];
            if (label && !recovery && !undoing)
                history = [...history, { label, selectedId: before.selectedId, events: before.events }].slice(-Wod.MAX_HISTORY);
            const candidate = Wod.validateStore({ ...store, selectedId: state.id, revision: uid(), savedAt: Date.now(), history });
            if (latest) {
                // Copie de secours sans historique, pour ne pas doubler la place prise dans le navigateur.
                let backup = null;
                try {
                    backup = JSON.stringify({ ...Wod.validateStore(JSON.parse(latest)), history: [] });
                }
                catch { /* Illisible : gardée à part. */ }
                localStorage.setItem(backup === null ? `${KEY}.damaged` : BACKUP, backup ?? latest);
            }
            let encoded = JSON.stringify(candidate);
            // Navigateur plein : on oublie les plus anciennes étapes d’annulation plutôt que de refuser l’enregistrement.
            for (;;) {
                try {
                    localStorage.setItem(KEY, encoded);
                    break;
                }
                catch (error) {
                    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError' || !candidate.history?.length)
                        throw error;
                    candidate.history.shift();
                    encoded = JSON.stringify(candidate);
                }
            }
            loadedRaw = encoded;
            storageBlocked = false;
            adopt(encoded);
            savedStatus();
            syncUndo();
            saveToDisk(encoded);
            return true;
        }
        catch (error) {
            try {
                adopt(committed);
            }
            catch { /* L’état précédent était déjà validé. */ }
            savedStatus(true);
            render();
            toast(`${error instanceof Error && error.message ? error.message : 'Impossible d’enregistrer dans ce navigateur.'} Aucune modification appliquée.`);
            return false;
        }
    }
    // Copie sur le disque via server.py, comme pour l’Hyrox : elle survit à un navigateur qui efface ses données.
    let diskPending = null, diskBusy = false, diskWarned = false;
    // Révision de la copie disque sur laquelle on s’appuie : le serveur refuse l’écriture si elle a changé entre-temps.
    let diskRevision = null;
    const revisionOf = (raw) => { const r = raw?.revision; return typeof r === 'string' ? r : ''; };
    function saveToDisk(raw) {
        if (typeof fetch !== 'function' || location.protocol === 'file:')
            return;
        diskPending = raw;
        Temoin.etat('attente');
        if (diskBusy)
            return;
        diskBusy = true;
        void (async () => {
            while (diskPending !== null) {
                const body = diskPending;
                diskPending = null;
                try {
                    const response = await fetch('/data/wod', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Base-Revision': diskRevision ?? '' }, body });
                    if (response.status === 409) {
                        Temoin.etat('conflit');
                        toast('La copie WOD sur le disque a été modifiée par un autre navigateur : rien n’a été écrasé. Rechargez la page.');
                        continue;
                    }
                    if (!response.ok)
                        throw Error();
                    diskRevision = revisionOf(JSON.parse(body));
                    diskWarned = false;
                    if (diskPending === null)
                        Temoin.etat('ok', JSON.parse(body).savedAt);
                }
                catch {
                    Temoin.etat('erreur');
                    if (!diskWarned) {
                        diskWarned = true;
                        toast('Copie sur le disque impossible. Gardez la fenêtre Soundcrossing ouverte et faites une sauvegarde fichier.');
                    }
                }
            }
            diskBusy = false;
        })();
    }
    async function syncDisk() {
        if (typeof fetch !== 'function' || location.protocol === 'file:')
            return;
        let disk = null, reached = false;
        try {
            const response = await fetch('/data/wod', { cache: 'no-store' });
            reached = true;
            if (response.status === 404)
                diskRevision = '';
            if (response.ok) {
                const raw = await response.json();
                diskRevision = revisionOf(raw);
                disk = Wod.validateStore(raw);
            }
        }
        catch { /* Pas de copie lisible : celle du navigateur reste la référence. */ }
        if (disk && (loadedRaw === null || storageBlocked || (disk.savedAt ?? 0) > (store.savedAt ?? 0))) {
            const encoded = JSON.stringify(disk);
            try {
                const damaged = storageBlocked ? localStorage.getItem(KEY) : null;
                if (damaged)
                    localStorage.setItem(`${KEY}.damaged`, damaged);
                else if (loadedRaw)
                    localStorage.setItem(BACKUP, loadedRaw);
                localStorage.setItem(KEY, encoded);
                loadedRaw = encoded;
                storageBlocked = false;
            }
            catch { /* Données utilisables à l’écran. */ }
            adopt(encoded);
            render();
            savedStatus(storageBlocked);
            toast('Données WOD rechargées depuis la copie sur le disque.');
        }
        else if (loadedRaw !== null && !storageBlocked && (!disk || (disk.savedAt ?? 0) < (store.savedAt ?? 0))) {
            saveToDisk(loadedRaw);
            return;
        }
        if (reached && !diskBusy)
            Temoin.etat('ok', disk?.savedAt);
        else if (!reached)
            Temoin.etat('erreur');
    }
    // Comme dans l’Hyrox : chaque formulaire retient la version de ce qu’il modifie à l’ouverture.
    // Si une autre fenêtre l’a changé entre-temps, l’enregistrement est refusé au lieu d’écraser la correction récente.
    const drafts = new WeakMap();
    function draftVersion(kind, id) {
        if (kind === 'event' && !id)
            return 'nouvel événement';
        const item = kind === 'athlete' ? state.athletes.find(a => a.id === id) : kind === 'workout' ? state.workouts.find(w => w.id === id)
            : { title: state.title, date: state.date, method: state.method, athletes: state.athletes.length, scored: Wod.hasAnyScore(state) };
        return JSON.stringify({ event: state.id, levels: state.levels, format: state.format, item: item ?? null });
    }
    function openDraft(form, kind, id) { drafts.set(form, draftVersion(kind, id)); }
    function draftChanged(form, kind, id) { return drafts.get(form) !== draftVersion(kind, id); }
    const STALE_FORM = 'Les données de ce formulaire ont changé dans une autre fenêtre. Fermez-le puis rouvrez-le pour utiliser la version à jour.';
    function savedStatus(error = false) { Temoin.navigateur(!error); }
    // « Annuler » comme dans l’Hyrox : revient à l’état d’avant la dernière modification (inscription, WOD, score, forfait…).
    function syncUndo() {
        const last = store.history?.at(-1);
        for (const id of ['undo-button', 'no-event-undo']) {
            const b = $(id);
            b.disabled = !last;
            b.title = last ? `Annuler : ${last.label}` : 'Aucune modification à annuler';
        }
        $('no-event-undo').hidden = !last;
    }
    function undo() {
        const last = store.history?.at(-1);
        if (!last)
            return;
        const where = last.events.find(e => e.id === last.selectedId)?.title;
        if (!confirm(`Annuler la dernière modification ?\n\nRevenir avant : ${last.label}${where ? ` (${where})` : ''}. Les inscriptions, WOD et scores précédents seront rétablis.`))
            return;
        store.history = store.history.slice(0, -1);
        store.events = last.events;
        selectEvent(last.selectedId);
        rememberEvent();
        if (save(false, '', true)) {
            render();
            toast('Dernière modification annulée.');
        }
    }
    let toastTimer = 0;
    function toast(text) {
        const el = $('toast');
        el.textContent = text;
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => { el.hidden = true; }, 3500);
    }
    function download(name, content, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    const TRAINING_PILL = '<em class="event-pick-training">Entraînement</em>';
    function render() {
        const hasEvent = store.events.length > 0;
        syncUndo();
        $('training-banner').hidden = !hasEvent || !state.training;
        {
            const count = store.events.filter(e => e.training).length;
            $('training-delete-all').hidden = !count;
            $('training-delete-all').textContent = count > 1 ? `Supprimer les ${count} entraînements` : 'Supprimer l’entraînement';
        }
        $('no-event').hidden = hasEvent;
        $('event-content').hidden = !hasEvent;
        $('edit-competition').hidden = !hasEvent;
        $('event-format-badge').hidden = !hasEvent;
        $('new-event-button').textContent = hasEvent ? '+ Nouvel événement' : '+ Créer un événement';
        $('event-selector-panel').hidden = store.events.length < 2;
        {
            const current = store.events.find(e => e.id === store.selectedId) || store.events[0];
            $('event-selector').innerHTML = current ? `<button type="button" class="event-dd-toggle" aria-haspopup="listbox" aria-expanded="false"><span class="event-dd-current">${((e) => `<strong>${esc(e.title)}</strong><span>${esc(dateLabel(e.date))}<em class="event-pick-format">${Wod.eventFormatLabel(e.format)}</em>${e.training ? TRAINING_PILL : ''}</span>`)(current)}</span><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="event-dd-list" role="listbox" hidden>${store.events.map(e => `<button type="button" role="option" class="event-dd-option${e.id === current.id ? ' active' : ''}" data-event-id="${esc(e.id)}" aria-selected="${e.id === current.id}"><strong>${esc(e.title)}</strong><span>${esc(dateLabel(e.date))}<em class="event-pick-format">${Wod.eventFormatLabel(e.format)}</em>${e.training ? TRAINING_PILL : ''}</span></button>`).join('')}</div>` : '';
        }
        if (!hasEvent) {
            $('title').textContent = 'Compétition WOD';
            $('session-date').textContent = 'Créez un événement pour commencer.';
            return;
        }
        $('title').textContent = state.title;
        $('event-format-badge').textContent = `${Wod.eventFormatLabel(state.format)} · WOD`;
        $('session-date').textContent = state.date ? new Date(`${state.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Choisissez une date pour la compétition.';
        $('count-athletes').textContent = String(state.athletes.length);
        $('count-workouts').textContent = String(state.workouts.length);
        document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
        $('chips').innerHTML = '';
        $('chips2').innerHTML = '';
        $('chips3').innerHTML = '';
        $('view-actions').innerHTML = '';
        document.querySelector('.wod-table').classList.toggle('wod-ranking', view === 'ranking');
        document.querySelector('.wod-table').dataset.view = view;
        $('podium-footer').hidden = true;
        $('search-label').hidden = view === 'workouts';
        ({ athletes: renderAthletes, workouts: renderWorkouts, scores: renderScores, ranking: renderRanking })[view]();
    }
    // Recherche par nom, comme dans l’Hyrox : filtre Participants, Scores et Classements (les rangs ne changent pas).
    const searchText = () => $('search').value;
    const found = (a) => Wod.matchesSearch(a, searchText());
    const NO_MATCH = 'Aucun participant ne correspond à la recherche.';
    function setTable(head, rows, emptyText) {
        if (!rows.length && searchText().trim() && view !== 'workouts')
            emptyText = NO_MATCH;
        $('table-head').innerHTML = `<tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>`;
        $('table-body').innerHTML = rows.join('');
        $('empty').hidden = rows.length > 0;
        $('empty-text').textContent = emptyText;
        document.querySelector('.wod-table').hidden = rows.length === 0;
    }
    function heading(title, description, actions = '') {
        $('view-title').textContent = title;
        $('view-description').textContent = description;
        $('view-actions').innerHTML = actions;
    }
    function chips(target, items, active, attr) {
        $(target).innerHTML = items.map(i => `<button class="format-chip${i.css ? ` ${i.css}` : ''}${i.key === active ? ' active' : ''}" data-${attr}="${esc(i.key)}">${esc(i.label)}</button>`).join('');
    }
    function badge(a) { const c = Wod.category(a); return `<span class="format-badge fmt-${c}">${esc(Wod.categoryLabel(c))}</span>`; }
    async function importFile(file) {
        try {
            if (file.size > 10 * 1024 * 1024)
                throw Error('Fichier trop volumineux (maximum 10 Mo).');
            const buffer = await file.arrayBuffer();
            const book = /\.(csv|tsv|txt)$/i.test(file.name) ? XLSX.read(Wod.decodeText(buffer), { type: 'string', raw: true }) : XLSX.read(buffer, { type: 'array' });
            const sheet = book.Sheets[book.SheetNames[0] ?? ''];
            if (!sheet)
                throw Error('Le fichier est vide.');
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
            const result = Wod.importAthletes(rows, state, uid);
            if (result.errors.length) {
                alert(`Import annulé, rien n’a été ajouté. Corrigez le fichier :\n\n${result.errors.slice(0, 8).join('\n')}${result.errors.length > 8 ? `\n… et ${result.errors.length - 8} autre(s) erreur(s).` : ''}`);
                return;
            }
            if (!result.athletes.length) {
                toast(result.duplicates ? 'Tous ces participants sont déjà inscrits.' : 'Aucun participant trouvé dans le fichier.');
                return;
            }
            const doublons = result.duplicates ? `\n${result.duplicates} déjà inscrit(s) seront ignorés.` : '';
            if (!confirm(`Ajouter ${result.athletes.length} inscription(s) à « ${state.title} » ?${doublons}`))
                return;
            state.athletes.push(...result.athletes);
            if (!save(false, `import de ${result.athletes.length} inscription(s)`))
                return;
            render();
            toast(`${result.athletes.length} inscription(s) ajoutée(s).`);
        }
        catch (error) {
            toast(error instanceof Error ? error.message : 'Impossible de lire ce fichier.');
        }
    }
    function renderAthletes() {
        const help = state.format === 'SOLO' ? 'Inscrivez les participants. La catégorie H ou F est calculée toute seule.' : state.format === 'DUO' ? 'Inscrivez les duos. La catégorie HH, FF ou HF est calculée toute seule.' : 'Inscrivez les solos et les duos. La catégorie (H, F, HH, FF, HF) est calculée toute seule.';
        heading('Participants', help, `<button class="button" data-action="import-template-xlsx" title="Fichier vierge avec listes déroulantes et légende">Modèle Excel</button><button class="button" data-action="import-athletes" title="Fichier Excel : Format, Participant 1, Participant 2${state.levels.length ? ', Niveau' : ''}">Importer (Excel)</button><button class="button primary" data-action="add-athlete">+ ${state.format === 'DUO' ? 'Ajouter un duo' : 'Ajouter un participant'}</button>`);
        const finalists = state.athletes.filter(a => Wod.isFinalist(state, a)).length;
        if (!finalists)
            onlyFinalists = false;
        if (finalists)
            $('chips').innerHTML = `<button class="format-chip${onlyFinalists ? ' active' : ''}" data-action="only-finalists" aria-pressed="${onlyFinalists}">Finalistes seulement (${finalists})</button>`;
        const rows = state.athletes.filter(a => (!onlyFinalists || Wod.isFinalist(state, a)) && found(a)).map(a => `<tr><td><strong>${esc(Wod.athleteLabel(a))}</strong>${Wod.isFinalist(state, a) ? ' <span class="finalist-badge">Finaliste</span>' : ''}</td><td>${a.level ? `<span class="level-badge level-${esc(a.level.toLowerCase())}">${esc(a.level)}</span>` : ''}${badge(a)}</td><td class="actions"><button class="button compact" data-edit-athlete="${a.id}">Modifier</button><button class="button compact danger" data-delete-athlete="${a.id}">Supprimer</button></td></tr>`);
        setTable(['PARTICIPANT / DUO', 'CATÉGORIE', 'ACTIONS'], rows, 'Aucun participant pour l’instant.');
    }
    function workoutDetails(w) {
        const parts = [];
        if (w.capMinutes)
            parts.push(w.type === 'time' ? `Time cap ${w.capMinutes} min` : `${w.capMinutes} min`);
        if (w.type === 'time' && w.totalReps)
            parts.push(`${w.totalReps} reps au total`);
        if (w.type === 'amrap' && w.repsPerRound)
            parts.push(`${w.repsPerRound} reps par tour`);
        return parts.join(' · ');
    }
    function renderWorkouts() {
        heading('WOD', 'Ajoutez chaque épreuve et choisissez comment elle se classe. Une épreuve de Finale est réservée aux qualifiés.', '<button class="button primary" data-action="add-workout">+ Ajouter un WOD</button>');
        const rows = state.workouts.map((w, i) => `<tr><td class="rank">${i + 1}</td><td><strong>${esc(w.name)}</strong>${w.phase === 'final' ? ' <span class="finalist-badge">Finale</span>' : ''}<div class="wod-desc">${esc(w.description)}</div></td><td>${esc(Wod.TYPE_LABELS[w.type])}<div class="muted">${esc(workoutDetails(w))}</div></td><td class="actions"><button class="button compact" data-edit-workout="${w.id}">Modifier</button><button class="button compact danger" data-delete-workout="${w.id}">Supprimer</button></td></tr>`);
        setTable(['N°', 'WOD', 'CLASSEMENT', 'ACTIONS'], rows, 'Aucun WOD pour l’instant.');
    }
    function currentWod() {
        if (!state.workouts.some(w => w.id === selectedWod))
            selectedWod = state.workouts[0]?.id ?? '';
        return state.workouts.find(w => w.id === selectedWod);
    }
    function inputsFor(w, a) {
        const s = state.scores[w.id]?.[a.id];
        if (s?.forfeit)
            return `<span class="outcome-badge">Forfait</span>`;
        const field = (name, value, ph, mode = 'numeric', off = false) => `<input data-score="${a.id}" data-field="${name}" value="${esc(value ?? '')}" placeholder="${ph}" inputmode="${mode}" aria-label="${ph}"${off ? ' disabled' : ''}>`;
        if (w.type === 'time') {
            // Temps du chrono (durée, pas une heure) : mm:ss si le cap fait moins d’une heure, sinon hh:mm:ss.
            const short = shortTime(w);
            // Soit un temps (fini), soit des reps (stoppé au cap) : la case remplie grise l’autre.
            const time = Saisie.box(`data-score="${a.id}" data-field="time"${s?.reps !== undefined ? ' disabled' : ''}`, Saisie.fromMs(s?.timeMs, short), `Temps réalisé ${short ? 'mm:ss' : 'hh:mm:ss'}`, short);
            return `<div class="score-inputs">${time}<span>ou, si stoppé au cap :</span>${field('reps', s?.timeMs === undefined ? s?.reps : '', 'Reps faites', 'numeric', s?.timeMs !== undefined)}</div>`;
        }
        if (w.type === 'load')
            return `<div class="score-inputs">${field('kg', s?.kg, 'Kg', 'decimal')}<span>kg</span></div>`;
        if (w.type === 'amrap' && w.repsPerRound) {
            const reps = s?.reps;
            const rounds = reps === undefined ? '' : Math.floor(reps / w.repsPerRound), rest = reps === undefined ? '' : reps % w.repsPerRound;
            return `<div class="score-inputs">${field('rounds', rounds, 'Tours')}<span>tours +</span>${field('rest', rest, 'Reps')}<span>reps</span></div>`;
        }
        return `<div class="score-inputs">${field('reps', s?.reps, 'Reps')}<span>reps</span></div>`;
    }
    const shortTime = (w) => !!w.capMinutes && w.capMinutes < 60;
    const capText = (w) => w.capMinutes ? `${w.capMinutes} min` : '';
    // Sélecteur de WOD : une barre d’onglets avec le nom, le type et le cap de chaque épreuve.
    function wodPicker(items, active, attr) {
        $('chips').innerHTML = `<div class="wod-picker" role="tablist">${items.map(i => `<button role="tab" aria-selected="${i.key === active}" class="${i.key === active ? 'active' : ''}" data-${attr}="${esc(i.key)}"><strong>${esc(i.label)}</strong><small>${esc(i.sub)}</small></button>`).join('')}</div>`;
    }
    const wodTab = (w) => ({ key: w.id, label: w.name, sub: [Wod.TYPE_LABELS[w.type], w.capMinutes ? `${w.type === 'time' ? 'cap ' : ''}${capText(w)}` : ''].filter(Boolean).join(' · ') });
    // Niveaux qui ont au moins un inscrit, dans l’ordre de l’événement.
    function levelsUsed() { return state.levels.filter(l => state.athletes.some(a => a.level === l)); }
    function shortGroup(g, level) { return level ? g.slice(level.length + 3) : g; }
    // Mêmes couleurs que les étiquettes : niveau (Scaled bleu, RX rouge) et format (Solo H bleu…).
    const levelChip = (l) => ({ key: l, label: l, css: `chip-level-${l.toLowerCase()}` });
    const groupChip = (g, level) => {
        const a = state.athletes.find(x => Wod.group(x) === g);
        return { key: g, label: shortGroup(g, level), css: a ? `chip-fmt-${Wod.category(a)}` : '' };
    };
    function renderScores() {
        const w = currentWod();
        const todo = w ? Wod.competitors(state, w).filter(a => Wod.scoreStatus(w, state.scores[w.id]?.[a.id]) === 'todo').length : 0;
        const how = w?.type === 'time' ? ` Saisissez le temps affiché par le chrono (${shortTime(w) ? 'mm:ss' : 'hh:mm:ss'}), pas une heure.${w.capMinutes ? ` Time cap : ${capText(w)}.` : ''}` : '';
        heading('Saisie des scores', w ? `${w.name} — ${Wod.TYPE_LABELS[w.type]}.${how} Le score s’enregistre dès que vous quittez la case (ou touche Entrée). ${todo ? `${todo} score(s) à saisir sur ce WOD.` : 'Tous les scores de ce WOD sont saisis.'}` : 'Ajoutez d’abord un WOD.', w ? `<button class="format-chip${onlyTodo ? ' active' : ''}" data-action="only-todo" aria-pressed="${onlyTodo}">À saisir seulement (${todo})</button><button class="button" data-action="print-blank" title="Deux feuilles vierges de ce WOD à remplir à la main">${PRINTER}Feuille vierge</button><button class="button" data-action="print-sheets" title="Une feuille par participant affiché (suivant les filtres)">${PRINTER}Feuilles jury</button>` : '');
        if (state.workouts.length)
            wodPicker(state.workouts.map(wodTab), selectedWod, 'wod');
        if (!w) {
            setTable([], [], 'Ajoutez un WOD dans l’onglet 2.');
            return;
        }
        // Une section par groupe (niveau + catégorie) : on saisit et on compare les athlètes d’un même classement.
        // Filtre par niveau (RX, Scaled) quand l’événement en a plusieurs.
        const levels = levelsUsed();
        if (!levels.includes(scoreLevel))
            scoreLevel = '';
        if (levels.length > 1)
            chips('chips2', [{ key: '', label: 'Tous les niveaux' }, ...levels.map(levelChip)], scoreLevel, 'score-level');
        const groups = Wod.groupsForLevel(state, scoreLevel);
        if (scoreGroup !== 'all' && !groups.includes(scoreGroup))
            scoreGroup = 'all';
        if (groups.length > 1)
            chips('chips3', [{ key: 'all', label: 'Tous les groupes' }, ...groups.map(g => groupChip(g, scoreLevel))], scoreGroup, 'score-group');
        const rows = [];
        for (const { g, list } of scoreSections(w)) {
            if (groups.length > 1)
                rows.push(`<tr class="group-row"><td colspan="4">${esc(g)}</td></tr>`);
            for (const a of list) {
                const forfeit = !!state.scores[w.id]?.[a.id]?.forfeit;
                rows.push(`<tr><td><strong>${esc(Wod.athleteLabel(a))}</strong><div class="muted">${esc(Wod.group(a))}</div></td><td>${inputsFor(w, a)}</td><td class="score-saved" id="saved-${a.id}">${savedText(w, a)}</td><td class="actions">${forfeit ? `<button class="button compact" data-reinstate="${a.id}">Annuler le forfait</button>` : `<button class="button compact" data-forfeit="${a.id}">Forfait</button>`}</td></tr>`);
            }
        }
        const scoreHead = w.type === 'time' ? `TEMPS RÉALISÉ${w.capMinutes ? ` · CAP ${capText(w).toUpperCase()}` : ''}` : 'SCORE';
        const none = w.phase === 'final' && !Wod.competitors(state, w).length ? 'Aucun qualifié pour la Finale : qualifiez-les dans l’onglet 4. Classements.' : 'Ajoutez des participants dans l’onglet 1.';
        setTable(['PARTICIPANT', scoreHead, 'ENREGISTRÉ', 'ACTIONS'], rows, onlyTodo && Wod.competitors(state, w).length ? 'Tous les scores de ce WOD sont saisis.' : none);
    }
    // Participants affichés dans Scores (filtres niveau, groupe, « à saisir »), groupe par groupe.
    function scoreSections(w) {
        return Wod.groupsForLevel(state, scoreLevel).filter(g => scoreGroup === 'all' || g === scoreGroup)
            .map(g => ({ g, list: Wod.competitors(state, w).filter(x => Wod.group(x) === g && found(x) && (!onlyTodo || Wod.scoreStatus(w, state.scores[w.id]?.[x.id]) === 'todo')) }))
            .filter(s => s.list.length);
    }
    // Feuilles de jury à imprimer, sur le modèle des scorecards CrossFit : une par participant, ou vierge.
    const PRINTER = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>';
    // Ligne à remplir : libellé, trait, unité.
    const line = (label, unit = '', short = false) => `<div class="sheet-field${short ? ' short' : ''}"><span>${label}</span><i></i>${unit ? `<em>${unit}</em>` : ''}</div>`;
    function sheetScore(w) {
        if (w.type === 'time') {
            const short = shortTime(w);
            const clock = `<div class="sheet-field"><span>Temps réalisé</span><b class="sheet-clock">${short ? '<i></i>:<i></i>' : '<i></i>:<i></i>:<i></i>'}</b><em>${short ? 'mm:ss' : 'hh:mm:ss'}</em></div>`;
            return `${clock}<p class="sheet-or">ou, si arrêté au cap${w.capMinutes ? ` de ${capText(w)}` : ''} :</p>${line('Reps faites', w.totalReps ? `sur ${w.totalReps}` : 'reps')}<p class="sheet-hint">Remplir une seule des deux cases : le temps si l’athlète a fini, sinon les reps.</p>`;
        }
        if (w.type === 'load')
            return line('Charge retenue', 'kg');
        if (w.type === 'amrap' && w.repsPerRound)
            return `<div class="sheet-row">${line('Tours complets', 'tours')}${line('+ Reps', 'reps')}</div>`;
        return line('Total', 'reps');
    }
    // Comptage pour le juge : cases à cocher par tour (avec les reps cumulées) ou lignes libres.
    function sheetTally(w) {
        if (w.type === 'amrap' && w.repsPerRound)
            return `<div class="sheet-tally">${Array.from({ length: 20 }, (_, i) => `<span><b>${i + 1}</b><small>${(i + 1) * (w.repsPerRound ?? 0)}</small></span>`).join('')}</div><p class="sheet-hint">Cochez chaque tour terminé (petit chiffre : reps cumulées).</p>`;
        if (w.type === 'load')
            return `<div class="sheet-tally attempts">${[1, 2, 3].map(i => `<span><b>Essai ${i}</b><small>kg</small><small>☐ OK ☐ No rep</small></span>`).join('')}</div>`;
        return '<div class="sheet-lines"><span>Comptage / notes</span><i></i></div>';
    }
    function sheet(w, a) {
        const box = (label) => `<span class="sheet-check">☐ ${esc(label)}</span>`;
        const cats = state.format === 'SOLO' ? ['Solo H', 'Solo F'] : state.format === 'DUO' ? ['Duo HH', 'Duo FF', 'Duo HF'] : ['Solo H', 'Solo F', 'Duo HH', 'Duo FF', 'Duo HF'];
        const who = a ? `<div class="sheet-name">${esc(Wod.athleteLabel(a))}</div><div class="sheet-tags">${a.level ? `<span class="level-badge level-${esc(a.level.toLowerCase())}">${esc(a.level)}</span>` : ''}${badge(a)}</div>`
            : `${line(state.format === 'SOLO' ? 'Participant' : 'Participant / duo')}<div class="sheet-tags">${state.levels.length ? `${state.levels.map(box).join('')}<span class="sheet-sep"></span>` : ''}${cats.map(box).join('')}</div>`;
        const info = [Wod.TYPE_LABELS[w.type], w.capMinutes ? `${w.type === 'time' ? 'time cap ' : ''}${capText(w)}` : '', w.phase === 'final' ? 'Finale' : ''].filter(Boolean).join(' · ');
        return `<article class="jury-sheet">
      <header><img src="assets/soundcrossing-logo.png" alt=""><div><strong>${esc(state.title)}</strong><span>${esc(dateLabel(state.date))}</span></div><b>FEUILLE DE JURY</b></header>
      <section class="sheet-wod"><div><strong>${esc(w.name)}</strong><span>${esc(info)}</span></div>${w.description ? `<p>${esc(w.description)}</p>` : ''}</section>
      <section class="sheet-who">${who}<div class="sheet-row">${line('Juge')}${line('Couloir', '', true)}</div></section>
      <section class="sheet-score"><h3>Score</h3>${sheetScore(w)}${sheetTally(w)}<span class="sheet-check">☐ Forfait</span></section>
      <footer><div class="sheet-sign">Signature du juge</div><div class="sheet-sign">Signature de l’athlète</div><span class="sheet-check">☐ Saisi dans l’app</span></footer>
    </article>`;
    }
    function printSheets(blank) {
        const w = currentWod();
        if (!w)
            return;
        const list = blank ? [] : scoreSections(w).flatMap(s => s.list);
        if (!blank && !list.length) {
            toast('Aucun participant à imprimer avec ces filtres.');
            return;
        }
        $('jury-print').innerHTML = blank ? sheet(w) + sheet(w) : list.map(a => sheet(w, a)).join('');
        // Attendre le logo, sinon il manque sur les feuilles imprimées.
        void Promise.all([...$('jury-print').querySelectorAll('img')].map(i => i.decode().catch(() => undefined))).then(() => window.print());
    }
    // Colonne « Enregistré » : le score, « À saisir » ou « Forfait ».
    function savedText(w, a) {
        const s = state.scores[w.id]?.[a.id], status = Wod.scoreStatus(w, s);
        return status === 'todo' ? `<span class="muted">${Wod.STATUS_LABELS.todo}</span>` : esc(Wod.scoreText(w, s));
    }
    // Forfait sur ce WOD : confirmé, comme dans l’Hyrox ; le score éventuel est retiré.
    function setForfeit(athleteId, forfeit) {
        const w = currentWod(), a = state.athletes.find(x => x.id === athleteId);
        if (!w || !a)
            return;
        const scores = state.scores[w.id] ??= {};
        if (forfeit) {
            const had = Wod.hasScore(w, scores[a.id]);
            if (!confirm(`Confirmer le forfait de ${Wod.athleteLabel(a)} sur ${w.name} ?\n\n${had ? `Le score enregistré (${Wod.scoreText(w, scores[a.id])}) sera retiré. ` : ''}${state.method === 'places' ? 'Sur ce WOD : dernière place de la catégorie.' : 'Sur ce WOD : 0 point.'}`))
                return;
            scores[a.id] = { forfeit: true };
        }
        else
            delete scores[a.id];
        if (save(false, `${forfeit ? 'forfait' : 'forfait annulé'} de ${Wod.athleteLabel(a)} sur ${w.name}`)) {
            render();
            toast(forfeit ? 'Forfait enregistré.' : 'Forfait annulé : score à saisir.');
        }
    }
    function saveScore(input) {
        const w = currentWod();
        const athleteId = input.dataset.score ?? '';
        if (!w)
            return;
        const row = input.closest('tr');
        const get = (f) => row.querySelector(`[data-field="${f}"]`)?.value ?? '';
        try {
            // Vérifier d’abord : un score ambigu est refusé et rien n’est modifié.
            const score = Wod.buildScore(w, { timeMs: w.type === 'time' ? Saisie.duration(get('time'), shortTime(w)) : null, reps: get('reps'), rounds: get('rounds'), rest: get('rest'), kg: get('kg') });
            row.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
            const scores = state.scores[w.id] ??= {};
            if (score)
                scores[athleteId] = score;
            else
                delete scores[athleteId];
            const who = state.athletes.find(x => x.id === athleteId);
            if (!save(false, `score de ${who ? Wod.athleteLabel(who) : 'participant'} sur ${w.name}`))
                return;
            if (w.type === 'time') {
                const f = row.querySelector('[data-field="time"]');
                if (f)
                    f.value = Saisie.fromMs(score?.timeMs, shortTime(w));
            }
            const a = state.athletes.find(x => x.id === athleteId);
            if (a)
                $(`saved-${athleteId}`).innerHTML = savedText(w, a);
        }
        catch (error) {
            input.classList.add('invalid');
            toast(error.message);
        }
    }
    // Rang comme dans l’Hyrox : pastille, la 1re place en rouge quand le classement est définitif.
    const rankBadge = (rank, final) => `<span class="result-rank ${final ? `rank-${rank}` : 'provisional'}">${rank}</span>`;
    // Bouton « Top 3 » en bas du tableau, noir, comme dans l’Hyrox.
    function podiumFooter(ranked, pending) {
        $('podium-footer').hidden = false;
        $('podium-footer-count').textContent = `${ranked} classé(s)${pending ? ` · ${pending} score(s) à saisir` : ''}`;
        $('podium-footer-label').textContent = pending ? 'Top 3 provisoire' : 'Top 3 final';
        $('show-podium-button').disabled = !ranked;
    }
    // Podium plein écran : même écran que l’Hyrox, pour l’onglet affiché (général ou un WOD) et la catégorie choisie.
    let podiumOpen = false;
    function openPodium() {
        const cat = rankingCat;
        if (!cat)
            return;
        const general = rankingTab === 'general' || rankingTab === 'final', phase = rankingTab === 'final' ? 'final' : 'qualif', w = state.workouts.find(x => x.id === rankingTab);
        const places = general
            ? Wod.generalRanking(state, cat, phase).map(r => ({ rank: r.rank, athlete: r.athlete, value: state.method === 'places' ? `Total ${r.total}` : `${r.total} pts` }))
            : w ? Wod.workoutRanking(state, w, cat).map(p => ({ rank: p.rank, athlete: p.athlete, value: Wod.scoreText(w, p.score) })) : [];
        const top = places.filter(p => p.rank <= 3);
        if (!top.length) {
            toast('Aucun score classé dans cette catégorie.');
            return;
        }
        const pending = general ? Wod.pendingScores(state, cat, phase) : w ? Wod.competitors(state, w).filter(a => Wod.group(a) === cat && Wod.scoreStatus(w, state.scores[w.id]?.[a.id]) === 'todo').length : 0;
        $('podium-event').textContent = state.title;
        $('podium-date').textContent = state.date ? new Date(`${state.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toLocaleUpperCase('fr-FR')) : '';
        $('podium-kicker').textContent = `${phase === 'final' && general ? 'FINALE · GRAND GAGNANT' : general ? Wod.hasFinal(state) ? 'QUALIFICATIONS' : 'CLASSEMENT GÉNÉRAL' : w.name.toUpperCase()} · ${pending ? 'PROVISOIRE' : 'FINAL'}`;
        $('podium-category').textContent = cat;
        $('podium-stage').innerHTML = [2, 1, 3].map(rank => {
            const list = top.filter(p => p.rank === rank), metal = rank === 1 ? 'Or' : rank === 2 ? 'Argent' : 'Bronze';
            return `<article class="podium-stage-card stage-${rank}${list.length ? '' : ' is-empty'}">${list.length ? `<div class="podium-award" aria-label="${rank === 1 ? '1er' : `${rank}e`} — ${metal}"><span class="podium-position-number" aria-hidden="true">0${rank}</span><span class="podium-metal-label" aria-hidden="true">${metal}</span></div>` + list.map(p => `<div class="podium-stage-winner"><div class="podium-stage-names"><span>${esc(p.athlete.name1)}</span>${p.athlete.format === 'DUO' ? `<span class="podium-stage-join">&amp;</span><span>${esc(p.athlete.name2)}</span>` : ''}</div><div class="podium-stage-time">${esc(p.value)}</div></div>`).join('') : '<div class="podium-stage-rank">—</div><p>Place non attribuée</p>'}</article>`;
        }).join('');
        podiumOpen = true;
        $('podium-screen').hidden = false;
        document.body.style.overflow = 'hidden';
        void $('podium-screen').requestFullscreen?.().catch(() => undefined);
    }
    function closePodium() {
        if (!podiumOpen)
            return;
        podiumOpen = false;
        $('podium-screen').hidden = true;
        document.body.style.overflow = '';
        if (document.fullscreenElement)
            void document.exitFullscreen().catch(() => undefined);
    }
    // Diplômes du classement affiché (général, qualifs ou Finale) : toutes les catégories, un par participant qui a au moins un score.
    function printDiplomas() {
        const phase = rankingTab === 'final' ? 'final' : 'qualif', wods = Wod.phaseWorkouts(state, phase);
        const label = phase === 'final' ? 'Finale' : Wod.hasFinal(state) ? 'Qualifications' : 'Classement général';
        const list = Wod.usedGroups(state).flatMap(g => {
            const ranking = Wod.generalRanking(state, g, phase);
            return ranking.filter(r => found(r.athlete) && wods.some(w => r.places[w.id] !== null)).map(r => ({ r, of: ranking.length }));
        });
        if (!list.length) {
            toast('Aucun participant classé à imprimer.');
            return;
        }
        if (Wod.pendingScores(state, undefined, phase) && !confirm(`Classement provisoire : des scores restent à saisir, les places imprimées peuvent encore changer.\n\nImprimer quand même ${list.length} diplôme(s) ?`))
            return;
        Diplome.print(list.map(({ r, of }) => ({
            names: r.athlete.format === 'DUO' ? [r.athlete.name1, r.athlete.name2] : [r.athlete.name1], event: state.title, date: state.date, group: Wod.group(r.athlete),
            phase: label, rank: r.rank, of, resultLabel: state.method === 'places' ? 'Total des places' : 'Points', result: state.method === 'places' ? String(r.total) : `${r.total} pts`,
            details: wods.map(w => { const p = r.places[w.id] ?? null, sc = state.scores[w.id]?.[r.athlete.id]; return { label: w.name, value: p === null ? Wod.STATUS_LABELS[Wod.scoreStatus(w, sc)] : Wod.scoreText(w, sc), place: p === null ? '—' : Diplome.place(p) }; }),
        })));
    }
    function renderRanking() {
        const levels = levelsUsed();
        if (!levels.includes(rankingLevel))
            rankingLevel = levels.length > 1 ? levels[0] : '';
        if (levels.length > 1)
            chips('chips2', levels.map(levelChip), rankingLevel, 'rank-level');
        const cats = Wod.groupsForLevel(state, rankingLevel);
        if (!cats.includes(rankingCat))
            rankingCat = cats[0] ?? '';
        const final = Wod.hasFinal(state);
        if (rankingTab !== 'general' && !(final && rankingTab === 'final') && !state.workouts.some(w => w.id === rankingTab))
            rankingTab = 'general';
        const sum = state.method === 'places' ? 'Somme des places' : 'Total des points';
        wodPicker([{ key: 'general', label: final ? 'Classement qualifs' : 'Classement général', sub: sum }, ...Wod.phaseWorkouts(state, 'qualif').map(wodTab),
            ...(final ? [{ key: 'final', label: 'Finale', sub: 'Qualifiés · grand gagnant' }, ...Wod.phaseWorkouts(state, 'final').map(wodTab)] : [])], rankingTab, 'rank-tab');
        chips(levels.length > 1 ? 'chips3' : 'chips2', cats.map(c => groupChip(c, rankingLevel)), rankingCat, 'rank-cat');
        if (!rankingCat) {
            heading('Classements', '');
            setTable([], [], 'Ajoutez des participants et des scores.');
            return;
        }
        if (!state.workouts.length) {
            heading('Classements', 'Pas de classement ni de podium sans épreuve.');
            setTable([], [], 'Ajoutez au moins un WOD (onglet 2) pour obtenir un classement.');
            return;
        }
        const cat = rankingCat;
        if (rankingTab === 'general' || rankingTab === 'final') {
            const phase = rankingTab === 'final' ? 'final' : 'qualif', wods = Wod.phaseWorkouts(state, phase);
            const pending = Wod.pendingScores(state, cat, phase), ranking = Wod.generalRanking(state, cat, phase);
            const name = phase === 'final' ? 'Finale' : final ? 'Classement des qualifs' : 'Classement général';
            const qualified = state.athletes.filter(a => Wod.group(a) === cat && Wod.isFinalist(state, a)).length;
            const note = phase === 'final' ? `Points remis à zéro : seuls les WOD de finale comptent. Égalité : meilleure place sur le dernier WOD de finale, puis classement des qualifs.${qualified ? '' : ' Aucun qualifié dans cette catégorie : qualifiez-les dans « Classement qualifs ».'}`
                : `${Wod.rulesText(state).slice(0, 3).join(' ')}${final ? ` ${qualified} qualifié(s) pour la Finale.` : ''}`;
            heading(`${name} ${pending ? 'provisoire' : phase === 'final' ? 'définitive' : 'définitif'}`, `${pending ? `${pending} score(s) à saisir dans cette catégorie. ` : ''}${note}`, `<button class="button" data-action="diplomas" title="Un diplôme par participant classé, toutes catégories (suivant la recherche), à imprimer ou enregistrer en PDF">${PRINTER}Diplômes</button>${phase === 'qualif' && final ? '<button class="button primary" data-action="qualify">Qualifier pour la Finale</button>' : ''}`);
            const cell = (w, r) => r.places[w.id] !== null ? `${r.places[w.id]}<sup>e</sup>` : `<span class="muted">${Wod.STATUS_LABELS[Wod.scoreStatus(w, state.scores[w.id]?.[r.athlete.id])]}</span>`;
            podiumFooter(ranking.length, pending);
            const pick = (a) => `<td>${Wod.isFinalist(state, a) ? `<button class="button compact finalist-on" data-unqualify="${a.id}" title="Retirer de la Finale">✓ Qualifié</button>` : `<button class="button compact" data-qualify-one="${a.id}">Qualifier</button>`}</td>`;
            const rows = ranking.filter(r => found(r.athlete)).map(r => `<tr><td class="rank">${rankBadge(r.rank, !pending)}</td><td><strong>${esc(Wod.athleteLabel(r.athlete))}</strong><div class="muted">${esc(r.athlete.level ? Wod.group(r.athlete) : Wod.categoryLabel(Wod.category(r.athlete)))}</div></td>${wods.map(w => `<td>${cell(w, r)}</td>`).join('')}<td class="rank">${r.total}</td>${phase === 'qualif' && final ? pick(r.athlete) : ''}</tr>`);
            setTable(['RANG', 'PARTICIPANT', ...wods.map(w => esc(w.name.toUpperCase())), state.method === 'places' ? 'TOTAL' : 'POINTS', ...(phase === 'qualif' && final ? ['FINALE'] : [])], rows, phase === 'final' ? 'Aucun qualifié dans cette catégorie.' : 'Aucun participant dans cette catégorie.');
            return;
        }
        const w = state.workouts.find(x => x.id === rankingTab);
        const inCat = Wod.competitors(state, w).filter(a => Wod.group(a) === cat);
        const todo = inCat.filter(a => Wod.scoreStatus(w, state.scores[w.id]?.[a.id]) === 'todo').length;
        heading(w.name, `${Wod.TYPE_LABELS[w.type]}.${todo ? ` Provisoire : ${todo} score(s) à saisir.` : ''}`);
        const label = (a) => `<strong>${esc(Wod.athleteLabel(a))}</strong><div class="muted">${esc(a.level ? Wod.group(a) : Wod.categoryLabel(Wod.category(a)))}</div>`;
        podiumFooter(Wod.workoutRanking(state, w, cat).length, todo);
        const rows = Wod.workoutRanking(state, w, cat).filter(p => found(p.athlete)).map(p => `<tr><td class="rank">${rankBadge(p.rank, !todo)}</td><td>${label(p.athlete)}</td><td class="score-saved">${esc(Wod.scoreText(w, p.score))}</td>${state.method === 'points' ? `<td>${Wod.pointsFor(p.rank)} pts</td>` : ''}</tr>`);
        for (const a of inCat)
            if (state.scores[w.id]?.[a.id]?.forfeit && found(a))
                rows.push(`<tr><td class="rank">—</td><td>${label(a)}</td><td><span class="outcome-badge">Forfait</span></td>${state.method === 'points' ? '<td>0 pt</td>' : ''}</tr>`);
        setTable(['RANG', 'PARTICIPANT', 'SCORE', ...(state.method === 'points' ? ['POINTS'] : [])], rows, 'Aucun score saisi pour cette catégorie.');
    }
    // Qualifiés de la catégorie affichée : les n premiers des qualifs, puis ajustables un par un.
    function qualify() {
        const cat = rankingCat;
        if (!cat)
            return;
        const current = state.athletes.filter(a => Wod.group(a) === cat && Wod.isFinalist(state, a)).length;
        const text = prompt(`Combien de qualifiés pour la Finale en ${cat} ?\n\nLes premiers du classement des qualifs sont qualifiés (ex æquo compris). Vous pourrez ensuite en ajouter ou en retirer un par un.`, String(current || 3));
        if (text === null)
            return;
        const n = Number(text.trim());
        if (!Number.isInteger(n) || n < 0) {
            toast('Nombre entier attendu.');
            return;
        }
        state.finalists = Wod.qualifyTop(state, cat, n);
        if (save(false, `qualification pour la Finale en ${cat}`)) {
            render();
            toast(`${state.athletes.filter(a => Wod.group(a) === cat && Wod.isFinalist(state, a)).length} qualifié(s) en ${cat}.`);
        }
    }
    function setFinalist(id, on) {
        const a = state.athletes.find(x => x.id === id);
        if (!a)
            return;
        const has = state.workouts.some(w => w.phase === 'final' && state.scores[w.id]?.[id]);
        if (!on && has && !confirm(`${Wod.athleteLabel(a)} a déjà des scores en Finale. Le retirer quand même ? Ses scores de finale seront gardés mais ne compteront plus.`))
            return;
        const list = (state.finalists ?? []).filter(x => x !== id);
        state.finalists = on ? [...list, id] : list;
        if (save(false, `${on ? 'qualification' : 'retrait de la Finale'} de ${Wod.athleteLabel(a)}`))
            render();
    }
    let entryFormat = '';
    let gender1 = '', gender2 = '';
    function syncEntryForm() {
        const form = $('entry-form'), duo = entryFormat === 'DUO';
        form.classList.toggle('duo-registration', duo);
        $('name2-field').hidden = !duo;
        form.elements.namedItem('name2').required = duo;
        document.querySelectorAll('#entry-form [data-gender]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gender === (b.dataset.person === '1' ? gender1 : gender2))));
        document.querySelectorAll('#entry-form [data-entry-format]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.entryFormat === entryFormat)));
        document.querySelectorAll('#entry-form [data-level]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === entryLevel)));
        const status = $('registration-category');
        let message = '';
        if (state.levels.length && !entryLevel)
            message = 'Choisissez le niveau.';
        else if (!entryFormat)
            message = 'Choisissez Solo ou Duo.';
        else if (!gender1)
            message = 'Choisissez H ou F pour le participant 1.';
        else if (duo && !gender2)
            message = 'Choisissez H ou F pour le participant 2.';
        status.classList.toggle('complete', !message);
        status.textContent = message || `Format : ${entryLevel ? `${entryLevel} · ` : ''}${Wod.categoryLabel(Wod.category({ id: '', bib: '', format: entryFormat, name1: '', name2: '', gender1: gender1, gender2: duo ? gender2 : '' }))}`;
    }
    function openAthlete(a) {
        const form = $('entry-form');
        form.reset();
        const f = form.elements;
        $('entry-title').textContent = a ? 'Modifier l’inscription' : state.format === 'DUO' ? 'Ajouter un duo' : 'Ajouter un participant';
        $('entry-course').textContent = `${state.title} · ${dateLabel(state.date)} · Événement ${Wod.eventFormatLabel(state.format)}`;
        $('entry-format-choice').hidden = state.format !== 'MIXED';
        $('entry-level-choice').hidden = !state.levels.length;
        $('entry-level-buttons').innerHTML = state.levels.map(l => `<button type="button" data-level="${esc(l)}" aria-pressed="false">${esc(l)}<small>${esc(LEVEL_HELP[l] ?? '')}</small></button>`).join('');
        entryLevel = a?.level && state.levels.includes(a.level) ? a.level : state.levels.length === 1 ? state.levels[0] : '';
        f.id.value = a?.id ?? '';
        f.name1.value = a?.name1 ?? '';
        f.name2.value = a?.name2 ?? '';
        entryFormat = a?.format ?? (state.format === 'MIXED' ? '' : state.format);
        gender1 = a?.gender1 ?? '';
        gender2 = a?.gender2 ?? '';
        $('delete-entry').hidden = !a;
        openDraft(form, 'athlete', a?.id ?? '');
        $('entry-error').textContent = '';
        syncEntryForm();
        $('entry-dialog').showModal();
    }
    function submitAthlete(event) {
        event.preventDefault();
        const data = new FormData(event.target);
        const v = (k) => String(data.get(k) ?? '').trim();
        const error = (text) => { $('entry-error').textContent = text; };
        if (state.levels.length && !entryLevel)
            return error('Choisissez le niveau.');
        if (!entryFormat)
            return error('Choisissez Solo ou Duo.');
        if (!gender1)
            return error('Choisissez H ou F pour le participant 1.');
        if (entryFormat === 'DUO' && !gender2)
            return error('Choisissez H ou F pour le participant 2.');
        if (entryFormat === 'DUO' && !v('name2'))
            return error('Renseignez le nom du participant 2.');
        if (draftChanged(event.target, 'athlete', v('id')))
            return error(STALE_FORM);
        const old = state.athletes.find(a => a.id === v('id'));
        const athlete = { id: old?.id ?? uid(), bib: old?.bib ?? Wod.nextBib(state), format: entryFormat, name1: v('name1'), name2: entryFormat === 'DUO' ? v('name2') : '', gender1, gender2: entryFormat === 'DUO' ? gender2 : '', ...(state.levels.length ? { level: entryLevel } : {}) };
        // Changer le niveau ou la catégorie d’un athlète déjà noté le déplace dans un autre classement : confirmé.
        const scored = old && state.workouts.some(w => Wod.hasScore(w, state.scores[w.id]?.[old.id]));
        if (old && scored && Wod.group(old) !== Wod.group(athlete) && !confirm(`${Wod.athleteLabel(old)} a déjà des scores.\n\nIl passera de « ${Wod.group(old)} » à « ${Wod.group(athlete)} », avec ses scores. Continuer ?`))
            return;
        const i = state.athletes.findIndex(a => a.id === athlete.id);
        if (i >= 0)
            state.athletes[i] = athlete;
        else
            state.athletes.push(athlete);
        if (!save(false, `${i >= 0 ? 'modification' : 'ajout'} de ${Wod.athleteLabel(athlete)}`)) {
            $('entry-error').textContent = 'Non enregistré : réessayez.';
            return;
        }
        $('entry-dialog').close();
        render();
        toast(i >= 0 ? 'Inscription modifiée.' : 'Participant ajouté.');
    }
    function deleteAthlete(a) {
        if (!a || !confirm(`Supprimer ${Wod.athleteLabel(a)} et ses scores ?`))
            return false;
        state.athletes = state.athletes.filter(x => x !== a);
        for (const s of Object.values(state.scores))
            delete s[a.id];
        if (!save(false, `suppression de ${Wod.athleteLabel(a)}`))
            return false;
        render();
        return true;
    }
    const HELP = {
        time: 'For Time : on saisit le temps. Si un athlète n’a pas fini avant le time cap, on saisit ses reps : il est classé après tous ceux qui ont fini.',
        amrap: 'AMRAP : on saisit les tours et les reps. Indiquez les reps d’un tour pour saisir « 5 tours + 12 reps » ; sinon on saisit le total de reps.',
        load: 'Charge max : on saisit la meilleure charge réussie en kg.',
        reps: 'Max reps : on saisit un nombre (reps, calories ou mètres). Le plus grand gagne.',
    };
    function syncWorkoutForm() {
        const type = ($('workout-form').elements.namedItem('type').value || 'time');
        document.querySelectorAll('#workout-form .type-time').forEach(el => { el.hidden = type !== 'time'; });
        document.querySelectorAll('#workout-form .type-amrap').forEach(el => { el.hidden = type !== 'amrap'; });
        $('workout-help').textContent = HELP[type];
    }
    function openWorkout(w) {
        const form = $('workout-form');
        form.reset();
        const f = form.elements;
        $('workout-title').textContent = w ? 'Modifier le WOD' : 'Ajouter un WOD';
        f.id.value = w?.id ?? '';
        f.name.value = w?.name ?? `WOD ${state.workouts.length + 1}`;
        form.elements.namedItem('type').value = w?.type ?? 'time';
        form.elements.namedItem('phase').value = w?.phase === 'final' ? 'final' : 'qualif';
        f.description.value = w?.description ?? '';
        f.capMinutes.value = String(w?.capMinutes ?? '');
        f.totalReps.value = String(w?.totalReps ?? '');
        f.repsPerRound.value = String(w?.repsPerRound ?? '');
        $('workout-error').textContent = '';
        openDraft(form, 'workout', w?.id ?? '');
        syncWorkoutForm();
        $('workout-dialog').showModal();
        f.name.focus();
    }
    function submitWorkout(event) {
        event.preventDefault();
        const data = new FormData(event.target);
        const v = (k) => String(data.get(k) ?? '').trim();
        const n = (k) => { const x = Number(v(k)); return v(k) && x > 0 ? x : null; };
        const type = v('type');
        const id = v('id') || uid();
        if (draftChanged(event.target, 'workout', v('id'))) {
            $('workout-error').textContent = STALE_FORM;
            return;
        }
        const old = state.workouts.find(w => w.id === id);
        if (old && old.type !== type && Object.keys(state.scores[id] ?? {}).length && !confirm('Changer le type efface les scores déjà saisis pour ce WOD. Continuer ?'))
            return;
        const workout = { id, name: v('name'), description: v('description'), type, capMinutes: n('capMinutes'), totalReps: type === 'time' ? n('totalReps') : null, repsPerRound: type === 'amrap' ? n('repsPerRound') : null, ...(v('phase') === 'final' ? { phase: 'final' } : {}) };
        // Cap, reps au total… : un score déjà saisi qui ne respecterait plus les réglages bloque la modification.
        const conflicts = old && old.type === type ? Wod.workoutConflicts(state, workout) : [];
        if (conflicts.length) {
            $('workout-error').textContent = `Non enregistré : ${conflicts.length} score(s) ne respectent plus ces réglages. Corrigez-les d’abord dans Scores, ou gardez les réglages actuels. ${conflicts.slice(0, 3).join(' · ')}${conflicts.length > 3 ? ' …' : ''}`;
            return;
        }
        if (old && old.type !== type)
            delete state.scores[id];
        const i = state.workouts.findIndex(w => w.id === id);
        if (i >= 0)
            state.workouts[i] = workout;
        else
            state.workouts.push(workout);
        if (!save(false, `${i >= 0 ? 'modification' : 'ajout'} du WOD ${workout.name}`)) {
            $('workout-error').textContent = 'Non enregistré : réessayez.';
            return;
        }
        $('workout-dialog').close();
        render();
        toast(i >= 0 ? 'WOD modifié.' : 'WOD ajouté.');
    }
    function openEvent(edit) {
        const form = $('session-form');
        form.reset();
        $('session-error').textContent = '';
        const f = form.elements;
        const radio = (name) => form.elements.namedItem(name);
        f.id.value = edit ? state.id : '';
        f.title.value = edit ? state.title : 'Soundcrossing WOD';
        f.date.value = edit ? state.date : today();
        radio('format').value = edit ? state.format : '';
        radio('method').value = edit ? state.method : 'places';
        // Règles stables : la méthode de classement ne change plus une fois les scores commencés.
        const locked = edit && Wod.hasAnyScore(state);
        form.querySelectorAll('input[name="method"]').forEach(i => { i.disabled = locked; });
        $('method-lock').hidden = !locked;
        radio('levels').value = edit ? Object.keys(Wod.LEVEL_PRESETS).find(k => Wod.LEVEL_PRESETS[k].join() === state.levels.join()) ?? 'none' : 'none';
        // Les niveaux ne changent plus une fois les scores commencés : un RX ne devient jamais Scaled sans qu’on le décide.
        form.querySelectorAll('input[name="levels"]').forEach(i => { i.disabled = locked; });
        $('levels-lock').hidden = !locked;
        openDraft(form, 'event', edit ? state.id : '');
        syncEventForm();
        $('event-dialog-title').textContent = edit ? 'Modifier l’événement' : 'Créer un événement';
        $('save-event-button').textContent = edit ? 'Enregistrer' : 'Créer l’événement';
        $('delete-event').hidden = !edit;
        $('session-dialog').showModal();
        f.title.focus();
    }
    // Ajouter des niveaux à un événement qui a déjà des inscrits : on choisit leur niveau, rien n’est deviné.
    function syncEventForm() {
        const form = $('session-form'), id = form.elements.namedItem('id').value;
        const levels = Wod.LEVEL_PRESETS[form.elements.namedItem('levels').value] ?? [];
        const ask = !!id && !state.levels.length && levels.length > 0 && state.athletes.length > 0;
        $('levels-assign').hidden = !ask;
        $('levels-assign-count').textContent = String(state.athletes.length);
        const buttons = $('levels-assign-buttons');
        if (ask === !buttons.innerHTML)
            buttons.innerHTML = ask ? levels.map(l => `<label><input type="radio" name="assignLevel" value="${esc(l)}" required><span>${esc(l)}<small>${esc(LEVEL_HELP[l] ?? '')}</small></span></label>`).join('') : '';
    }
    function submitEvent(event) {
        event.preventDefault();
        const data = new FormData(event.target);
        const v = (k) => String(data.get(k) ?? '').trim();
        const format = v('format');
        if (!['SOLO', 'DUO', 'MIXED'].includes(format)) {
            $('session-error').textContent = 'Choisissez Solo, Duo ou Solo + Duo.';
            return;
        }
        if (draftChanged(event.target, 'event', v('id'))) {
            $('session-error').textContent = STALE_FORM;
            return;
        }
        const existing = store.events.find(e => e.id === v('id'));
        if (existing && format !== 'MIXED' && existing.athletes.some(a => a.format !== format)) {
            $('session-error').textContent = `Des inscriptions ${format === 'SOLO' ? 'Duo' : 'Solo'} existent déjà : gardez Solo + Duo ou supprimez-les d’abord.`;
            return;
        }
        const target = existing ?? Wod.emptyCompetition(uid(), '', '', format);
        target.title = v('title') || 'Soundcrossing WOD';
        target.date = v('date');
        target.format = format;
        if (!(existing && Wod.hasAnyScore(existing)))
            target.method = v('method') === 'points' ? 'points' : 'places';
        // Changer de niveaux : « un seul niveau » les retire.
        const levels = Wod.LEVEL_PRESETS[v('levels')] ?? [];
        if (levels.join() !== target.levels.join() && !(existing && Wod.hasAnyScore(existing))) {
            const assign = v('assignLevel');
            if (target.athletes.length && levels.length && !target.levels.length && !levels.includes(assign)) {
                $('session-error').textContent = 'Choisissez le niveau des participants déjà inscrits.';
                return;
            }
            if (target.athletes.length && !levels.length && !confirm(`Passer à un seul niveau ?\n\nLes ${target.athletes.length} inscrit(s) Scaled et RX seront classés ensemble.`))
                return;
            for (const a of target.athletes) {
                const level = levels.length && !target.levels.length ? assign : Wod.remapLevel(a.level, levels);
                if (level)
                    a.level = level;
                else
                    delete a.level;
            }
            target.levels = [...levels];
        }
        if (!existing) {
            store.events.push(target);
            view = 'athletes';
        }
        selectEvent(target.id);
        rememberEvent();
        if (!save(false, `${existing ? 'modification' : 'création'} de l’événement ${target.title}`)) {
            $('session-error').textContent = 'Non enregistré : réessayez.';
            return;
        }
        $('session-dialog').close();
        render();
        toast(existing ? 'Événement enregistré.' : 'Événement créé. Ajoutez les participants.');
    }
    function deleteEvent() {
        if (!confirm(`Supprimer l’événement « ${state.title} », ses inscriptions, ses WOD et ses scores ?`))
            return;
        const title = state.title;
        store.events = store.events.filter(e => e.id !== state.id);
        selectEvent('');
        if (!save(false, `suppression de l’événement ${title}`))
            return;
        $('session-dialog').close();
        render();
        toast('Événement supprimé.');
    }
    function exportExcel() {
        if (!store.events.length) {
            toast('Créez d’abord un événement.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            toast('Export Excel indisponible.');
            return;
        }
        const book = XLSX.utils.book_new();
        for (const sheet of Wod.exportRows(state))
            XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
        XLSX.writeFile(book, `${state.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'wod'} - résultats.xlsx`);
    }
    // Mode entraînement : événement fictif, bien signalé, supprimable en un clic. Les vrais événements ne bougent pas.
    function loadTraining() {
        const example = Wod.training(today(), store.events);
        example.id = `entrainement-${uid()}`;
        store.events.push(example);
        selectEvent(example.id);
        rememberEvent();
        if (!save(false, `création de l’entraînement ${example.title}`))
            return;
        view = 'scores';
        render();
        $('settings-dialog').close();
        toast(`Entraînement créé : ${example.athletes.length} inscrits fictifs et ${example.workouts.length} WOD. Saisissez les scores.`);
    }
    function deleteTrainings(ids) {
        const events = store.events.filter(e => e.training && ids.includes(e.id));
        if (!events.length)
            return;
        const one = events.length === 1;
        if (!confirm(`${one ? `Supprimer l’entraînement « ${events[0].title} », ses inscriptions et ses scores fictifs ?` : `Supprimer les ${events.length} événements d’entraînement, leurs inscriptions et leurs scores fictifs ?`}\n\nVos vrais événements ne sont pas touchés.`))
            return;
        store.events = store.events.filter(e => !events.includes(e));
        if (events.some(e => e.id === state.id))
            selectEvent('');
        rememberEvent();
        if (!save(false, one ? `suppression de l’entraînement ${events[0].title}` : 'suppression des entraînements'))
            return;
        $('settings-dialog').close();
        render();
        toast(one ? 'Entraînement supprimé.' : 'Entraînements supprimés.');
    }
    function loadDemo() {
        const example = Wod.demo(today());
        example.id = `exemple-${uid()}`;
        store.events.push(example);
        selectEvent(example.id);
        rememberEvent();
        if (!save(false, 'ajout de l’exemple'))
            return;
        view = 'ranking';
        rankingTab = 'general';
        render();
        $('settings-dialog').close();
        toast('Exemple chargé : 10 inscrits et 3 WOD. Regardez chaque onglet.');
    }
    function bind() {
        Saisie.install();
        document.addEventListener('click', e => {
            const t = e.target.closest('button');
            if (!t)
                return;
            const d = t.dataset;
            if (t.classList.contains('close-modal')) {
                t.closest('dialog')?.close();
                return;
            }
            if (d.view) {
                view = d.view;
                render();
            }
            else if (d.action === 'add-athlete')
                openAthlete();
            else if (d.action === 'add-workout')
                openWorkout();
            else if (d.action === 'import-athletes')
                $('import-file').click();
            else if (d.action === 'import-template-xlsx')
                Modele.download(Modele.workbook(Wod.importColumns(state)), 'modele-participants-wod.xlsx');
            else if (d.editAthlete)
                openAthlete(state.athletes.find(a => a.id === d.editAthlete));
            else if (d.editWorkout)
                openWorkout(state.workouts.find(w => w.id === d.editWorkout));
            else if (d.deleteAthlete)
                deleteAthlete(state.athletes.find(x => x.id === d.deleteAthlete));
            else if (d.entryFormat) {
                entryFormat = d.entryFormat;
                $('entry-error').textContent = '';
                syncEntryForm();
            }
            else if (d.gender && d.person) {
                if (d.person === '1')
                    gender1 = d.gender;
                else
                    gender2 = d.gender;
                $('entry-error').textContent = '';
                syncEntryForm();
            }
            else if (d.deleteWorkout) {
                const w = state.workouts.find(x => x.id === d.deleteWorkout);
                if (w && confirm(`Supprimer ${w.name} et tous ses scores ?`)) {
                    state.workouts = state.workouts.filter(x => x !== w);
                    delete state.scores[w.id];
                    if (save(false, `suppression du WOD ${w.name}`))
                        render();
                }
            }
            else if (d.wod) {
                selectedWod = d.wod;
                render();
            }
            else if (d.action === 'podium')
                openPodium();
            else if (d.action === 'print-sheets')
                printSheets(false);
            else if (d.action === 'print-blank')
                printSheets(true);
            else if (d.action === 'diplomas')
                printDiplomas();
            else if (d.action === 'only-todo') {
                onlyTodo = !onlyTodo;
                render();
            }
            else if (d.action === 'only-finalists') {
                onlyFinalists = !onlyFinalists;
                render();
            }
            else if (d.action === 'qualify')
                qualify();
            else if (d.qualifyOne)
                setFinalist(d.qualifyOne, true);
            else if (d.unqualify)
                setFinalist(d.unqualify, false);
            else if (d.forfeit)
                setForfeit(d.forfeit, true);
            else if (d.reinstate)
                setForfeit(d.reinstate, false);
            else if (d.rankTab) {
                rankingTab = d.rankTab;
                render();
            }
            else if (d.rankCat) {
                rankingCat = d.rankCat;
                render();
            }
            else if (d.scoreGroup) {
                scoreGroup = d.scoreGroup;
                render();
            }
            else if (d.scoreLevel !== undefined && t.closest('#chips2')) {
                scoreLevel = d.scoreLevel;
                scoreGroup = 'all';
                render();
            }
            else if (d.rankLevel) {
                rankingLevel = d.rankLevel;
                render();
            }
            else if (d.level !== undefined && t.closest('#entry-form')) {
                entryLevel = d.level;
                $('entry-error').textContent = '';
                syncEntryForm();
            }
        });
        $('table-body').addEventListener('input', e => {
            const i = e.target, other = { time: 'reps', reps: 'time' }[i.dataset.field ?? ''];
            const box = other ? i.closest('tr')?.querySelector(`[data-field="${other}"]`) : null;
            if (box)
                box.disabled = i.value.trim() !== '';
        });
        $('table-body').addEventListener('change', e => { const i = e.target; if (i.dataset.score)
            saveScore(i); });
        $('close-podium').addEventListener('click', closePodium);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && podiumOpen) {
            e.preventDefault();
            closePodium();
        } });
        document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement)
            closePodium(); });
        $('table-body').addEventListener('keydown', e => {
            const i = e.target;
            if (e.key !== 'Enter' || !i.dataset.score)
                return;
            e.preventDefault();
            saveScore(i);
            const all = [...document.querySelectorAll('#table-body input[data-field]')].filter(x => x.dataset.field === i.dataset.field && (x === i || !x.disabled));
            all[all.indexOf(i) + 1]?.focus();
        });
        $('entry-form').addEventListener('submit', submitAthlete);
        $('delete-entry').addEventListener('click', () => { const id = $('entry-form').elements.namedItem('id').value; if (deleteAthlete(state.athletes.find(a => a.id === id)))
            $('entry-dialog').close(); });
        $('workout-form').addEventListener('submit', submitWorkout);
        $('workout-form').addEventListener('change', syncWorkoutForm);
        $('session-form').addEventListener('submit', submitEvent);
        $('session-form').addEventListener('change', syncEventForm);
        $('edit-competition').addEventListener('click', () => openEvent(true));
        $('new-event-button').addEventListener('click', () => openEvent(false));
        $('no-event-create').addEventListener('click', () => openEvent(false));
        $('delete-event').addEventListener('click', deleteEvent);
        function toggleEventList(open) { const list = document.querySelector('#event-selector .event-dd-list'); const toggle = document.querySelector('#event-selector .event-dd-toggle'); if (!list || !toggle)
            return; const show = open ?? list.hidden; list.hidden = !show; toggle.setAttribute('aria-expanded', String(show)); }
        document.addEventListener('click', event => { if (!event.target.closest('#event-selector'))
            toggleEventList(false); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape')
            toggleEventList(false); });
        $('event-selector').addEventListener('click', event => { const target = event.target; if (target.closest('.event-dd-toggle')) {
            toggleEventList();
            return;
        } const pick = target.closest('[data-event-id]'); toggleEventList(false); if (!pick || pick.dataset.eventId === store.selectedId)
            return; selectEvent(pick.dataset.eventId || ''); $('search').value = ''; rememberEvent(); render(); });
        $('search').addEventListener('input', render);
        $('settings-button').addEventListener('click', () => $('settings-dialog').showModal());
        $('export-button').addEventListener('click', exportExcel);
        $('backup-button').addEventListener('click', exportBackup);
        $('restore-button').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file)
                return;
            try {
                if (file.size > 15 * 1024 * 1024)
                    throw Error('Sauvegarde trop volumineuse.');
                // Mêmes règles qu’à la saisie : temps nul, au-delà du cap, temps et reps ensemble… sont refusés.
                const imported = Wod.validateStore(JSON.parse(await file.text()), true);
                const athletes = imported.events.reduce((n, ev) => n + ev.athletes.length, 0);
                if (!confirm(`Restaurer cette sauvegarde (${imported.events.length} événement(s), ${athletes} inscription(s)) ?\n\nLes données WOD actuelles seront remplacées. Une sauvegarde des données actuelles sera téléchargée avant.`))
                    return;
                if (store.events.length)
                    exportBackup();
                store = imported;
                selectEvent(imported.selectedId);
                rememberEvent();
                if (!save(true))
                    return;
                render();
                $('settings-dialog').close();
                toast('Sauvegarde restaurée.');
            }
            catch (error) {
                alert(error.message);
            }
        });
        $('import-file').addEventListener('change', e => { const input = e.target, file = input.files?.[0]; input.value = ''; if (file)
            void importFile(file); });
        $('no-event-demo').addEventListener('click', loadDemo);
        $('undo-button').addEventListener('click', undo);
        $('no-event-undo').addEventListener('click', undo);
        $('demo-settings').addEventListener('click', loadDemo);
        $('training-create').addEventListener('click', loadTraining);
        $('training-delete').addEventListener('click', () => deleteTrainings([state.id]));
        $('training-delete-all').addEventListener('click', () => deleteTrainings(store.events.map(e => e.id)));
        $('reset-button').addEventListener('click', () => {
            if (!confirm('Supprimer tous les événements WOD, inscriptions et scores ?\n\nUne sauvegarde des données actuelles sera téléchargée avant.'))
                return;
            if (store.events.length)
                exportBackup();
            store = Wod.emptyStore();
            selectEvent('');
            if (!save(false, 'remise à zéro'))
                return;
            view = 'athletes';
            render();
            $('settings-dialog').close();
        });
    }
    function rememberEvent() { try {
        localStorage.setItem(EVENT_KEY, state.id);
    }
    catch { /* Vue facultative. */ } }
    function exportBackup() { download(`sauvegarde-wod-${today()}.json`, JSON.stringify({ ...store, selectedId: state.id, history: [] }, null, 2), 'application/json'); }
    document.addEventListener('DOMContentLoaded', () => {
        load();
        bind();
        render();
        savedStatus(storageBlocked);
        void syncDisk();
        Temoin.surveiller(() => { void syncDisk(); });
        // Une autre fenêtre a enregistré : on affiche sa version au lieu de l’écraser plus tard.
        window.addEventListener('storage', event => {
            if (event.key !== KEY && event.key !== null)
                return;
            try {
                const latest = localStorage.getItem(KEY);
                if (latest === loadedRaw)
                    return;
                loadedRaw = latest;
                if (latest) {
                    adopt(latest);
                    storageBlocked = false;
                    render();
                    savedStatus();
                    toast('Données WOD mises à jour depuis une autre fenêtre.');
                }
                else {
                    storageBlocked = true;
                    savedStatus(true);
                    toast('Les données WOD ont été supprimées du navigateur. Faites une sauvegarde fichier.');
                }
            }
            catch {
                storageBlocked = true;
                savedStatus(true);
                toast('Les données WOD de l’autre fenêtre sont illisibles. Faites une sauvegarde fichier.');
            }
        });
        const tick = () => { $('wall-clock').textContent = new Date().toLocaleTimeString('fr-FR'); };
        tick();
        window.setInterval(tick, 1000);
    });
})(Wod || (Wod = {}));
