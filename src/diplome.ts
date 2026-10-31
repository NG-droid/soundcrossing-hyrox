// Diplômes de participation à imprimer, partagés par l’Hyrox et le WOD : une page A4 par participant,
// avec sa place dans sa catégorie et son résultat. « Enregistrer en PDF » dans la fenêtre d’impression pour l’envoyer.
namespace Diplome {
  export interface Detail { label: string; value: string; place: string; }
  export interface Data {
    names: string[];        // un nom (solo) ou deux (duo)
    event: string;          // nom de l’événement
    date: string;           // date ISO de l’événement
    group: string;          // « Open · Duo HH »
    phase: string;          // « Hyrox », « Classement général », « Finale »…
    rank: number; of: number;
    resultLabel: string; result: string;
    details?: Detail[];     // WOD : score et place sur chaque épreuve
  }
  const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  // « 1re place », « 2e place » : place est féminin.
  export function place(rank: number): string { return `${rank}<sup>${rank === 1 ? 're' : 'e'}</sup>`; }
  export function longDate(date: string): string {
    return date ? new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toLocaleUpperCase('fr-FR')) : '';
  }
  export function page(d: Data): string {
    const names = d.names.map(n => `<span>${esc(n)}</span>`).join('<em>&amp;</em>');
    const details = d.details?.length ? `<table class="diploma-details"><thead><tr><th>Épreuve</th><th>Score</th><th>Place</th></tr></thead><tbody>${d.details.map(x => `<tr><td>${esc(x.label)}</td><td>${esc(x.value)}</td><td>${x.place}</td></tr>`).join('')}</tbody></table>` : '';
    return `<article class="diploma${d.rank <= 3 ? ` diploma-top diploma-${d.rank}` : ''}"><div class="diploma-frame">
      <header><img src="assets/soundcrossing-logo.png" alt=""><div class="diploma-event"><strong>${esc(d.event)}</strong><span>${esc(longDate(d.date))}</span></div></header>
      <div class="diploma-title"><b>DIPLÔME</b><span>de participation</span></div>
      <p class="diploma-to">décerné à</p>
      <div class="diploma-names">${names}</div>
      <div class="diploma-group">${esc(d.group)}</div>
      <div class="diploma-result">
        <div><small>${esc(d.phase)}</small><strong>${place(d.rank)}</strong><span>place sur ${d.of}</span></div>
        <div><small>${esc(d.resultLabel)}</small><strong class="diploma-score">${esc(d.result)}</strong></div>
      </div>
      ${details}
      <footer><div class="diploma-sign">L’organisateur</div><div class="diploma-brand">SOUNDCROSSING</div></footer>
    </div></article>`;
  }
  // Imprime les diplômes seuls : le reste de la page est caché pendant l’impression (club.css).
  export function print(list: Data[]): void {
    let area = document.getElementById('diplome-print');
    if (!area) { area = document.createElement('div'); area.id = 'diplome-print'; area.className = 'diplome-print'; area.setAttribute('aria-hidden', 'true'); document.body.append(area); }
    area.innerHTML = list.map(page).join('');
    const done = (): void => { document.body.classList.remove('print-diplomes'); window.removeEventListener('afterprint', done); };
    // Attendre le logo, sinon il manque sur les diplômes imprimés.
    void Promise.all([...area.querySelectorAll('img')].map(i => i.decode().catch(() => undefined))).then(() => {
      document.body.classList.add('print-diplomes'); window.addEventListener('afterprint', done); window.print();
    });
  }
}

// Images Instagram du classement, partagées par l’Hyrox et le WOD : une image PNG par catégorie,
// au format post (1080 × 1350) ou story (1080 × 1920), aux couleurs du thème (Sombre ou Clair).
namespace Insta {
  export interface Row { rank: number; name: string; result: string; }
  export interface Card {
    event: string; date: string;
    kicker: string;          // « Classement final », « Finale provisoire »…
    group: string;           // « Open · Duo HH »
    resultLabel: string;     // « Temps », « Points »…
    rows: Row[];             // déjà triées par place
  }
  type Format = 'post' | 'story';
  const SIZE: Record<Format, { h: number; max: number }> = { post: { h: 1350, max: 10 }, story: { h: 1920, max: 16 } };
  const W = 1080, FONT = 'Arial, Helvetica, sans-serif';
  const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  let format: Format = 'post', cards: Card[] = [], urls: string[] = [];

