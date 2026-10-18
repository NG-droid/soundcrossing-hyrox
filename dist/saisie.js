"use strict";
// Case de temps unique partagée par l’Hyrox (heure d’arrivée) et le WOD (temps réalisé) :
// on tape les chiffres, les « : » se placent tout seuls (074512 → 07:45:12).
var Saisie;
(function (Saisie) {
    const pad = (n) => String(n).padStart(2, '0');
    // Met en forme ce qui est tapé : deux chiffres par bloc, au plus hh:mm:ss.
    // Un séparateur tapé après un seul chiffre complète le bloc (7: → 07:).
    function mask(raw) {
        const blocks = [];
        let current = '';
        for (const ch of raw) {
            if (blocks.length === 3)
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
        if (current && blocks.length < 3)
            blocks.push(current);
        return blocks.join(':');
    }
    Saisie.mask = mask;
    // Heures, minutes, secondes lues dans la case ; null si elle est vide.
    function parts(text) {
        const value = mask(text.trim());
        if (!value)
            return null;
        if (!/^\d{2}(:\d{2}){0,2}$/.test(value))
            throw Error(`Temps incomplet : « ${text.trim()} ». Écrivez hh:mm:ss, par ex. 01:05:30.`);
        const [h, m = 0, s = 0] = value.split(':').map(Number);
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
    // Durée en millisecondes pour le WOD (null si vide).
    function duration(text) {
        const p = parts(text);
        if (!p)
            return null;
        const ms = ((p[0] * 60 + p[1]) * 60 + p[2]) * 1000;
        if (ms <= 0)
            throw Error('Temps : saisissez une durée.');
        return ms;
    }
    Saisie.duration = duration;
    function fromMs(ms) {
        if (ms === null || ms === undefined)
            return '';
        const s = Math.round(ms / 1000);
        return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(pad).join(':');
    }
    Saisie.fromMs = fromMs;
    function box(attrs, value, label) {
        return `<input class="time-box" ${attrs} value="${value}" placeholder="hh:mm:ss" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="${label}">`;
    }
    Saisie.box = box;
    // Met en forme pendant la frappe, dans toutes les cases .time-box de la page.
    function install(root = document) {
        root.addEventListener('input', event => {
            const input = event.target;
            if (!input.classList?.contains('time-box'))
                return;
            const atEnd = input.selectionStart === input.value.length, next = mask(input.value);
            if (next !== input.value) {
                input.value = next;
                if (atEnd)
                    input.setSelectionRange(next.length, next.length);
            }
            input.classList.remove('invalid');
        });
    }
    Saisie.install = install;
})(Saisie || (Saisie = {}));
