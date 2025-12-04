import { makeGenreDto } from '@/dto/advancedGenre.dto';
import { env } from '@/env';
import { db } from '@/lib/db';
import { PathLocale } from '@/lib/locale';
import { getPrimaryLocalizedText, getSecondaryLocalizedText } from '@/lib/localization';
import fs from 'fs';
import path from 'path';
import { getAllBooks } from './book';

export const getAdvancedGenreById = async (id: string, locale: PathLocale = 'en') => {
  if (!genreIdToGenre) {
    await populateAdvancedGenres();
  }

  const genre = genreIdToGenre?.[id];
  if (!genre) return null;

  // Get aggregated count for this genre
  const aggregatedCounts = await calculateAggregatedCounts();
  const aggregatedCount = aggregatedCounts.get(id) || 0;

  // Create genre with aggregated count
  const genreWithAggregatedCount = {
    ...genre,
    numberOfBooks: aggregatedCount,
  };

  return makeGenreDto(genreWithAggregatedCount, locale);
};

export const getAdvancedGenreBySlug = async (slug: string, locale: PathLocale = 'en') => {
  if (!genreIdToGenre) {
    await populateAdvancedGenres();
  }

  const genre = genreSlugToGenre?.[slug];
  if (!genre) return null;

  // Get aggregated count for this genre
  const aggregatedCounts = await calculateAggregatedCounts();
  const aggregatedCount = aggregatedCounts.get(genre.id) || 0;

  // Create genre with aggregated count
  const genreWithAggregatedCount = {
    ...genre,
    numberOfBooks: aggregatedCount,
  };

  return makeGenreDto(genreWithAggregatedCount, locale);
};

/**
 * Builds a map of genre ID to all its descendant IDs (children, grandchildren, etc.)
 */
const buildDescendantMap = (): Map<string, Set<string>> => {
  const descendantsMap = new Map<string, Set<string>>();
  const genres = Object.values(genreIdToGenre ?? {});

  // Initialize all genres
  for (const genre of genres) {
    descendantsMap.set(genre.id, new Set());
  }

  // Build direct children map
  const childrenMap = new Map<string, Set<string>>();
  for (const genre of genres) {
    if (genre.parentGenre) {
      if (!childrenMap.has(genre.parentGenre)) {
        childrenMap.set(genre.parentGenre, new Set());
      }
      childrenMap.get(genre.parentGenre)!.add(genre.id);
    }
  }

  // Recursively collect all descendants
  const collectDescendants = (genreId: string): Set<string> => {
    if (descendantsMap.has(genreId)) {
      const cached = descendantsMap.get(genreId)!;
      if (cached.size > 0) {
        return cached;
      }
    }

    const descendants = new Set<string>();
    const children = childrenMap.get(genreId) || new Set();

    for (const childId of children) {
      descendants.add(childId);
      const childDescendants = collectDescendants(childId);
      for (const descId of childDescendants) {
        descendants.add(descId);
      }
    }

    descendantsMap.set(genreId, descendants);
    return descendants;
  };

  // Build descendants for all genres
  for (const genre of genres) {
    collectDescendants(genre.id);
  }

  return descendantsMap;
};

/**
 * Gets all descendant genre IDs (including the genre itself) for given genre IDs.
 * This is useful when searching for books - if a parent genre is searched,
 * we want to include books from all child genres as well.
 */
export const getGenreIdsWithDescendants = async (genreIds: string[]): Promise<string[]> => {
  if (!genreIdToGenre) {
    await populateAdvancedGenres();
  }

  if (genreIds.length === 0) {
    return [];
  }

  const descendantsMap = buildDescendantMap();
  const resultSet = new Set<string>();

  for (const genreId of genreIds) {
    // Include the genre itself
    resultSet.add(genreId);
    
    // Include all descendants
    const descendants = descendantsMap.get(genreId);
    if (descendants) {
      for (const descendantId of descendants) {
        resultSet.add(descendantId);
      }
    }
  }

  return Array.from(resultSet);
};

