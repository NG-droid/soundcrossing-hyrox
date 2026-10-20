namespace Pace {
  export const MAX_ENTRIES = 3000;
  export function decodeDelimited(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('windows-1252').decode(bytes); }
  }
  export function normalize(value: unknown): string {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }
  export function parseDuration(value: unknown): number | null {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0 || value >= 1) throw Error('Temps Excel invalide : utiliser hh:mm:ss.');
      const duration = Math.round(value * 86400) * 1000;
      if (duration <= 0) throw Error('Le temps doit être d’au moins une seconde.');
      return duration;
    }
    let h = 0, m = 0, s = 0;
    const colon = text.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
    const units = text.toLowerCase().match(/^(?:(\d{1,2})\s*h\s*)?(?:(\d{1,2})\s*(?:min|m)\s*)?(?:(\d{1,2})\s*(?:sec|s)\s*)?$/);
    if (colon) { h = Number(colon[1] ?? 0); m = Number(colon[2]); s = Number(colon[3]); }
    else if (units && units.slice(1).some(Boolean)) { h = Number(units[1] ?? 0); m = Number(units[2] ?? 0); s = Number(units[3] ?? 0); }
    else throw Error('Temps invalide. Exemples : 01:03:00, 63:00 ou 1h03min.');
    if ((colon?.[1] || units) && m >= 60 || s >= 60) throw Error('Minutes et secondes doivent être inférieures à 60.');
    const duration = ((h * 60 + m) * 60 + s) * 1000;
    if (duration <= 0 || duration > 48 * 3600000) throw Error('Le temps doit être positif et inférieur ou égal à 48 heures.');
    return duration;
  }
  export function parseScheduled(value: unknown): string {
    if (value === '' || value == null) return '';
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error('Heure de passage Excel invalide.');
      const seconds = Math.round(value * 86400) % 86400;
      return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}${seconds % 60 ? `:${String(seconds % 60).padStart(2, '0')}` : ''}`;
    }
    const match = String(value).trim().match(/^(\d{1,2})[:h](\d{2})(?::(\d{2}))?$/i);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59) throw Error('Heure invalide : utiliser HH:MM ou HH:MM:SS.');
    return `${match[1]!.padStart(2, '0')}:${match[2]}${match[3] ? `:${match[3]}` : ''}`;
  }
  export function durationFromFields(fields: DurationFields): string {
    if (!fields.hours.trim()) throw Error('Renseignez les heures du temps total (0 si moins d’une heure).');
    const parts = [fields.hours, fields.minutes || '0', fields.seconds || '0'];
    if (parts.some(part => !/^\d{1,2}$/.test(part))) throw Error('Utilisez des nombres entiers pour les heures, minutes et secondes.');
    if (Number(parts[1]) > 59 || Number(parts[2]) > 59) throw Error('Minutes et secondes doivent être inférieures à 60.');
    const time = parts.map(part => part.padStart(2, '0')).join(':');
    const duration = parseDuration(time);
    if (duration === null) throw Error('Renseignez le temps total.');
    return clock(duration);
  }
  export function clock(ms: number): string {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  }
  export function words(ms: number): string {
    const [h, m, s] = clock(ms).split(':');
    return `${Number(h)} h ${m} min ${s} s`;
  }
  export function label(entry: Entry): string { return entry.format === 'DUO' ? `${entry.name1} & ${entry.name2}` : entry.name1; }
  export function identity(entry: Entry): string {
    const names = entry.format === 'DUO' ? [normalize(entry.name1), normalize(entry.name2)].sort().join(':') : normalize(entry.name1);
    const time = parseScheduled(entry.scheduled);
    return `${entry.raceId}:${entry.format}:${entry.category}:${names}:${time.length === 5 ? `${time}:00` : time}`;
  }
  export function formatKey(entry: Entry): RankingFormat {
    return entry.format === 'DUO' ? entry.category as 'HH' | 'FF' | 'HF' : entry.category as 'H' | 'F' || 'SOLO';
  }
  export const LEVELS = ['Open', 'Pro'];
  // « Open · Duo HH » quand l’événement a des niveaux, sinon « Duo HH ».
  export function groupLabel(level: string, formatText: string): string { return level ? `${level} · ${formatText}` : formatText; }
  export function formatLabel(entry: Entry): string {
    return entry.format === 'DUO' ? `Duo ${entry.category}` : entry.category ? `Solo ${entry.category}` : 'Solo · à préciser';
  }
  export function categoryFromGenders(format: Format, gender1: Gender, gender2: Gender): Category {
    if (!['H', 'F'].includes(gender1)) throw Error('Choisissez H ou F pour le participant 1.');
    if (format === 'SOLO') {
      if (gender2 !== '') throw Error('Un solo contient un seul participant.');
      return gender1;
    }
    if (format !== 'DUO') throw Error('Choisissez Solo ou Duo.');
    if (!['H', 'F'].includes(gender2)) throw Error('Choisissez H ou F pour le participant 2.');
    return gender1 === gender2 ? gender1 === 'H' ? 'HH' : 'FF' : 'HF';
  }
  export function validateRace(value: unknown): Race {
    if (!value || typeof value !== 'object') throw Error('Course invalide.');
    const v = value as Record<string, unknown>;
    if (typeof v.id !== 'string' || !v.id.trim() || v.id.length > 160 || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 100 || typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) throw Error('Nom et date de course obligatoires.');
    if (!Number.isFinite(new Date(`${v.date}T12:00:00`).getTime()) || localDate(new Date(`${v.date}T12:00:00`)) !== v.date) throw Error('Date de course invalide.');
    if (v.previousTitles !== undefined && (!Array.isArray(v.previousTitles) || v.previousTitles.some(title => typeof title !== 'string' || title.length > 100))) throw Error('Historique des noms d’événement invalide.');
    const format = v.format ?? v.defaultFormat ?? 'MIXED';
    if (!['SOLO', 'DUO', 'MIXED'].includes(String(format))) throw Error('Format d’événement attendu : Solo, Duo ou Solo + Duo.');
    if (v.levels !== undefined && (!Array.isArray(v.levels) || v.levels.some(level => !LEVELS.includes(String(level))))) throw Error('Niveaux attendus : Open et Pro.');
    const levels = Array.isArray(v.levels) && v.levels.length ? [...LEVELS] : [];
    return { id: v.id, title: v.title.trim(), date: v.date, format: format as Race['format'], levels, previousTitles: v.previousTitles as string[] | undefined ?? [], ...(v.training === true ? { training: true as const } : {}) };
  }
  export function assertRaceFormat(race: Race, format: Format): void {
    if (race.format !== 'MIXED' && race.format !== format) throw Error(`Cet événement accepte uniquement des ${race.format === 'DUO' ? 'duos' : 'solos'}.`);
  }
  export function eventRankingFormats(race: Race | undefined, entries: Entry[]): RankingFormat[] {
    const formats: RankingFormat[] = race?.format === 'DUO' ? ['HH', 'FF', 'HF'] : race?.format === 'SOLO' ? ['H', 'F'] : ['H', 'F', 'HH', 'FF', 'HF'];
    if (race?.format !== 'DUO' && entries.some(e => formatKey(e) === 'SOLO')) formats.push('SOLO');
    return formats;
  }
  // Classements de l’événement : chaque niveau (Open, Pro) a ses propres formats.
  export function eventRankingGroups(race: Race | undefined, entries: Entry[]): { level: string; format: RankingFormat }[] {
    const levels = race?.levels?.length ? race.levels : [''], formats = eventRankingFormats(race, entries);
    return levels.flatMap(level => formats.map(format => ({ level, format })));
  }
  export function plannedAt(race: Race, entry: Entry): number | null {
    if (!entry.scheduled) return null;
    const time = parseScheduled(entry.scheduled), fullTime = time.length === 5 ? `${time}:00` : time, date = new Date(`${race.date}T${fullTime}`);
    if (!Number.isFinite(date.getTime()) || localDate(date) !== race.date || timeOfDay(date.getTime()) !== fullTime) throw Error('Cette heure de départ n’existe pas à cette date dans le fuseau de l’ordinateur.');
    return date.getTime();
  }
  export function timeOfDay(timestamp: number): string {
    const date = new Date(timestamp);
    return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
  }
  export function departureAt(race: Race, entry: Entry): number | null { return entry.startedAt ?? plannedAt(race, entry); }
  export function captureEdit(session: Session, kind: EditSnapshot['kind'], id: string, raceId = ''): EditSnapshot {
    const entry = kind === 'entry' ? session.entries.find(e => e.id === id) : undefined;
    const targetRaceId = kind === 'race' ? id : entry?.raceId ?? raceId;
    const race = session.races.find(r => r.id === targetRaceId) ?? null;
    const value = JSON.stringify(kind === 'race'
      ? { race, entries: id ? session.entries.filter(e => e.raceId === id) : [] }
      : { race, entry: entry ?? null });
    return { kind, id, raceId: targetRaceId, value };
  }
  export function assertEditUnchanged(session: Session, snapshot: EditSnapshot): void {
    if (captureEdit(session, snapshot.kind, snapshot.id, snapshot.raceId).value !== snapshot.value) {
      throw Error('Les données de ce formulaire ont changé. Fermez-le puis rouvrez-le pour utiliser la version à jour.');
    }
  }
  export function ranking(entries: Entry[]): { entry: Entry; rank: number }[] {
    const sorted = entries.filter(e => e.status === 'finished' && e.durationMs !== null).sort((a, b) => a.durationMs! - b.durationMs! || label(a).localeCompare(label(b), 'fr'));
    let rank = 0;
    return sorted.map((entry, i) => {
      if (i === 0 || entry.durationMs !== sorted[i - 1]!.durationMs) rank = i + 1;
      return { entry, rank };
    });
  }
  export function rankingFor(session: Session, format: RankingFormat, date: string, level = ''): { entry: Entry; rank: number }[] {
    const races = new Set(session.races.filter(race => race.date === date).map(race => race.id));
    return ranking(session.entries.filter(entry => races.has(entry.raceId) && formatKey(entry) === format && (entry.level ?? '') === level));
  }
  export function isResolved(entry: Entry): boolean {
    return entry.status === 'finished' || entry.status === 'abandoned' || entry.status === 'withdrawn';
  }
  export function statusLabel(entry: Entry): string {
    return entry.status === 'abandoned' || entry.status === 'withdrawn' ? 'Forfait' : entry.status === 'finished' ? 'Arrivé' : 'Résultat à saisir';
  }
  export function eventResultsFinal(session: Session, race: Race | undefined): boolean {
    if (!race) return false;
    const ids = new Set(session.races.filter(r => r.date === race.date).map(r => r.id));
    const entries = session.entries.filter(e => ids.has(e.raceId) && (race.format === 'MIXED' || e.format === race.format));
    return entries.length > 0 && entries.every(isResolved);
  }
  export function podiumFor(session: Session, race: Race, format: RankingFormat, level = ''): PodiumPlace[] {
    if (!eventResultsFinal(session, race)) throw Error('Complétez tous les résultats ou forfaits avant d’afficher le podium final.');
    if (!eventRankingFormats(race, session.entries).includes(format)) throw Error('Cette catégorie ne fait pas partie de l’événement.');
    const ranked = rankingFor(session, format, race.date, level);
    return ([1, 2, 3] as const).map(rank => ({ rank, entries: ranked.filter(r => r.rank === rank).map(r => r.entry) })).filter(place => place.entries.length > 0);
  }
  export function setOutcome(entry: Entry, status: 'waiting' | 'abandoned' | 'withdrawn'): Entry {
    return validateEntry({ ...entry, status, arrivedAt: null, durationMs: null, startedAt: status === 'withdrawn' ? null : entry.startedAt });
  }
  export function calculateArrival(race: Race, entry: Entry, value: string, nextDay: boolean): ArrivalResult {
    const departure = departureAt(race, entry); if (departure === null) throw Error('Renseignez d’abord l’heure de départ dans l’inscription.');
    const startedAt = Math.floor(departure / 1000) * 1000;
    const time = parseScheduled(value); if (!time) throw Error('Saisissez l’heure d’arrivée.');
    const parts = time.split(':').map(Number), date = new Date(startedAt);
    if (nextDay) date.setDate(date.getDate() + 1);
    const expectedDate = localDate(date);
    date.setHours(parts[0]!, parts[1]!, parts[2] ?? 0, 0);
    const expectedTime = time.length === 5 ? `${time}:00` : time;
    if (localDate(date) !== expectedDate || timeOfDay(date.getTime()) !== expectedTime) throw Error('Cette heure d’arrivée n’existe pas à cette date dans le fuseau de l’ordinateur.');
    const arrivedAt = date.getTime(), durationMs = arrivedAt - startedAt;
    if (durationMs <= 0) throw Error('L’arrivée doit être après le départ. Si elle est après minuit, cochez « Arrivée le lendemain ».');
    if (durationMs > 48 * 3600000) throw Error('Le temps total dépasse 48 heures. Vérifiez les horaires.');
    return { startedAt, arrivedAt, durationMs };
  }
  export function calculateDuration(race: Race, entry: Entry, value: string): ArrivalResult {
    const departure = departureAt(race, entry);
    if (departure === null) throw Error('Renseignez d’abord l’heure de départ dans l’inscription.');
    const durationMs = parseDuration(value);
    if (durationMs === null) throw Error('Saisissez le temps total. Exemple : 1h00min30s.');
    const startedAt = Math.floor(departure / 1000) * 1000;
    return { startedAt, arrivedAt: startedAt + durationMs, durationMs };
  }
  export function calculateResultArrival(race: Race, entry: Entry, value: string, capture: ArrivalCapture | null = null): ArrivalResult {
    const time = parseScheduled(value), fullTime = time.length === 5 ? `${time}:00` : time;
    const departure = departureAt(race, entry);
    if (departure === null) throw Error('Renseignez d’abord l’heure de départ dans l’inscription.');
    if (entry.arrivedAt !== null && departure !== null && timeOfDay(entry.arrivedAt) === fullTime) {
      return { startedAt: departure, arrivedAt: entry.arrivedAt, durationMs: entry.arrivedAt - departure };
    }
    if (entry.durationMs !== null && entry.durationMs > 24 * 3600000) throw Error('Pour ce résultat supérieur à 24 heures, utilisez la saisie du temps total.');
    const existingNextDay = entry.arrivedAt !== null && departure !== null && localDate(new Date(entry.arrivedAt)) !== localDate(new Date(departure));
    const nextDay = capture?.arrivalTime === fullTime ? capture.nextDay : existingNextDay && fullTime < timeOfDay(departure);
    return calculateArrival(race, entry, time, nextDay);
  }
  export function encodeCSV(rows: (string | number | null)[][]): string {
    const cell = (value: string | number | null): string => {
      let text = String(value ?? '');
      if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
  }
  export function finalResultsCSV(session: Session, race: Race): string {
    if (!eventResultsFinal(session, race)) throw Error('Complétez chaque résultat ou indiquez Forfait avant d’exporter le CSV final.');
    const races = new Map(session.races.filter(r => r.date === race.date).map(r => [r.id, r]));
    const withLevels = (race.levels?.length ?? 0) > 0;
    const rows: (string | number | null)[][] = [['Rang', ...(withLevels ? ['Niveau'] : []), 'Format', 'Participant 1', 'Participant 2', 'Heure de départ', 'Heure d’arrivée', 'Temps total', 'Statut', 'Événement', 'Date', 'Date d’arrivée']];
    for (const { level, format } of eventRankingGroups(race, session.entries)) {
      const ranked = rankingFor(session, format, race.date, level), ranks = new Map(ranked.map(r => [r.entry.id, r.rank]));
      const entries = session.entries.filter(e => races.has(e.raceId) && formatKey(e) === format && (e.level ?? '') === level);
      entries.sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) || label(a).localeCompare(label(b), 'fr'));
      for (const e of entries) rows.push([ranks.get(e.id) ?? '', ...(withLevels ? [level] : []), formatLabel(e), e.name1, e.name2, e.startedAt === null ? e.scheduled : timeOfDay(e.startedAt), e.arrivedAt === null ? '' : timeOfDay(e.arrivedAt), e.durationMs === null ? '' : clock(e.durationMs), statusLabel(e), races.get(e.raceId)!.title, race.date, e.arrivedAt === null ? '' : localDate(new Date(e.arrivedAt))]);
    }
    return encodeCSV(rows);
  }
  export function arrivalNow(race: Race, entry: Entry, now = Date.now()): ArrivalCapture {
    if (!Number.isFinite(now) || now <= 0 || !Number.isFinite(new Date(now).getTime())) throw Error('L’heure de l’ordinateur est invalide.');
    const departure = departureAt(race, entry);
    if (departure === null) throw Error('Renseignez d’abord l’heure de départ.');
    const captured = Math.floor(now / 1000) * 1000, date = new Date(captured), start = new Date(departure);
    const day = (value: Date): number => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
    const elapsedDays = (day(date) - day(start)) / 86400000;
    if (elapsedDays !== 0 && elapsedDays !== 1) throw Error('« Arrivée maintenant » s’utilise le jour du départ ou le lendemain. Pour un ancien événement, saisissez l’heure manuellement.');
    const arrivalTime = timeOfDay(captured), nextDay = elapsedDays === 1;
    const result = calculateArrival(race, entry, arrivalTime, nextDay);
    if (result.arrivedAt !== captured) throw Error('L’heure actuelle est ambiguë lors du changement d’heure. L’arrivée automatique ne peut pas être utilisée.');
    return { ...result, arrivalTime, nextDay };
  }
  export function validateEntry(value: unknown): Entry {
    if (!value || typeof value !== 'object') throw Error('Participant invalide.');
    const v = value as Record<string, unknown>;
    for (const key of ['id', 'bib', 'name1', 'name2', 'scheduled']) {
      if (typeof v[key] !== 'string' || (v[key] as string).length > 160) throw Error(`Champ ${key} invalide.`);
    }
    if (!v.id || !(v.name1 as string).trim()) throw Error('Le premier participant est obligatoire.');
    if (v.format !== 'SOLO' && v.format !== 'DUO') throw Error('Format attendu : SOLO ou DUO.');
    if (v.format === 'DUO' && (!(v.name2 as string).trim() || !['HH', 'FF', 'HF'].includes(String(v.category)))) throw Error('Un duo nécessite deux noms et une catégorie HH, FF ou HF.');
    if (v.format === 'SOLO' && (v.name2 !== '' || !['', 'H', 'F'].includes(String(v.category)))) throw Error('Un solo contient un seul nom et une catégorie H ou F.');
    // A mixed legacy entry does not reveal which participant is H or F.
    const gender1 = v.gender1 ?? (v.category === 'HH' || v.category === 'H' ? 'H' : v.category === 'FF' || v.category === 'F' ? 'F' : '');
    const gender2 = v.gender2 ?? (v.format === 'DUO' ? v.category === 'HH' ? 'H' : v.category === 'FF' ? 'F' : '' : '');
    if (!['', 'H', 'F'].includes(String(gender1)) || !['', 'H', 'F'].includes(String(gender2))) throw Error('Sexe attendu : H ou F.');
    if (v.format === 'SOLO' && gender2 !== '') throw Error('Un solo contient un seul participant.');
    if ((gender1 || gender2) && categoryFromGenders(v.format, gender1 as Gender, gender2 as Gender) !== v.category) throw Error('La catégorie ne correspond pas aux participants.');
    const scheduled = parseScheduled(v.scheduled);
    if (!['waiting', 'running', 'finished', 'abandoned', 'withdrawn'].includes(String(v.status))) throw Error('Statut invalide.');
    if (v.startedAt !== null && (typeof v.startedAt !== 'number' || !Number.isFinite(v.startedAt) || v.startedAt <= 0 || v.startedAt > Date.now() + 60000)) throw Error('Date de départ invalide.');
    if (v.durationMs !== null && (typeof v.durationMs !== 'number' || !Number.isFinite(v.durationMs) || v.durationMs <= 0 || v.durationMs > 48 * 3600000)) throw Error('Durée invalide.');
    if (v.status === 'running' && (v.startedAt === null || v.durationMs !== null)) throw Error('Chrono en cours incohérent.');
    if (v.status === 'waiting' && v.durationMs !== null) throw Error('Inscription en attente incohérente.');
    if (v.status === 'finished' && v.durationMs === null) throw Error('Résultat sans temps final.');
    const legacyId = `legacy-${v.format}-${v.category || 'solo'}`;
    if (v.raceId !== undefined && (typeof v.raceId !== 'string' || !v.raceId || v.raceId.length > 160)) throw Error('Course du participant invalide.');
    const level = v.level ?? '';
    if (level !== '' && !LEVELS.includes(String(level))) throw Error('Niveau attendu : Open ou Pro.');
    const arrivedAt = v.arrivedAt ?? null;
    const resultMode = v.resultMode ?? (v.durationMs !== null && arrivedAt === null ? 'duration' : 'arrival');
    if (resultMode !== 'arrival' && resultMode !== 'duration') throw Error('Mode de saisie du résultat invalide.');
    if ((v.status === 'abandoned' || v.status === 'withdrawn') && (v.durationMs !== null || arrivedAt !== null)) throw Error('Un abandon ou forfait ne peut pas avoir de résultat chronométré.');
    if (v.status === 'withdrawn' && v.startedAt !== null) throw Error('Un forfait ne peut pas avoir de départ enregistré.');
    if (arrivedAt !== null && (typeof arrivedAt !== 'number' || !Number.isFinite(arrivedAt) || arrivedAt <= 0 || v.status !== 'finished' || typeof v.startedAt !== 'number' || arrivedAt - v.startedAt !== v.durationMs)) throw Error('Les horaires et le résultat ne correspondent pas.');
    return { id: v.id as string, bib: (v.bib as string).trim(), raceId: (v.raceId as string | undefined) ?? legacyId, name1: (v.name1 as string).trim(), name2: (v.name2 as string).trim(), gender1: gender1 as Gender, gender2: gender2 as Gender, format: v.format, category: v.category as Category, level: level as string, scheduled, startedAt: v.startedAt as number | null, arrivedAt: arrivedAt as number | null, durationMs: v.durationMs as number | null, status: v.status as Status, resultMode };
  }
  export function validateSession(value: unknown, migrateLegacyFormats = false): Session {
    if (!value || typeof value !== 'object') throw Error('Session invalide.');
    const v = value as Record<string, unknown>;
    if (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 100 || typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Array.isArray(v.entries) || v.entries.length > MAX_ENTRIES) throw Error('La session ou sa liste est invalide.');
    const date = new Date(`${v.date}T12:00:00`);
    if (!Number.isFinite(date.getTime()) || localDate(date) !== v.date) throw Error('Date de session invalide.');
    const entries = v.entries.map(validateEntry);
    let races = v.races === undefined
      ? [...new Map(entries.map(entry => [entry.raceId, { id: entry.raceId, title: entry.format === 'SOLO' ? 'Course solo' : `Course duo ${entry.category}`, date: v.date as string }])).values()].map(validateRace)
      : Array.isArray(v.races) && v.races.length <= 100 ? v.races.map(validateRace) : (() => { throw Error('Liste des courses invalide (maximum 100).'); })();
    if (new Set(races.map(race => race.id)).size !== races.length) throw Error('Identifiants de courses en double.');
    // V3 used the event format as a suggestion. Preserve older mixed registrations.
    if (migrateLegacyFormats) races = races.map(race => entries.some(e => e.raceId === race.id && race.format !== 'MIXED' && e.format !== race.format) ? { ...race, format: 'MIXED' } : race);
    for (const entry of entries) {
      const race = races.find(item => item.id === entry.raceId);
      if (!race) throw Error('L’événement du participant est introuvable.');
      assertRaceFormat(race, entry.format);
      plannedAt(race, entry);
    }
    if (new Set(entries.map(e => e.id)).size !== entries.length) throw Error('La liste contient des identifiants en double.');
    return { title: v.title.trim(), date: v.date, races, entries };
  }
  export function validateStore(value: unknown): Store {
    if (!value || typeof value !== 'object') throw Error('Sauvegarde invalide.');
    const v = value as Record<string, unknown>;
    if (![1, 2, 3, 4].includes(Number(v.version)) || typeof v.version !== 'number' || typeof v.revision !== 'string' || typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt) || !Array.isArray(v.history) || v.history.length > 15) throw Error('Format de sauvegarde non reconnu.');
    const history = v.history.map((item: unknown) => {
      if (!item || typeof item !== 'object' || typeof (item as Snapshot).label !== 'string') throw Error('Historique invalide.');
      return { label: (item as Snapshot).label, session: validateSession((item as Snapshot).session, v.version !== 4) };
    });
    if (v.version >= 2 && (!(v.session && typeof v.session === 'object') || !Array.isArray((v.session as Session).races))) throw Error('Sauvegarde sans événements.');
    const migrate = (session: Session): Session => {
      if (Number(v.version) >= 3) return session;
      const groups = new Map<string, Race[]>();
      for (const race of session.races) { const group = groups.get(race.date) ?? []; group.push(race); groups.set(race.date, group); }
      const mapping = new Map<string, string>();
      const races = [...groups.values()].map(group => {
        const first = group[0]!; group.forEach(r => mapping.set(r.id, first.id));
        return { ...first, format: group.every(r => r.format === first.format) ? first.format : 'MIXED' as const, title: group.length > 1 ? 'Soundcrossing' : first.title, previousTitles: [...new Set(group.flatMap(r => [r.title, ...r.previousTitles]))] };
      });
      return validateSession({ ...session, races, entries: session.entries.map(entry => ({ ...entry, raceId: mapping.get(entry.raceId)! })) });
    };
    const settingsValue = v.settings as Record<string, unknown> | undefined;
    const photoTemplate = settingsValue?.photoTemplate ?? 'club';
    if (!['club', 'light', 'podium'].includes(String(photoTemplate))) throw Error('Modèle photo invalide.');
    return { version: 4, revision: v.revision, savedAt: v.savedAt, session: migrate(validateSession(v.session, v.version !== 4)), history: history.map(item => ({ ...item, session: migrate(item.session) })), settings: { photoTemplate: photoTemplate as PhotoTemplate } };
  }
  export function localDate(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  export function importRows(rows: unknown[][], mapping: Record<ImportField, number>, existing: Entry[], race?: Race): ImportRow[] {
    const seen = new Set(existing.map(identity));
    return rows.map((row, i) => {
      try {
        const get = (key: ImportField): unknown => row[mapping[key]] ?? '';
        const text = (key: ImportField): string => String(get(key)).trim();
        const rawFormat = normalize(get('format')).replace(/\bmf\b/g, 'hf');
        const formatText = normalize(rawFormat === 'h' || rawFormat === 'f' ? `solo ${rawFormat}` : ['hh', 'ff', 'hf'].includes(rawFormat) ? `duo ${rawFormat}` : rawFormat).replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ');
        const format: Format = !formatText ? (text('name2') ? 'DUO' : 'SOLO') : /^solo(?: [hf])?$/.test(formatText) ? 'SOLO' : /^duo(?: (?:hh|ff|hf))?$/.test(formatText) ? 'DUO' : (() => { throw Error('Format attendu : Solo H, Solo F, Duo HH, Duo FF ou Duo HF.'); })();
        if (race) assertRaceFormat(race, format);
        const categoryText = text('category').toUpperCase() || formatText.split(' ')[1]?.toUpperCase() || '';
        const category = categoryText === 'MF' ? 'HF' : categoryText;
        if (race && !category) throw Error('Précisez le format : Solo H/F ou Duo HH/FF/HF.');
        const levelText = normalize(get('level')), level = race?.levels?.find(l => normalize(l) === levelText) ?? '';
        if (race?.levels?.length && !level) throw Error(levelText ? `Niveau « ${text('level')} » inconnu : Open ou Pro.` : 'Précisez le niveau : Open ou Pro.');
        const durationMs = parseDuration(get('duration'));
        const entry = validateEntry({ id: crypto.randomUUID(), bib: text('bib'), raceId: race?.id, name1: text('name1'), name2: format === 'DUO' ? text('name2') : '', format, category, level, scheduled: parseScheduled(get('scheduled')), startedAt: null, durationMs, status: durationMs === null ? 'waiting' : 'finished' });
        if (race) plannedAt(race, entry);
        if (format === 'SOLO' && text('name2')) throw Error('Deux noms pour un solo : corriger le format.');
        const key = identity(entry); const duplicate = seen.has(key); seen.add(key);
        return { line: i + 2, entry, error: '', duplicate };
      } catch (error) { return { line: i + 2, entry: null, error: error instanceof Error ? error.message : 'Ligne invalide.', duplicate: false }; }
    });
  }
  // Mode entraînement : un événement fictif (Solo + Duo, Open + Pro) pour s’exercer ou former un bénévole.
  // Départs toutes les 5 minutes, déjà passés (depuis 2 h) pour pouvoir saisir les arrivées tout de suite ;
  // les trois premiers ont déjà un résultat pour montrer le classement.
  export function trainingEvent(existing: Race[], now = new Date()): { race: Race; entries: Entry[] } {
    const early = now.getHours() < 3, day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (early ? 1 : 0), 12), date = localDate(day);
    const first = early ? 9 * 60 : Math.floor((now.getHours() * 60 + now.getMinutes() - 120) / 5) * 5;
    let title = 'Entraînement — Soundcrossing';
    for (let n = 2; existing.some(r => r.date === date && normalize(r.title) === normalize(title)); n++) title = `Entraînement ${n} — Soundcrossing`;
    const race = validateRace({ id: `entrainement-${crypto.randomUUID()}`, title, date, format: 'MIXED', levels: LEVELS, training: true });
    const people: [string, string, Gender, Gender, string, number][] = [
      ['Alex Martin', '', 'H', '', 'Open', 3735], ['Emma Durand', 'Léa Moreau', 'F', 'F', 'Open', 4000], ['Hugo Robert', '', 'H', '', 'Pro', 3425],
      ['Manon Simon', '', 'F', '', 'Open', 0], ['Lucas Petit', 'Zoé Bernard', 'H', 'F', 'Open', 0], ['Tom Garcia', '', 'H', '', 'Pro', 0],
      ['Jules Leroy', 'Paul Denis', 'H', 'H', 'Pro', 0], ['Nina Roux', '', 'F', '', 'Pro', 0], ['Inès Morel', 'Max Girard', 'F', 'H', 'Open', 0],
      ['Chloé Fabre', 'Sarah Vidal', 'F', 'F', 'Pro', 0], ['Théo Lambert', '', 'H', '', 'Open', 0], ['Camille Roche', '', 'F', '', 'Open', 0],
    ];
    const entries = people.map(([name1, name2, gender1, gender2, level, seconds], i) => {
      const format: Format = name2 ? 'DUO' : 'SOLO', minutes = first + i * 5;
      const scheduled = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      const entry = validateEntry({ id: crypto.randomUUID(), bib: '', raceId: race.id, name1, name2, gender1, gender2, format, category: categoryFromGenders(format, gender1, gender2), level, scheduled, status: 'waiting', startedAt: null, arrivedAt: null, durationMs: null });
      const startedAt = plannedAt(race, entry);
      return seconds && startedAt !== null && startedAt + seconds * 1000 < now.getTime() ? validateEntry({ ...entry, startedAt, arrivedAt: startedAt + seconds * 1000, durationMs: seconds * 1000, status: 'finished', resultMode: 'arrival' }) : entry;
    });
    return { race, entries };
  }
}
