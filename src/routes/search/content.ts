import { AzureSearchResult, searchBook } from '@/book-search/search';
import { langfuse } from '@/lib/langfuse';
import { generateObject } from '@/lib/llm';
import { chunk } from '@/lib/utils';
import { getBookDetails } from '@/routes/book/details';
import { localeSchema } from '@/validators/locale';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { optionalAuth } from '@/middlewares/auth';
import { resolveLangfuseUserId } from '@/lib/langfuse-user';
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';

const contentSearchRoutes = new Hono();

contentSearchRoutes.get(
  '/content',
  optionalAuth,
  zValidator(
    'query',
    z.object({
      q: z.string().min(1),
      bookId: z.string().min(1),
      versionId: z.string().min(1),
      type: z.enum(['semantic', 'keyword']).optional().default('semantic'),
      page: z.coerce.number().min(1).optional().default(1),
      limit: z.coerce.number().min(1).max(100).optional().default(10),
      locale: localeSchema,
    }),
  ),
  async c => {
    const {
      bookId,
      versionId,
      q: query,
      type,
      locale,
      limit,
      page,
    } = c.req.valid('query');

    const bookDetails = await getBookDetails(bookId, locale);
    if (!bookDetails || 'type' in bookDetails) {
      throw new HTTPException(400, { message: 'Invalid book' });
    }

    const version = bookDetails.book.versions.find(v => v.id === versionId);

    if (!version) {
      throw new Error('Version not found');
    }

    const results = await searchBook({
      books: [
        {
          id: bookId,
          sourceAndVersion: `${version.source}:${version.value}`,
        },
      ],
      query,
      type: type === 'semantic' ? 'vector' : 'text',
      limit,
      page,
    });

    if (type === 'keyword') {
      return c.json({
        ...results,
        results: results.results.map(r => r.node),
      });
    }

    const userId = resolveLangfuseUserId(c.var.session);

    return c.json({
      ...results,
      results: await summarizeChunks(query, results.results, userId),
    });
  },
);

const summarizeChunks = async (
  query: string,
  results: AzureSearchResult[],
  userId: string,
) => {
  return propagateAttributes(
    { userId, traceName: 'search-content-enhance' },
    async () => {
    return startActiveObservation('search-content-enhance', async rootSpan => {
      rootSpan.updateTrace({ name: 'search-content-enhance', input: query });

      const formattedResults = results.map(match => ({
        score: match.score,
        text: match.node.text,
        metadata: match.node.metadata,
      }));

      const batches = chunk(formattedResults, 5);
      const prompt = await langfuse.getPrompt('search.enhance');
      const compiledPrompt = prompt.compile();

      const summaries = await Promise.all(
        batches.map(async batch => {
          const result = await generateObject({
            system: compiledPrompt,
            output: 'no-schema',
            messages: [
              {
                role: 'user',
                content: `
Search Query: ${query}

Results: 
${batch.map((r, idx) => `[${idx}]. ${r.text}`).join('\n\n')}
    `.trim(),
              },
            ],
            langfuse: {
              name: 'Search.OpenAI.Book',
              prompt,
            },
          });

          return result.object as Record<number, string>;
        }),
      );

      const mapped = summaries.flatMap((parsed, idx) => {
        const batch = batches[idx];

        return batch.map((node, idx) => {
          if (!parsed[idx]) {
            return node;
          }

          return {
            ...node,
            text: replaceHighlights(parsed[idx]),
          };
        });
      });

      rootSpan.updateTrace({ output: { resultCount: mapped.length } });
      return mapped;
    });
    },
  );
};

// replace text in [[...]] with <em>...</em>
// replace text in [..] with <strong>...</strong>
const replaceHighlights = (text: string) => {
  return text
    .replace(/\[\[(.*?)\]\]/g, '<em>$1</em>')
    .replace(/\[(.*?)\]/g, '<strong>$1</strong>');
};

export default contentSearchRoutes;
