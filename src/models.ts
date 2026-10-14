namespace Pace {
  export type Format = 'SOLO' | 'DUO';
  export type Gender = '' | 'H' | 'F';
  export type Category = '' | 'H' | 'F' | 'HH' | 'FF' | 'HF';
  export type RankingFormat = 'SOLO' | 'H' | 'F' | 'HH' | 'FF' | 'HF';
  export type PhotoTemplate = 'club' | 'light' | 'podium';
  export type ResultMode = 'arrival' | 'duration';
  export interface DurationFields { hours: string; minutes: string; seconds: string; }
  export interface PodiumPlace { rank: 1 | 2 | 3; entries: Entry[]; }
  export interface PodiumSelection { raceId: string; format: RankingFormat; }
  export interface Settings { photoTemplate: PhotoTemplate; }
  // running et abandoned restent lisibles pour préserver les anciennes sauvegardes.
  export type Status = 'waiting' | 'running' | 'finished' | 'abandoned' | 'withdrawn';
  export interface Race {
    id: string; title: string; date: string;
    format: Format | 'MIXED';
    previousTitles: string[];
  }
  export interface Entry {
    id: string; bib: string; name1: string; name2: string;
    gender1: Gender; gender2: Gender;
    raceId: string;
    format: Format; category: Category; scheduled: string;
    startedAt: number | null; arrivedAt: number | null; durationMs: number | null; status: Status;
    resultMode: ResultMode;
  }
  export interface ArrivalResult { startedAt: number; arrivedAt: number; durationMs: number; }
  export interface ArrivalCapture extends ArrivalResult { arrivalTime: string; nextDay: boolean; }
  export interface Session { title: string; date: string; races: Race[]; entries: Entry[]; }
  export interface Snapshot { label: string; session: Session; }
  export interface Store { version: 4; revision: string; savedAt: number; session: Session; history: Snapshot[]; settings: Settings; }
  export type ImportField = 'bib' | 'name1' | 'name2' | 'format' | 'category' | 'scheduled' | 'duration';
  export interface ImportRow { line: number; entry: Entry | null; error: string; duplicate: boolean; }
  export interface Worksheet { [key: string]: unknown; }
  export interface Workbook { SheetNames: string[]; Sheets: Record<string, Worksheet>; }
}
declare const XLSX: {
  read(data: ArrayBuffer | string, options?: Record<string, unknown>): Pace.Workbook;
  utils: {
    sheet_to_json(sheet: Pace.Worksheet, options: Record<string, unknown>): unknown[][];
    aoa_to_sheet(rows: (string | number | null)[][]): Pace.Worksheet;
    book_new(): Pace.Workbook;
    book_append_sheet(book: Pace.Workbook, sheet: Pace.Worksheet, name: string): void;
  };
  writeFile(book: Pace.Workbook, filename: string): void;
};