  interface Palette { bg1: string; bg2: string; red: string; ink: string; muted: string; row: string; rowLine: string; pill: string; pillInk: string; groupBg: string; groupInk: string; logo: string; }
  function palette(): Palette {
    return document.documentElement.dataset.theme === 'blanc'
      ? { bg1: '#f6f7f8', bg2: '#dfe1e4', red: '#df282f', ink: '#171717', muted: '#5f646b', row: '#ffffff', rowLine: '#c9ccd1', pill: '#e4e6e9', pillInk: '#171717', groupBg: '#171717', groupInk: '#ffffff', logo: 'assets/soundcrossing-logo.png' }
      : { bg1: '#202226', bg2: '#0d0e10', red: '#d8242d', ink: '#eceef1', muted: '#9a9fa7', row: '#17181b', rowLine: '#2e3035', pill: '#2e3035', pillInk: '#eceef1', groupBg: '#d8242d', groupInk: '#ffffff', logo: 'assets/soundcrossing-logo-black.png' };
  }
  // Mêmes dégradés métalliques que les pastilles de rang de l’app (club.css).
  const MEDALS: Record<number, [string, string, string]> = { 1: ['#f7e08a', '#d4a12a', '#3a2a05'], 2: ['#e4e8ec', '#aab3bd', '#1f252b'], 3: ['#e2b393', '#b07a55', '#2e1a0c'] };

  const logos = new Map<string, Promise<HTMLImageElement | null>>();
  function logo(src: string): Promise<HTMLImageElement | null> {
    if (!logos.has(src)) logos.set(src, new Promise(done => { const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = src; }));
    return logos.get(src)!;
  }
  function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function spaced(ctx: CanvasRenderingContext2D, px: number): void { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; }
  // Texte réduit puis coupé avec « … » s’il dépasse la largeur disponible.
  function fit(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, min: number, weight = 'bold'): string {
    for (let s = size; s >= min; s -= 2) { ctx.font = `${weight} ${s}px ${FONT}`; if (ctx.measureText(text).width <= max) return text; }
    let t = text; while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }

  async function draw(card: Card, f: Format): Promise<HTMLCanvasElement> {
    const { h: H, max } = SIZE[f], p = palette(), story = f === 'story';
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, p.bg1); bg.addColorStop(1, p.bg2);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.red; ctx.fillRect(0, 0, W, 12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // En-tête : logo, événement, date, type de classement, catégorie.
    let y = story ? 150 : 70;
    const img = await logo(p.logo), ls = story ? 190 : 150;
    if (img) ctx.drawImage(img, (W - ls) / 2, y, ls, ls);
    y += ls + 70;
    ctx.fillStyle = p.ink; spaced(ctx, 1); ctx.fillText(fit(ctx, card.event.toLocaleUpperCase('fr-FR'), W - 140, 54, 34), W / 2, y);
    y += 46; ctx.fillStyle = p.muted; spaced(ctx, 0); ctx.font = `28px ${FONT}`; ctx.fillText(Diplome.longDate(card.date), W / 2, y);
    y += 62; ctx.fillStyle = p.red; spaced(ctx, 6); ctx.font = `bold 28px ${FONT}`; ctx.fillText(card.kicker.toLocaleUpperCase('fr-FR'), W / 2, y);
    y += 26; spaced(ctx, 1);
    const groupText = fit(ctx, card.group.toLocaleUpperCase('fr-FR'), W - 240, 40, 28), gw = ctx.measureText(groupText).width + 80;
    ctx.fillStyle = p.groupBg; round(ctx, (W - gw) / 2, y, gw, 68, 34); ctx.fill();
    ctx.fillStyle = p.groupInk; ctx.textBaseline = 'middle'; ctx.fillText(groupText, W / 2, y + 36);
    y += 68 + (story ? 70 : 44);
    // Liste : rang, nom(s), résultat.
    const rows = card.rows.slice(0, max), more = card.rows.length - rows.length;
    const x0 = 70, x1 = W - 70, footer = story ? 190 : 110, labelH = 40;
    const rh = Math.min(story ? 92 : 80, Math.floor((H - footer - y - labelH - (more ? 50 : 0)) / Math.max(rows.length, 1)));
    // Peu de classés : la liste descend un peu pour ne pas laisser un grand vide en bas.
    y += Math.max(0, (H - footer - y - labelH - rows.length * rh - (more ? 50 : 0)) * 0.35);
    ctx.font = `bold 22px ${FONT}`; spaced(ctx, 3); ctx.fillStyle = p.muted;
    ctx.textAlign = 'left'; ctx.fillText('PLACE', x0 + 6, y + 14);
    ctx.textAlign = 'right'; ctx.fillText(card.resultLabel.toLocaleUpperCase('fr-FR'), x1 - 28, y + 14);
    y += labelH; spaced(ctx, 0);
    for (const r of rows) {
      const top = y + 5, hh = rh - 10, medal = MEDALS[r.rank];
      ctx.fillStyle = p.row; round(ctx, x0, top, x1 - x0, hh, 16); ctx.fill();
      ctx.strokeStyle = medal ? medal[1] : p.rowLine; ctx.lineWidth = medal ? 3 : 2; ctx.stroke();
      // Pastille de rang (or, argent, bronze pour le podium).
      const pw = 96, ph = Math.min(hh - 18, 56), px = x0 + 16, py = top + (hh - ph) / 2;
      if (medal) { const g = ctx.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, medal[0]); g.addColorStop(1, medal[1]); ctx.fillStyle = g; } else ctx.fillStyle = p.pill;
      round(ctx, px, py, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = medal ? medal[2] : p.pillInk; ctx.textAlign = 'center'; ctx.font = `bold ${Math.round(ph * 0.55)}px ${FONT}`;
      ctx.fillText(`${r.rank}${r.rank === 1 ? 'er' : 'e'}`, px + pw / 2, py + ph / 2 + 2);
      const size = Math.min(36, Math.round(hh * 0.5));
      ctx.textAlign = 'right'; ctx.font = `bold ${size}px ${FONT}`; ctx.fillStyle = p.ink;
      ctx.fillText(r.result, x1 - 28, top + hh / 2 + 2);
      const resultW = ctx.measureText(r.result).width;
      ctx.textAlign = 'left'; ctx.fillStyle = p.ink;
      ctx.fillText(fit(ctx, r.name, x1 - 28 - resultW - 40 - (px + pw + 28), size, 26), px + pw + 28, top + hh / 2 + 2);
      y += rh;
    }
    if (more) { ctx.textAlign = 'center'; ctx.fillStyle = p.muted; ctx.font = `26px ${FONT}`; ctx.fillText(`+ ${more} autre${more > 1 ? 's' : ''} participant${more > 1 ? 's' : ''} classé${more > 1 ? 's' : ''}`, W / 2, y + 30); }
    // Pied : signature du club.
    ctx.textAlign = 'center'; ctx.fillStyle = p.red; ctx.fillRect(W / 2 - 40, H - footer + 30, 80, 4);
    ctx.fillStyle = p.ink; spaced(ctx, 10); ctx.font = `bold 30px ${FONT}`; ctx.fillText('SOUNDCROSSING', W / 2, H - footer + 78);
    spaced(ctx, 0);
    return canvas;
  }

