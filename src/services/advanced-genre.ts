import { makeGenreDto } from '@/dto/advancedGenre.dto';
import { env } from '@/env';
import { db } from '@/lib/db';
import { PathLocale } from '@/lib/locale';
import { getPrimaryLocalizedText } from '@/lib/localization';
import fs from 'fs';
import path from 'path';
import { getAllBooks } from './book';

export const getAdvancedGenreById = (id: string, locale: PathLocale = 'en') => {
  const genre = genreIdToGenre?.[id];
  if (!genre) return null;

  return makeGenreDto(genre, locale);
};

export const getAdvancedGenreBySlug = (slug: string, locale: PathLocale = 'en') => {
  const genre = genreSlugToGenre?.[slug];
  if (!genre) return null;

  return makeGenreDto(genre, locale);
};

export const getAllAdvancedGenres = (
  locale: PathLocale = 'en',
  params?: {
    authorId?: string;
    bookIds?: string[];
    yearRange?: [number, number];
    regionId?: string;
  },
) => {
  let genres = Object.values(genreIdToGenre ?? {});
  if (
    params &&
    (params.authorId || params.bookIds || params.yearRange || params.regionId)
  ) {
    const books = getAllBooks(locale, params);
    const genreIdsToCount: Record<string, number> = {};
    for (const book of books) {
      for (const genre of book.genres) {
        genreIdsToCount[genre.id] = (genreIdsToCount[genre.id] ?? 0) + 1;
      }
    }

    genres = genres
      .filter(genre => genreIdsToCount[genre.id] !== undefined)
      .map(genre => ({
        ...genre,
        numberOfBooks: genreIdsToCount[genre.id]!,
      }))
      .sort((a, b) => b.numberOfBooks - a.numberOfBooks);
  }

  return genres.map(genre => makeGenreDto(genre, locale));
};

export const getAdvancedGenreCount = async () => {
  if (genreIdToGenre) {
    return Object.keys(genreIdToGenre).length;
  }

  return db.genre.count();
};

// TODO: Refactoring
export const getAdvancedGenresHierarchy = async (locale: PathLocale = 'en') => {
  const genres = await db.advancedGenre.findMany({
    select: {
      id: true,
      slug: true,
      transliteration: true,
      parentGenre: true,
      numberOfBooks: true,
      nameTranslations: true,
    },
  });

  type TreeNode = {
    id: string;
    slug: string;
    name: string;
    numberOfBooks: number;
    children?: TreeNode[];
  };

  const idToNode = new Map<string, TreeNode>();

  for (const g of genres) {
    const localizedName = getPrimaryLocalizedText(
      g.nameTranslations as any,
      locale,
    ) as string | undefined;
    idToNode.set(g.id, {
      id: g.id,
      slug: g.slug,
      name: localizedName || g.transliteration || g.slug,
      numberOfBooks: g.numberOfBooks,
    });
  }

  const roots: TreeNode[] = [];

  for (const g of genres) {
    const node = idToNode.get(g.id)!;
    const parentId = g.parentGenre ?? null;

    if (!parentId) {
      roots.push(node);
      continue;
    }

    const parent = idToNode.get(parentId);
    if (!parent) {
      roots.push(node);
      continue;
    }

    if (!parent.children) parent.children = [];
    parent.children.push(node);
  }

  return roots;
}

const get = () =>
  db.advancedGenre.findMany({
    include: {
      nameTranslations: true,
    },
  });

type RawGenre = Awaited<ReturnType<typeof get>>[number];

let genreIdToGenre: Record<string, RawGenre> | null = null;
let genreSlugToGenre: Record<string, RawGenre> | null = null;
export const populateAdvancedGenres = async () => {
  let genres: Awaited<ReturnType<typeof get>> | undefined;
  const filePath = path.resolve('.cache/advanced-genres.json');
  if (env.NODE_ENV === 'development') {
    // load from local
    if (fs.existsSync(filePath)) {
      genres = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }

  if (!genres) {
    genres = await get();
    if (env.NODE_ENV === 'development') {
      // write to cache
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(genres), 'utf-8');
    }
  }

  genreIdToGenre = {};
  genreSlugToGenre = {};

  for (const genre of genres) {
    genreIdToGenre[genre.id] = genre;
    genreSlugToGenre[genre.slug] = genre;
  }
};
