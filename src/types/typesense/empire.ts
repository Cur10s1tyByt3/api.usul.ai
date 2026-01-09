import type { LocalizedEntry } from './localized-entry';

export type TypesenseEmpireDocument = {
  id: string;
  slug: string;

  names: LocalizedEntry[];
  overviewTranslations: LocalizedEntry[];

  transliteration?: string;
  hijriStartYear?: number;
  hijriEndYear?: number;

  booksCount: number;
  authorsCount: number;
  _popularity: number;
}