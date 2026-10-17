// Module WOD (version test) : interface de wod.html. Stockage séparé de l’app Hyrox.
namespace Wod {
  const KEY = 'soundcrossing-wod.v1';
  type View = 'athletes' | 'workouts' | 'scores' | 'ranking';
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const uid = (): string => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now() + Math.random());

  let state: Competition = emptyCompetition(today());
  let view: View = 'athletes';
  let selectedWod = '';
  let rankingTab = 'general';
  let rankingCat: Category | '' = '';

  function load(): void {
    try { const raw = localStorage.getItem(KEY); if (raw) state = validate(JSON.parse(raw)); }
    catch { toast('Les données WOD enregistrées sont illisibles. Restaurez une sauvegarde.'); }
  }
  function save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { toast('Impossible d’enregistrer dans ce navigateur. Faites une sauvegarde fichier.'); }
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
    $('title').textContent = state.title;
    const date = state.date ? new Date(`${state.date}T12:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    $('subtitle').textContent = `${date}${date ? ' · ' : ''}${state.method === 'places' ? 'Classement : addition des places' : 'Classement : table de points'}`;
    $('count-athletes').textContent = String(state.athletes.length);
    $('count-workouts').textContent = String(state.workouts.length);
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('chips').innerHTML = ''; $('chips2').innerHTML = ''; $('view-actions').innerHTML = '';
    ({ athletes: renderAthletes, workouts: renderWorkouts, scores: renderScores, ranking: renderRanking })[view]();
  }
  function setTable(head: string[], rows: string[], emptyText: string): void {
    $('table-head').innerHTML = `<tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>`;
    $('table-body').innerHTML = rows.join('');
    $('empty').hidden = rows.length > 0;
    $('empty-text').textContent = emptyText;
    $('demo-button').hidden = state.athletes.length > 0 || state.workouts.length > 0;
    (document.querySelector('.wod-table') as HTMLElement).hidden = rows.length === 0;
  }
  function heading(title: string, description: string, actions = ''): void {
    $('view-title').textContent = title; $('view-description').textContent = description; $('view-actions').innerHTML = actions;
  }
  function chips(target: string, items: { key: string; label: string }[], active: string, attr: string): void {
    $(target).innerHTML = items.map(i => `<button class="format-chip${i.key === active ? ' active' : ''}" data-${attr}="${esc(i.key)}">${esc(i.label)}</button>`).join('');
  }

  function renderAthletes(): void {
    heading('Participants', 'Inscrivez les solos et les duos. La catégorie (H, F, HH, FF, HF) est calculée toute seule.', '<button class="button primary" data-action="add-athlete">+ Ajouter un participant</button>');
    const rows = [...state.athletes].sort((a, b) => a.bib.localeCompare(b.bib, 'fr', { numeric: true })).map(a =>
      `<tr><td>${esc(a.bib)}</td><td><strong>${esc(athleteLabel(a))}</strong></td><td>${categoryLabel(category(a))}</td><td class="actions"><button class="button compact" data-edit-athlete="${a.id}">Modifier</button><button class="button compact danger" data-delete-athlete="${a.id}">Supprimer</button></td></tr>`);
    setTable(['DOSSARD', 'PARTICIPANT / DUO', 'CATÉGORIE', ''], rows, 'Aucun participant pour l’instant.');
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
      const cap = `${field('time', s?.timeMs !== undefined ? clock(s.timeMs) : '', 'Temps 7:45', 'text')}<span>ou, si stoppé au cap :</span>${field('reps', s?.timeMs === undefined ? s?.reps : '', 'Reps faites')}`;
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
  function renderScores(): void {
    const w = currentWod();
    heading('Saisie des scores', w ? `${w.name} — ${TYPE_LABELS[w.type]}. Le score s’enregistre dès que vous quittez la case (ou touche Entrée).` : 'Ajoutez d’abord un WOD.');
    chips('chips', state.workouts.map(x => ({ key: x.id, label: x.name })), selectedWod, 'wod');
    if (!w) { setTable([], [], 'Ajoutez un WOD dans l’onglet 2.'); return; }
    const rows = [...state.athletes].sort((a, b) => a.bib.localeCompare(b.bib, 'fr', { numeric: true })).map(a =>
      `<tr><td>${esc(a.bib)}</td><td><strong>${esc(athleteLabel(a))}</strong><div class="muted">${categoryLabel(category(a))}</div></td><td>${inputsFor(w, a)}</td><td class="score-saved" id="saved-${a.id}">${esc(scoreText(w, state.scores[w.id]?.[a.id]))}</td></tr>`);
    setTable(['DOSSARD', 'PARTICIPANT', 'SCORE', 'ENREGISTRÉ'], rows, 'Ajoutez des participants dans l’onglet 1.');
  }
  function saveScore(input: HTMLInputElement): void {
    const w = currentWod(); const athleteId = input.dataset.score ?? '';
    if (!w) return;
    const row = input.closest('tr') as HTMLTableRowElement;
    const get = (f: string): string => (row.querySelector(`[data-field="${f}"]`) as HTMLInputElement | null)?.value ?? '';
    try {
      const score: Score = {};
      if (w.type === 'time') {
        const t = parseTime(get('time')), reps = parseNumber(get('reps'), 'Reps');
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
      save();
      $(`saved-${athleteId}`).textContent = scoreText(w, scores[athleteId]);
    } catch (error) {
      input.classList.add('invalid'); toast((error as Error).message);
    }
  }

  function renderRanking(): void {
    const cats = usedCategories(state);
    if (!cats.includes(rankingCat as Category)) rankingCat = cats[0] ?? '';
    if (rankingTab !== 'general' && !state.workouts.some(w => w.id === rankingTab)) rankingTab = 'general';
    chips('chips', [{ key: 'general', label: 'Classement général' }, ...state.workouts.map(w => ({ key: w.id, label: w.name }))], rankingTab, 'rank-tab');
    chips('chips2', cats.map(c => ({ key: c, label: categoryLabel(c) })), rankingCat, 'rank-cat');
    if (!rankingCat) { heading('Classements', ''); setTable([], [], 'Ajoutez des participants et des scores.'); return; }
    const cat = rankingCat;
    if (rankingTab === 'general') {
      heading('Classement général', state.method === 'places' ? 'Addition des places sur tous les WOD : le plus petit total gagne.' : 'Table de points (1er = 100, puis −3 par place) : le plus gros total gagne.');
      const rows = generalRanking(state, cat).map(r =>
        `<tr><td class="rank">${r.rank}</td><td><strong>${esc(athleteLabel(r.athlete))}</strong><div class="muted">Dossard ${esc(r.athlete.bib)}</div></td>${state.workouts.map(w => `<td>${r.places[w.id] === null ? '<span class="muted">—</span>' : `${r.places[w.id]}<sup>e</sup>`}</td>`).join('')}<td class="rank">${r.total}</td></tr>`);
      setTable(['RANG', 'PARTICIPANT', ...state.workouts.map(w => esc(w.name.toUpperCase())), state.method === 'places' ? 'TOTAL' : 'POINTS'], rows, 'Aucun participant dans cette catégorie.');
      return;
    }
    const w = state.workouts.find(x => x.id === rankingTab) as Workout;
    heading(w.name, TYPE_LABELS[w.type]);
    const rows = workoutRanking(state, w, cat).map(p =>
      `<tr><td class="rank">${p.rank}</td><td><strong>${esc(athleteLabel(p.athlete))}</strong><div class="muted">Dossard ${esc(p.athlete.bib)}</div></td><td class="score-saved">${esc(scoreText(w, p.score))}</td>${state.method === 'points' ? `<td>${pointsFor(p.rank)} pts</td>` : ''}</tr>`);
    setTable(['RANG', 'PARTICIPANT', 'SCORE', ...(state.method === 'points' ? ['POINTS'] : [])], rows, 'Aucun score saisi pour cette catégorie.');
  }

  function openAthlete(a?: Athlete): void {
    const form = $<HTMLFormElement>('athlete-form'); form.reset();
    const f = form.elements as unknown as Record<string, HTMLInputElement>;
    $('athlete-title').textContent = a ? 'Modifier le participant' : 'Ajouter un participant';
    f.id!.value = a?.id ?? ''; f.bib!.value = a?.bib ?? nextBib(state); f.format!.value = a?.format ?? 'SOLO';
    f.name1!.value = a?.name1 ?? ''; f.name2!.value = a?.name2 ?? ''; f.gender1!.value = a?.gender1 ?? 'H'; f.gender2!.value = a?.gender2 || 'F';
    $('athlete-error').textContent = ''; syncAthleteForm(); $<HTMLDialogElement>('athlete-dialog').showModal(); f.name1!.focus();
  }
  function syncAthleteForm(): void {
    const duo = ($<HTMLFormElement>('athlete-form').elements.namedItem('format') as HTMLSelectElement).value === 'DUO';
    document.querySelectorAll<HTMLElement>('#athlete-form .duo-only').forEach(el => { el.hidden = !duo; });
  }
  function submitAthlete(event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const v = (k: string): string => String(data.get(k) ?? '').trim();
    const format = v('format') === 'DUO' ? 'DUO' : 'SOLO';
    const athlete: Athlete = { id: v('id') || uid(), bib: v('bib'), format, name1: v('name1'), name2: format === 'DUO' ? v('name2') : '', gender1: v('gender1') === 'F' ? 'F' : 'H', gender2: format === 'DUO' ? v('gender2') === 'F' ? 'F' : 'H' : '' };
    if (format === 'DUO' && !athlete.name2) { $('athlete-error').textContent = 'Renseignez le participant 2.'; return; }
    if (state.athletes.some(a => a.bib === athlete.bib && a.id !== athlete.id)) { $('athlete-error').textContent = `Le dossard ${athlete.bib} est déjà pris.`; return; }
    const i = state.athletes.findIndex(a => a.id === athlete.id);
    if (i >= 0) state.athletes[i] = athlete; else state.athletes.push(athlete);
    save(); $<HTMLDialogElement>('athlete-dialog').close(); render(); toast(i >= 0 ? 'Participant modifié.' : 'Participant ajouté.');
  }

  const HELP: Record<ScoreType, string> = {
    time: 'For Time : on saisit le temps. Si un athlète n’a pas fini avant le time cap, on saisit ses reps : il est classé après tous ceux qui ont fini.',
    amrap: 'AMRAP : on saisit les tours et les reps. Indiquez les reps d’un tour pour saisir « 5 tours + 12 reps » ; sinon on saisit le total de reps.',
    load: 'Charge max : on saisit la meilleure charge réussie en kg.',
    reps: 'Max reps : on saisit un nombre (reps, calories ou mètres). Le plus grand gagne.',
  };
  function syncWorkoutForm(): void {
    const type = ($<HTMLFormElement>('workout-form').elements.namedItem('type') as HTMLSelectElement).value as ScoreType;
    document.querySelectorAll<HTMLElement>('#workout-form .type-time').forEach(el => { el.hidden = type !== 'time'; });
    document.querySelectorAll<HTMLElement>('#workout-form .type-amrap').forEach(el => { el.hidden = type !== 'amrap'; });
    $('workout-help').textContent = HELP[type];
  }
  function openWorkout(w?: Workout): void {
    const form = $<HTMLFormElement>('workout-form'); form.reset();
    const f = form.elements as unknown as Record<string, HTMLInputElement>;
    $('workout-title').textContent = w ? 'Modifier le WOD' : 'Ajouter un WOD';
    f.id!.value = w?.id ?? ''; f.name!.value = w?.name ?? `WOD ${state.workouts.length + 1}`; f.type!.value = w?.type ?? 'time';
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

  function openCompetition(): void {
    const f = $<HTMLFormElement>('competition-form').elements as unknown as Record<string, HTMLInputElement>;
    f.title!.value = state.title; f.date!.value = state.date; f.method!.value = state.method;
    $<HTMLDialogElement>('competition-dialog').showModal();
  }
  function submitCompetition(event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    state.title = String(data.get('title') ?? '').trim() || state.title; state.date = String(data.get('date') ?? '');
    state.method = data.get('method') === 'points' ? 'points' : 'places';
    save(); $<HTMLDialogElement>('competition-dialog').close(); render();
  }

  function exportExcel(): void {
    if (typeof XLSX === 'undefined') { toast('Export Excel indisponible.'); return; }
    const book = XLSX.utils.book_new();
    for (const sheet of exportRows(state)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    XLSX.writeFile(book, `${state.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'wod'} - résultats.xlsx`);
  }
  function loadDemo(): void {
    if ((state.athletes.length || state.workouts.length) && !confirm('L’exemple remplace la compétition actuelle. Continuer ?')) return;
    state = demo(today()); save(); view = 'ranking'; rankingTab = 'general'; render();
    $<HTMLDialogElement>('settings-dialog').close(); toast('Exemple chargé : 10 inscrits et 3 WOD. Regardez chaque onglet.');
  }

  function bind(): void {
    document.addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!t) return;
      const d = t.dataset;
      if (t.classList.contains('close-modal')) { t.closest('dialog')?.close(); return; }
      if (d.view) { view = d.view as View; render(); }
      else if (d.action === 'add-athlete') openAthlete();
      else if (d.action === 'add-workout') openWorkout();
      else if (d.editAthlete) openAthlete(state.athletes.find(a => a.id === d.editAthlete));
      else if (d.editWorkout) openWorkout(state.workouts.find(w => w.id === d.editWorkout));
      else if (d.deleteAthlete) {
        const a = state.athletes.find(x => x.id === d.deleteAthlete);
        if (a && confirm(`Supprimer ${athleteLabel(a)} et ses scores ?`)) {
          state.athletes = state.athletes.filter(x => x !== a);
          for (const s of Object.values(state.scores)) delete s[a.id];
          save(); render();
        }
      } else if (d.deleteWorkout) {
        const w = state.workouts.find(x => x.id === d.deleteWorkout);
        if (w && confirm(`Supprimer ${w.name} et tous ses scores ?`)) { state.workouts = state.workouts.filter(x => x !== w); delete state.scores[w.id]; save(); render(); }
      } else if (d.wod) { selectedWod = d.wod; render(); }
      else if (d.rankTab) { rankingTab = d.rankTab; render(); }
      else if (d.rankCat) { rankingCat = d.rankCat as Category; render(); }
    });
    $('table-body').addEventListener('change', e => { const i = e.target as HTMLInputElement; if (i.dataset.score) saveScore(i); });
    $('table-body').addEventListener('keydown', e => {
      const i = e.target as HTMLInputElement;
      if (e.key !== 'Enter' || !i.dataset.score) return;
      e.preventDefault(); saveScore(i);
      const all = [...document.querySelectorAll<HTMLInputElement>('#table-body input[data-field]')].filter(x => x.dataset.field === i.dataset.field);
      all[all.indexOf(i) + 1]?.focus();
    });
    $('athlete-form').addEventListener('submit', submitAthlete);
    $('athlete-form').addEventListener('change', syncAthleteForm);
    $('workout-form').addEventListener('submit', submitWorkout);
    $('workout-form').addEventListener('change', syncWorkoutForm);
    $('competition-form').addEventListener('submit', submitCompetition);
    $('edit-competition').addEventListener('click', openCompetition);
    $('settings-button').addEventListener('click', () => $<HTMLDialogElement>('settings-dialog').showModal());
    $('export-button').addEventListener('click', exportExcel);
    $('backup-button').addEventListener('click', () => download(`sauvegarde-wod-${state.date || today()}.json`, JSON.stringify(state, null, 2), 'application/json'));
    $('restore-button').addEventListener('click', () => $('restore-file').click());
    $<HTMLInputElement>('restore-file').addEventListener('change', async e => {
      const file = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = '';
      if (!file) return;
      try { state = validate(JSON.parse(await file.text())); save(); render(); $<HTMLDialogElement>('settings-dialog').close(); toast('Sauvegarde restaurée.'); }
      catch (error) { toast((error as Error).message); }
    });
    $('demo-button').addEventListener('click', loadDemo);
    $('demo-settings').addEventListener('click', loadDemo);
    $('reset-button').addEventListener('click', () => {
      if (!confirm('Effacer toute la compétition WOD (participants, WOD et scores) ?')) return;
      state = emptyCompetition(today()); save(); view = 'athletes'; render(); $<HTMLDialogElement>('settings-dialog').close();
    });
  }

  document.addEventListener('DOMContentLoaded', () => { load(); bind(); render(); });
}
