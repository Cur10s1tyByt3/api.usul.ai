import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  commonSearchSchema,
  formatGenre,
  formatPagination,
  formatResults,
  prepareQuery,
  weightsMapToQueryWeights,
} from './utils';
import { z } from 'zod';
import { typesense } from '@/lib/typesense';
import { TypesenseAdvancedGenreDocument } from '@/types/typesense/advanced-genre';
import { ADVANCED_GENRES_COLLECTION, advancedGenresQueryWeights } from '@/lib/typesense/collections';

const advancedGenresSearchRoutes = new Hono();

advancedGenresSearchRoutes.get(
  '/advancedGenres',
  zValidator(
    'query',
    commonSearchSchema.extend({
      sortBy: z
        .enum([
          'relevance',
          'texts-asc',
          'texts-desc',
          'alphabetical-asc',
          'alphabetical-desc',
        ])
        .optional(),
    }),
  ),
  async c => {
    const { q, limit, page, sortBy, locale } = c.req.valid('query');

    const results = await typesense
      .collections<TypesenseAdvancedGenreDocument>(ADVANCED_GENRES_COLLECTION.INDEX)
      .documents()
      .search({
        q: prepareQuery(q),
        query_by: Object.values(advancedGenresQueryWeights).flat(),
        query_by_weights: weightsMapToQueryWeights(advancedGenresQueryWeights),
        prioritize_token_position: true,
        limit,
        page,
        ...(sortBy &&
          sortBy !== 'relevance' && {
          sort_by: {
            'texts-asc': 'booksCount:asc',
            'texts-desc': 'booksCount:desc',
            'alphabetical-asc': 'transliteration:asc',
            'alphabetical-desc': 'transliteration:desc',
          }[sortBy],
        }),
      });

    return c.json({
      results: formatResults(results, 'genre', genre => formatGenre(genre, locale)),
      pagination: formatPagination(results.found, results.page, limit),
    });
  },
);

export default advancedGenresSearchRoutes;
