// Module WOD : interface de wod.html. Stockage séparé de l’app Hyrox.
namespace Wod {
  const KEY = 'soundcrossing-wod.v1', BACKUP = `${KEY}.recovery`, EVENT_KEY = `${KEY}.event`;
  type View = 'athletes' | 'workouts' | 'scores' | 'ranking';
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const uid = (): string => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now() + Math.random());

  let store: Store = emptyStore();
  // Événement affiché : toutes les vues travaillent dessus, comme l’événement choisi dans l’app Hyrox.
  let state: Competition = emptyCompetition('', '', today(), 'MIXED');
  function selectEvent(id: string): void {
    const found = store.events.find(e => e.id === id) ?? store.events[0];
    store.selectedId = found?.id ?? '';
    state = found ?? emptyCompetition('', '', today(), 'MIXED');
  }
  const LEVEL_HELP: Record<string, string> = { RX: 'Charges et mouvements officiels', Scaled: 'Version allégée' };
  const dateLabel = (date: string): string => date ? new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR') : 'sans date';
  let view: View = 'athletes';
  let selectedWod = '';
  let rankingTab = 'general';
  let rankingCat = '';
  let scoreGroup = 'all';
  let scoreLevel = '';
  let onlyTodo = false;
  let rankingLevel = '';
  let entryLevel = '';

  // Mêmes protections que l’app Hyrox : on n’écrase jamais une version plus récente d’une autre fenêtre,
  // l’écran n’affiche une modification qu’une fois enregistrée, et la version précédente reste en secours.
  let loadedRaw: string | null = null, storageBlocked = false;
  let committed = JSON.stringify(store); // dernier état réellement enregistré, pour annuler une modification refusée
  function adopt(raw: string): void {
    store = validateStore(JSON.parse(raw)); committed = JSON.stringify(store);
    let remembered = '';
    try { remembered = localStorage.getItem(EVENT_KEY) ?? ''; } catch { /* Vue facultative. */ }
    selectEvent(state.id && store.events.some(e => e.id === state.id) ? state.id : remembered || store.selectedId);
  }
  function load(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
      if (raw) adopt(raw); else { const recovery = localStorage.getItem(BACKUP); if (recovery) { adopt(recovery); raw = JSON.stringify(store); localStorage.setItem(KEY, raw); } }
      loadedRaw = raw;
    } catch {
      try {
        const recovery = localStorage.getItem(BACKUP);
        if (!recovery) throw Error();
        adopt(recovery);
        if (raw) localStorage.setItem(`${KEY}.damaged`, raw);
        loadedRaw = JSON.stringify(store); localStorage.setItem(KEY, loadedRaw);
        toast('Copie précédente des données WOD récupérée. Vérifiez les derniers scores.');
      } catch { storageBlocked = true; toast('Les données WOD enregistrées sont illisibles. Restaurez une sauvegarde (Paramètres).'); }
    }
    selectEvent(state.id || store.selectedId);
  }
  // Enregistre store ; en cas d’échec, l’écran revient au dernier état enregistré. recovery : restauration volontaire.
  function save(recovery = false): boolean {
    try {
      if (storageBlocked && !recovery) throw Error('Stockage illisible : restaurez une sauvegarde avant de modifier.');
      const latest = localStorage.getItem(KEY);
      if (!recovery && latest !== loadedRaw) {
        if (latest) { loadedRaw = latest; adopt(latest); }
        throw Error('Les données WOD ont changé dans une autre fenêtre. Vérifiez puis recommencez.');
      }
      const candidate = validateStore({ ...store, selectedId: state.id, revision: uid(), savedAt: Date.now() });
      const encoded = JSON.stringify(candidate);
      if (latest) {
        let readable = true;
        try { validateStore(JSON.parse(latest)); } catch { readable = false; }
        localStorage.setItem(readable ? BACKUP : `${KEY}.damaged`, latest);
      }
      localStorage.setItem(KEY, encoded);
      loadedRaw = encoded; storageBlocked = false; adopt(encoded); savedStatus(); saveToDisk(encoded);
      return true;
    } catch (error) {
      try { adopt(committed); } catch { /* L’état précédent était déjà validé. */ }
      savedStatus(true); render();
      toast(`${error instanceof Error && error.message ? error.message : 'Impossible d’enregistrer dans ce navigateur.'} Aucune modification appliquée.`);
      return false;
    }
  }
  // Copie sur le disque via server.py, comme pour l’Hyrox : elle survit à un navigateur qui efface ses données.
  let diskPending: string | null = null, diskBusy = false, diskWarned = false;
  function saveToDisk(raw: string): void {
    if (typeof fetch !== 'function' || location.protocol === 'file:') return;
    diskPending = raw;
    if (diskBusy) return;
    diskBusy = true;
    void (async () => {
      while (diskPending !== null) {
        const body = diskPending; diskPending = null;
        try {
          const response = await fetch('/data/wod', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
          if (response.status === 409) { toast('Une version WOD plus récente est enregistrée sur le disque (autre navigateur). Rechargez la page.'); continue; }
          if (!response.ok) throw Error();
          diskWarned = false;
        } catch {
          if (!diskWarned) { diskWarned = true; toast('Copie sur le disque impossible. Gardez la fenêtre Soundcrossing ouverte et faites une sauvegarde fichier.'); }
        }
      }
      diskBusy = false;
    })();
  }
  async function syncDisk(): Promise<void> {
    if (typeof fetch !== 'function' || location.protocol === 'file:') return;
    let disk: Store | null = null;
    try {
      const response = await fetch('/data/wod', { cache: 'no-store' });
      if (response.ok) disk = validateStore(await response.json());
    } catch { /* Pas de copie lisible : celle du navigateur reste la référence. */ }
    if (disk && (loadedRaw === null || storageBlocked || (disk.savedAt ?? 0) > (store.savedAt ?? 0))) {
      const encoded = JSON.stringify(disk);
      try {
        const damaged = storageBlocked ? localStorage.getItem(KEY) : null;
        if (damaged) localStorage.setItem(`${KEY}.damaged`, damaged); else if (loadedRaw) localStorage.setItem(BACKUP, loadedRaw);
        localStorage.setItem(KEY, encoded); loadedRaw = encoded; storageBlocked = false; } catch { /* Données utilisables à l’écran. */ }
      adopt(encoded); render(); savedStatus(storageBlocked);
      toast('Données WOD rechargées depuis la copie sur le disque.');
    } else if (loadedRaw !== null && !storageBlocked && (!disk || (disk.savedAt ?? 0) < (store.savedAt ?? 0))) saveToDisk(loadedRaw);
  }
  function savedStatus(error = false): void {
    const element = $('save-status'); element.classList.toggle('error', error);
    element.innerHTML = `<i></i>${error ? 'Enregistrement indisponible' : 'Modifications enregistrées'}`;
  }
  let toastTimer = 0;
  function toast(text: string): void {
    const el = $('toast'); el.textContent = text; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el.hidden = true; }, 3500);
  }
  function download(name: string, content: BlobPart, type: string): void {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function render(): void {
    const hasEvent = store.events.length > 0;
    $('no-event').hidden = hasEvent; $('event-content').hidden = !hasEvent;
    $('edit-competition').hidden = !hasEvent; $('event-format-badge').hidden = !hasEvent;
    $('new-event-button').textContent = hasEvent ? '+ Nouvel événement' : '+ Créer un événement';
    $('event-selector-panel').hidden = store.events.length < 2;
    $('event-selector').innerHTML = store.events.map(e => `<option value="${esc(e.id)}"${e.id === store.selectedId ? ' selected' : ''}>${esc(e.title)} · ${esc(dateLabel(e.date))} · ${eventFormatLabel(e.format)}</option>`).join('');
    if (!hasEvent) { $('title').textContent = 'Compétition WOD'; $('session-date').textContent = 'Créez un événement pour commencer.'; return; }
    $('title').textContent = state.title;
    $('event-format-badge').textContent = `${eventFormatLabel(state.format)} · WOD`;
    $('session-date').textContent = state.date ? new Date(`${state.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Choisissez une date pour la compétition.';
    $('count-athletes').textContent = String(state.athletes.length);
    $('count-workouts').textContent = String(state.workouts.length);
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('chips').innerHTML = ''; $('chips2').innerHTML = ''; $('chips3').innerHTML = ''; $('view-actions').innerHTML = '';
    (document.querySelector('.wod-table') as HTMLElement).classList.toggle('wod-ranking', view === 'ranking');
    $('podium-footer').hidden = true;
    ({ athletes: renderAthletes, workouts: renderWorkouts, scores: renderScores, ranking: renderRanking })[view]();
  }
  function setTable(head: string[], rows: string[], emptyText: string): void {
    $('table-head').innerHTML = `<tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>`;
    $('table-body').innerHTML = rows.join('');
    $('empty').hidden = rows.length > 0;
    $('empty-text').textContent = emptyText;
    (document.querySelector('.wod-table') as HTMLElement).hidden = rows.length === 0;
  }
  function heading(title: string, description: string, actions = ''): void {
    $('view-title').textContent = title; $('view-description').textContent = description; $('view-actions').innerHTML = actions;
  }
  function chips(target: string, items: { key: string; label: string; css?: string }[], active: string, attr: string): void {
    $(target).innerHTML = items.map(i => `<button class="format-chip${i.css ? ` ${i.css}` : ''}${i.key === active ? ' active' : ''}" data-${attr}="${esc(i.key)}">${esc(i.label)}</button>`).join('');
  }

  function badge(a: Athlete): string { const c = category(a); return `<span class="format-badge fmt-${c}">${esc(categoryLabel(c))}</span>`; }
  async function importFile(file: File): Promise<void> {
    try {
      if (file.size > 10 * 1024 * 1024) throw Error('Fichier trop volumineux (maximum 10 Mo).');
      const buffer = await file.arrayBuffer();
      const book = /\.(csv|tsv|txt)$/i.test(file.name) ? XLSX.read(decodeText(buffer), { type: 'string', raw: true }) : XLSX.read(buffer, { type: 'array' });
      const sheet = book.Sheets[book.SheetNames[0] ?? '']; if (!sheet) throw Error('Le fichier est vide.');
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
      const result = importAthletes(rows, state, uid);
      if (result.errors.length) { alert(`Import annulé, rien n’a été ajouté. Corrigez le fichier :\n\n${result.errors.slice(0, 8).join('\n')}${result.errors.length > 8 ? `\n… et ${result.errors.length - 8} autre(s) erreur(s).` : ''}`); return; }
      if (!result.athletes.length) { toast(result.duplicates ? 'Tous ces participants sont déjà inscrits.' : 'Aucun participant trouvé dans le fichier.'); return; }
      const doublons = result.duplicates ? `\n${result.duplicates} déjà inscrit(s) seront ignorés.` : '';
      if (!confirm(`Ajouter ${result.athletes.length} inscription(s) à « ${state.title} » ?${doublons}`)) return;
      state.athletes.push(...result.athletes); if (!save()) return; render(); toast(`${result.athletes.length} inscription(s) ajoutée(s).`);
    } catch (error) { toast(error instanceof Error ? error.message : 'Impossible de lire ce fichier.'); }
  }
  function renderAthletes(): void {
    const help = state.format === 'SOLO' ? 'Inscrivez les participants. La catégorie H ou F est calculée toute seule.' : state.format === 'DUO' ? 'Inscrivez les duos. La catégorie HH, FF ou HF est calculée toute seule.' : 'Inscrivez les solos et les duos. La catégorie (H, F, HH, FF, HF) est calculée toute seule.';
    heading('Participants', help, `<button class="button" data-action="import-template-xlsx" title="Fichier vierge avec listes déroulantes et légende">Modèle Excel</button><button class="button" data-action="import-athletes" title="Fichier Excel : Format, Participant 1, Participant 2${state.levels.length ? ', Niveau' : ''}">Importer (Excel)</button><button class="button primary" data-action="add-athlete">+ ${state.format === 'DUO' ? 'Ajouter un duo' : 'Ajouter un participant'}</button>`);
    const rows = state.athletes.map(a =>
      `<tr><td><strong>${esc(athleteLabel(a))}</strong></td><td>${a.level ? `<span class="level-badge level-${esc(a.level.toLowerCase())}">${esc(a.level)}</span>` : ''}${badge(a)}</td><td class="actions"><button class="button compact" data-edit-athlete="${a.id}">Modifier</button><button class="button compact danger" data-delete-athlete="${a.id}">Supprimer</button></td></tr>`);
    setTable(['PARTICIPANT / DUO', 'CATÉGORIE', ''], rows, 'Aucun participant pour l’instant.');
  }

  function workoutDetails(w: Workout): string {
    const parts: string[] = [];
    if (w.capMinutes) parts.push(w.type === 'time' ? `Time cap ${w.capMinutes} min` : `${w.capMinutes} min`);
    if (w.type === 'time' && w.totalReps) parts.push(`${w.totalReps} reps au total`);
    if (w.type === 'amrap' && w.repsPerRound) parts.push(`${w.repsPerRound} reps par tour`);
    return parts.join(' · ');
  }
  function renderWorkouts(): void {
    heading('WOD', 'Ajoutez chaque épreuve et choisissez comment elle se classe.', '<button class="button primary" data-action="add-workout">+ Ajouter un WOD</button>');
    const rows = state.workouts.map((w, i) =>
      `<tr><td class="rank">${i + 1}</td><td><strong>${esc(w.name)}</strong><div class="wod-desc">${esc(w.description)}</div></td><td>${esc(TYPE_LABELS[w.type])}<div class="muted">${esc(workoutDetails(w))}</div></td><td class="actions"><button class="button compact" data-edit-workout="${w.id}">Modifier</button><button class="button compact danger" data-delete-workout="${w.id}">Supprimer</button></td></tr>`);
    setTable(['N°', 'WOD', 'CLASSEMENT', ''], rows, 'Aucun WOD pour l’instant.');
  }

  function currentWod(): Workout | undefined {
    if (!state.workouts.some(w => w.id === selectedWod)) selectedWod = state.workouts[0]?.id ?? '';
    return state.workouts.find(w => w.id === selectedWod);
  }
  function inputsFor(w: Workout, a: Athlete): string {
    const s = state.scores[w.id]?.[a.id];
    if (s?.forfeit) return `<span class="outcome-badge">Forfait</span>`;
    const field = (name: string, value: number | string | undefined, ph: string, mode = 'numeric', off = false): string =>
      `<input data-score="${a.id}" data-field="${name}" value="${esc(value ?? '')}" placeholder="${ph}" inputmode="${mode}" aria-label="${ph}"${off ? ' disabled' : ''}>`;
    if (w.type === 'time') {
      // Temps du chrono (durée, pas une heure) : mm:ss si le cap fait moins d’une heure, sinon hh:mm:ss.
      const short = shortTime(w);
      // Soit un temps (fini), soit des reps (stoppé au cap) : la case remplie grise l’autre.
      const time = Saisie.box(`data-score="${a.id}" data-field="time"${s?.reps !== undefined ? ' disabled' : ''}`, Saisie.fromMs(s?.timeMs, short), `Temps réalisé ${short ? 'mm:ss' : 'hh:mm:ss'}`, short);
      return `<div class="score-inputs">${time}<span>ou, si stoppé au cap :</span>${field('reps', s?.timeMs === undefined ? s?.reps : '', 'Reps faites', 'numeric', s?.timeMs !== undefined)}</div>`;
    }
    if (w.type === 'load') return `<div class="score-inputs">${field('kg', s?.kg, 'Kg', 'decimal')}<span>kg</span></div>`;
    if (w.type === 'amrap' && w.repsPerRound) {
      const reps = s?.reps;
      const rounds = reps === undefined ? '' : Math.floor(reps / w.repsPerRound), rest = reps === undefined ? '' : reps % w.repsPerRound;
      return `<div class="score-inputs">${field('rounds', rounds, 'Tours')}<span>tours +</span>${field('rest', rest, 'Reps')}<span>reps</span></div>`;
    }
    return `<div class="score-inputs">${field('reps', s?.reps, 'Reps')}<span>reps</span></div>`;
  }
  const shortTime = (w: Workout): boolean => !!w.capMinutes && w.capMinutes < 60;
  const capText = (w: Workout): string => w.capMinutes ? `${w.capMinutes} min` : '';
  // Sélecteur de WOD : une barre d’onglets avec le nom, le type et le cap de chaque épreuve.
  function wodPicker(items: { key: string; label: string; sub: string }[], active: string, attr: string): void {
    $('chips').innerHTML = `<div class="wod-picker" role="tablist">${items.map(i => `<button role="tab" aria-selected="${i.key === active}" class="${i.key === active ? 'active' : ''}" data-${attr}="${esc(i.key)}"><strong>${esc(i.label)}</strong><small>${esc(i.sub)}</small></button>`).join('')}</div>`;
  }
  const wodTab = (w: Workout): { key: string; label: string; sub: string } => ({ key: w.id, label: w.name, sub: [TYPE_LABELS[w.type], w.capMinutes ? `${w.type === 'time' ? 'cap ' : ''}${capText(w)}` : ''].filter(Boolean).join(' · ') });
  // Niveaux qui ont au moins un inscrit, dans l’ordre de l’événement.
  function levelsUsed(): string[] { return state.levels.filter(l => state.athletes.some(a => a.level === l)); }
  function shortGroup(g: string, level: string): string { return level ? g.slice(level.length + 3) : g; }
  // Mêmes couleurs que les étiquettes : niveau (Scaled bleu, RX rouge) et format (Solo H bleu…).
  const levelChip = (l: string): { key: string; label: string; css: string } => ({ key: l, label: l, css: `chip-level-${l.toLowerCase()}` });
  const groupChip = (g: string, level: string): { key: string; label: string; css: string } => {
    const a = state.athletes.find(x => group(x) === g);
    return { key: g, label: shortGroup(g, level), css: a ? `chip-fmt-${category(a)}` : '' };
  };
  function renderScores(): void {
    const w = currentWod();
    const todo = w ? state.athletes.filter(a => scoreStatus(w, state.scores[w.id]?.[a.id]) === 'todo').length : 0;
    const how = w?.type === 'time' ? ` Saisissez le temps affiché par le chrono (${shortTime(w) ? 'mm:ss' : 'hh:mm:ss'}), pas une heure.${w.capMinutes ? ` Time cap : ${capText(w)}.` : ''}` : '';
    heading('Saisie des scores', w ? `${w.name} — ${TYPE_LABELS[w.type]}.${how} Le score s’enregistre dès que vous quittez la case (ou touche Entrée). ${todo ? `${todo} score(s) à saisir sur ce WOD.` : 'Tous les scores de ce WOD sont saisis.'}` : 'Ajoutez d’abord un WOD.',
      w ? `<button class="format-chip${onlyTodo ? ' active' : ''}" data-action="only-todo" aria-pressed="${onlyTodo}">À saisir seulement (${todo})</button>` : '');
    if (state.workouts.length) wodPicker(state.workouts.map(wodTab), selectedWod, 'wod');
    if (!w) { setTable([], [], 'Ajoutez un WOD dans l’onglet 2.'); return; }
    // Une section par groupe (niveau + catégorie) : on saisit et on compare les athlètes d’un même classement.
    // Filtre par niveau (RX, Scaled) quand l’événement en a plusieurs.
    const levels = levelsUsed();
    if (!levels.includes(scoreLevel)) scoreLevel = '';
    if (levels.length > 1) chips('chips2', [{ key: '', label: 'Tous les niveaux' }, ...levels.map(levelChip)], scoreLevel, 'score-level');
    const groups = groupsForLevel(state, scoreLevel);
    if (scoreGroup !== 'all' && !groups.includes(scoreGroup)) scoreGroup = 'all';
    if (groups.length > 1) chips('chips3', [{ key: 'all', label: 'Tous les groupes' }, ...groups.map(g => groupChip(g, scoreLevel))], scoreGroup, 'score-group');
    const rows: string[] = [];
    for (const g of groups) {
      if (scoreGroup !== 'all' && g !== scoreGroup) continue;
      const list = state.athletes.filter(x => group(x) === g && (!onlyTodo || scoreStatus(w, state.scores[w.id]?.[x.id]) === 'todo'));
      if (!list.length) continue;
      if (groups.length > 1) rows.push(`<tr class="group-row"><td colspan="4">${esc(g)}</td></tr>`);
      for (const a of list) {
        const forfeit = !!state.scores[w.id]?.[a.id]?.forfeit;
        rows.push(`<tr><td><strong>${esc(athleteLabel(a))}</strong><div class="muted">${esc(group(a))}</div></td><td>${inputsFor(w, a)}</td><td class="score-saved" id="saved-${a.id}">${savedText(w, a)}</td><td class="actions">${forfeit ? `<button class="button compact" data-reinstate="${a.id}">Annuler le forfait</button>` : `<button class="button compact" data-forfeit="${a.id}">Forfait</button>`}</td></tr>`);
      }
    }
    const scoreHead = w.type === 'time' ? `TEMPS RÉALISÉ${w.capMinutes ? ` · CAP ${capText(w).toUpperCase()}` : ''}` : 'SCORE';
    setTable(['PARTICIPANT', scoreHead, 'ENREGISTRÉ', ''], rows, onlyTodo && state.athletes.length ? 'Tous les scores de ce WOD sont saisis.' : 'Ajoutez des participants dans l’onglet 1.');
  }
  // Colonne « Enregistré » : le score, « À saisir » ou « Forfait ».
  function savedText(w: Workout, a: Athlete): string {
    const s = state.scores[w.id]?.[a.id], status = scoreStatus(w, s);
    return status === 'todo' ? `<span class="muted">${STATUS_LABELS.todo}</span>` : esc(scoreText(w, s));
  }
  // Forfait sur ce WOD : confirmé, comme dans l’Hyrox ; le score éventuel est retiré.
  function setForfeit(athleteId: string, forfeit: boolean): void {
    const w = currentWod(), a = state.athletes.find(x => x.id === athleteId);
    if (!w || !a) return;
    const scores = state.scores[w.id] ??= {};
    if (forfeit) {
      const had = hasScore(w, scores[a.id]);
      if (!confirm(`Confirmer le forfait de ${athleteLabel(a)} sur ${w.name} ?\n\n${had ? `Le score enregistré (${scoreText(w, scores[a.id])}) sera retiré. ` : ''}${state.method === 'places' ? 'Sur ce WOD : dernière place de la catégorie.' : 'Sur ce WOD : 0 point.'}`)) return;
      scores[a.id] = { forfeit: true };
    } else delete scores[a.id];
    if (save()) { render(); toast(forfeit ? 'Forfait enregistré.' : 'Forfait annulé : score à saisir.'); }
  }
  function saveScore(input: HTMLInputElement): void {
    const w = currentWod(); const athleteId = input.dataset.score ?? '';
    if (!w) return;
    const row = input.closest('tr') as HTMLTableRowElement;
    const get = (f: string): string => (row.querySelector(`[data-field="${f}"]`) as HTMLInputElement | null)?.value ?? '';
    try {
      // Vérifier d’abord : un score ambigu est refusé et rien n’est modifié.
      const score = buildScore(w, { timeMs: w.type === 'time' ? Saisie.duration(get('time'), shortTime(w)) : null, reps: get('reps'), rounds: get('rounds'), rest: get('rest'), kg: get('kg') });
      row.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
      const scores = state.scores[w.id] ??= {};
      if (score) scores[athleteId] = score; else delete scores[athleteId];
      if (!save()) return;
      if (w.type === 'time') { const f = row.querySelector<HTMLInputElement>('[data-field="time"]'); if (f) f.value = Saisie.fromMs(score?.timeMs, shortTime(w)); }
      const a = state.athletes.find(x => x.id === athleteId);
      if (a) $(`saved-${athleteId}`).innerHTML = savedText(w, a);
    } catch (error) {
      input.classList.add('invalid'); toast((error as Error).message);
    }
  }

  // Rang comme dans l’Hyrox : pastille, la 1re place en rouge quand le classement est définitif.
  const rankBadge = (rank: number, final: boolean): string => `<span class="result-rank ${final ? `rank-${rank}` : 'provisional'}">${rank}</span>`;
  // Bouton « Top 3 » en bas du tableau, noir, comme dans l’Hyrox.
  function podiumFooter(ranked: number, pending: number): void {
    $('podium-footer').hidden = false;
    $('podium-footer-count').textContent = `${ranked} classé(s)${pending ? ` · ${pending} score(s) à saisir` : ''}`;
    $('podium-footer-label').textContent = pending ? 'Top 3 provisoire' : 'Top 3 final';
    $<HTMLButtonElement>('show-podium-button').disabled = !ranked;
  }
  // Podium plein écran : même écran que l’Hyrox, pour l’onglet affiché (général ou un WOD) et la catégorie choisie.
  let podiumOpen = false;
  function openPodium(): void {
    const cat = rankingCat; if (!cat) return;
    const general = rankingTab === 'general', w = state.workouts.find(x => x.id === rankingTab);
    const places: { rank: number; athlete: Athlete; value: string }[] = general
      ? generalRanking(state, cat).map(r => ({ rank: r.rank, athlete: r.athlete, value: state.method === 'places' ? `Total ${r.total}` : `${r.total} pts` }))
      : w ? workoutRanking(state, w, cat).map(p => ({ rank: p.rank, athlete: p.athlete, value: scoreText(w, p.score) })) : [];
    const top = places.filter(p => p.rank <= 3);
    if (!top.length) { toast('Aucun score classé dans cette catégorie.'); return; }
    const pending = general ? pendingScores(state, cat) : w ? state.athletes.filter(a => group(a) === cat && scoreStatus(w, state.scores[w.id]?.[a.id]) === 'todo').length : 0;
    $('podium-event').textContent = state.title;
    $('podium-date').textContent = state.date ? new Date(`${state.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toLocaleUpperCase('fr-FR')) : '';
    $('podium-kicker').textContent = `${general ? 'CLASSEMENT GÉNÉRAL' : w!.name.toUpperCase()} · ${pending ? 'PROVISOIRE' : 'FINAL'}`;
    $('podium-category').textContent = cat;
    $('podium-stage').innerHTML = [2, 1, 3].map(rank => {
      const list = top.filter(p => p.rank === rank), metal = rank === 1 ? 'Or' : rank === 2 ? 'Argent' : 'Bronze';
      return `<article class="podium-stage-card stage-${rank}${list.length ? '' : ' is-empty'}">${list.length ? `<div class="podium-award" aria-label="${rank === 1 ? '1er' : `${rank}e`} — ${metal}"><span class="podium-position-number" aria-hidden="true">0${rank}</span><span class="podium-metal-label" aria-hidden="true">${metal}</span></div>` + list.map(p => `<div class="podium-stage-winner"><div class="podium-stage-names"><span>${esc(p.athlete.name1)}</span>${p.athlete.format === 'DUO' ? `<span class="podium-stage-join">&amp;</span><span>${esc(p.athlete.name2)}</span>` : ''}</div><div class="podium-stage-time">${esc(p.value)}</div></div>`).join('') : '<div class="podium-stage-rank">—</div><p>Place non attribuée</p>'}</article>`;
    }).join('');
    podiumOpen = true; $('podium-screen').hidden = false; document.body.style.overflow = 'hidden';
    void $('podium-screen').requestFullscreen?.().catch(() => undefined);
  }
  function closePodium(): void {
    if (!podiumOpen) return;
    podiumOpen = false; $('podium-screen').hidden = true; document.body.style.overflow = '';
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }
  function renderRanking(): void {
    const levels = levelsUsed();
    if (!levels.includes(rankingLevel)) rankingLevel = levels.length > 1 ? levels[0]! : '';
    if (levels.length > 1) chips('chips2', levels.map(levelChip), rankingLevel, 'rank-level');
    const cats = groupsForLevel(state, rankingLevel);
    if (!cats.includes(rankingCat)) rankingCat = cats[0] ?? '';
    if (rankingTab !== 'general' && !state.workouts.some(w => w.id === rankingTab)) rankingTab = 'general';
    wodPicker([{ key: 'general', label: 'Classement général', sub: state.method === 'places' ? 'Somme des places' : 'Total des points' }, ...state.workouts.map(wodTab)], rankingTab, 'rank-tab');
    chips(levels.length > 1 ? 'chips3' : 'chips2', cats.map(c => groupChip(c, rankingLevel)), rankingCat, 'rank-cat');
    if (!rankingCat) { heading('Classements', ''); setTable([], [], 'Ajoutez des participants et des scores.'); return; }
    const cat = rankingCat;
    if (rankingTab === 'general') {
      const pending = pendingScores(state, cat);
      heading(pending ? 'Classement général provisoire' : 'Classement général définitif', `${pending ? `${pending} score(s) à saisir dans cette catégorie. ` : ''}${rulesText(state).slice(0, 3).join(' ')}`);
      const cell = (w: Workout, r: GeneralRow): string => r.places[w.id] !== null ? `${r.places[w.id]}<sup>e</sup>` : `<span class="muted">${STATUS_LABELS[scoreStatus(w, state.scores[w.id]?.[r.athlete.id])]}</span>`;
      podiumFooter(generalRanking(state, cat).length, pending);
      const rows = generalRanking(state, cat).map(r =>
        `<tr><td class="rank">${rankBadge(r.rank, !pending)}</td><td><strong>${esc(athleteLabel(r.athlete))}</strong><div class="muted">${esc(r.athlete.level ? group(r.athlete) : categoryLabel(category(r.athlete)))}</div></td>${state.workouts.map(w => `<td>${cell(w, r)}</td>`).join('')}<td class="rank">${r.total}</td></tr>`);
      setTable(['RANG', 'PARTICIPANT', ...state.workouts.map(w => esc(w.name.toUpperCase())), state.method === 'places' ? 'TOTAL' : 'POINTS'], rows, 'Aucun participant dans cette catégorie.');
      return;
    }
    const w = state.workouts.find(x => x.id === rankingTab) as Workout;
    const inCat = state.athletes.filter(a => group(a) === cat);
    const todo = inCat.filter(a => scoreStatus(w, state.scores[w.id]?.[a.id]) === 'todo').length;
    heading(w.name, `${TYPE_LABELS[w.type]}.${todo ? ` Provisoire : ${todo} score(s) à saisir.` : ''}`);
    const label = (a: Athlete): string => `<strong>${esc(athleteLabel(a))}</strong><div class="muted">${esc(a.level ? group(a) : categoryLabel(category(a)))}</div>`;
    podiumFooter(workoutRanking(state, w, cat).length, todo);
    const rows = workoutRanking(state, w, cat).map(p =>
      `<tr><td class="rank">${rankBadge(p.rank, !todo)}</td><td>${label(p.athlete)}</td><td class="score-saved">${esc(scoreText(w, p.score))}</td>${state.method === 'points' ? `<td>${pointsFor(p.rank)} pts</td>` : ''}</tr>`);
    for (const a of inCat) if (state.scores[w.id]?.[a.id]?.forfeit)
      rows.push(`<tr><td class="rank">—</td><td>${label(a)}</td><td><span class="outcome-badge">Forfait</span></td>${state.method === 'points' ? '<td>0 pt</td>' : ''}</tr>`);
    setTable(['RANG', 'PARTICIPANT', 'SCORE', ...(state.method === 'points' ? ['POINTS'] : [])], rows, 'Aucun score saisi pour cette catégorie.');
  }

  let entryFormat: Athlete['format'] | '' = '';
  let gender1: '' | 'H' | 'F' = '', gender2: '' | 'H' | 'F' = '';
  function syncEntryForm(): void {
    const form = $<HTMLFormElement>('entry-form'), duo = entryFormat === 'DUO';
    form.classList.toggle('duo-registration', duo);
    $('name2-field').hidden = !duo; (form.elements.namedItem('name2') as HTMLInputElement).required = duo;
    document.querySelectorAll<HTMLButtonElement>('#entry-form [data-gender]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gender === (b.dataset.person === '1' ? gender1 : gender2))));
    document.querySelectorAll<HTMLButtonElement>('#entry-form [data-entry-format]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.entryFormat === entryFormat)));
    document.querySelectorAll<HTMLButtonElement>('#entry-form [data-level]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === entryLevel)));
    const status = $('registration-category');
    let message = '';
    if (state.levels.length && !entryLevel) message = 'Choisissez le niveau.';
    else if (!entryFormat) message = 'Choisissez Solo ou Duo.';
    else if (!gender1) message = 'Choisissez H ou F pour le participant 1.';
    else if (duo && !gender2) message = 'Choisissez H ou F pour le participant 2.';
    status.classList.toggle('complete', !message);
    status.textContent = message || `Format : ${entryLevel ? `${entryLevel} · ` : ''}${categoryLabel(category({ id: '', bib: '', format: entryFormat as Athlete['format'], name1: '', name2: '', gender1: gender1 as 'H' | 'F', gender2: duo ? gender2 : '' }))}`;
  }
  function openAthlete(a?: Athlete): void {
    const form = $<HTMLFormElement>('entry-form'); form.reset();
    const f = form.elements as unknown as Record<string, HTMLInputElement>;
    $('entry-title').textContent = a ? 'Modifier l’inscription' : state.format === 'DUO' ? 'Ajouter un duo' : 'Ajouter un participant';
    $('entry-course').textContent = `${state.title} · ${dateLabel(state.date)} · Événement ${eventFormatLabel(state.format)}`;
    $('entry-format-choice').hidden = state.format !== 'MIXED';
    $('entry-level-choice').hidden = !state.levels.length;
    $('entry-level-buttons').innerHTML = state.levels.map(l => `<button type="button" data-level="${esc(l)}" aria-pressed="false">${esc(l)}<small>${esc(LEVEL_HELP[l] ?? '')}</small></button>`).join('');
    entryLevel = a?.level && state.levels.includes(a.level) ? a.level : state.levels.length === 1 ? state.levels[0]! : '';
    f.id!.value = a?.id ?? ''; f.name1!.value = a?.name1 ?? ''; f.name2!.value = a?.name2 ?? '';
    entryFormat = a?.format ?? (state.format === 'MIXED' ? '' : state.format); gender1 = a?.gender1 ?? ''; gender2 = a?.gender2 ?? '';
    $('delete-entry').hidden = !a;
    $('entry-error').textContent = ''; syncEntryForm(); $<HTMLDialogElement>('entry-dialog').showModal();
  }
  function submitAthlete(event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const v = (k: string): string => String(data.get(k) ?? '').trim();
    const error = (text: string): void => { $('entry-error').textContent = text; };
    if (state.levels.length && !entryLevel) return error('Choisissez le niveau.');
    if (!entryFormat) return error('Choisissez Solo ou Duo.');
    if (!gender1) return error('Choisissez H ou F pour le participant 1.');
    if (entryFormat === 'DUO' && !gender2) return error('Choisissez H ou F pour le participant 2.');
    if (entryFormat === 'DUO' && !v('name2')) return error('Renseignez le nom du participant 2.');
    const old = state.athletes.find(a => a.id === v('id'));
    const athlete: Athlete = { id: old?.id ?? uid(), bib: old?.bib ?? nextBib(state), format: entryFormat, name1: v('name1'), name2: entryFormat === 'DUO' ? v('name2') : '', gender1, gender2: entryFormat === 'DUO' ? gender2 : '', ...(state.levels.length ? { level: entryLevel } : {}) };
    const i = state.athletes.findIndex(a => a.id === athlete.id);
    if (i >= 0) state.athletes[i] = athlete; else state.athletes.push(athlete);
    if (!save()) { $('entry-error').textContent = 'Non enregistré : réessayez.'; return; }
    $<HTMLDialogElement>('entry-dialog').close(); render(); toast(i >= 0 ? 'Inscription modifiée.' : 'Participant ajouté.');
  }
  function deleteAthlete(a: Athlete | undefined): boolean {
    if (!a || !confirm(`Supprimer ${athleteLabel(a)} et ses scores ?`)) return false;
    state.athletes = state.athletes.filter(x => x !== a);
    for (const s of Object.values(state.scores)) delete s[a.id];
    if (!save()) return false;
    render(); return true;
  }

  const HELP: Record<ScoreType, string> = {
    time: 'For Time : on saisit le temps. Si un athlète n’a pas fini avant le time cap, on saisit ses reps : il est classé après tous ceux qui ont fini.',
    amrap: 'AMRAP : on saisit les tours et les reps. Indiquez les reps d’un tour pour saisir « 5 tours + 12 reps » ; sinon on saisit le total de reps.',
    load: 'Charge max : on saisit la meilleure charge réussie en kg.',
    reps: 'Max reps : on saisit un nombre (reps, calories ou mètres). Le plus grand gagne.',
  };
  function syncWorkoutForm(): void {
    const type = (($<HTMLFormElement>('workout-form').elements.namedItem('type') as RadioNodeList).value || 'time') as ScoreType;
    document.querySelectorAll<HTMLElement>('#workout-form .type-time').forEach(el => { el.hidden = type !== 'time'; });
    document.querySelectorAll<HTMLElement>('#workout-form .type-amrap').forEach(el => { el.hidden = type !== 'amrap'; });
    $('workout-help').textContent = HELP[type];
  }
  function openWorkout(w?: Workout): void {
    const form = $<HTMLFormElement>('workout-form'); form.reset();
    const f = form.elements as unknown as Record<string, HTMLInputElement>;
    $('workout-title').textContent = w ? 'Modifier le WOD' : 'Ajouter un WOD';
    f.id!.value = w?.id ?? ''; f.name!.value = w?.name ?? `WOD ${state.workouts.length + 1}`; (form.elements.namedItem('type') as RadioNodeList).value = w?.type ?? 'time';
    f.description!.value = w?.description ?? ''; f.capMinutes!.value = String(w?.capMinutes ?? ''); f.totalReps!.value = String(w?.totalReps ?? ''); f.repsPerRound!.value = String(w?.repsPerRound ?? '');
    $('workout-error').textContent = ''; syncWorkoutForm(); $<HTMLDialogElement>('workout-dialog').showModal(); f.name!.focus();
  }
  function submitWorkout(event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const v = (k: string): string => String(data.get(k) ?? '').trim();
    const n = (k: string): number | null => { const x = Number(v(k)); return v(k) && x > 0 ? x : null; };
    const type = v('type') as ScoreType;
    const id = v('id') || uid();
    const old = state.workouts.find(w => w.id === id);
    if (old && old.type !== type && Object.keys(state.scores[id] ?? {}).length && !confirm('Changer le type efface les scores déjà saisis pour ce WOD. Continuer ?')) return;
    const workout: Workout = { id, name: v('name'), description: v('description'), type, capMinutes: n('capMinutes'), totalReps: type === 'time' ? n('totalReps') : null, repsPerRound: type === 'amrap' ? n('repsPerRound') : null };
    if (old && old.type !== type) delete state.scores[id];
    const i = state.workouts.findIndex(w => w.id === id);
    if (i >= 0) state.workouts[i] = workout; else state.workouts.push(workout);
    if (!save()) { $('workout-error').textContent = 'Non enregistré : réessayez.'; return; }
    $<HTMLDialogElement>('workout-dialog').close(); render(); toast(i >= 0 ? 'WOD modifié.' : 'WOD ajouté.');
  }

  function openEvent(edit: boolean): void {
    const form = $<HTMLFormElement>('session-form'); form.reset(); $('session-error').textContent = '';
    const f = form.elements as unknown as Record<string, HTMLInputElement>;
    const radio = (name: string): RadioNodeList => form.elements.namedItem(name) as RadioNodeList;
    f.id!.value = edit ? state.id : ''; f.title!.value = edit ? state.title : 'Soundcrossing WOD'; f.date!.value = edit ? state.date : today();
    radio('format').value = edit ? state.format : ''; radio('method').value = edit ? state.method : 'places';
    // Règles stables : la méthode de classement ne change plus une fois les scores commencés.
    const locked = edit && hasAnyScore(state);
    form.querySelectorAll<HTMLInputElement>('input[name="method"]').forEach(i => { i.disabled = locked; });
    $('method-lock').hidden = !locked;
    radio('levels').value = edit ? Object.keys(LEVEL_PRESETS).find(k => LEVEL_PRESETS[k]!.join() === state.levels.join()) ?? 'none' : 'none';
    $('event-dialog-title').textContent = edit ? 'Modifier l’événement' : 'Créer un événement';
    $('save-event-button').textContent = edit ? 'Enregistrer' : 'Créer l’événement';
    $('delete-event').hidden = !edit;
    $<HTMLDialogElement>('session-dialog').showModal(); f.title!.focus();
  }
  function submitEvent(event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const v = (k: string): string => String(data.get(k) ?? '').trim();
    const format = v('format') as EventFormat;
    if (!['SOLO', 'DUO', 'MIXED'].includes(format)) { $('session-error').textContent = 'Choisissez Solo, Duo ou Solo + Duo.'; return; }
    const existing = store.events.find(e => e.id === v('id'));
    if (existing && format !== 'MIXED' && existing.athletes.some(a => a.format !== format)) {
      $('session-error').textContent = `Des inscriptions ${format === 'SOLO' ? 'Duo' : 'Solo'} existent déjà : gardez Solo + Duo ou supprimez-les d’abord.`; return;
    }
    const target = existing ?? emptyCompetition(uid(), '', '', format);
    target.title = v('title') || 'Soundcrossing WOD'; target.date = v('date'); target.format = format;
    if (!(existing && hasAnyScore(existing))) target.method = v('method') === 'points' ? 'points' : 'places';
    // Changer de niveaux : « un seul niveau » les retire.
    const levels = LEVEL_PRESETS[v('levels')] ?? [];
    if (levels.join() !== target.levels.join()) {
      for (const a of target.athletes) {
        const level = remapLevel(a.level, levels);
        if (level) a.level = level; else delete a.level;
      }
      target.levels = [...levels];
    }
    if (!existing) { store.events.push(target); view = 'athletes'; }
    selectEvent(target.id); rememberEvent(); if (!save()) { $('session-error').textContent = 'Non enregistré : réessayez.'; return; }
    $<HTMLDialogElement>('session-dialog').close(); render(); toast(existing ? 'Événement enregistré.' : 'Événement créé. Ajoutez les participants.');
  }
  function deleteEvent(): void {
    if (!confirm(`Supprimer l’événement « ${state.title} », ses inscriptions, ses WOD et ses scores ?`)) return;
    store.events = store.events.filter(e => e.id !== state.id);
    selectEvent(''); if (!save()) return;
    $<HTMLDialogElement>('session-dialog').close(); render(); toast('Événement supprimé.');
  }

  function exportExcel(): void {
    if (!store.events.length) { toast('Créez d’abord un événement.'); return; }
    if (typeof XLSX === 'undefined') { toast('Export Excel indisponible.'); return; }
    const book = XLSX.utils.book_new();
    for (const sheet of exportRows(state)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    XLSX.writeFile(book, `${state.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'wod'} - résultats.xlsx`);
  }
  function loadDemo(): void {
    const example = demo(today());
    example.id = `exemple-${uid()}`;
    store.events.push(example); selectEvent(example.id); rememberEvent(); if (!save()) return;
    view = 'ranking'; rankingTab = 'general'; render();
    $<HTMLDialogElement>('settings-dialog').close(); toast('Exemple chargé : 10 inscrits et 3 WOD. Regardez chaque onglet.');
  }

  function bind(): void {
    Saisie.install();
    document.addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!t) return;
      const d = t.dataset;
      if (t.classList.contains('close-modal')) { t.closest('dialog')?.close(); return; }
      if (d.view) { view = d.view as View; render(); }
      else if (d.action === 'add-athlete') openAthlete();
      else if (d.action === 'add-workout') openWorkout();
      else if (d.action === 'import-athletes') $('import-file').click();
      else if (d.action === 'import-template-xlsx') Modele.download(Modele.workbook(importColumns(state)), 'modele-participants-wod.xlsx');
      else if (d.editAthlete) openAthlete(state.athletes.find(a => a.id === d.editAthlete));
      else if (d.editWorkout) openWorkout(state.workouts.find(w => w.id === d.editWorkout));
      else if (d.deleteAthlete) deleteAthlete(state.athletes.find(x => x.id === d.deleteAthlete));
      else if (d.entryFormat) { entryFormat = d.entryFormat as Athlete['format']; $('entry-error').textContent = ''; syncEntryForm(); }
      else if (d.gender && d.person) { if (d.person === '1') gender1 = d.gender as 'H' | 'F'; else gender2 = d.gender as 'H' | 'F'; $('entry-error').textContent = ''; syncEntryForm(); } else if (d.deleteWorkout) {
        const w = state.workouts.find(x => x.id === d.deleteWorkout);
        if (w && confirm(`Supprimer ${w.name} et tous ses scores ?`)) { state.workouts = state.workouts.filter(x => x !== w); delete state.scores[w.id]; if (save()) render(); }
      } else if (d.wod) { selectedWod = d.wod; render(); }
      else if (d.action === 'podium') openPodium();
      else if (d.action === 'only-todo') { onlyTodo = !onlyTodo; render(); }
      else if (d.forfeit) setForfeit(d.forfeit, true);
      else if (d.reinstate) setForfeit(d.reinstate, false);
      else if (d.rankTab) { rankingTab = d.rankTab; render(); }
      else if (d.rankCat) { rankingCat = d.rankCat; render(); }
      else if (d.scoreGroup) { scoreGroup = d.scoreGroup; render(); }
      else if (d.scoreLevel !== undefined && t.closest('#chips2')) { scoreLevel = d.scoreLevel; scoreGroup = 'all'; render(); }
      else if (d.rankLevel) { rankingLevel = d.rankLevel; render(); }
      else if (d.level !== undefined && t.closest('#entry-form')) { entryLevel = d.level; $('entry-error').textContent = ''; syncEntryForm(); }
    });
    $('table-body').addEventListener('input', e => {
      const i = e.target as HTMLInputElement, other = { time: 'reps', reps: 'time' }[i.dataset.field ?? ''];
      const box = other ? i.closest('tr')?.querySelector<HTMLInputElement>(`[data-field="${other}"]`) : null;
      if (box) box.disabled = i.value.trim() !== '';
    });
    $('table-body').addEventListener('change', e => { const i = e.target as HTMLInputElement; if (i.dataset.score) saveScore(i); });
    $('close-podium').addEventListener('click', closePodium);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && podiumOpen) { e.preventDefault(); closePodium(); } });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) closePodium(); });
    $('table-body').addEventListener('keydown', e => {
      const i = e.target as HTMLInputElement;
      if (e.key !== 'Enter' || !i.dataset.score) return;
      e.preventDefault(); saveScore(i);
      const all = [...document.querySelectorAll<HTMLInputElement>('#table-body input[data-field]')].filter(x => x.dataset.field === i.dataset.field);
      all[all.indexOf(i) + 1]?.focus();
    });
    $('entry-form').addEventListener('submit', submitAthlete);
    $('delete-entry').addEventListener('click', () => { const id = ($<HTMLFormElement>('entry-form').elements.namedItem('id') as HTMLInputElement).value; if (deleteAthlete(state.athletes.find(a => a.id === id))) $<HTMLDialogElement>('entry-dialog').close(); });
    $('workout-form').addEventListener('submit', submitWorkout);
    $('workout-form').addEventListener('change', syncWorkoutForm);
    $('session-form').addEventListener('submit', submitEvent);
    $('edit-competition').addEventListener('click', () => openEvent(true));
    $('new-event-button').addEventListener('click', () => openEvent(false));
    $('no-event-create').addEventListener('click', () => openEvent(false));
    $('delete-event').addEventListener('click', deleteEvent);
    $('event-selector').addEventListener('change', () => { selectEvent($<HTMLSelectElement>('event-selector').value); rememberEvent(); render(); });
    $('settings-button').addEventListener('click', () => $<HTMLDialogElement>('settings-dialog').showModal());
    $('export-button').addEventListener('click', exportExcel);
    $('backup-button').addEventListener('click', exportBackup);
    $('restore-button').addEventListener('click', () => $('restore-file').click());
    $<HTMLInputElement>('restore-file').addEventListener('change', async e => {
      const file = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = '';
      if (!file) return;
      try {
        if (file.size > 15 * 1024 * 1024) throw Error('Sauvegarde trop volumineuse.');
        const imported = validateStore(JSON.parse(await file.text()));
        const athletes = imported.events.reduce((n, ev) => n + ev.athletes.length, 0);
        if (!confirm(`Restaurer cette sauvegarde (${imported.events.length} événement(s), ${athletes} inscription(s)) ?\n\nLes données WOD actuelles seront remplacées. Une sauvegarde des données actuelles sera téléchargée avant.`)) return;
        if (store.events.length) exportBackup();
        store = imported; selectEvent(imported.selectedId); rememberEvent();
        if (!save(true)) return;
        render(); $<HTMLDialogElement>('settings-dialog').close(); toast('Sauvegarde restaurée.');
      } catch (error) { toast((error as Error).message); }
    });
    $<HTMLInputElement>('import-file').addEventListener('change', e => { const input = e.target as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (file) void importFile(file); });
    $('no-event-demo').addEventListener('click', loadDemo);
    $('demo-settings').addEventListener('click', loadDemo);
    $('reset-button').addEventListener('click', () => {
      if (!confirm('Supprimer tous les événements WOD, inscriptions et scores ?\n\nUne sauvegarde des données actuelles sera téléchargée avant.')) return;
      if (store.events.length) exportBackup();
      store = emptyStore(); selectEvent(''); if (!save()) return;
      view = 'athletes'; render(); $<HTMLDialogElement>('settings-dialog').close();
    });
  }

  function rememberEvent(): void { try { localStorage.setItem(EVENT_KEY, state.id); } catch { /* Vue facultative. */ } }
  function exportBackup(): void { download(`sauvegarde-wod-${today()}.json`, JSON.stringify({ ...store, selectedId: state.id }, null, 2), 'application/json'); }

  document.addEventListener('DOMContentLoaded', () => {
    load(); bind(); render(); savedStatus(storageBlocked); void syncDisk();
    // Une autre fenêtre a enregistré : on affiche sa version au lieu de l’écraser plus tard.
    window.addEventListener('storage', event => {
      if (event.key !== KEY && event.key !== null) return;
      try {
        const latest = localStorage.getItem(KEY);
        if (latest === loadedRaw) return;
        loadedRaw = latest;
        if (latest) { adopt(latest); storageBlocked = false; render(); savedStatus(); toast('Données WOD mises à jour depuis une autre fenêtre.'); }
        else { storageBlocked = true; savedStatus(true); toast('Les données WOD ont été supprimées du navigateur. Faites une sauvegarde fichier.'); }
      } catch { storageBlocked = true; savedStatus(true); toast('Les données WOD de l’autre fenêtre sont illisibles. Faites une sauvegarde fichier.'); }
    });
    const tick = (): void => { $('wall-clock').textContent = new Date().toLocaleTimeString('fr-FR'); };
    tick(); window.setInterval(tick, 1000);
  });
}
