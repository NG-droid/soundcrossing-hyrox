"use strict";
// Diplômes de participation à imprimer, partagés par l’Hyrox et le WOD : une page A4 par participant,
// avec sa place dans sa catégorie et son résultat. « Enregistrer en PDF » dans la fenêtre d’impression pour l’envoyer.
var Diplome;
(function (Diplome) {
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    // « 1re place », « 2e place » : place est féminin.
    function place(rank) { return `${rank}<sup>${rank === 1 ? 're' : 'e'}</sup>`; }
    Diplome.place = place;
    function longDate(date) {
        return date ? new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toLocaleUpperCase('fr-FR')) : '';
    }
    Diplome.longDate = longDate;
    function page(d) {
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
    Diplome.page = page;
    // Imprime les diplômes seuls : le reste de la page est caché pendant l’impression (club.css).
    function print(list) {
        let area = document.getElementById('diplome-print');
        if (!area) {
            area = document.createElement('div');
            area.id = 'diplome-print';
            area.className = 'diplome-print';
            area.setAttribute('aria-hidden', 'true');
            document.body.append(area);
        }
        area.innerHTML = list.map(page).join('');
        const done = () => { document.body.classList.remove('print-diplomes'); window.removeEventListener('afterprint', done); };
        // Attendre le logo, sinon il manque sur les diplômes imprimés.
        void Promise.all([...area.querySelectorAll('img')].map(i => i.decode().catch(() => undefined))).then(() => {
            document.body.classList.add('print-diplomes');
            window.addEventListener('afterprint', done);
            window.print();
        });
    }
    Diplome.print = print;
})(Diplome || (Diplome = {}));
