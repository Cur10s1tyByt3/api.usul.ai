import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  commonSearchSchema,
  formatPagination,
  formatEmpire,
  formatResults,
  prepareQuery,
  weightsMapToQueryWeights,
} from './utils';
import { z } from 'zod';
import { typesense } from '@/lib/typesense';
import { TypesenseEmpireDocument } from '@/types/typesense/empire';
import { EMPIRES_COLLECTION, empiresQueryWeights } from '@/lib/typesense/collections';

const empireSearchRoutes = new Hono();

empireSearchRoutes.get(
  '/empires',
  zValidator(
    'query',
    commonSearchSchema.extend({
      sortBy: z
        .enum([
          'relevance',
          'texts-asc',
          'texts-desc',
          'authors-asc',
          'authors-desc',
          'alphabetical-asc',
          'alphabetical-desc',
        ])
        .optional(),
    }),
  ),
  async c => {
    const { q, limit, page, sortBy, locale } = c.req.valid('query');

    const results = await typesense
      .collections<TypesenseEmpireDocument>(EMPIRES_COLLECTION.INDEX)
      .documents()
      .search({
        q: prepareQuery(q),
        query_by: Object.values(empiresQueryWeights).flat(),
        query_by_weights: weightsMapToQueryWeights(empiresQueryWeights),
        prioritize_token_position: true,
        limit,
        page,
        ...(sortBy &&
          sortBy !== 'relevance' && {
          sort_by: {
            'texts-asc': 'booksCount:asc',
            'texts-desc': 'booksCount:desc',
            'authors-asc': 'authorsCount:asc',
            'authors-desc': 'authorsCount:desc',
            'alphabetical-asc': 'names.text:asc',
            'alphabetical-desc': 'names.text:desc',
          }[sortBy],
        }),
      });

    return c.json({
      results: formatResults(results, 'empire', empire => formatEmpire(empire, locale)),
      pagination: formatPagination(results.found, results.page, limit),
    });
  },
);

export default empireSearchRoutes;