// Cache for aggregated counts (no params case - most common)
let cachedAggregatedCounts: Map<string, number> | null = null;

/**
 * Calculates aggregated counts for all genres by aggregating child genres to parents
 * Returns a map of genre ID to aggregated book count
 */
export const calculateAggregatedCounts = async (params?: {
  authorId?: string;
  bookIds?: string[];
  yearRange?: [number, number];
  regionId?: string;
}): Promise<Map<string, number>> => {
  if (!genreIdToGenre) {
    await populateAdvancedGenres();
  }

  // Use cache for the common case (no params)
  if (!params || (!params.authorId && !params.bookIds && !params.yearRange && !params.regionId)) {
    if (cachedAggregatedCounts) {
      // Return a new Map to avoid mutation issues
      return new Map(cachedAggregatedCounts);
    }
  }

  // Get all books with their advancedGenres
  let books;
  try {
    books = await db.book.findMany({
    where: params
      ? {
          ...(params.authorId && { authorId: params.authorId }),
          ...(params.bookIds && { id: { in: params.bookIds } }),
          ...(params.regionId && {
            author: {
              locations: {
                some: {
                  regionId: params.regionId,
                },
              },
            },
          }),
          ...(params.yearRange && {
            author: {
              year: {
                gte: params.yearRange[0],
                lte: params.yearRange[1],
              },
            },
          }),
        }
      : undefined,
    select: {
      id: true,
      advancedGenres: {
        select: {
          id: true,
        },
      },
    },
  });
  } catch (error: any) {
    // Handle database connection errors gracefully
    // If we have cached counts, return them; otherwise return empty counts
    if (error?.code === 'P1001' || error?.code === 'P1000') {
      console.warn('Database connection error, using cached data or returning empty counts:', error.message);
      if (cachedAggregatedCounts) {
        return new Map(cachedAggregatedCounts);
      }
      // Return empty map if no cache available
      const emptyCounts = new Map<string, number>();
      const genres = Object.values(genreIdToGenre ?? {});
      for (const genre of genres) {
        emptyCounts.set(genre.id, 0);
      }
      return emptyCounts;
    }
    // Re-throw other errors
    throw error;
  }

  // Build genre to books map (including direct associations)
  const genreToBooks = new Map<string, Set<string>>();
  for (const book of books) {
    for (const genre of book.advancedGenres) {
      if (!genreToBooks.has(genre.id)) {
        genreToBooks.set(genre.id, new Set());
      }
      genreToBooks.get(genre.id)!.add(book.id);
    }
  }

  // Build direct children map (parent -> direct children only)
  const childrenMap = new Map<string, Set<string>>();
  const genres = Object.values(genreIdToGenre ?? {});
  for (const genre of genres) {
    if (genre.parentGenre) {
      if (!childrenMap.has(genre.parentGenre)) {
        childrenMap.set(genre.parentGenre, new Set());
      }
      childrenMap.get(genre.parentGenre)!.add(genre.id);
    }
  }

  // Aggregate counts and books from children to parents
  const aggregatedBooks = new Map<string, Set<string>>();

  // Initialize with direct book associations
  for (const genre of genres) {
    const directBooks = genreToBooks.get(genre.id) || new Set();
    aggregatedBooks.set(genre.id, new Set(directBooks));
  }

  // Aggregate from direct children to parents (bottom-up approach)
  // Process genres from leaves (no children) to roots
  const processed = new Set<string>();

  const processGenre = (genreId: string) => {
    if (processed.has(genreId)) return;

    const genre = genreIdToGenre![genreId];
    if (!genre) return;

    // Get direct children only
    const directChildren = childrenMap.get(genreId) || new Set();

    // Process all direct children first (bottom-up approach)
    // This ensures children have their aggregated counts before we aggregate them to parent
    for (const childId of directChildren) {
      processGenre(childId);
    }

    // Aggregate books from direct children only
    // Children already have their descendants' books aggregated
    const currentBooks = aggregatedBooks.get(genreId) || new Set();
    for (const childId of directChildren) {
      const childBooks = aggregatedBooks.get(childId) || new Set();
      for (const bookId of childBooks) {
        currentBooks.add(bookId);
      }
    }
    aggregatedBooks.set(genreId, currentBooks);
    processed.add(genreId);
  };

  // Process all genres (this will handle the tree traversal)
  for (const genre of genres) {
    processGenre(genre.id);
  }

  // Calculate aggregated counts
  const aggregatedCounts = new Map<string, number>();
  for (const [genreId, books] of aggregatedBooks.entries()) {
    aggregatedCounts.set(genreId, books.size);
  }

  // Cache the result for the no-params case (most common)
  if (!params || (!params.authorId && !params.bookIds && !params.yearRange && !params.regionId)) {
    cachedAggregatedCounts = aggregatedCounts;
  }

  return aggregatedCounts;
};

