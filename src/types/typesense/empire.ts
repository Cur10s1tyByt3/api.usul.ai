import type { LocalizedEntry } from './localized-entry';

export type TypesenseEmpireDocument = {
  id: string;
  slug: string;

  names: LocalizedEntry[];
  overviewTranslations: LocalizedEntry[];

  booksCount: number;
  authorsCount: number;
  _popularity: number;
}