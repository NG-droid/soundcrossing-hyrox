"use strict";
// Case de temps unique partagée par l’Hyrox (heure d’arrivée) et le WOD (temps réalisé) :
// on tape les chiffres, les « : » se placent tout seuls (074512 → 07:45:12).
var Saisie;
(function (Saisie) {
    const pad = (n) => String(n).padStart(2, '0');
    // Met en forme ce qui est tapé : deux chiffres par bloc, au plus hh:mm:ss.
    // Un séparateur tapé après un seul chiffre complète le bloc (7: → 07:).
    // Pour un WOD court (cap de moins d’une heure), la case n’a que deux blocs : mm:ss.
    function mask(raw, max = 3) {
        const blocks = [];
        let current = '';
        for (const ch of raw) {
            if (blocks.length === max)
                break;
            if (/\d/.test(ch)) {
                current += ch;
                if (current.length === 2) {
                    blocks.push(current);
                    current = '';
                }
            }
            else if (/[:hm.,\s]/i.test(ch) && current.length === 1) {
                blocks.push(`0${current}`);
                current = '';
            }
        }
        if (current && blocks.length < max)
            blocks.push(current);
        return blocks.join(':');
    }
    Saisie.mask = mask;
    // Heures, minutes, secondes lues dans la case ; null si elle est vide.
    function parts(text, short = false) {
        const value = mask(text.trim(), short ? 2 : 3);
        if (!value)
            return null;
        if (!/^\d{2}(:\d{2}){0,2}$/.test(value))
            throw Error(`Temps incomplet : « ${text.trim()} ». Écrivez ${short ? 'mm:ss, par ex. 12:30' : 'hh:mm:ss, par ex. 01:05:30'}.`);
        const nums = value.split(':').map(Number);
        if (short) {
            const [m, s = 0] = nums;
            if (s > 59)
                throw Error('Les secondes doivent être entre 00 et 59.');
            return [0, m, s];
        }
        const [h, m = 0, s = 0] = nums;
        if (m > 59 || s > 59)
            throw Error('Minutes et secondes doivent être entre 00 et 59.');
        return [h, m, s];
    }
    Saisie.parts = parts;
    // Heure d’arrivée « HH:MM:SS » pour l’Hyrox ('' si vide).
    function clockTime(text) {
        const p = parts(text);
        if (!p)
            return '';
        if (p[0] > 23)
            throw Error('Heure d’arrivée : les heures vont de 00 à 23.');
        return p.map(pad).join(':');
    }
    Saisie.clockTime = clockTime;
    // Durée en millisecondes pour le WOD (null si vide) ; short = case mm:ss.
    function duration(text, short = false) {
        const p = parts(text, short);
        if (!p)
            return null;
        const ms = ((p[0] * 60 + p[1]) * 60 + p[2]) * 1000;
        if (ms <= 0)
            throw Error('Temps : saisissez une durée.');
        return ms;
    }
    Saisie.duration = duration;
    function fromMs(ms, short = false) {
        if (ms === null || ms === undefined)
            return '';
        const s = Math.round(ms / 1000);
        if (short)
            return [Math.floor(s / 60), s % 60].map(pad).join(':');
        return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(pad).join(':');
    }
    Saisie.fromMs = fromMs;
    // La case de temps unique de l’app, Hyrox comme WOD : même aspect, même taille, même frappe partout
    // (arrivée et départ Hyrox, temps total, temps For Time du WOD). blocks = 3 pour hh:mm:ss, 2 pour hh:mm ou mm:ss.
    function box(attrs, value, label, blocks = 3) {
        return `<input class="score-time time-box" ${attrs} data-blocks="${blocks}" value="${value}" placeholder="${blocks === 2 ? '--:--' : '--:--:--'}" inputmode="numeric" maxlength="${blocks === 2 ? 5 : 8}" autocomplete="off" aria-label="${label}">`;
    }
    Saisie.box = box;
    // Met en forme pendant la frappe, dans toutes les cases .time-box de la page.
    function install(root = document) {
        root.addEventListener('input', event => {
            const input = event.target;
            if (!input.classList?.contains('time-box'))
                return;
            const atEnd = input.selectionStart === input.value.length, next = mask(input.value, input.dataset.blocks === '2' ? 2 : 3);
            if (next !== input.value) {
                input.value = next;
                if (atEnd)
                    input.setSelectionRange(next.length, next.length);
            }
            input.classList.remove('invalid');
        }, true); // Capture : la case est mise en forme avant que l’app ne lise sa valeur.
    }
    Saisie.install = install;
    Saisie.MAX_FICTIFS = 80;
    function inscriptionsFictives(format, personnes) {
        const hommes = ['Alex', 'Hugo', 'Tom', 'Lucas', 'Jules', 'Paul', 'Max', 'Théo', 'Louis', 'Nathan', 'Léo', 'Gabriel', 'Arthur', 'Raphaël', 'Ethan', 'Noah', 'Adam', 'Victor', 'Sacha', 'Mathis', 'Enzo', 'Baptiste', 'Simon', 'Antoine', 'Clément', 'Quentin', 'Romain', 'Julien', 'Bastien', 'Yanis', 'Martin', 'Axel', 'Samuel', 'Robin', 'Malo', 'Oscar', 'Marius', 'Kylian', 'Tristan', 'Valentin', 'Damien', 'Florian', 'Kevin', 'Olivier', 'Pierre'];
        const femmes = ['Emma', 'Léa', 'Zoé', 'Manon', 'Nina', 'Inès', 'Chloé', 'Sarah', 'Camille', 'Jade', 'Louise', 'Alice', 'Lina', 'Rose', 'Anna', 'Julia', 'Lola', 'Clara', 'Eva', 'Juliette', 'Margot', 'Lou', 'Agathe', 'Romane', 'Mila', 'Elsa', 'Lucie', 'Pauline', 'Laura', 'Marie', 'Charlotte', 'Océane', 'Mathilde', 'Justine', 'Anaïs', 'Léna', 'Ambre', 'Maëlle', 'Noémie', 'Héloïse', 'Elise', 'Audrey', 'Céline', 'Sophie', 'Julie'];
        const noms = ['Martin', 'Durand', 'Robert', 'Petit', 'Leroy', 'Moreau', 'Garcia', 'Bernard', 'Roux', 'Faure', 'Morel', 'Girard', 'Fabre', 'Vidal', 'Lambert', 'Roche', 'Blanc', 'Denis', 'Fournier', 'Mercier', 'Dupont', 'Bonnet', 'Legrand', 'Garnier', 'Chevalier', 'Rousseau', 'Perrin', 'Gauthier', 'Masson', 'Muller'];
        let h = 0, f = 0, k = 0;
        const personne = (g) => `${g === 'H' ? hommes[h++ % hommes.length] : femmes[f++ % femmes.length]} ${noms[k++ % noms.length]}`;
        const total = Math.max(1, Math.min(Saisie.MAX_FICTIFS, Math.floor(personnes) || 0));
        const equipes = format === 'DUO' ? Math.max(1, Math.floor(total / 2)) : format === 'MIXED' ? Math.floor(total / 4) : 0;
        const solos = format === 'DUO' ? 0 : total - 2 * equipes;
        const duoTypes = [['H', 'H'], ['F', 'F'], ['H', 'F']];
        const liste = [];
        for (let s = 0, d = 0; s < solos || d < equipes;) {
            if (s < solos && (s <= d || d >= equipes)) {
                const g = s++ % 2 ? 'F' : 'H';
                liste.push({ name1: personne(g), name2: '', gender1: g, gender2: '' });
            }
            else {
                const [g1, g2] = duoTypes[d++ % 3];
                liste.push({ name1: personne(g1), name2: personne(g2), gender1: g1, gender2: g2 });
            }
        }
        return liste;
    }
    Saisie.inscriptionsFictives = inscriptionsFictives;
    // Résumé lisible pour la fenêtre de création : « 15 duos : 5 HH, 5 FF, 5 HF ».
    function resumeFictifs(liste) {
        const cat = (i) => !i.name2 ? i.gender1 : i.gender1 === i.gender2 ? i.gender1 + i.gender2 : 'HF';
        const compte = (c) => liste.filter(i => cat(i) === c).length;
        const solos = liste.filter(i => !i.name2).length, duos = liste.length - solos, parts = [];
        if (solos)
            parts.push(`${solos} solo${solos > 1 ? 's' : ''} (${compte('H')} H, ${compte('F')} F)`);
        if (duos)
            parts.push(`${duos} duo${duos > 1 ? 's' : ''} (${compte('HH')} HH, ${compte('FF')} FF, ${compte('HF')} HF)`);
        const personnes = solos + 2 * duos;
        return `${parts.join(' + ')} · ${personnes} personne${personnes > 1 ? 's' : ''}`;
    }
    Saisie.resumeFictifs = resumeFictifs;
})(Saisie || (Saisie = {}));
// Témoin de sauvegarde, partagé par l’Hyrox et le WOD : la pastille de l’en-tête dit si la copie
// sur l’ordinateur (dossier Documents/Soundcrossing, écrit par server.py) est à jour.
var Temoin;
(function (Temoin) {
    let disque = 'attente', local = true, depuis = 0, dossier = '', lenteur = 0;
    const heure = (ms) => new Date(ms).toLocaleTimeString('fr-FR');
    function afficher() {
        const el = document.getElementById('save-status');
        if (!el)
            return;
        const ou = dossier || 'Documents/Soundcrossing';
        const [css, texte, titre] = !local ? ['erreur', 'Enregistrement indisponible', 'Le navigateur refuse d’enregistrer. Exportez une sauvegarde : aucune modification non sauvegardée n’est appliquée.']
            : disque === 'ok' ? ['ok', 'Enregistré sur l’ordinateur', depuis ? `Dernière copie à ${heure(depuis)} dans ${ou}` : `Copie à jour dans ${ou}`]
                : disque === 'attente' ? ['attente', 'Enregistrement…', `Copie en cours dans ${ou}`]
                    : disque === 'navigateur' ? ['attente', 'Navigateur seulement', 'Page ouverte sans le lanceur Soundcrossing : rien n’est copié sur l’ordinateur. Exportez une sauvegarde.']
                        : disque === 'conflit' ? ['erreur', 'Non enregistré sur l’ordinateur', 'La copie sur l’ordinateur a été modifiée par un autre navigateur : rien n’a été écrasé. Rechargez la page.']
                            : ['erreur', 'Non enregistré sur l’ordinateur', 'Le lanceur Soundcrossing ne répond plus. Rouvrez-le : la copie reprendra toute seule. En attendant, les données restent dans ce navigateur.'];
        el.className = `save-badge ${css}`;
        el.title = titre;
        el.innerHTML = `<i></i>${texte}`;
    }
    // false : le navigateur lui-même n’enregistre plus (stockage bloqué ou illisible).
    function navigateur(ok) { local = ok; afficher(); }
    Temoin.navigateur = navigateur;
    // L’état « attente » n’apparaît que si la copie traîne : une écriture rapide ne fait pas clignoter la pastille.
    function etat(valeur, savedAt = 0) {
        window.clearTimeout(lenteur);
        if (valeur === 'attente') {
            lenteur = window.setTimeout(() => { disque = 'attente'; afficher(); }, 600);
            return;
        }
        disque = valeur;
        if (valeur === 'ok' && savedAt)
            depuis = savedAt;
        afficher();
    }
    Temoin.etat = etat;
    // Version en bas des Paramètres (Hyrox et WOD), donnée par le lanceur : « Version 57 · 21 octobre 2026 ».
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    function texteVersion(v) {
        const date = v && typeof v.date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.date) : null;
        if (!date)
            return 'Version inconnue';
        const jour = `${Number(date[3]) === 1 ? '1er' : Number(date[3])} ${MOIS[Number(date[2]) - 1]} ${date[1]}`;
        return typeof v?.numero === 'string' && /^\d+$/.test(v.numero) ? `Version ${v.numero} · ${jour}` : `Version du ${jour}`;
    }
    Temoin.texteVersion = texteVersion;
    function version(v) {
        const el = document.getElementById('app-version');
        if (el)
            el.textContent = texteVersion(v);
    }
    // Vérifie toutes les 10 s que le lanceur répond ; quand il revient, relancer() recopie les données.
    function surveiller(relancer) {
        if (typeof fetch !== 'function' || location.protocol === 'file:') {
            etat('navigateur');
            version();
            return;
        }
        const ping = async () => {
            try {
                const response = await fetch('/health', { cache: 'no-store' });
                if (!response.ok)
                    throw Error();
                const info = await response.json();
                if (typeof info.data === 'string' && info.data !== dossier) {
                    dossier = info.data;
                    afficher();
                }
                version(info.version);
                if (disque === 'erreur')
                    relancer();
            }
            catch {
                etat('erreur');
            }
        };
        void ping();
        window.setInterval(() => { void ping(); }, 10000);
    }
    Temoin.surveiller = surveiller;
})(Temoin || (Temoin = {}));
// Thème de l’application (Paramètres → Apparence), partagé par l’Hyrox et le WOD : « blanc » ou « black ».
// Le choix est gardé dans ce navigateur ; un petit script dans <head> l’applique avant l’affichage.
var Theme;
(function (Theme) {
    const CLE = 'soundcrossing-theme';
    function lire() {
        try {
            return localStorage.getItem(CLE) === 'black' ? 'black' : 'blanc';
        }
        catch {
            return 'blanc';
        }
    }
    Theme.lire = lire;
    function appliquer(nom) {
        const root = document.documentElement;
        if (nom === 'black')
            root.dataset.theme = 'black';
        else
            delete root.dataset.theme;
        document.querySelector('link[rel="icon"]')?.setAttribute('href', nom === 'black' ? 'assets/favicon-black.png' : 'assets/favicon.png');
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nom === 'black' ? '#141518' : '#eceef0');
        document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === nom)));
    }
    Theme.appliquer = appliquer;
    function choisir(nom) {
        try {
            if (nom === 'black')
                localStorage.setItem(CLE, 'black');
            else
                localStorage.removeItem(CLE);
        }
        catch { /* stockage bloqué : le thème vaut pour cette page seulement */ }
        appliquer(nom);
    }
    Theme.choisir = choisir;
    // Branché seulement dans une vraie page (pas dans les tests, où document est simulé).
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && typeof document.querySelectorAll === 'function') {
        document.addEventListener('click', event => {
            const bouton = event.target?.closest?.('[data-theme-choice]');
            if (bouton)
                choisir(bouton.dataset.themeChoice === 'black' ? 'black' : 'blanc');
        });
        // L’autre fenêtre (Hyrox ou WOD) suit le changement tout de suite.
        window.addEventListener('storage', event => { if (event.key === CLE)
            appliquer(lire()); });
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => appliquer(lire()));
        else
            appliquer(lire());
    }
})(Theme || (Theme = {}));
