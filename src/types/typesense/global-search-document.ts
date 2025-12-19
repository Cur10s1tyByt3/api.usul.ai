import type { TypesenseAuthorDocument } from './author';
import type { LocalizedArrayEntry, LocalizedEntry } from './localized-entry';

export type TypesenseGlobalSearchDocument = {
  id: string;
  slug: string;
  type: 'author' | 'book' | 'advancedGenre' | 'genre' | 'region' | 'empire';

  transliteration?: string;
  primaryNames: LocalizedEntry[];
  otherNames: LocalizedArrayEntry[];

  _nameVariations?: string[];
  _popularity?: number;
  author?: Omit<TypesenseAuthorDocument, 'books' | 'booksCount' | 'geographies'>;
  year?: number;
  booksCount?: number;
};
