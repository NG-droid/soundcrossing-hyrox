// Module WOD : interface de wod.html. Stockage séparé de l’app Hyrox.
namespace Wod {
  const KEY = 'soundcrossing-wod.v1';
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
  let rankingLevel = '';
  let entryLevel = '';

  function load(): void {
    try { const raw = localStorage.getItem(KEY); if (raw) store = validateStore(JSON.parse(raw)); }
    catch { toast('Les données WOD enregistrées sont illisibles. Restaurez une sauvegarde.'); }
    selectEvent(store.selectedId);
  }
  function save(): void {
    let error = false;
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch { error = true; toast('Impossible d’enregistrer dans ce navigateur. Faites une sauvegarde fichier.'); }
    savedStatus(error);
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
      state.athletes.push(...result.athletes); save(); render(); toast(`${result.athletes.length} inscription(s) ajoutée(s).`);
    } catch (error) { toast(error instanceof Error ? error.message : 'Impossible de lire ce fichier.'); }
  }
  function renderAthletes(): void {
    const help = state.format === 'SOLO' ? 'Inscrivez les participants. La catégorie H ou F est calculée toute seule.' : state.format === 'DUO' ? 'Inscrivez les duos. La catégorie HH, FF ou HF est calculée toute seule.' : 'Inscrivez les solos et les duos. La catégorie (H, F, HH, FF, HF) est calculée toute seule.';
    heading('Participants', help, `<button class="button" data-action="import-template-xlsx" title="Fichier vierge avec listes déroulantes et légende">Modèle Excel</button><button class="button" data-action="import-template" title="Fichier vierge, seulement les colonnes">Modèle CSV</button><button class="button" data-action="import-athletes" title="Fichier CSV ou Excel : Format, Participant 1, Participant 2${state.levels.length ? ', Niveau' : ''}">Importer (CSV / Excel)</button><button class="button primary" data-action="add-athlete">+ ${state.format === 'DUO' ? 'Ajouter un duo' : 'Ajouter un participant'}</button>`);
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
    const field = (name: string, value: number | string | undefined, ph: string, mode = 'numeric'): string =>
      `<input data-score="${a.id}" data-field="${name}" value="${esc(value ?? '')}" placeholder="${ph}" inputmode="${mode}" aria-label="${ph}">`;
    if (w.type === 'time') {
      // Même case que l’heure d’arrivée de l’Hyrox : on tape hh:mm:ss.
      const time = Saisie.box(`data-score="${a.id}" data-field="time"`, Saisie.fromMs(s?.timeMs), 'Temps hh:mm:ss');
      const cap = `${time}<span>ou, si stoppé au cap :</span>${field('reps', s?.timeMs === undefined ? s?.reps : '', 'Reps faites')}`;
      return `<div class="score-inputs">${cap}</div>`;
    }
    if (w.type === 'load') return `<div class="score-inputs">${field('kg', s?.kg, 'Kg', 'decimal')}<span>kg</span></div>`;
    if (w.type === 'amrap' && w.repsPerRound) {
      const reps = s?.reps;
      const rounds = reps === undefined ? '' : Math.floor(reps / w.repsPerRound), rest = reps === undefined ? '' : reps % w.repsPerRound;
      return `<div class="score-inputs">${field('rounds', rounds, 'Tours')}<span>tours +</span>${field('rest', rest, 'Reps')}<span>reps</span></div>`;
    }
    return `<div class="score-inputs">${field('reps', s?.reps, 'Reps')}<span>reps</span></div>`;
  }
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
    heading('Saisie des scores', w ? `${w.name} — ${TYPE_LABELS[w.type]}. Le score s’enregistre dès que vous quittez la case (ou touche Entrée).` : 'Ajoutez d’abord un WOD.');
    chips('chips', state.workouts.map(x => ({ key: x.id, label: x.name })), selectedWod, 'wod');
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
      if (groups.length > 1) rows.push(`<tr class="group-row"><td colspan="3">${esc(g)}</td></tr>`);
      for (const a of state.athletes.filter(x => group(x) === g))
        rows.push(`<tr><td><strong>${esc(athleteLabel(a))}</strong><div class="muted">${esc(group(a))}</div></td><td>${inputsFor(w, a)}</td><td class="score-saved" id="saved-${a.id}">${esc(scoreText(w, state.scores[w.id]?.[a.id]))}</td></tr>`);
    }
    setTable(['PARTICIPANT', 'SCORE', 'ENREGISTRÉ'], rows, 'Ajoutez des participants dans l’onglet 1.');
  }
  function saveScore(input: HTMLInputElement): void {
    const w = currentWod(); const athleteId = input.dataset.score ?? '';
    if (!w) return;
    const row = input.closest('tr') as HTMLTableRowElement;
    const get = (f: string): string => (row.querySelector(`[data-field="${f}"]`) as HTMLInputElement | null)?.value ?? '';
    try {
      const score: Score = {};
      if (w.type === 'time') {
        const t = Saisie.duration(get('time')), reps = parseNumber(get('reps'), 'Reps');
        if (t !== null) score.timeMs = t; else if (reps !== null) score.reps = Math.round(reps);
        if (t !== null && w.capMinutes && t > w.capMinutes * 60000) throw Error(`Ce temps dépasse le time cap de ${w.capMinutes} min : saisissez plutôt les reps faites.`);
        if (score.reps !== undefined && w.totalReps && score.reps >= w.totalReps) throw Error(`Avec ${score.reps} reps le WOD est terminé : saisissez le temps.`);
      } else if (w.type === 'load') {
        const kg = parseNumber(get('kg'), 'Charge'); if (kg !== null) score.kg = kg;
      } else if (w.type === 'amrap' && w.repsPerRound) {
        const rounds = parseNumber(get('rounds'), 'Tours'), rest = parseNumber(get('rest'), 'Reps');
        if (rounds !== null || rest !== null) score.reps = Math.round((rounds ?? 0) * w.repsPerRound + (rest ?? 0));
      } else {
        const reps = parseNumber(get('reps'), 'Reps'); if (reps !== null) score.reps = Math.round(reps);
      }
      row.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
      const scores = state.scores[w.id] ??= {};
      if (hasScore(w, score)) scores[athleteId] = score; else delete scores[athleteId];
      if (w.type === 'time') { const f = row.querySelector<HTMLInputElement>('[data-field="time"]'); if (f) f.value = Saisie.fromMs(score.timeMs); }
      save();
      $(`saved-${athleteId}`).textContent = scoreText(w, scores[athleteId]);
    } catch (error) {
      input.classList.add('invalid'); toast((error as Error).message);
    }
  }

  function renderRanking(): void {
    const levels = levelsUsed();
    if (!levels.includes(rankingLevel)) rankingLevel = levels.length > 1 ? levels[0]! : '';
    if (levels.length > 1) chips('chips2', levels.map(levelChip), rankingLevel, 'rank-level');
    const cats = groupsForLevel(state, rankingLevel);
    if (!cats.includes(rankingCat)) rankingCat = cats[0] ?? '';
    if (rankingTab !== 'general' && !state.workouts.some(w => w.id === rankingTab)) rankingTab = 'general';
    chips('chips', [{ key: 'general', label: 'Classement général' }, ...state.workouts.map(w => ({ key: w.id, label: w.name }))], rankingTab, 'rank-tab');
    chips(levels.length > 1 ? 'chips3' : 'chips2', cats.map(c => groupChip(c, rankingLevel)), rankingCat, 'rank-cat');
    if (!rankingCat) { heading('Classements', ''); setTable([], [], 'Ajoutez des participants et des scores.'); return; }
    const cat = rankingCat;
    if (rankingTab === 'general') {
      heading('Classement général', state.method === 'places' ? 'Addition des places sur tous les WOD : le plus petit total gagne.' : 'Table de points (1er = 100, puis −3 par place) : le plus gros total gagne.');
      const rows = generalRanking(state, cat).map(r =>
        `<tr><td class="rank">${r.rank}</td><td><strong>${esc(athleteLabel(r.athlete))}</strong><div class="muted">${esc(r.athlete.level ? group(r.athlete) : categoryLabel(category(r.athlete)))}</div></td>${state.workouts.map(w => `<td>${r.places[w.id] === null ? '<span class="muted">—</span>' : `${r.places[w.id]}<sup>e</sup>`}</td>`).join('')}<td class="rank">${r.total}</td></tr>`);
      setTable(['RANG', 'PARTICIPANT', ...state.workouts.map(w => esc(w.name.toUpperCase())), state.method === 'places' ? 'TOTAL' : 'POINTS'], rows, 'Aucun participant dans cette catégorie.');
      return;
    }
    const w = state.workouts.find(x => x.id === rankingTab) as Workout;
    heading(w.name, TYPE_LABELS[w.type]);
    const rows = workoutRanking(state, w, cat).map(p =>
      `<tr><td class="rank">${p.rank}</td><td><strong>${esc(athleteLabel(p.athlete))}</strong><div class="muted">${esc(p.athlete.level ? group(p.athlete) : categoryLabel(category(p.athlete)))}</div></td><td class="score-saved">${esc(scoreText(w, p.score))}</td>${state.method === 'points' ? `<td>${pointsFor(p.rank)} pts</td>` : ''}</tr>`);
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
    save(); $<HTMLDialogElement>('entry-dialog').close(); render(); toast(i >= 0 ? 'Inscription modifiée.' : 'Participant ajouté.');
  }
  function deleteAthlete(a: Athlete | undefined): boolean {
    if (!a || !confirm(`Supprimer ${athleteLabel(a)} et ses scores ?`)) return false;
    state.athletes = state.athletes.filter(x => x !== a);
    for (const s of Object.values(state.scores)) delete s[a.id];
    save(); render(); return true;
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
    save(); $<HTMLDialogElement>('workout-dialog').close(); render(); toast(i >= 0 ? 'WOD modifié.' : 'WOD ajouté.');
  }

  function openEvent(edit: boolean): void {
    const form = $<HTMLFormElement>('session-form'); form.reset(); $('session-error').textContent = '';
    const f = form.elements as unknown as Record<string, HTMLInputElement>;
    const radio = (name: string): RadioNodeList => form.elements.namedItem(name) as RadioNodeList;
    f.id!.value = edit ? state.id : ''; f.title!.value = edit ? state.title : 'Soundcrossing WOD'; f.date!.value = edit ? state.date : today();
    radio('format').value = edit ? state.format : ''; radio('method').value = edit ? state.method : 'places';
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
    target.method = v('method') === 'points' ? 'points' : 'places';
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
    selectEvent(target.id); save(); $<HTMLDialogElement>('session-dialog').close(); render(); toast(existing ? 'Événement enregistré.' : 'Événement créé. Ajoutez les participants.');
  }
  function deleteEvent(): void {
    if (!confirm(`Supprimer l’événement « ${state.title} », ses inscriptions, ses WOD et ses scores ?`)) return;
    store.events = store.events.filter(e => e.id !== state.id);
    selectEvent(''); save(); $<HTMLDialogElement>('session-dialog').close(); render(); toast('Événement supprimé.');
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
    store.events.push(example); selectEvent(example.id); save(); view = 'ranking'; rankingTab = 'general'; render();
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
      else if (d.action === 'import-template') download(`modele-participants-wod.csv`, toCsv(importTemplate(state)), 'text/csv;charset=utf-8');
      else if (d.editAthlete) openAthlete(state.athletes.find(a => a.id === d.editAthlete));
      else if (d.editWorkout) openWorkout(state.workouts.find(w => w.id === d.editWorkout));
      else if (d.deleteAthlete) deleteAthlete(state.athletes.find(x => x.id === d.deleteAthlete));
      else if (d.entryFormat) { entryFormat = d.entryFormat as Athlete['format']; $('entry-error').textContent = ''; syncEntryForm(); }
      else if (d.gender && d.person) { if (d.person === '1') gender1 = d.gender as 'H' | 'F'; else gender2 = d.gender as 'H' | 'F'; $('entry-error').textContent = ''; syncEntryForm(); } else if (d.deleteWorkout) {
        const w = state.workouts.find(x => x.id === d.deleteWorkout);
        if (w && confirm(`Supprimer ${w.name} et tous ses scores ?`)) { state.workouts = state.workouts.filter(x => x !== w); delete state.scores[w.id]; save(); render(); }
      } else if (d.wod) { selectedWod = d.wod; render(); }
      else if (d.rankTab) { rankingTab = d.rankTab; render(); }
      else if (d.rankCat) { rankingCat = d.rankCat; render(); }
      else if (d.scoreGroup) { scoreGroup = d.scoreGroup; render(); }
      else if (d.scoreLevel !== undefined && t.closest('#chips2')) { scoreLevel = d.scoreLevel; scoreGroup = 'all'; render(); }
      else if (d.rankLevel) { rankingLevel = d.rankLevel; render(); }
      else if (d.level !== undefined && t.closest('#entry-form')) { entryLevel = d.level; $('entry-error').textContent = ''; syncEntryForm(); }
    });
    $('table-body').addEventListener('change', e => { const i = e.target as HTMLInputElement; if (i.dataset.score) saveScore(i); });
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
    $('event-selector').addEventListener('change', () => { selectEvent($<HTMLSelectElement>('event-selector').value); save(); render(); });
    $('settings-button').addEventListener('click', () => $<HTMLDialogElement>('settings-dialog').showModal());
    $('export-button').addEventListener('click', exportExcel);
    $('backup-button').addEventListener('click', () => download(`sauvegarde-wod-${today()}.json`, JSON.stringify(store, null, 2), 'application/json'));
    $('restore-button').addEventListener('click', () => $('restore-file').click());
    $<HTMLInputElement>('restore-file').addEventListener('change', async e => {
      const file = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = '';
      if (!file) return;
      try { store = validateStore(JSON.parse(await file.text())); selectEvent(store.selectedId); save(); render(); $<HTMLDialogElement>('settings-dialog').close(); toast('Sauvegarde restaurée.'); }
      catch (error) { toast((error as Error).message); }
    });
    $<HTMLInputElement>('import-file').addEventListener('change', e => { const input = e.target as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (file) void importFile(file); });
    $('no-event-demo').addEventListener('click', loadDemo);
    $('demo-settings').addEventListener('click', loadDemo);
    $('reset-button').addEventListener('click', () => {
      if (!confirm('Supprimer tous les événements WOD, inscriptions et scores ?')) return;
      store = emptyStore(); selectEvent(''); save(); view = 'athletes'; render(); $<HTMLDialogElement>('settings-dialog').close();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    load(); bind(); render(); savedStatus();
    const tick = (): void => { $('wall-clock').textContent = new Date().toLocaleTimeString('fr-FR'); };
    tick(); window.setInterval(tick, 1000);
  });
}