  const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fileName = (c: Card): string => `${slug(c.event) || 'Soundcrossing'}-${slug(c.group) || 'classement'}-${format}.png`;
  function download(i: number): void {
    const a = document.createElement('a'); a.href = urls[i]!; a.download = fileName(cards[i]!); document.body.append(a); a.click(); a.remove();
  }

  function dialog(): HTMLDialogElement {
    let d = document.getElementById('insta-dialog') as HTMLDialogElement | null;
    if (d) return d;
    d = document.createElement('dialog'); d.id = 'insta-dialog'; d.className = 'modal insta-modal';
    d.innerHTML = `<div class="modal-heading"><div><div class="eyebrow">PARTAGER LES RÉSULTATS</div><h2>Images Instagram</h2></div><button type="button" class="icon-button" data-insta="close" aria-label="Fermer">×</button></div>
      <fieldset class="format-field"><legend>Format</legend><div class="format-choice"><button type="button" data-insta-format="post">Post<small>1080 × 1350, dans le fil</small></button><button type="button" data-insta-format="story">Story<small>1080 × 1920, plein écran</small></button></div></fieldset>
      <p class="modal-note">Une image par catégorie, aux couleurs du thème choisi (Paramètres → Apparence). Cliquez sur une image pour l’enregistrer, puis publiez-la depuis votre téléphone.</p>
      <div id="insta-previews" class="insta-previews"></div>
      <div class="modal-footer"><span class="spacer"></span><button type="button" class="button" data-insta="close">Fermer</button><button type="button" class="button primary" data-insta="all">Tout télécharger</button></div>`;
    d.addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-insta],[data-insta-format],[data-insta-save]'); if (!t) return;
      if (t.dataset.instaFormat) { format = t.dataset.instaFormat as Format; void render(); }
      else if (t.dataset.instaSave) download(Number(t.dataset.instaSave));
      else if (t.dataset.insta === 'close') d!.close();
      // Petite pause entre les fichiers : certains navigateurs bloquent les téléchargements trop rapprochés.
      else if (t.dataset.insta === 'all') urls.forEach((_, i) => setTimeout(() => download(i), i * 400));
    });
    document.body.append(d);
    return d;
  }

  async function render(): Promise<void> {
    const d = dialog();
    d.querySelectorAll<HTMLButtonElement>('[data-insta-format]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.instaFormat === format)));
    d.querySelector<HTMLElement>('.insta-previews')!.dataset.format = format;
    const list = cards, f = format;
    const made = await Promise.all(list.map(c => draw(c, f).then(cv => cv.toDataURL('image/png'))));
    if (list !== cards || f !== format) return; // un autre choix entre-temps
    urls = made;
    d.querySelector('#insta-previews')!.innerHTML = cards.map((c, i) => `<figure><button type="button" data-insta-save="${i}" title="Enregistrer ${esc(fileName(c))}"><img src="${urls[i]}" alt="${esc(`${c.kicker} ${c.group}`)}"></button><figcaption>${esc(c.group)}<small>${c.rows.length} classé${c.rows.length > 1 ? 's' : ''}</small></figcaption></figure>`).join('');
    const all = d.querySelector<HTMLButtonElement>('[data-insta="all"]')!;
    all.hidden = cards.length < 2;
  }

  export function open(list: Card[]): void {
    cards = list.filter(c => c.rows.length); urls = [];
    const d = dialog(); d.querySelector('#insta-previews')!.innerHTML = '<p class="modal-note">Préparation des images…</p>';
    if (!d.open) d.showModal();
    void render();
  }
}
