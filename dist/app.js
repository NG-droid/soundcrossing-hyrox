"use strict";
var PaceApp;
(function (PaceApp) {
    const { validateStore, validateSession, validateEntry, clock, label, identity, localDate, normalize, importRows } = Pace;
    const KEY = 'pace.hyrox.session.v1', BACKUP = `${KEY}.recovery`;
    const $ = (id) => {
        const element = document.getElementById(id);
        if (!element)
            throw Error(`Élément manquant : ${id}`);
        return element;
    };
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const fresh = () => ({ version: 4, revision: crypto.randomUUID(), savedAt: 0, session: { title: 'Soundcrossing', date: localDate(), races: [], entries: [] }, history: [], settings: { photoTemplate: 'club' } });
    let state = fresh(), loadedRaw = null, storageBlocked = false;
    const SAMPLE_PHOTO = '__exemple__';
    let view = 'participants', focusId = '', photoId = '';
    let photoReturnFocus = null, photoReturnScroll = 0, photoReturnHeight = 0;
    let podiumSelection = null, fullscreenOwned = false;
    let selectedRaceId = '', importRaceId = '';
    let activeFormat = 'all';
    let activeLevel = ''; // '' = tous les niveaux
    let selectedLevel = '';
    const lastEntryLevels = new Map();
    const lastEntryFormats = new Map();
    let selectedEntryFormat = '';
    let selectedGender1 = '', selectedGender2 = '';
    let resultMode = 'arrival', capturedArrival = null;
    let arrivalDraft = '';
    // Temps total tapé dans la case de temps unique (hh:mm:ss).
    let durationText = '';
    const editSnapshots = new WeakMap();
    const formatOptions = [{ key: 'H', label: 'Solo H' }, { key: 'F', label: 'Solo F' }, { key: 'HH', label: 'Duo HH' }, { key: 'FF', label: 'Duo FF' }, { key: 'HF', label: 'Duo HF' }, { key: 'SOLO', label: 'Solo à préciser' }];
    let toastTimer, confirmation = null;
    let importBook = null, sourceRows = [], headers = [], preview = [];
    const fields = [
        { key: 'name1', label: 'Participant 1', aliases: ['participant 1', 'participant1', 'nom', 'nom 1', 'nom1', 'participant', 'athlete', 'name'] },
        { key: 'name2', label: 'Participant 2', aliases: ['participant 2', 'participant2', 'nom 2', 'nom2', 'partenaire', 'binome'] },
        { key: 'format', label: 'Format', aliases: ['format', 'type', 'categorie', 'catégorie'] },
        { key: 'level', label: 'Niveau (Open / Pro)', aliases: ['niveau', 'level', 'division'] },
        { key: 'scheduled', label: 'Heure de départ', aliases: ['heure de depart', 'heure de passage', 'passage', 'heure', 'depart', 'heure depart'] },
    ];
    function toast(message, error = false) {
        const element = $('toast');
        element.textContent = message;
        element.classList.toggle('error', error);
        element.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => { element.hidden = true; }, error ? 10000 : 4500);
    }
    function savedStatus(error = false) { Temoin.navigateur(!error); }
    function load() {
        try {
            loadedRaw = localStorage.getItem(KEY);
            if (loadedRaw)
                state = validateStore(JSON.parse(loadedRaw));
            else {
                const recovery = localStorage.getItem(BACKUP);
                if (recovery) {
                    state = validateStore(JSON.parse(recovery));
                    localStorage.setItem(KEY, JSON.stringify(state));
                    loadedRaw = JSON.stringify(state);
                    toast('Session récupérée depuis la copie locale. Exportez une sauvegarde.');
                }
            }
        }
        catch {
            try {
                const recovery = localStorage.getItem(BACKUP);
                if (!recovery)
                    throw Error();
                state = validateStore(JSON.parse(recovery));
                if (loadedRaw)
                    localStorage.setItem(`${KEY}.damaged`, loadedRaw);
                loadedRaw = JSON.stringify(state);
                localStorage.setItem(KEY, loadedRaw);
                toast('Copie locale précédente récupérée. Vérifiez les derniers résultats.', true);
            }
            catch {
                storageBlocked = true;
                toast('Stockage illisible ou inaccessible. Importez une sauvegarde ou rétablissez le stockage de ce navigateur.', true);
            }
        }
        savedStatus(storageBlocked);
        try {
            selectedRaceId = localStorage.getItem(`${KEY}.event`) ?? '';
        }
        catch { /* Le choix de vue ne bloque pas les données. */ }
    }
    // Copie de la session sur le disque via server.py : elle survit à un navigateur qui efface ses données à la fermeture.
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
                    const response = await fetch('/data', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Base-Revision': diskRevision ?? '' }, body });
                    if (response.status === 409) {
                        Temoin.etat('conflit');
                        toast('La copie sur le disque a été modifiée par un autre navigateur : rien n’a été écrasé. Rechargez la page.', true);
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
                        toast('Copie sur le disque impossible. Gardez la fenêtre Soundcrossing ouverte et exportez une sauvegarde.', true);
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
            const response = await fetch('/data', { cache: 'no-store' });
            reached = true;
            if (response.status === 404)
                diskRevision = '';
            if (response.ok) {
                const raw = await response.json();
                diskRevision = revisionOf(raw);
                disk = validateStore(raw);
            }
        }
        catch { /* Pas de copie lisible : celle du navigateur reste la référence. */ }
        if (disk && (loadedRaw === null || storageBlocked || disk.savedAt > state.savedAt)) {
            const encoded = JSON.stringify(disk);
            try {
                localStorage.setItem(KEY, encoded);
                loadedRaw = encoded;
                storageBlocked = false;
            }
            catch { /* La session reste utilisable à l’écran. */ }
            state = disk;
            render();
            savedStatus(storageBlocked);
            toast('Données rechargées depuis la copie sur le disque.');
        }
        else if (loadedRaw !== null && !storageBlocked && (!disk || disk.savedAt < state.savedAt)) {
            saveToDisk(loadedRaw);
            return;
        }
        if (reached && !diskBusy)
            Temoin.etat('ok', disk?.savedAt);
        else if (!reached)
            Temoin.etat('erreur');
    }
    function persist(candidate, allowRecovery = false, expectedRaw = loadedRaw) {
        try {
            if (storageBlocked && !allowRecovery)
                throw Error('Stockage bloqué. Restaurez une sauvegarde avant de modifier la session.');
            const latest = localStorage.getItem(KEY);
            if (latest !== expectedRaw && !(allowRecovery && latest === null)) {
                if (latest) {
                    state = validateStore(JSON.parse(latest));
                    loadedRaw = latest;
                    render();
                }
                throw Error('La session a changé dans une autre fenêtre. Vérifiez la liste puis recommencez.');
            }
            const validated = validateStore(candidate);
            if (latest || allowRecovery && state.session.entries.length) {
                let old;
                try {
                    old = latest ? validateStore(JSON.parse(latest)) : validateStore(clone(state));
                }
                catch {
                    if (!allowRecovery)
                        throw Error('Sauvegarde actuelle invalide.');
                    old = validateStore(clone(state));
                }
                old.history = [];
                localStorage.setItem(BACKUP, JSON.stringify(old));
            }
            let encoded = JSON.stringify(validated);
            for (;;) {
                try {
                    localStorage.setItem(KEY, encoded);
                    break;
                }
                catch (error) {
                    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError' || validated.history.length === 0)
                        throw error;
                    validated.history.shift();
                    encoded = JSON.stringify(validated);
                }
            }
            state = validated;
            loadedRaw = encoded;
            storageBlocked = false;
            savedStatus();
            saveToDisk(encoded);
            return true;
        }
        catch (error) {
            savedStatus(true);
            toast(error instanceof Error ? `${error.message} Aucune modification appliquée.` : 'Échec de sauvegarde. Aucune modification appliquée.', true);
            return false;
        }
    }
    function assertDraftCurrent(form) {
        const snapshot = editSnapshots.get(form);
        if (!snapshot)
            throw Error('Rouvrez ce formulaire avant d’enregistrer.');
        Pace.assertEditUnchanged(state.session, snapshot);
    }
    function commit(description, mutate, form) {
        try {
            if (form)
                assertDraftCurrent(form);
            const candidate = clone(state);
            mutate(candidate.session);
            candidate.session = validateSession(candidate.session);
            candidate.history.push({ label: description, session: clone(state.session) });
            candidate.history = candidate.history.slice(-15);
            candidate.revision = crypto.randomUUID();
            candidate.savedAt = Date.now();
            if (!persist(candidate)) {
                const error = form?.querySelector('.form-error');
                if (error)
                    error.textContent = $('toast').textContent;
                return false;
            }
            render();
            return true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Modification impossible.';
            const fieldError = form?.querySelector('.form-error');
            if (fieldError)
                fieldError.textContent = message;
            toast(message, true);
            return false;
        }
    }
    function ask(title, message, action, button = 'Confirmer') {
        $('confirm-title').textContent = title;
        $('confirm-description').textContent = message;
        $('confirm-action').textContent = button;
        confirmation = action;
        $('confirm-dialog').showModal();
    }
    function entryById(id) { return state.session.entries.find(e => e.id === id); }
    const TRAINING_PILL = '<em class="event-pick-training">Entraînement</em>';
    function currentRace() { return state.session.races.find(race => race.id === selectedRaceId) ?? state.session.races[0]; }
    function raceEntries() {
        const race = currentRace(), ids = new Set(state.session.races.filter(r => r.date === race?.date).map(r => r.id));
        return state.session.entries.filter(entry => ids.has(entry.raceId) && (race?.format === 'MIXED' || entry.format === race?.format));
    }
    function raceLabel(race) { return new Date(`${race.date}T12:00:00`).toLocaleDateString('fr-FR'); }
    function eventFormatLabel(race) { return race.format === 'MIXED' ? 'Solo + Duo' : race.format === 'DUO' ? 'Duo' : 'Solo'; }
    // Départ affiché en hh:mm ; les secondes ne servent qu’au résultat.
    function departureText(entry) { return entry.startedAt === null ? entry.scheduled.slice(0, 5) || '—' : Pace.timeOfDay(entry.startedAt).slice(0, 5); }
    function resultRanking() {
        return Pace.eventRankingGroups(currentRace(), raceEntries()).filter(g => (!activeLevel || g.level === activeLevel) && (activeFormat === 'all' || g.format === activeFormat)).flatMap(g => Pace.rankingFor(state.session, g.format, currentRace()?.date ?? state.session.date, g.level));
    }
    // Tri choisi en cliquant sur les en-têtes, mémorisé par onglet (« Arrivées à compléter » suit Scores).
    const sortBy = {};
    const sortTable = () => view === 'live' ? 'scores' : view;
    function sortValue(e, key, ranks) {
        if (key === 'rank')
            return ranks.get(e.id);
        if (key === 'name')
            return label(e);
        if (key === 'format')
            return Pace.groupLabel(e.level, Pace.formatLabel(e));
        if (key === 'start')
            return departureText(e) === '—' ? null : departureText(e);
        if (key === 'arrival')
            return e.arrivedAt;
        if (key === 'time')
            return e.status === 'finished' ? e.durationMs : null;
        return null;
    }
    function filtered() {
        const search = normalize($('search').value), sort = sortBy[sortTable()] ?? null;
        if (view === 'results') {
            // Classements : on trie à l’intérieur de chaque catégorie (barre noire), les rangs ne changent pas.
            const ranking = resultRanking(), ranks = new Map(ranking.map(r => [r.entry.id, r.rank]));
            return Tri.appliquer(ranking.map(r => r.entry).filter(e => !search || normalize(label(e)).includes(search)), sort, (e, key) => sortValue(e, key, ranks), e => `${e.level}:${Pace.formatKey(e)}`);
        }
        // Ordre habituel : heure de départ, puis nom.
        const list = raceEntries().filter(e => (view !== 'live' || !Pace.isResolved(e)) && (activeFormat === 'all' || Pace.formatKey(e) === activeFormat) && (!activeLevel || e.level === activeLevel) && (!search || normalize(label(e)).includes(search))).sort((a, b) => (departureText(a) === '—' ? '99:99' : departureText(a)).localeCompare(departureText(b) === '—' ? '99:99' : departureText(b)) || label(a).localeCompare(label(b), 'fr'));
        return Tri.appliquer(list, sort, (e, key) => sortValue(e, key, new Map()));
    }
    function actionButton(action, id, text, css = '', title = '') {
        return `<button class="row-action ${css}" data-action="${action}" data-id="${esc(id)}"${title ? ` aria-label="${esc(title)}" title="${esc(title)}"` : ''}>${text}</button>`;
    }
    // Boutons texte « Modifier » / « Supprimer » : même modèle que l’app WOD.
    function textButton(action, id, text, css = '', title = '') {
        return `<button class="button compact${css ? ` ${css}` : ''}" data-action="${action}" data-id="${esc(id)}"${title ? ` aria-label="${esc(title)}" title="${esc(title)}"` : ''}>${text}</button>`;
    }
    function nameCell(e) {
        const names = `<span>${esc(e.name1)}</span>${e.format === 'DUO' ? `<span class="duo-join">&amp;</span><span>${esc(e.name2)}</span>` : ''}`;
        // Dans l’onglet Scores, tout se fait sur la ligne : le nom n’ouvre pas de fenêtre.
        return view === 'scores' ? `<td class="name-col"><span class="score-name duo-names">${names}</span></td>` : `<td class="name-col"><button class="names-button duo-names" data-action="${view === 'participants' ? 'edit' : 'result'}" data-id="${esc(e.id)}">${names}</button></td>`;
    }
    function arrivalText(e) {
        return e.arrivedAt === null ? '—' : `${Pace.timeOfDay(e.arrivedAt)}${e.startedAt !== null && localDate(new Date(e.arrivedAt)) !== localDate(new Date(e.startedAt)) ? '<small class="next-day-tag">+1 jour</small>' : ''}`;
    }
    function resultCells(e) {
        return `<td class="recorded-time">${arrivalText(e)}</td><td class="time-cell">${e.status === 'abandoned' || e.status === 'withdrawn' ? `<span class="outcome-badge">${Pace.statusLabel(e)}</span>` : e.durationMs === null ? '—' : clock(e.durationMs)}</td><td><div class="row-actions">${e.status === 'finished' ? actionButton('photo', e.id, 'Photo finish', 'photo-action') : ''}</div></td>`;
    }
    // Onglet Participants : on gère l’inscription (modifier, supprimer) ; les résultats se saisissent dans Scores.
    function participantCells(e) {
        return `<td><div class="row-actions">${textButton('edit', e.id, 'Modifier', '', `Modifier l’inscription de ${label(e)}`)}${textButton('delete', e.id, 'Supprimer', 'danger', `Supprimer l’inscription de ${label(e)}`)}</div></td>`;
    }
    // Onglet Scores : l’heure d’arrivée se tape dans la case, le reste se fait avec les boutons de la ligne.
    let unlockedId = '';
    function scoreCells(e) {
        const out = e.status === 'abandoned' || e.status === 'withdrawn';
        // Même case d’heure que l’heure de départ de l’inscription, avec les secondes.
        // Un temps enregistré est verrouillé : le crayon le rend modifiable.
        // Un forfait n’a pas d’heure à saisir : « Remettre en course » d’abord, sinon une heure tapée par erreur l’annulerait.
        const locked = e.status === 'finished' && unlockedId !== e.id || out;
        const arrival = `<div class="arrival-entry">${Saisie.box(`data-arrival="${esc(e.id)}"${locked ? ' disabled' : ''}`, e.arrivedAt === null ? '' : Pace.timeOfDay(e.arrivedAt), `Heure d’arrivée de ${esc(label(e))}`)}</div>`;
        const actions = [
            e.status === 'finished' ? textButton('photo', e.id, 'Photo finish', 'photo-action') : '',
            locked && !out ? textButton('unlock', e.id, 'Modifier', '', `Modifier le temps de ${label(e)}`) : '',
            out ? textButton('reinstate', e.id, 'Remettre en course') : textButton('withdraw', e.id, 'Forfait'),
            e.status === 'finished' ? textButton('clear', e.id, 'Effacer', 'danger', `Effacer le résultat de ${label(e)}`) : ''
        ].join('');
        return `<td>${arrival}</td><td class="time-cell">${out ? `<span class="outcome-badge">${Pace.statusLabel(e)}</span>` : e.durationMs === null ? '—' : clock(e.durationMs)}</td><td><div class="row-actions">${actions}</div></td>`;
    }
    function render() {
        const race = currentRace();
        selectedRaceId = race?.id ?? '';
        const entries = raceEntries(), visibleFormats = Pace.eventRankingFormats(race, entries);
        if (activeFormat !== 'all' && !visibleFormats.includes(activeFormat))
            activeFormat = 'all';
        if (!race?.levels.includes(activeLevel))
            activeLevel = '';
        const levelEntries = entries.filter(e => !activeLevel || e.level === activeLevel);
        $('level-chips').hidden = !race?.levels.length;
        $('level-chips').innerHTML = race?.levels.length ? [{ key: '', label: 'Tous les niveaux' }, ...race.levels.map(l => ({ key: l, label: l }))].map(option => `<button class="format-chip ${option.key ? `chip-level-${option.key.toLowerCase()}` : ''} ${activeLevel === option.key ? 'active' : ''}" data-level-filter="${esc(option.key)}" aria-pressed="${activeLevel === option.key}">${option.label}<small>${entries.filter(e => !option.key || e.level === option.key).length}</small></button>`).join('') : '';
        const running = entries.filter(e => !Pace.isResolved(e)).length, finished = entries.filter(e => e.status === 'finished').length;
        const finalResults = Pace.eventResultsFinal(state.session, race);
        $('results-progress').textContent = finalResults ? 'Résultats complets · Classements définitifs' : `${running} inscription${running > 1 ? 's' : ''} à compléter · Classements provisoires`;
        $('results-progress').hidden = !race || view !== 'results' || finalResults;
        $('csv-final-button').disabled = !finalResults;
        $('csv-final-button').title = finalResults ? 'Exporter tous les résultats et forfaits, par format, indépendamment de la recherche.' : 'Complétez les résultats ou indiquez Forfait pour chaque inscription.';
        $('session-title').textContent = race?.title ?? 'Votre prochain événement';
        $('event-format-badge').textContent = race ? eventFormatLabel(race) : '';
        $('event-format-badge').hidden = !race;
        $('training-banner').hidden = !race?.training;
        {
            const count = state.session.races.filter(r => r.training).length;
            $('training-delete-all').hidden = !count;
            $('training-delete-all').textContent = count > 1 ? `Supprimer les ${count} entraînements` : 'Supprimer l’entraînement';
        }
        $('session-date').textContent = race ? new Date(`${race.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Choisissez une date pour réunir tous les participants.';
        const addLabel = race ? race.format === 'DUO' ? '+ Ajouter un duo' : '+ Ajouter un participant' : '+ Créer un événement';
        $('new-race-button').textContent = state.session.races.length ? '+ Nouvel événement' : '+ Créer un événement';
        $('list-add').textContent = addLabel;
        $('session-button').hidden = !race;
        $('event-format-note').textContent = race?.format === 'DUO' ? 'Événement Duo — HH / FF / HF' : race?.format === 'SOLO' ? 'Événement Solo — H / F' : 'Événement Solo + Duo — tous les formats';
        $('race-selector-panel').hidden = state.session.races.length < 2;
        {
            const current = state.session.races.find(r => r.id === selectedRaceId) || state.session.races[0];
            $('race-selector').innerHTML = current ? `<button type="button" class="event-dd-toggle" aria-haspopup="listbox" aria-expanded="false"><span class="event-dd-current">${((r) => `<strong>${esc(r.title)}</strong><span>${esc(raceLabel(r))}<em class="event-pick-format">${eventFormatLabel(r)}</em>${r.training ? TRAINING_PILL : ''}</span>`)(current)}</span><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="event-dd-list" role="listbox" hidden>${state.session.races.map(r => `<button type="button" role="option" class="event-dd-option${r.id === current.id ? ' active' : ''}" data-event-id="${esc(r.id)}" aria-selected="${r.id === current.id}"><strong>${esc(r.title)}</strong><span>${esc(raceLabel(r))}<em class="event-pick-format">${eventFormatLabel(r)}</em>${r.training ? TRAINING_PILL : ''}</span></button>`).join('')}</div>` : '';
        }
        $('total-athletes').textContent = String(entries.reduce((n, e) => n + (e.format === 'DUO' ? 2 : 1), 0));
        for (const [id, count] of [['nav-count', entries.length], ['nav-live', running], ['nav-results', finished], ['nav-scores', finished], ['stat-teams', entries.length], ['stat-running', running], ['stat-finished', finished]])
            $(id).textContent = String(count);
        document.querySelectorAll('[data-view]').forEach(b => { const active = b.dataset.view === (view === 'live' ? 'participants' : view); b.classList.toggle('active', active); b.setAttribute('aria-current', active ? 'page' : 'false'); });
        $('view-title').innerHTML = `${view === 'results' ? 'Classements du jour' : view === 'live' ? 'Arrivées à compléter' : view === 'scores' ? 'Saisie des scores' : 'Participants du jour'} <span id="list-count"></span>`;
        $('view-description').textContent = view === 'scores' ? 'Tapez l’heure d’arrivée (heures, minutes, secondes) puis Entrée : le temps total se calcule et la case suivante est prête.' : view === 'results' ? `${finalResults ? 'Classements définitifs' : 'Classements provisoires : des inscriptions restent à compléter'}. Forfaits non classés. Les ex æquo partagent leur rang.` : race?.format === 'DUO' ? 'Les duos de la journée, classés par heure de départ.' : race?.format === 'SOLO' ? 'Les solos de la journée, classés par heure de départ.' : 'Tous les formats réunis, classés par heure de départ.';
        $('pending-filter').classList.toggle('active', view === 'live');
        $('pending-filter').setAttribute('aria-pressed', String(view === 'live'));
        $('format-chips').innerHTML = [{ key: 'all', label: 'Tout le monde' }, ...formatOptions.filter(option => visibleFormats.includes(option.key))].map(option => `<button class="format-chip ${option.key === 'all' ? '' : `chip-fmt-${option.key}`} ${activeFormat === option.key ? 'active' : ''}" data-filter="${option.key}" aria-pressed="${activeFormat === option.key}">${option.label}<small>${levelEntries.filter(e => option.key === 'all' || Pace.formatKey(e) === option.key).length}</small></button>`).join('');
        $('format-chips').hidden = !race;
        $('rank-heading').hidden = view !== 'results';
        // Le tableau connaît son onglet : largeurs et alignements des colonnes en dépendent (club.css).
        document.querySelector('.race-table').dataset.view = view;
        $('arrival-heading').hidden = $('total-heading').hidden = view === 'participants';
        $('list-add').hidden = $('import-button').hidden = $('list-template').hidden = view !== 'participants';
        $('show-podium-button').hidden = view === 'participants' || view === 'live';
        $('diploma-button').hidden = view !== 'results';
        $('rank-heading').dataset.label = finalResults ? 'RANG' : 'RANG PROVISOIRE';
        Tri.marquer($('entries-head'), sortBy[sortTable()] ?? null);
        const list = filtered();
        $('list-count').textContent = String(list.length);
        $('visible-count').textContent = `${list.length} départ${list.length > 1 ? 's' : ''} affiché${list.length > 1 ? 's' : ''}`;
        $('undo-button').disabled = !state.history.length;
        $('undo-button').title = state.history.at(-1)?.label ? `Annuler : ${state.history.at(-1).label.replace(/abandon/gi, 'Forfait')}` : 'Aucune modification à annuler';
        $('empty-state').hidden = entries.length !== 0 || view === 'results';
        $('export-button').disabled = view === 'results' ? !resultRanking().length : !entries.length;
        $('import-button').disabled = !race;
        $('template-button').disabled = $('list-template').disabled = !race;
        $('excel-help-button').disabled = !race;
        $('settings-event-context').textContent = race ? `${race.title} · ${raceLabel(race)} · ${eventFormatLabel(race)}` : 'Aucun événement : créez-en un pour préparer ou exporter ses fichiers.';
        $('export-button').textContent = view === 'results' ? 'Exporter le classement (Excel)' : 'Exporter la liste (Excel)';
        $('settings-export-hint').textContent = !race ? 'Excel des inscriptions et résultats.' : `${view === 'results' ? 'Excel : classement affiché.' : 'Excel : inscriptions, horaires et résultats.'} ${finalResults ? 'CSV final : tous les formats, forfaits inclus.' : 'CSV final : quand tout le monde a un résultat ou un forfait.'}`;
        $('empty-title').textContent = race ? 'La liste de départ est prête à remplir.' : 'Préparez votre événement Soundcrossing.';
        $('empty-description').textContent = race ? race.format === 'DUO' ? 'Ajoutez les duos HH/FF/HF et leurs heures de départ.' : race.format === 'SOLO' ? 'Ajoutez les solos H/F et leurs heures de départ.' : 'Ajoutez des solos H/F ou des duos HH/FF/HF, puis leurs heures de départ.' : 'Donnez un nom, une date et un format à l’événement.';
        $('empty-add').textContent = race ? 'Ajouter les participants' : 'Créer un événement';
        $('demo-button').hidden = state.session.races.length !== 0;
        const ranks = new Map(resultRanking().map(r => [r.entry.id, r.rank]));
        let previousFormat = '';
        $('entries-body').innerHTML = list.map(e => {
            const key = `${e.level}:${Pace.formatKey(e)}`, group = view === 'results' && (activeFormat === 'all' || !!race?.levels.length && !activeLevel) && previousFormat !== key ? `<tr class="ranking-group"><th colspan="7">${esc(Pace.groupLabel(e.level, Pace.formatLabel(e)))}</th></tr>` : '';
            previousFormat = key;
            return `${group}<tr>${view === 'results' ? `<td><span class="result-rank ${finalResults ? `rank-${ranks.get(e.id)}` : 'provisional'}">${ranks.get(e.id)}</span></td>` : ''}${nameCell(e)}<td>${e.level ? `<span class="level-badge level-${esc(e.level.toLowerCase())}">${esc(e.level)}</span>` : ''}<span class="format-badge ${e.format === 'DUO' ? 'duo' : ''} fmt-${Pace.formatKey(e)}">${esc(Pace.formatLabel(e))}</span></td><td class="recorded-time">${esc(departureText(e))}</td>${view === 'scores' || view === 'live' ? scoreCells(e) : view === 'participants' ? participantCells(e) : resultCells(e)}</tr>`;
        }).join('') || (entries.length || view === 'results' ? `<tr><td colspan="${view === 'results' ? 7 : view === 'participants' ? 4 : 6}" class="no-results">${view === 'results' ? 'Aucun résultat pour ce format à cette date.' : 'Aucun participant dans cette vue.'}</td></tr>` : '');
        const focusedEntries = view === 'results' ? list : entries;
        if (!focusedEntries.some(e => e.id === focusId))
            focusId = focusedEntries.find(e => !Pace.isResolved(e))?.id ?? focusedEntries.at(-1)?.id ?? '';
        if (photoId)
            renderPhoto();
        if (podiumSelection)
            renderFullPodium();
        tick();
        $('photo-template').value = state.settings.photoTemplate;
        $('show-podium-button').disabled = !finalResults || !resultRanking().length;
        $('show-podium-button').title = finalResults ? 'Afficher le top 3 final en plein écran, par catégorie.' : 'Disponible lorsque toutes les inscriptions ont un résultat ou un forfait.';
        $('data-description').textContent = `${state.session.entries.length} inscriptions, ${state.session.races.length} événement(s). À faire après chaque événement.`;
    }
    function tick() {
        $('wall-clock').textContent = new Date().toLocaleTimeString('fr-FR');
    }
    function podiumAwardMarkup(rank) {
        const metal = rank === 1 ? 'Or' : rank === 2 ? 'Argent' : 'Bronze';
        return `<div class="podium-award" aria-label="${rank === 1 ? '1er' : `${rank}e`} — ${metal}"><span class="podium-position-number" aria-hidden="true">0${rank}</span><span class="podium-metal-label" aria-hidden="true">${metal}</span></div>`;
    }
    function field(form, name) { return form.elements.namedItem(name); }
    function entryFormatFields() {
        const form = $('entry-form'), duo = selectedEntryFormat === 'DUO';
        form.classList.toggle('duo-registration', duo);
        $('name2-field').hidden = !duo;
        field(form, 'name2').required = duo;
    }
    function syncGenderFields() {
        document.querySelectorAll('[data-gender]').forEach(button => {
            const selected = button.dataset.person === '1' ? selectedGender1 : selectedGender2;
            button.setAttribute('aria-pressed', String(button.dataset.gender === selected));
        });
        document.querySelectorAll('[data-entry-format]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.entryFormat === selectedEntryFormat)));
        document.querySelectorAll('[data-entry-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.entryLevel === selectedLevel)));
        entryFormatFields();
        try {
            if (!selectedEntryFormat)
                throw Error('Choisissez Solo ou Duo.');
            const category = Pace.categoryFromGenders(selectedEntryFormat, selectedGender1, selectedGender2);
            const race = state.session.races.find(r => r.id === field($('entry-form'), 'raceId').value);
            if (race?.levels.length && !selectedLevel)
                throw Error('Choisissez le niveau : Open ou Pro.');
            $('registration-category').textContent = `Format : ${Pace.groupLabel(race?.levels.length ? selectedLevel : '', selectedEntryFormat === 'DUO' ? `Duo ${category}` : `Solo ${category}`)}`;
            $('registration-category').classList.add('complete');
        }
        catch (error) {
            $('registration-category').textContent = error instanceof Error ? error.message : 'Choisissez H ou F.';
            $('registration-category').classList.remove('complete');
        }
    }
    function chooseEntryFormat(format) {
        const race = state.session.races.find(r => r.id === field($('entry-form'), 'raceId').value);
        if (format && race && race.format !== 'MIXED' && format !== race.format)
            return;
        selectedEntryFormat = format;
        if (format !== 'DUO')
            selectedGender2 = '';
        $('entry-error').textContent = '';
        syncGenderFields();
    }
    function rememberEvent() { try {
        localStorage.setItem(`${KEY}.event`, selectedRaceId);
    }
    catch { /* Vue facultative. */ } }
    function openRace(id = '') {
        const form = $('session-form');
        form.reset();
        $('session-error').textContent = '';
        const race = state.session.races.find(item => item.id === id);
        field(form, 'id').value = race?.id ?? '';
        field(form, 'title').value = race?.title ?? 'Soundcrossing';
        field(form, 'date').value = race?.date ?? localDate();
        editSnapshots.set(form, Pace.captureEdit(state.session, 'race', race?.id ?? ''));
        if (race)
            form.querySelector(`[name="format"][value="${race.format}"]`).checked = true;
        form.querySelector(`[name="levels"][value="${race?.levels.length ? 'pro' : 'none'}"]`).checked = true;
        $('race-dialog-title').textContent = race ? 'Modifier l’événement' : 'Créer un événement';
        $('save-race-button').textContent = race ? 'Enregistrer' : 'Créer l’événement';
        $('session-dialog').showModal();
        field(form, 'title').focus();
    }
    function saveRace(event) {
        event.preventDefault();
        const form = $('session-form');
        try {
            assertDraftCurrent(form);
            const id = field(form, 'id').value, old = state.session.races.find(race => race.id === id);
            const format = new FormData(form).get('format');
            if (format !== 'SOLO' && format !== 'DUO' && format !== 'MIXED')
                throw Error('Choisissez le format de l’événement : Solo, Duo ou Solo + Duo.');
            const levels = new FormData(form).get('levels') === 'pro' ? Pace.LEVELS : [];
            const race = Pace.validateRace({ id: old?.id ?? crypto.randomUUID(), title: field(form, 'title').value.trim(), date: field(form, 'date').value, format, levels, previousTitles: old?.previousTitles ?? [], training: old?.training });
            if (old && old.date !== race.date && state.session.entries.some(e => e.raceId === id && e.startedAt !== null))
                throw Error('Des départs sont déjà enregistrés à cette date. Créez un nouvel événement pour une autre journée.');
            if (state.session.races.some(r => r.id !== race.id && normalize(r.title) === normalize(race.title) && r.date === race.date))
                throw Error('Cet événement existe déjà à cette date.');
            const incompatible = state.session.entries.find(e => e.raceId === race.id && race.format !== 'MIXED' && e.format !== race.format);
            if (incompatible)
                throw Error(`Des ${incompatible.format === 'DUO' ? 'duos' : 'solos'} sont déjà inscrits à cet événement. Choisissez Solo + Duo pour les conserver.`);
            const previousRaceId = selectedRaceId;
            selectedRaceId = race.id;
            if (commit(`${old ? 'modification' : 'création'} de l’événement ${race.title}`, session => {
                const index = session.races.findIndex(r => r.id === race.id);
                if (index >= 0)
                    session.races[index] = race;
                else
                    session.races.push(race);
                // Niveaux activés : les inscrits déjà là passent en Open (modifiable ensuite). Niveaux retirés : un seul classement.
                for (const e of session.entries)
                    if (e.raceId === race.id)
                        e.level = race.levels.length ? e.level || 'Open' : '';
            }, form)) {
                focusId = '';
                activeFormat = 'all';
                activeLevel = '';
                rememberEvent();
                $('session-dialog').close();
                render();
                toast('Événement enregistré.');
            }
            else
                selectedRaceId = previousRaceId;
        }
        catch (error) {
            $('session-error').textContent = error instanceof Error ? error.message : 'Événement invalide.';
        }
    }
    function openEntry(id = '') {
        if (!currentRace()) {
            openRace();
            return;
        }
        const form = $('entry-form');
        form.reset();
        $('entry-error').textContent = '';
        const entry = entryById(id), race = entry ? state.session.races.find(r => r.id === entry.raceId) : currentRace();
        field(form, 'id').value = entry?.id ?? '';
        field(form, 'raceId').value = race.id;
        editSnapshots.set(form, Pace.captureEdit(state.session, 'entry', entry?.id ?? '', race.id));
        $('entry-title').textContent = entry ? 'Modifier l’inscription' : race.format === 'DUO' ? 'Ajouter un duo' : 'Ajouter un participant';
        $('entry-format-choice').hidden = race.format !== 'MIXED';
        $('entry-level-choice').hidden = !race.levels.length;
        selectedLevel = race.levels.length ? entry?.level || lastEntryLevels.get(race.id) || '' : '';
        $('entry-course').textContent = `${race.title} · ${raceLabel(race)} · Événement ${eventFormatLabel(race)}`;
        $('delete-entry').hidden = !entry;
        for (const name of ['name1', 'name2'])
            if (entry)
                field(form, name).value = entry[name];
        if (entry)
            field(form, 'scheduled').value = (entry.startedAt === null ? entry.scheduled : Pace.timeOfDay(entry.startedAt)).slice(0, 5);
        const lastKind = lastEntryFormats.get(race.id) ?? '';
        const lastFormat = lastKind.startsWith('DUO_') ? 'DUO' : lastKind.startsWith('SOLO_') ? 'SOLO' : '';
        const format = entry?.format ?? (race.format === 'MIXED' ? lastFormat : race.format);
        selectedGender1 = entry?.gender1 ?? '';
        selectedGender2 = entry?.gender2 ?? '';
        chooseEntryFormat(format);
        $('scheduled-hint').textContent = entry?.arrivedAt ? entry.resultMode === 'duration' ? 'Modifier le départ conserve le temps total saisi et décale l’arrivée.' : 'Modifier le départ recalcule le temps total à partir de l’arrivée enregistrée.' : 'Heure de départ à la date de cette course (hh:mm).';
        $('entry-dialog').showModal();
        const genderChoice = form.querySelector('button[data-person="1"][data-gender="H"]');
        const needsGender = genderChoice && genderChoice.offsetParent !== null && !form.querySelector('button[data-person="1"][aria-pressed="true"]');
        (needsGender ? genderChoice : field(form, 'name1')).focus();
    }
    function saveEntry(event) {
        event.preventDefault();
        const form = $('entry-form'), get = (name) => field(form, name).value.trim();
        try {
            assertDraftCurrent(form);
            const old = entryById(get('id')), race = state.session.races.find(r => r.id === get('raceId'));
            if (!race)
                throw Error('La course n’existe plus.');
            const scheduled = Pace.parseScheduled(get('scheduled'));
            if (!scheduled)
                throw Error('Renseignez l’heure de départ.');
            let startedAt = old?.startedAt ?? null;
            if (startedAt !== null && scheduled.slice(0, 5) !== Pace.timeOfDay(startedAt).slice(0, 5))
                startedAt = Pace.plannedAt(race, { ...old, scheduled });
            // Un temps total saisi reste fixe : l’arrivée suit le départ. Une heure d’arrivée saisie reste fixe : le temps est recalculé.
            const keepDuration = old?.resultMode === 'duration';
            const durationMs = old?.arrivedAt && startedAt !== null && !keepDuration ? old.arrivedAt - startedAt : old?.durationMs ?? null;
            const arrivedAt = old?.arrivedAt && startedAt !== null && keepDuration && durationMs !== null ? startedAt + durationMs : old?.arrivedAt ?? null;
            if (durationMs !== null && durationMs <= 0)
                throw Error('Ce départ serait après l’arrivée. Corrigez les horaires.');
            if (!selectedEntryFormat)
                throw Error('Choisissez Solo ou Duo.');
            const format = selectedEntryFormat;
            Pace.assertRaceFormat(race, format);
            const category = Pace.categoryFromGenders(format, selectedGender1, selectedGender2);
            if (race.levels.length && !race.levels.includes(selectedLevel))
                throw Error('Choisissez le niveau : Open ou Pro.');
            const entry = validateEntry({ id: old?.id ?? crypto.randomUUID(), bib: old?.bib ?? '', raceId: race.id, name1: get('name1'), name2: format === 'DUO' ? get('name2') : '', format, category, level: race.levels.length ? selectedLevel : '', gender1: selectedGender1, gender2: selectedGender2, scheduled, startedAt, arrivedAt, durationMs, status: old?.status ?? 'waiting', resultMode: old?.resultMode ?? 'arrival' });
            if (state.session.entries.some(e => e.id !== entry.id && identity(e) === identity(entry)))
                throw Error('Ce participant ou duo est déjà inscrit à cette course.');
            if (!old && state.session.entries.length >= Pace.MAX_ENTRIES)
                throw Error('Limite de 3 000 départs par session.');
            Pace.plannedAt(race, entry);
            saveValidatedEntry(entry, !!old);
        }
        catch (error) {
            $('entry-error').textContent = error instanceof Error ? error.message : 'Saisie invalide.';
        }
    }
    function saveValidatedEntry(entry, editing) {
        const success = commit(`${editing ? 'modification' : 'ajout'} de ${label(entry)}`, session => {
            const index = session.entries.findIndex(e => e.id === entry.id);
            if (index >= 0)
                session.entries[index] = entry;
            else
                session.entries.push(entry);
        }, $('entry-form'));
        if (success) {
            lastEntryFormats.set(entry.raceId, `${entry.format}_${entry.category}`);
            lastEntryLevels.set(entry.raceId, entry.level);
            focusId = entry.id;
            $('entry-dialog').close();
            render();
            toast('Participant enregistré.');
        }
    }
    function undo() {
        const last = state.history.at(-1);
        if (!last)
            return;
        ask('Annuler la dernière modification ?', `Revenir avant : ${last.label.replace(/abandon/gi, 'Forfait')}. Les inscriptions, horaires et résultats précédents seront rétablis.`, () => {
            const candidate = clone(state);
            const snapshot = candidate.history.pop();
            candidate.session = snapshot.session;
            candidate.revision = crypto.randomUUID();
            candidate.savedAt = Date.now();
            if (persist(candidate)) {
                render();
                toast('Dernière modification annulée.');
            }
        }, 'Annuler la modification');
    }
    function openResult(id) {
        const entry = entryById(id);
        if (!entry)
            return;
        const race = state.session.races.find(r => r.id === entry.raceId);
        const form = $('result-form');
        form.reset();
        field(form, 'id').value = id;
        editSnapshots.set(form, Pace.captureEdit(state.session, 'entry', entry.id, race.id));
        capturedArrival = null;
        arrivalDraft = entry.arrivedAt === null ? '' : Pace.timeOfDay(entry.arrivedAt);
        durationText = entry.durationMs === null ? '' : clock(entry.durationMs);
        resultMode = entry.resultMode;
        syncResultMode();
        $('result-participant').textContent = label(entry);
        $('result-departure').textContent = `${race.title} · Départ : ${departureText(entry)}`;
        $('result-error').textContent = '';
        $('result-status').textContent = Pace.statusLabel(entry);
        $('result-status').hidden = entry.status !== 'abandoned' && entry.status !== 'withdrawn';
        $('reset-outcome').hidden = entry.status !== 'abandoned' && entry.status !== 'withdrawn';
        $('clear-result').hidden = entry.status !== 'finished';
        previewArrival();
        $('result-dialog').showModal();
        field(form, resultMode === 'duration' ? 'duration' : 'arrival').focus();
    }
    function syncResultMode() {
        const duration = resultMode === 'duration', input = field($('result-form'), 'arrival');
        document.querySelectorAll('[data-result-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.resultMode === resultMode)));
        input.disabled = duration;
        input.required = !duration;
        $('arrival-input-field').hidden = duration;
        $('duration-input-field').hidden = !duration;
        $('result-input-hint').textContent = duration ? 'Tapez le temps total : heures, minutes, secondes (ex. 010215 → 01:02:15).' : 'Tapez l’heure d’arrivée : heures, minutes, secondes (ex. 091530 → 09:15:30).';
        input.value = arrivalDraft;
        const total = field($('result-form'), 'duration');
        total.value = durationText;
        total.disabled = !duration;
        total.required = duration;
        $('arrival-now').hidden = duration;
        $('save-result-button').textContent = 'Enregistrer le résultat';
    }
    function resultFromInput(entry, race) {
        if (resultMode === 'duration') {
            const p = Saisie.parts(durationText);
            if (!p)
                throw Error('Renseignez le temps total.');
            return Pace.calculateDuration(race, entry, Pace.durationFromFields({ hours: String(p[0]), minutes: String(p[1]), seconds: String(p[2]) }));
        }
        const value = Saisie.clockTime(field($('result-form'), 'arrival').value);
        try {
            return Pace.calculateResultArrival(race, entry, value, capturedArrival);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('après minuit'))
                throw Error('L’heure d’arrivée précède le départ. Vérifiez l’heure ou saisissez le temps total.');
            throw error;
        }
    }
    function previewArrival() {
        const form = $('result-form'), entry = entryById(field(form, 'id').value);
        $('arrival-preview').classList.remove('complete', 'invalid');
        if (!entry || (resultMode === 'duration' ? !durationText : !field(form, 'arrival').value)) {
            $('arrival-preview').textContent = resultMode === 'duration' ? 'Saisissez le temps total ; l’arrivée sera calculée à partir du départ.' : 'Saisissez l’heure d’arrivée ; le temps total sera calculé.';
            return;
        }
        try {
            const race = state.session.races.find(r => r.id === entry.raceId);
            const result = resultFromInput(entry, race);
            $('arrival-preview').textContent = `Temps total : ${clock(result.durationMs)} · Arrivée : ${Pace.timeOfDay(result.arrivedAt)}${localDate(new Date(result.arrivedAt)) !== race.date ? ` (${new Date(result.arrivedAt).toLocaleDateString('fr-FR')})` : ''}`;
            $('arrival-preview').classList.add('complete');
        }
        catch (error) {
            $('arrival-preview').textContent = error instanceof Error ? error.message : 'Horaires invalides.';
            $('arrival-preview').classList.add('invalid');
        }
    }
    function captureArrival() {
        const form = $('result-form'), entry = entryById(field(form, 'id').value);
        try {
            if (!entry)
                throw Error('Participant introuvable.');
            const race = state.session.races.find(r => r.id === entry.raceId);
            const capture = Pace.arrivalNow(race, entry);
            capturedArrival = capture;
            resultMode = 'arrival';
            arrivalDraft = capture.arrivalTime;
            syncResultMode();
            $('result-error').textContent = '';
            previewArrival();
        }
        catch (error) {
            $('result-error').textContent = error instanceof Error ? error.message : 'Impossible de récupérer l’heure actuelle.';
        }
    }
    function saveResult(event) {
        event.preventDefault();
        const form = $('result-form'), id = field(form, 'id').value;
        try {
            assertDraftCurrent(form);
            const entry = entryById(id);
            if (!entry)
                throw Error('Participant introuvable.');
            const race = state.session.races.find(r => r.id === entry.raceId);
            const result = resultFromInput(entry, race);
            if (commit(`résultat de ${label(entry)}`, session => { const e = session.entries.find(e => e.id === id); Object.assign(e, result); e.status = 'finished'; e.resultMode = resultMode; }, form)) {
                $('result-dialog').close();
                if (event.submitter?.dataset.afterSave === 'photo')
                    openPhoto(id);
                else
                    toast('Résultat enregistré.');
            }
        }
        catch (error) {
            $('result-error').textContent = error instanceof Error ? error.message : 'Résultat invalide.';
        }
    }
    function renderPhoto() {
        if (photoId === SAMPLE_PHOTO) {
            renderSamplePhoto();
            return;
        }
        const e = entryById(photoId);
        if (!e || e.status !== 'finished') {
            closePresentation();
            return;
        }
        const race = state.session.races.find(r => r.id === e.raceId);
        $('photo-event').textContent = race.title;
        $('photo-date').textContent = new Date(`${race.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, first => first.toLocaleUpperCase('fr-FR'));
        $('photo-screen').dataset.template = state.settings.photoTemplate;
        $('photo-category').textContent = Pace.groupLabel(e.level, Pace.formatLabel(e));
        const rank = Pace.rankingFor(state.session, Pace.formatKey(e), race.date, e.level).find(r => r.entry.id === e.id)?.rank;
        const finalResults = Pace.eventResultsFinal(state.session, race);
        $('photo-rank').hidden = !finalResults || !rank;
        $('photo-rank').textContent = finalResults && rank ? `${rank === 1 ? '1er' : `${rank}e`} · ${Pace.groupLabel(e.level, Pace.formatLabel(e))}` : '';
        $('photo-names').innerHTML = `${esc(e.name1)}${e.format === 'DUO' ? `<span>&</span>${esc(e.name2)}` : ''}`;
        $('photo-time').textContent = clock(e.durationMs);
    }
    function recordOutcome(status) {
        const form = $('result-form');
        try {
            assertDraftCurrent(form);
        }
        catch (error) {
            $('result-error').textContent = error instanceof Error ? error.message : 'Rouvrez ce formulaire.';
            return;
        }
        const entry = entryById(field(form, 'id').value);
        if (!entry)
            return;
        const next = Pace.setOutcome(entry, status), caption = status === 'waiting' ? 'Remettre en course' : Pace.statusLabel(next);
        const apply = () => {
            if (commit(`${caption} : ${label(entry)}`, session => {
                const current = session.entries.find(e => e.id === entry.id);
                Object.assign(current, Pace.setOutcome(current, status));
            }, form)) {
                $('result-dialog').close();
                toast(`${caption} enregistré. Vous pouvez annuler cette modification.`);
            }
        };
        if (status === 'withdrawn')
            ask(`Confirmer le forfait ou l’abandon de ${label(entry)} ?`, entry.status === 'finished' ? 'Le temps et l’arrivée seront retirés du classement. L’inscription est conservée ; Annuler permet de rétablir le résultat.' : 'L’inscription est conservée, sans temps ni classement. « Remettre en course » ou Annuler permet de revenir en arrière.', apply, 'Confirmer le forfait');
        else
            apply();
    }
    // Aperçu du style sans arrivée enregistrée : participant fictif, rien n’est sauvegardé.
    function renderSamplePhoto() {
        const race = currentRace(), date = race?.date ?? new Date().toISOString().slice(0, 10);
        $('photo-event').textContent = race?.title ?? 'Exemple d’événement';
        $('photo-date').textContent = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, first => first.toLocaleUpperCase('fr-FR'));
        $('photo-screen').dataset.template = state.settings.photoTemplate;
        $('photo-category').textContent = 'Solo H';
        $('photo-rank').hidden = false;
        $('photo-rank').textContent = '1er · Solo H';
        $('photo-names').textContent = 'Participant exemple';
        $('photo-time').textContent = clock(3_725_000);
    }
    function openPhoto(id) {
        if (id === SAMPLE_PHOTO) {
            photoId = id;
            renderPhoto();
            openPresentation('photo-screen');
            return;
        }
        if (entryById(id)?.status !== 'finished')
            return;
        photoId = id;
        renderPhoto();
        openPresentation('photo-screen');
    }
    function openPodiumChooser() {
        const race = currentRace();
        if (!race || !Pace.eventResultsFinal(state.session, race))
            return;
        if (activeFormat !== 'all' && (!race.levels.length || activeLevel)) {
            openPodium(race.id, activeFormat, activeLevel);
            return;
        }
        const groups = Pace.eventRankingGroups(race, raceEntries()).filter(g => (!activeLevel || g.level === activeLevel) && (activeFormat === 'all' || g.format === activeFormat));
        $('podium-choice-context').textContent = `${race.title} · ${raceLabel(race)}`;
        $('podium-choice-buttons').innerHTML = groups.map(g => {
            const count = Pace.rankingFor(state.session, g.format, race.date, g.level).length;
            return `<button class="button" data-action="podium" data-format="${g.format}" data-level="${esc(g.level)}" data-race-id="${esc(race.id)}"${!count ? ' disabled' : ''}>${esc(Pace.groupLabel(g.level, formatName(g.format)))}<small>${count ? `${count} résultat${count > 1 ? 's' : ''}` : 'Aucun résultat'}</small></button>`;
        }).join('');
        $('podium-choice-dialog').showModal();
    }
    // Diplômes : un par participant classé affiché (filtres et recherche), avec sa place dans sa catégorie et son temps.
    function printDiplomas() {
        const race = currentRace();
        if (!race)
            return;
        const groups = Pace.eventRankingGroups(race, raceEntries()).map(g => Pace.rankingFor(state.session, g.format, race.date, g.level));
        const placed = new Map(groups.flatMap(list => list.map(r => [r.entry.id, { rank: r.rank, of: list.length }])));
        const list = filtered().flatMap(e => { const p = placed.get(e.id); return p && e.durationMs !== null ? [{ e, ...p }] : []; });
        if (!list.length) {
            toast('Aucun participant classé à imprimer avec ces filtres.');
            return;
        }
        const go = () => Diplome.print(list.map(({ e, rank, of }) => ({
            names: e.format === 'DUO' ? [e.name1, e.name2] : [e.name1], event: race.title, date: race.date, group: Pace.groupLabel(e.level, Pace.formatLabel(e)),
            phase: 'Classement', rank, of, resultLabel: 'Temps', result: clock(e.durationMs)
        })));
        if (Pace.eventResultsFinal(state.session, race))
            go();
        else
            ask('Classement provisoire', `Des inscriptions restent à compléter : les places imprimées peuvent encore changer. Imprimer quand même ${list.length} diplôme(s) ?`, go, 'Imprimer');
    }
    function formatName(format) { return formatOptions.find(option => option.key === format).label; }
    function openPodium(raceId, format, level = '') {
        try {
            const race = state.session.races.find(r => r.id === raceId);
            if (!race)
                throw Error('Événement introuvable.');
            if (!Pace.podiumFor(state.session, race, format, level).length)
                throw Error('Aucun résultat classé pour cette catégorie.');
            $('podium-choice-dialog').close();
            podiumSelection = { raceId, format, level };
            renderFullPodium();
            openPresentation('podium-screen');
        }
        catch (error) {
            toast(error instanceof Error ? error.message : 'Podium indisponible.', true);
        }
    }
    function renderFullPodium() {
        if (!podiumSelection)
            return;
        const race = state.session.races.find(r => r.id === podiumSelection.raceId);
        if (!race || !Pace.eventResultsFinal(state.session, race)) {
            closePresentation();
            return;
        }
        const places = Pace.podiumFor(state.session, race, podiumSelection.format, podiumSelection.level);
        if (!places.length) {
            closePresentation();
            return;
        }
        $('podium-event').textContent = race.title;
        $('podium-date').textContent = new Date(`${race.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, first => first.toLocaleUpperCase('fr-FR'));
        $('podium-category').textContent = Pace.groupLabel(podiumSelection.level, formatName(podiumSelection.format));
        $('podium-stage').innerHTML = [2, 1, 3].map(rank => {
            const entries = places.find(place => place.rank === rank)?.entries ?? [];
            return `<article class="podium-stage-card stage-${rank}${entries.length ? '' : ' is-empty'}">${entries.length ? podiumAwardMarkup(rank) + entries.map(entry => `<div class="podium-stage-winner"><div class="podium-stage-names"><span>${esc(entry.name1)}</span>${entry.format === 'DUO' ? `<span class="podium-stage-join">&amp;</span><span>${esc(entry.name2)}</span>` : ''}</div><div class="podium-stage-time">${clock(entry.durationMs)}</div></div>`).join('') : '<div class="podium-stage-rank">—</div><p>Place non attribuée</p>'}</article>`;
        }).join('');
    }
    function presentationActive() { return !!photoId || podiumSelection !== null; }
    function openPresentation(screenId) {
        photoReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        photoReturnScroll = document.scrollingElement?.scrollTop ?? window.scrollY;
        photoReturnHeight = document.documentElement.clientHeight;
        window.clearTimeout(toastTimer);
        $('toast').hidden = true;
        $(screenId).hidden = false;
        fullscreenOwned = false;
        document.body.style.overflow = 'hidden';
        void requestFullscreen(screenId);
    }
    async function requestFullscreen(screenId) {
        try {
            if (!document.fullscreenElement && $(screenId).requestFullscreen)
                await $(screenId).requestFullscreen();
            if (!presentationActive() && document.fullscreenElement === $(screenId))
                await document.exitFullscreen();
        }
        catch { /* La photo reste affichée sans commandes. */ }
    }
    function closePresentation() {
        if (!presentationActive())
            return;
        const id = photoId, scroll = photoReturnScroll, height = photoReturnHeight, previousFocus = photoReturnFocus, wasFullscreen = Boolean(document.fullscreenElement);
        photoId = '';
        podiumSelection = null;
        fullscreenOwned = false;
        $('photo-screen').hidden = true;
        $('podium-screen').hidden = true;
        document.body.style.overflow = '';
        const restore = () => {
            if (presentationActive())
                return;
            const row = [...document.querySelectorAll('[data-action="photo"]')].find(button => button.dataset.id === id);
            const previous = previousFocus?.isConnected && !previousFocus.closest('dialog') ? previousFocus : null;
            (row ?? previous ?? $('search')).focus({ preventScroll: true });
            if (document.scrollingElement)
                document.scrollingElement.scrollTop = scroll;
            else
                window.scrollTo(0, scroll);
        };
        const waitForViewport = () => {
            const started = performance.now();
            const frame = () => {
                if (presentationActive())
                    return;
                if ((!document.fullscreenElement && document.documentElement.clientHeight === height) || performance.now() - started > 500)
                    restore();
                else
                    window.requestAnimationFrame(frame);
            };
            window.requestAnimationFrame(frame);
        };
        if (wasFullscreen)
            void document.exitFullscreen().then(waitForViewport, waitForViewport);
        else
            waitForViewport();
    }
    function download(data, name, type) {
        const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    function exportBackup() { download(JSON.stringify(state, null, 2), `pace-session-${state.session.date}.json`, 'application/json'); toast('Sauvegarde exportée. Conservez le fichier téléchargé.'); }
    function exportFinalCSV() {
        try {
            const race = currentRace();
            if (!race)
                throw Error('Créez un événement.');
            download(Pace.finalResultsCSV(state.session, race), `soundcrossing-resultats-${race.date}.csv`, 'text/csv;charset=utf-8');
            toast('CSV final exporté : résultats et forfaits, classés par format.');
        }
        catch (error) {
            toast(error instanceof Error ? error.message : 'Export CSV impossible.', true);
        }
    }
    function openExcelHelp() {
        const race = currentRace();
        document.querySelectorAll('[data-excel-kind]').forEach(element => {
            element.hidden = !!race && race.format !== 'MIXED' && element.dataset.excelKind !== race.format;
        });
        $('excel-help-template').disabled = !race;
        $('excel-help-dialog').showModal();
    }
    // Modèle vierge : seulement les colonnes. Le fichier Excel ajoute des listes déroulantes et un onglet Légende.
    function templateColumns(race) {
        const formats = ['Solo H', 'Solo F', 'Duo HH', 'Duo FF', 'Duo HF'].filter(f => race.format === 'MIXED' || f.startsWith(race.format === 'DUO' ? 'Duo' : 'Solo'));
        return [
            { header: 'Format', choices: formats, help: 'Le format de l’inscription : Solo H ou F, Duo HH, FF ou HF (HF quel que soit l’ordre des noms).', width: 18 },
            { header: 'Participant 1', help: 'Prénom et nom.', width: 26 },
            { header: 'Participant 2', help: 'Prénom et nom du partenaire, pour un duo. Laisser vide pour un solo.', width: 26 },
            { header: 'Heure de départ', help: 'Heure à la date de l’événement, par exemple 09:00 ou 09:00:30.', width: 18 },
            ...(race.levels.length ? [{ header: 'Niveau', choices: race.levels, help: 'Open (charges standard) ou Pro (charges lourdes).', width: 12 }] : []),
        ];
    }
    function templateRows(race) { return [templateColumns(race).map(c => c.header)]; }
    // Modèle CSV pour Excel en français : séparateur « ; », accents conservés.
    function exportExcelTemplate() {
        const race = currentRace();
        if (!race) {
            openRace();
            return;
        }
        try {
            Modele.download(Modele.workbook(templateColumns(race)), 'soundcrossing-modele.xlsx');
        }
        catch {
            toast('Modèle Excel impossible. Utilisez le modèle CSV.', true);
        }
    }
    function exportExcel(template = false) {
        try {
            const race = currentRace();
            if (!race) {
                openRace();
                return;
            }
            const rows = template
                ? templateRows(race)
                : [['Rang dans le format', 'Événement', 'Date', 'Participant 1', 'H/F participant 1', 'Participant 2', 'H/F participant 2', 'Format', 'Catégorie', 'Heure de départ', 'Heure d’arrivée', 'Arrivée le lendemain', 'Temps total', 'Statut', 'Classement']];
            if (!template && race.levels.length)
                rows[0].push('Niveau');
            const ranked = view === 'results' ? resultRanking() : Pace.eventRankingGroups(race, raceEntries()).flatMap(g => Pace.rankingFor(state.session, g.format, race.date, g.level)), ranks = new Map(ranked.map(r => [r.entry.id, r.rank]));
            if (!template)
                for (const e of view === 'results' ? ranked.map(r => r.entry) : raceEntries()) {
                    const r = state.session.races.find(item => item.id === e.raceId);
                    rows.push([ranks.get(e.id) ?? '', r.title, r.date, e.name1, e.gender1, e.name2, e.gender2, e.format, e.category, departureText(e), e.arrivedAt === null ? '' : Pace.timeOfDay(e.arrivedAt), e.arrivedAt !== null && e.startedAt !== null && localDate(new Date(e.arrivedAt)) !== localDate(new Date(e.startedAt)) ? 'Oui' : '', e.durationMs === null ? '' : clock(e.durationMs), Pace.statusLabel(e), Pace.eventResultsFinal(state.session, r) ? 'Définitif' : 'Provisoire', ...(race.levels.length ? [e.level] : [])]);
                }
            const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(rows);
            sheet['!cols'] = (template ? [18, 26, 26, 21, 12] : [10, 32, 16, 26, 19, 26, 19, 12, 12, 21, 21, 24, 16, 20, 16]).map(wch => ({ wch }));
            XLSX.utils.book_append_sheet(book, sheet, 'Participants');
            XLSX.writeFile(book, template ? 'soundcrossing-modele.xlsx' : `pace-resultats-${race.date}.xlsx`);
        }
        catch {
            toast('Export Excel impossible. Exportez une sauvegarde de la session.', true);
        }
    }
    async function readImport(file) {
        try {
            const race = currentRace();
            if (!race)
                throw Error('Créez d’abord une course.');
            importRaceId = race.id;
            $('import-course').textContent = `Ajouter à « ${race.title} » (${raceLabel(race)}). Formats acceptés : ${race.format === 'DUO' ? 'Duo HH/FF/HF' : race.format === 'SOLO' ? 'Solo H/F' : 'Solo H/F et Duo HH/FF/HF'}.${race.levels.length ? ' Colonne Niveau : Open ou Pro.' : ''} Première ligne du fichier : noms des colonnes.`;
            if (file.size > 10 * 1024 * 1024)
                throw Error('Fichier trop volumineux (maximum 10 Mo).');
            if (!/\.(xlsx|xls)$/i.test(file.name))
                throw Error('Choisissez un fichier Excel (.xlsx).');
            const buffer = await file.arrayBuffer();
            importBook = /\.(csv|tsv)$/i.test(file.name)
                ? XLSX.read(Pace.decodeDelimited(buffer), { type: 'string', raw: true })
                : XLSX.read(buffer, { type: 'array', cellDates: false });
            if (!importBook.SheetNames.length)
                throw Error('Le fichier ne contient aucune feuille.');
            $('import-sheet').innerHTML = importBook.SheetNames.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
            selectSheet();
            $('import-dialog').showModal();
        }
        catch (error) {
            toast(error instanceof Error ? error.message : 'Impossible de lire ce fichier.', true);
        }
    }
    function selectSheet() {
        if (!importBook)
            return;
        try {
            const sheet = importBook.Sheets[$('import-sheet').value];
            if (!sheet)
                throw Error('Feuille introuvable.');
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: true });
            if (!rows.length)
                throw Error('La feuille est vide.');
            if (rows.length > Pace.MAX_ENTRIES + 1)
                throw Error('La feuille dépasse la limite de 3 000 lignes.');
            headers = rows[0].map((value, i) => String(value || `Colonne ${i + 1}`));
            if (headers.length > 100)
                throw Error('La feuille contient trop de colonnes (maximum 100).');
            sourceRows = rows.slice(1);
            $('import-mapping').innerHTML = fields.map(field => {
                const index = headers.findIndex(header => field.aliases.includes(normalize(header)));
                return `<label>${field.label}<select data-map="${field.key}"><option value="-1">— Non renseigné —</option>${headers.map((header, i) => `<option value="${i}"${index === i ? ' selected' : ''}>${esc(header)}</option>`).join('')}</select></label>`;
            }).join('');
            refreshImport();
        }
        catch (error) {
            sourceRows = [];
            preview = [];
            $('import-mapping').innerHTML = '';
            $('import-preview').innerHTML = '';
            $('import-summary').textContent = error instanceof Error ? error.message : 'Feuille illisible.';
            $('import-summary').classList.add('error');
            $('confirm-import').disabled = true;
        }
    }
    function refreshImport() {
        const mapping = { bib: -1, name1: -1, name2: -1, format: -1, category: -1, level: -1, scheduled: -1, duration: -1 };
        for (const field of fields)
            mapping[field.key] = Number(document.querySelector(`[data-map="${field.key}"]`).value);
        const selected = Object.values(mapping).filter(n => n >= 0);
        const duplicateMapping = new Set(selected).size !== selected.length;
        const race = state.session.races.find(r => r.id === importRaceId);
        if (!race) {
            $('confirm-import').disabled = true;
            $('import-summary').textContent = 'La course n’existe plus.';
            return;
        }
        preview = importRows(sourceRows, mapping, state.session.entries, race).filter((row, i) => sourceRows[i].some(cell => String(cell ?? '').trim()));
        const errors = preview.filter(r => r.error).length, duplicates = preview.filter(r => r.duplicate).length, valid = preview.filter(r => r.entry && !r.duplicate && !r.error).length;
        const exceeds = state.session.entries.length + valid > Pace.MAX_ENTRIES;
        $('import-summary').textContent = duplicateMapping ? 'Une même colonne est utilisée plusieurs fois. Corrigez les correspondances.' : exceeds ? 'L’import dépasserait 3 000 départs.' : `${valid} ligne${valid > 1 ? 's' : ''} à ajouter · ${duplicates} doublon${duplicates > 1 ? 's' : ''} ignoré${duplicates > 1 ? 's' : ''} · ${errors} erreur${errors > 1 ? 's' : ''}${errors ? '. Corrigez le fichier avant de poursuivre.' : ''}`;
        $('import-summary').classList.toggle('error', errors > 0 || duplicateMapping || exceeds);
        $('confirm-import').disabled = !valid || errors > 0 || duplicateMapping || exceeds;
        $('import-preview').innerHTML = `<table><thead><tr><th>Ligne</th><th>Participant / équipe</th><th>Format</th><th>Vérification</th></tr></thead><tbody>${preview.slice(0, 100).map(r => `<tr><td>${r.line}</td><td>${r.entry ? esc(label(r.entry)) : '—'}</td><td>${r.entry ? esc(Pace.groupLabel(r.entry.level, Pace.formatLabel(r.entry))) : '—'}</td><td class="${r.error ? 'error' : ''}">${esc(r.error || (r.duplicate ? 'Doublon ignoré' : 'Prêt à ajouter'))}</td></tr>`).join('')}</tbody></table>${preview.length > 100 ? '<p class="modal-note">Aperçu des 100 premières lignes. Toutes les lignes sont vérifiées.</p>' : ''}`;
    }
    async function restore(file) {
        try {
            if (file.size > 15 * 1024 * 1024)
                throw Error('Sauvegarde trop volumineuse.');
            const imported = validateStore(JSON.parse(await file.text()));
            const expectedRaw = localStorage.getItem(KEY);
            ask('Restaurer cette session ?', `« ${imported.session.title} » contient ${imported.session.entries.length} départs. La liste actuelle sera remplacée. Une sauvegarde de la session actuelle sera téléchargée avant le remplacement.`, () => {
                exportBackup();
                imported.revision = crypto.randomUUID();
                imported.savedAt = Date.now();
                if (persist(imported, true, expectedRaw)) {
                    focusId = '';
                    selectedRaceId = '';
                    render();
                    toast('Courses, horaires et résultats restaurés.');
                }
            }, 'Sauvegarder et restaurer');
        }
        catch (error) {
            toast(error instanceof Error ? error.message : 'Sauvegarde invalide.', true);
        }
    }
    // Mode entraînement : événement fictif, bien signalé, supprimable en un clic. Les vrais événements ne bougent pas.
    function openTraining() {
        $('settings-dialog').close();
        $('training-form').reset();
        trainingSummary();
        $('training-dialog').showModal();
    }
    function trainingChoice() {
        const data = new FormData($('training-form')), format = (String(data.get('format')) || 'DUO');
        return { format, people: Saisie.inscriptionsFictives(format, Number(data.get('count'))), withLevels: data.get('levels') === 'pro' };
    }
    function trainingSummary() { $('training-summary').textContent = `Sera créé : ${Saisie.resumeFictifs(trainingChoice().people)}.`; }
    function createTraining(event) {
        event.preventDefault();
        const { format, people, withLevels } = trainingChoice();
        const { race, entries } = Pace.trainingEvent(state.session.races, people, format, withLevels);
        if (commit(`création de l’entraînement ${race.title}`, session => { session.races.push(race); session.entries.push(...entries); })) {
            selectedRaceId = race.id;
            focusId = '';
            activeFormat = 'all';
            activeLevel = '';
            view = 'scores';
            $('search').value = '';
            rememberEvent();
            $('training-dialog').close();
            render();
            toast(`Entraînement créé : ${entries.length} inscriptions fictives. Saisissez les arrivées dans « Scores ».`);
        }
    }
    function deleteTrainings(ids) {
        const races = state.session.races.filter(r => r.training && ids.includes(r.id));
        if (!races.length)
            return;
        const one = races.length === 1;
        ask(one ? 'Supprimer cet entraînement ?' : `Supprimer les ${races.length} entraînements ?`, `${one ? `« ${races[0].title} », ses inscriptions et ses résultats fictifs seront supprimés.` : 'Tous les événements d’entraînement, leurs inscriptions et leurs résultats fictifs seront supprimés.'} Vos vrais événements ne sont pas touchés. La commande Annuler permet de revenir en arrière.`, () => {
            const gone = new Set(races.map(r => r.id));
            if (commit(one ? `suppression de l’entraînement ${races[0].title}` : 'suppression des entraînements', session => { session.races = session.races.filter(r => !gone.has(r.id)); session.entries = session.entries.filter(e => !gone.has(e.raceId)); })) {
                if (gone.has(selectedRaceId)) {
                    selectedRaceId = '';
                    focusId = '';
                    rememberEvent();
                }
                $('settings-dialog').close();
                render();
                toast(one ? 'Entraînement supprimé.' : 'Entraînements supprimés.');
            }
        }, 'Supprimer');
    }
    // ——— Onglet Scores : saisie directement dans le tableau, sans fenêtre ———
    function raceOf(entry) { return state.session.races.find(r => r.id === entry.raceId); }
    // Après un enregistrement, le tableau est redessiné : on remet le curseur dans la case où il était.
    function keepFocus(save, nextId = '') {
        const active = document.activeElement;
        const id = nextId || active?.dataset.arrival || '';
        if (!save() || !id)
            return;
        const box = document.querySelector(`[data-arrival="${CSS.escape(id)}"]`);
        if (box)
            box.focus();
    }
    function saveArrival(input, nextId = '') {
        const id = input.dataset.arrival ?? '', entry = entryById(id);
        if (!entry || entry.status === 'withdrawn' || entry.status === 'abandoned')
            return;
        try {
            const time = Saisie.clockTime(input.value), current = entry.arrivedAt === null ? '' : Pace.timeOfDay(entry.arrivedAt);
            if (!time) {
                input.value = current;
                if (current)
                    toast('Pour retirer ce résultat, utilisez la corbeille de la ligne.');
                return;
            }
            if (time === current && entry.status === 'finished') {
                input.value = current;
                if (unlockedId === id) {
                    unlockedId = '';
                    render();
                }
                keepFocus(() => true, nextId);
                return;
            }
            let result;
            try {
                result = Pace.calculateResultArrival(raceOf(entry), entry, time);
            }
            catch (error) {
                throw error instanceof Error && error.message.includes('après minuit') ? Error('L’heure d’arrivée est avant le départ. Vérifiez l’heure tapée.') : error;
            }
            if (unlockedId === id)
                unlockedId = '';
            keepFocus(() => commit(`résultat de ${label(entry)}`, session => { const e = session.entries.find(e => e.id === id); Object.assign(e, result); e.status = 'finished'; e.resultMode = 'arrival'; }), nextId);
        }
        catch (error) {
            input.classList.add('invalid');
            toast(error instanceof Error ? error.message : 'Heure invalide.', true);
        }
    }
    function setStatusInline(id, status) {
        const entry = entryById(id);
        if (!entry)
            return;
        const caption = status === 'waiting' ? 'Remettre en course' : 'Forfait';
        const apply = () => { if (commit(`${caption} : ${label(entry)}`, session => { const e = session.entries.find(e => e.id === id); Object.assign(e, Pace.setOutcome(e, status)); }))
            toast(`${caption} enregistré. Vous pouvez annuler cette modification.`); };
        if (status === 'withdrawn')
            ask(`Confirmer le forfait ou l’abandon de ${label(entry)} ?`, entry.status === 'finished' ? 'Le temps et l’arrivée seront retirés du classement. L’inscription est conservée ; Annuler permet de rétablir le résultat.' : 'L’inscription est conservée, sans temps ni classement. « Remettre en course » ou Annuler permet de revenir en arrière.', apply, 'Confirmer le forfait');
        else
            apply();
    }
    function clearResultInline(id) {
        const entry = entryById(id);
        if (!entry)
            return;
        ask('Effacer le résultat ?', `${label(entry)} : l’heure de départ est conservée. L’arrivée et le temps total sont retirés du classement.`, () => {
            commit(`retrait du résultat de ${label(entry)}`, session => { const e = session.entries.find(e => e.id === id); e.status = 'waiting'; e.arrivedAt = null; e.durationMs = null; });
        }, 'Effacer le résultat');
    }
    function deleteEntryInline(id) {
        const entry = entryById(id);
        if (!entry)
            return;
        ask('Supprimer cette ligne ?', `L’inscription de ${label(entry)}, ses horaires et son résultat seront supprimés. La commande Annuler permet de revenir en arrière.`, () => {
            commit(`suppression de ${label(entry)}`, session => { session.entries = session.entries.filter(item => item.id !== id); });
        }, 'Supprimer');
    }
    function handleAction(event) {
        const button = event.target.closest('[data-action]');
        if (!button)
            return;
        const id = button.dataset.id ?? '', action = button.dataset.action;
        if (action === 'focus') {
            focusId = id;
            render();
        }
        else if (action === 'edit')
            openEntry(id);
        else if (action === 'photo')
            openPhoto(id);
        else if (action === 'result')
            openResult(id);
        else if (action === 'withdraw')
            setStatusInline(id, 'withdrawn');
        else if (action === 'reinstate')
            setStatusInline(id, 'waiting');
        else if (action === 'clear')
            clearResultInline(id);
        else if (action === 'delete')
            deleteEntryInline(id);
        else if (action === 'unlock') {
            unlockedId = id;
            render();
            document.querySelector(`[data-arrival="${CSS.escape(id)}"]`)?.focus();
        }
        else if (action === 'podium')
            openPodium(button.dataset.raceId ?? '', button.dataset.format, button.dataset.level ?? '');
    }
    document.addEventListener('click', handleAction);
    Saisie.install();
    // Quitter une case enregistre l’heure ; on attend que le clic suivant ait placé le curseur.
    // La case d’heure change à chaque bloc tapé : on enregistre seulement en quittant la case (ou avec Entrée).
    $('entries-body').addEventListener('focusout', event => { const input = event.target; if (input.dataset.arrival)
        window.setTimeout(() => { if (input.isConnected)
            saveArrival(input); }); });
    $('entries-body').addEventListener('keydown', event => {
        const input = event.target;
        if (event.key !== 'Enter' || !input.dataset.arrival)
            return;
        event.preventDefault();
        // Case suivante encore à remplir : on saute les temps verrouillés et les forfaits.
        const boxes = [...document.querySelectorAll('#entries-body [data-arrival]')];
        saveArrival(input, boxes.slice(boxes.indexOf(input) + 1).find(box => !box.disabled)?.dataset.arrival ?? input.dataset.arrival);
    });
    // Un bouton cliqué juste après avoir tapé une heure est redessiné avec la ligne : on rejoue son clic.
    let pressed = null;
    document.addEventListener('pointerdown', event => { pressed = event.target.closest('#entries-body [data-action]'); }, true);
    document.addEventListener('pointerup', () => {
        const was = pressed;
        pressed = null;
        if (was && !was.isConnected)
            document.querySelector(`#entries-body [data-action="${was.dataset.action}"][data-id="${CSS.escape(was.dataset.id ?? '')}"]`)?.click();
    }, true);
    document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => b.closest('dialog')?.close()));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; render(); }));
    $('pending-filter').addEventListener('click', () => { view = view === 'live' ? 'participants' : 'live'; render(); });
    $('level-chips').addEventListener('click', event => { const button = event.target.closest('[data-level-filter]'); if (button) {
        activeLevel = button.dataset.levelFilter ?? '';
        render();
    } });
    $('format-chips').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (button) {
        activeFormat = button.dataset.filter;
        render();
    } });
    ['empty-add', 'list-add'].forEach(id => $(id).addEventListener('click', () => openEntry()));
    $('new-race-button').addEventListener('click', () => openRace());
    function toggleEventList(open) { const list = document.querySelector('#race-selector .event-dd-list'); const toggle = document.querySelector('#race-selector .event-dd-toggle'); if (!list || !toggle)
        return; const show = open ?? list.hidden; list.hidden = !show; toggle.setAttribute('aria-expanded', String(show)); }
    document.addEventListener('click', event => { if (!event.target.closest('#race-selector'))
        toggleEventList(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape')
        toggleEventList(false); });
    $('race-selector').addEventListener('click', event => { const target = event.target; if (target.closest('.event-dd-toggle')) {
        toggleEventList();
        return;
    } const pick = target.closest('[data-event-id]'); toggleEventList(false); if (!pick || pick.dataset.eventId === selectedRaceId)
        return; selectedRaceId = pick.dataset.eventId || ''; activeFormat = 'all'; focusId = ''; $('search').value = ''; rememberEvent(); render(); });
    $('template-button').addEventListener('click', exportExcelTemplate);
    $('list-template').addEventListener('click', exportExcelTemplate);
    $('excel-help-button').addEventListener('click', openExcelHelp);
    $('excel-help-template').addEventListener('click', exportExcelTemplate);
    $('export-button').addEventListener('click', () => exportExcel());
    $('csv-final-button').addEventListener('click', exportFinalCSV);
    $('show-podium-button').addEventListener('click', openPodiumChooser);
    $('diploma-button').addEventListener('click', printDiplomas);
    $('settings-button').addEventListener('click', () => $('settings-dialog').showModal());
    $('backup-button').addEventListener('click', exportBackup);
    $('restore-button').addEventListener('click', () => $('restore-file').click());
    $('help-button').addEventListener('click', () => $('help-dialog').showModal());
    $('photo-template').addEventListener('change', () => {
        const candidate = clone(state);
        candidate.settings.photoTemplate = $('photo-template').value;
        candidate.savedAt = Date.now();
        candidate.revision = crypto.randomUUID();
        if (persist(candidate))
            render();
        else
            render();
    });
    $('preview-photo').addEventListener('click', () => { const entry = raceEntries().find(e => e.status === 'finished'); $('settings-dialog').close(); openPhoto(entry?.id ?? SAMPLE_PHOTO); });
    const resetAll = () => {
        $('reset-dialog').close();
        if (commit('remise à zéro', session => { session.title = 'Soundcrossing'; session.date = localDate(); session.races = []; session.entries = []; })) {
            focusId = '';
            selectedRaceId = '';
            view = 'participants';
            activeFormat = 'all';
            render();
            toast('Tout est effacé. « Annuler » permet encore de revenir en arrière.');
        }
    };
    $('new-session-button').addEventListener('click', () => { $('settings-dialog').close(); $('reset-dialog').showModal(); $('reset-save').focus(); });
    $('reset-save').addEventListener('click', () => { exportBackup(); resetAll(); });
    $('reset-now').addEventListener('click', resetAll);
    $('demo-button').addEventListener('click', openTraining);
    $('training-create').addEventListener('click', openTraining);
    $('training-form').addEventListener('submit', event => createTraining(event));
    $('training-form').addEventListener('input', trainingSummary);
    $('training-delete').addEventListener('click', () => deleteTrainings([selectedRaceId]));
    $('training-delete-all').addEventListener('click', () => deleteTrainings(state.session.races.map(r => r.id)));
    $('undo-button').addEventListener('click', undo);
    $('search').addEventListener('input', render);
    // Clic sur un en-tête : croissant, décroissant, puis retour à l’ordre habituel.
    $('entries-head').addEventListener('click', event => { const key = event.target.closest('[data-sort]')?.dataset.sort; if (!key)
        return; sortBy[sortTable()] = Tri.suivant(sortBy[sortTable()] ?? null, key); render(); });
    $('entry-form').addEventListener('submit', event => saveEntry(event));
    document.querySelectorAll('[data-gender]').forEach(button => button.addEventListener('click', () => {
        if (button.dataset.person === '1')
            selectedGender1 = button.dataset.gender;
        else
            selectedGender2 = button.dataset.gender;
        $('entry-error').textContent = '';
        syncGenderFields();
    }));
    document.querySelectorAll('[data-entry-level]').forEach(button => button.addEventListener('click', () => { selectedLevel = button.dataset.entryLevel ?? ''; $('entry-error').textContent = ''; syncGenderFields(); }));
    document.querySelectorAll('[data-entry-format]').forEach(button => button.addEventListener('click', () => {
        const format = button.dataset.entryFormat;
        if (selectedEntryFormat !== format)
            chooseEntryFormat(format);
    }));
    $('result-form').addEventListener('submit', event => saveResult(event));
    $('arrival-now').addEventListener('click', captureArrival);
    $('mark-withdrawn').addEventListener('click', () => recordOutcome('withdrawn'));
    $('reset-outcome').addEventListener('click', () => recordOutcome('waiting'));
    const resultForm = $('result-form');
    resultForm.addEventListener('input', () => {
        if (resultMode === 'arrival')
            arrivalDraft = field(resultForm, 'arrival').value;
        else
            durationText = field(resultForm, 'duration').value;
        $('result-error').textContent = '';
        previewArrival();
    });
    document.querySelectorAll('[data-result-mode]').forEach(button => button.addEventListener('click', () => {
        resultMode = button.dataset.resultMode;
        syncResultMode();
        $('result-error').textContent = '';
        previewArrival();
    }));
    $('clear-result').addEventListener('click', () => {
        const id = field($('result-form'), 'id').value, entry = entryById(id);
        if (!entry)
            return;
        ask('Retirer le résultat ?', 'L’heure de départ sera conservée. L’arrivée et le temps total seront retirés du classement.', () => {
            if (commit(`retrait du résultat de ${label(entry)}`, session => { const e = session.entries.find(e => e.id === id); e.status = 'waiting'; e.arrivedAt = null; e.durationMs = null; }, $('result-form')))
                $('result-dialog').close();
        }, 'Retirer le résultat');
    });
    $('delete-entry').addEventListener('click', () => {
        const id = field($('entry-form'), 'id').value, e = entryById(id);
        if (!e)
            return;
        ask('Supprimer cette ligne ?', `L’inscription de ${label(e)}, ses horaires et son résultat seront supprimés. La commande Annuler permet de revenir en arrière.`, () => {
            if (commit(`suppression de ${label(e)}`, session => { session.entries = session.entries.filter(item => item.id !== id); }, $('entry-form')))
                $('entry-dialog').close();
        }, 'Supprimer');
    });
    $('session-button').addEventListener('click', () => openRace(currentRace()?.id));
    $('session-form').addEventListener('submit', event => saveRace(event));
    $('confirm-action').addEventListener('click', () => { const action = confirmation; confirmation = null; $('confirm-dialog').close(); action?.(); });
    $('confirm-dialog').addEventListener('close', () => { confirmation = null; });
    $('import-button').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', () => { const input = $('import-file'); if (input.files?.[0])
        void readImport(input.files[0]); input.value = ''; });
    $('restore-file').addEventListener('change', () => { const input = $('restore-file'); if (input.files?.[0])
        void restore(input.files[0]); input.value = ''; });
    $('import-sheet').addEventListener('change', selectSheet);
    $('import-mapping').addEventListener('change', refreshImport);
    $('confirm-import').addEventListener('click', () => {
        refreshImport();
        if ($('confirm-import').disabled)
            return;
        const additions = preview.filter(r => r.entry && !r.duplicate && !r.error).map(r => r.entry);
        if (commit('import de participants', session => { session.entries.push(...additions); })) {
            $('import-dialog').close();
            toast(`${additions.length} départs ajoutés.`);
        }
    });
    $('close-photo').addEventListener('click', closePresentation);
    $('close-podium').addEventListener('click', closePresentation);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && presentationActive()) {
        event.preventDefault();
        closePresentation();
    } });
    // Échap peut être consommé par le navigateur avant l’événement clavier.
    document.addEventListener('fullscreenchange', () => {
        const element = document.fullscreenElement;
        if (element && presentationActive() && (element.id === 'photo-screen' || element.id === 'podium-screen'))
            fullscreenOwned = true;
        else if (!element && fullscreenOwned && presentationActive())
            closePresentation();
    });
    window.addEventListener('storage', event => {
        if (event.key !== KEY && event.key !== null)
            return;
        try {
            const latest = localStorage.getItem(KEY);
            if (latest === loadedRaw)
                return;
            loadedRaw = latest;
            if (latest) {
                state = validateStore(JSON.parse(latest));
                storageBlocked = false;
                render();
                savedStatus();
                toast('Session mise à jour depuis une autre fenêtre.');
            }
            else {
                storageBlocked = true;
                savedStatus(true);
                toast('Le stockage a été supprimé. Exportez votre session avant de fermer.', true);
            }
        }
        catch {
            storageBlocked = true;
            savedStatus(true);
            toast('La sauvegarde externe est illisible. Exportez la session actuelle.', true);
        }
    });
    window.addEventListener('pageshow', tick);
    document.addEventListener('visibilitychange', tick);
    load();
    render();
    void syncDisk();
    Temoin.surveiller(() => { void syncDisk(); });
    window.setInterval(tick, 1000);
})(PaceApp || (PaceApp = {}));
