// Écran public : classements en plein écran pour un projecteur ou une télé. Lecture seule.
// ecran.html?source=hyrox ou ?source=wod. Les catégories défilent toutes seules ; les données se relisent
// en continu, donc un score saisi dans la fenêtre principale apparaît ici quelques secondes plus tard.
namespace Ecran {
  const HYROX_KEY = 'pace.hyrox.session.v1', WOD_KEY = 'soundcrossing-wod.v1';
  const params = new URLSearchParams(location.search);
  const source: 'hyrox' | 'wod' = params.get('source') === 'wod' ? 'wod' : 'hyrox';
  const SLIDE_MS = Math.min(60, Math.max(4, Number(params.get('duree')) || 12)) * 1000;
  const ROWS = 8, REFRESH_MS = 3000;
  const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
  const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const longDate = (date: string): string => date ? new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toLocaleUpperCase('fr-FR')) : '';

  interface Row { rank: number; names: string[]; cells: string[]; }
  interface Slide { key: string; kicker: string; title: string; final: boolean; columns: string[]; rows: Row[]; empty: string; }
  interface Board { title: string; date: string; slides: Slide[]; }

  function readRaw(key: string): string | null {
    try { return localStorage.getItem(key) ?? localStorage.getItem(`${key}.recovery`); } catch { return null; }
  }
  // Navigateur vide (données effacées) : la copie sur le disque, gardée par server.py, prend le relais.
  async function readDisk(path: string): Promise<unknown> {
    try { const response = await fetch(path, { cache: 'no-store' }); return response.ok ? await response.json() : null; } catch { return null; }
  }
  // Écart avec le premier, court pour être lu de loin : +5:52, ou +1:02:10 au-delà d’une heure.
  function gap(ms: number): string {
    const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, pad = (n: number): string => String(n).padStart(2, '0');
    return `+${h ? `${h}:${pad(m)}` : m}:${pad(s % 60)}`;
  }
  const nameParts = (format: string, name1: string, name2: string): string[] => format === 'DUO' ? [name1, name2] : [name1];

  function hyroxBoard(store: Pace.Store): Board | null {
    const session = store.session;
    let selected = '';
    try { selected = localStorage.getItem(`${HYROX_KEY}.event`) ?? ''; } catch { /* Premier événement par défaut. */ }
    const race = session.races.find(r => r.id === selected) ?? session.races[0];
    if (!race) return null;
    const ids = new Set(session.races.filter(r => r.date === race.date).map(r => r.id));
    const entries = session.entries.filter(e => ids.has(e.raceId) && (race.format === 'MIXED' || e.format === race.format));
    const final = Pace.eventResultsFinal(session, race);
    const slides = Pace.eventRankingGroups(race, entries).flatMap(({ level, format }): Slide[] => {
      const inGroup = entries.filter(e => Pace.formatKey(e) === format && (e.level ?? '') === level);
      if (!inGroup.length) return [];
      const ranking = Pace.rankingFor(session, format, race.date, level), best = ranking[0]?.entry.durationMs ?? 0;
      const sample = inGroup[0] as Pace.Entry;
      return [{
        key: `${level}:${format}`, kicker: final ? 'CLASSEMENT FINAL' : 'CLASSEMENT PROVISOIRE', final,
        title: Pace.groupLabel(level, Pace.formatLabel(sample)), columns: ['RANG', sample.format === 'DUO' ? 'DUO' : 'PARTICIPANT', 'TEMPS', 'ÉCART'],
        rows: ranking.map(({ entry, rank }) => ({ rank, names: nameParts(entry.format, entry.name1, entry.name2),
          cells: [Pace.clock(entry.durationMs ?? 0), entry.durationMs === best ? '—' : gap((entry.durationMs ?? 0) - best)] })),
        empty: `${inGroup.length} inscrit(s) · premières arrivées à venir`,
      }];
    });
    return { title: race.title, date: race.date, slides };
  }

  function wodBoard(store: Wod.Store): Board | null {
    let selected = '';
    try { selected = localStorage.getItem(`${WOD_KEY}.event`) ?? ''; } catch { /* Événement enregistré par défaut. */ }
    const c = store.events.find(e => e.id === selected) ?? store.events.find(e => e.id === store.selectedId) ?? store.events[0];
    if (!c) return null;
    const final = Wod.hasFinal(c);
    const phases: Wod.Phase[] = final && Wod.phaseWorkouts(c, 'final').some(w => Object.keys(c.scores[w.id] ?? {}).length) ? ['final', 'qualif'] : ['qualif'];
    const slides = phases.flatMap(phase => Wod.usedGroups(c).flatMap((cat): Slide[] => {
      const wods = Wod.phaseWorkouts(c, phase), rows = Wod.generalRanking(c, cat, phase);
      if (!rows.length) return [];
      const done = Wod.pendingScores(c, cat, phase) === 0;
      const scored = rows.some(r => Object.values(r.places).some(p => p !== null));
      const label = phase === 'final' ? 'FINALE' : final ? 'QUALIFICATIONS' : 'CLASSEMENT GÉNÉRAL';
      return [{
        key: `${phase}:${cat}`, kicker: `${label} · ${done ? 'FINAL' : 'PROVISOIRE'}`, final: done, title: cat,
        columns: ['RANG', 'PARTICIPANT', ...wods.map(w => w.name.toUpperCase()), c.method === 'places' ? 'TOTAL' : 'POINTS'],
        rows: scored ? rows.map(r => ({ rank: r.rank, names: nameParts(r.athlete.format, r.athlete.name1, r.athlete.name2),
          cells: [...wods.map(w => { const p = r.places[w.id]; return p === null || p === undefined ? '–' : `${p}<sup>${p === 1 ? 'er' : 'e'}</sup>`; }), String(r.total)] })) : [],
        empty: `${rows.length} inscrit(s) · premiers scores à venir`,
      }];
    }));
    return { title: c.title, date: c.date, slides };
  }

  let board: Board | null = null, lastRaw: string | null = null;
  async function refresh(): Promise<void> {
    const key = source === 'wod' ? WOD_KEY : HYROX_KEY;
    let raw = readRaw(key);
    if (raw === null) { const disk = await readDisk(source === 'wod' ? '/data/wod' : '/data'); raw = disk ? JSON.stringify(disk) : null; }
    let selected = '';
    try { selected = localStorage.getItem(`${key}.event`) ?? ''; } catch { /* Sans importance. */ }
    const signature = `${selected}|${raw}`;
    if (signature === lastRaw) return;
    lastRaw = signature;
    try {
      board = raw === null ? null : source === 'wod' ? wodBoard(Wod.validateStore(JSON.parse(raw))) : hyroxBoard(Pace.validateStore(JSON.parse(raw)));
    } catch { return; } // Écriture en cours ou données illisibles : on garde l’affichage précédent.
    render(false);
  }

  // Défilement : chaque catégorie, page par page (ROWS lignes), puis la suivante. On reste sur la même
  // catégorie quand les données changent, pour qu’un nouveau score ne fasse pas sauter l’écran.
  let slideKey = '', page = 0, paused = false, timer: number | undefined, startedAt = 0;
  function pages(slide: Slide): number { return Math.max(1, Math.ceil(slide.rows.length / ROWS)); }
  function step(delta: number): void {
    const slides = board?.slides ?? [];
    if (!slides.length) return;
    let index = Math.max(0, slides.findIndex(s => s.key === slideKey));
    page += delta;
    if (page >= pages(slides[index] as Slide)) { index = (index + 1) % slides.length; page = 0; }
    else if (page < 0) { index = (index - 1 + slides.length) % slides.length; page = pages(slides[index] as Slide) - 1; }
    slideKey = (slides[index] as Slide).key;
    render(true);
  }
  function schedule(): void {
    window.clearTimeout(timer); startedAt = Date.now();
    const bar = $('progress'); bar.style.transition = 'none'; bar.style.width = '0';
    if (paused || !(board?.slides.length)) return;
    void bar.offsetWidth; bar.style.transition = `width ${SLIDE_MS}ms linear`; bar.style.width = '100%';
    timer = window.setTimeout(() => step(1), SLIDE_MS);
  }

  function render(moved: boolean): void {
    $('event').textContent = board?.title ?? '';
    $('date').textContent = longDate(board?.date ?? '');
    const slides = board?.slides ?? [];
    let index = slides.findIndex(s => s.key === slideKey);
    if (index < 0) { index = 0; page = 0; moved = true; }
    const slide = slides[index];
    $('screen').classList.toggle('is-waiting', !slide);
    if (!slide) {
      slideKey = ''; $('kicker').textContent = source === 'wod' ? 'COMPÉTITION WOD' : 'HYROX';
      $('category').textContent = board ? 'Classements à venir' : 'Aucun événement';
      $('board').innerHTML = `<p class="board-empty">${board ? 'Les classements s’afficheront ici dès les premiers résultats.' : `Créez un événement dans l’app ${source === 'wod' ? 'WOD' : 'Hyrox'}.`}</p>`;
      $('position').textContent = ''; schedule(); return;
    }
    slideKey = slide.key; page = Math.min(page, pages(slide) - 1);
    $('kicker').textContent = slide.kicker;
    $('category').textContent = slide.title;
    const visible = slide.rows.slice(page * ROWS, page * ROWS + ROWS);
    const head = `<div class="board-row board-head">${slide.columns.map(c => `<span>${esc(c)}</span>`).join('')}</div>`;
    const body = visible.map(r => `<div class="board-row${r.rank <= 3 ? ` top top-${r.rank}` : ''}"><span><b class="rank${slide.final ? ` rank-${r.rank}` : ' provisional'}">${r.rank}</b></span><span class="names">${r.names.map(esc).join('<i>&amp;</i>')}</span>${r.cells.map(c => `<span class="value">${c}</span>`).join('')}</div>`).join('');
    const grid = `grid-template-columns:clamp(70px,8vw,140px) minmax(0,1fr) repeat(${slide.columns.length - 2},minmax(90px,${slide.columns.length > 5 ? '11vw' : '17vw'}))`;
    $('board').innerHTML = visible.length ? `<div class="board-table" style="${grid}">${head}${body}</div>` : `<p class="board-empty">${esc(slide.empty)}</p>`;
    $('position').textContent = `Catégorie ${index + 1}/${slides.length}${pages(slide) > 1 ? ` · page ${page + 1}/${pages(slide)}` : ''}`;
    if (moved) { $('board').classList.remove('enter'); void $('board').offsetWidth; $('board').classList.add('enter'); schedule(); }
    else if (!timer || Date.now() - startedAt >= SLIDE_MS) schedule();
  }

  function fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
  function tick(): void { $('clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  let idle: number | undefined;
  function wake(): void { document.body.classList.remove('idle'); window.clearTimeout(idle); idle = window.setTimeout(() => document.body.classList.add('idle'), 3000); }

  document.addEventListener('DOMContentLoaded', () => {
    $('brand').textContent = source === 'wod' ? 'SOUND CROSSING / WOD' : 'SOUND CROSSING / HYROX';
    document.title = `Soundcrossing — Écran classement ${source === 'wod' ? 'WOD' : 'Hyrox'}`;
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === ' ') { e.preventDefault(); paused = !paused; $('paused').hidden = !paused; schedule(); }
      else if (e.key.toLowerCase() === 'f') fullscreen();
    });
    $('screen').addEventListener('click', fullscreen);
    document.addEventListener('mousemove', wake);
    window.addEventListener('storage', () => void refresh());
    window.setInterval(() => void refresh(), REFRESH_MS);
    window.setInterval(tick, 10000); tick(); wake();
    void refresh();
  });
}
