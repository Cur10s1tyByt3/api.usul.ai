import type { LocalizedEntry } from './localized-entry';

export type TypesenseAdvancedGenreDocument = {
  id: string;
  slug: string;
  transliteration?: string;
  nameTranslations: LocalizedEntry[];
  booksCount: number;
  _popularity: number;
};
