import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
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
    try {
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
              'alphabetical-asc': 'transliteration:asc',
              'alphabetical-desc': 'transliteration:desc',
            }[sortBy],
          }),
        });

      return c.json({
        results: formatResults(results, 'empire', empire => formatEmpire(empire, locale)),
        pagination: formatPagination(results.found, results.page, limit),
      });
    } catch (error: any) {
      console.error('Error searching empires:', error);
      
      // Handle Typesense collection not found error
      if (error?.httpStatus === 404 || error?.message?.includes('not found')) {
        throw new HTTPException(404, {
          message: `Empires collection not found. Please ensure the '${EMPIRES_COLLECTION.INDEX}' collection exists in Typesense.`,
        });
      }
      
      // Handle Typesense connection errors
      if (error?.message?.includes('ECONNREFUSED') || error?.message?.includes('ENOTFOUND')) {
        throw new HTTPException(503, {
          message: 'Typesense service unavailable. Please check the Typesense server connection.',
        });
      }
      
      // Re-throw other errors to be handled by the global error handler
      throw error;
    }
  },
);

export default empireSearchRoutes;