/**
 * Aggregates child genres to parent genres by:
 * 1. Adding child genre counts to parent counts
 * 2. Including books from child genres in parent genres
 */
export const aggregateChildGenresToParents = async (
  locale: PathLocale = 'en',
  params?: {
    authorId?: string;
    bookIds?: string[];
    yearRange?: [number, number];
    regionId?: string;
  },
) => {
  if (!genreIdToGenre) {
    await populateAdvancedGenres();
  }

  const aggregatedCounts = await calculateAggregatedCounts(params);
  const genres = Object.values(genreIdToGenre ?? {});

  // Return genres with aggregated data
  return genres
    .map(genre => ({
      ...genre,
      numberOfBooks: aggregatedCounts.get(genre.id) || 0,
    }))
    .filter(genre => !params || aggregatedCounts.get(genre.id)! > 0)
    .sort((a, b) => {
      const countA = aggregatedCounts.get(a.id) || 0;
      const countB = aggregatedCounts.get(b.id) || 0;
      return countB - countA;
    })
    .map(genre => makeGenreDto(genre, locale));
};

export const getAllAdvancedGenres = async (
  locale: PathLocale = 'en',
  params?: {
    authorId?: string;
    bookIds?: string[];
    yearRange?: [number, number];
    regionId?: string;
  },
) => {
  // Use aggregation to include child genres in parent counts
  return aggregateChildGenresToParents(locale, params);
};

export const getAdvancedGenreCount = async () => {
  if (genreIdToGenre) {
    return Object.keys(genreIdToGenre).length;
  }

  return db.genre.count();
};

// TODO: Refactoring
export const getAdvancedGenresHierarchy = async (locale: PathLocale = 'en') => {
  if (!genreIdToGenre) {
    await populateAdvancedGenres();
  }

  // Get aggregated counts (includes child genres)
  const aggregatedCounts = await calculateAggregatedCounts();

  const genres = await db.advancedGenre.findMany({
    select: {
      id: true,
      slug: true,
      transliteration: true,
      parentGenre: true,
      nameTranslations: true,
    },
  });

  type TreeNode = {
    id: string;
    slug: string;
    primaryName: string;
    secondaryName?: string;
    numberOfBooks: number;
    children?: TreeNode[];
  };

  const idToNode = new Map<string, TreeNode>();

  for (const g of genres) {
    const primaryName = getPrimaryLocalizedText(
      g.nameTranslations as any,
      locale,
    ) as string | undefined;
    const secondaryName = getSecondaryLocalizedText(
      g.nameTranslations as any,
      locale,
    ) as string | undefined;
    idToNode.set(g.id, {
      id: g.id,
      slug: g.slug,
      primaryName: primaryName || g.transliteration || g.slug,
      secondaryName:  secondaryName,
      numberOfBooks: aggregatedCounts.get(g.id) || 0,
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

  // Invalidate cached aggregated counts when genres are repopulated
  cachedAggregatedCounts = null;
};
