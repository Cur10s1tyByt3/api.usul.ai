import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createDataStream } from 'ai';

import { searchQueriesInParallel } from '@/book-search/search';
import { answerMultiBookRagQuery } from '@/chat/rag';
import { dataStreamToResponse } from '@/lib/stream';
import { messagesSchema } from '@/validators/chat';
import { getBookById, getBooksByAuthorId, getBooksByAdvancedGenreId } from '@/services/book';
import { getGenreIdsWithDescendants } from '@/services/advanced-genre';
import { BookDto } from '@/dto/book.dto';
import { localeSchema } from '@/validators/locale';
import { generateQueries } from '@/chat/generate-queries';
import { rerankChunks } from '@/lib/cohere';
import { writeSourcesToStream } from '@/chat/utils';
import { condenseMessageHistory } from '@/chat/condense-chat';
import { detectLanguage } from '@/chat/detect-language';
import {
  getCachedResponse,
  setCachedResponse,
} from '@/lib/example-query-cache';
import { isExampleQuery } from '@/lib/example-queries';
import { createCachedTextStream } from '@/lib/stream-cached-text';
import { checkAndIncrementChatLimit } from '../../lib/chat-limit';
import { optionalAuth } from '@/middlewares/auth';

const multiChatRoutes = new Hono();

multiChatRoutes.post(
  '/multi',
  optionalAuth,
  zValidator(
    'query',
    z.object({
      locale: localeSchema,
    }),
  ),
  zValidator(
    'json',
    z.object({
      isRetry: z.boolean().optional(),
      bookIds: z.array(z.string()).optional().default([]),
      authorIds: z.array(z.string()).optional().default([]),
      advancedGenreIds: z.array(z.string()).optional().default([]),
      messages: messagesSchema,
      chatId: z.string().optional(),
    }),
  ),
  async c => {
    const body = c.req.valid('json');
    const { locale } = c.req.valid('query');

    // Skip IP-based limit for signed-in users; only enforce it for anonymous users
    if (!c.var.session) {
      const limitResult = await checkAndIncrementChatLimit(c);
      if (!limitResult.allowed) {
        return c.json(
          { code: limitResult.code, message: limitResult.message },
          403,
        );
      }
    }

    const traceId = uuidv4();
    const sessionId = body.chatId ?? uuidv4();
    const userId = c.var.session?.user?.id;

    const lastMessage = body.messages[body.messages.length - 1].content;
    const messages = body.messages.slice(0, body.messages.length - 1);
    // get last 6 messages
    const chatHistory = messages.slice(-6);

    const resolvedBookIds = new Set<string>();
    if (body.bookIds.length > 0) {
      body.bookIds.forEach(bookId => resolvedBookIds.add(bookId));
    }

    if (body.authorIds.length > 0) {
      body.authorIds.forEach(authorId => {
        const books = getBooksByAuthorId(authorId, locale);
        books.forEach(book => resolvedBookIds.add(book.id));
      });
    }

    if (body.advancedGenreIds.length > 0) {
      // Expand advancedGenres to include all descendant genres (children, grandchildren, etc.)
      // This ensures that when a parent genre is searched, books from all child genres are included
      const expandedGenreIds = await getGenreIdsWithDescendants(body.advancedGenreIds);
      for (const advancedGenreId of expandedGenreIds) {
        const books = getBooksByAdvancedGenreId(advancedGenreId, locale);
        for (const book of books) {
          resolvedBookIds.add(book.id);
        }
      }
    }

    const books = [...resolvedBookIds]
      .map(id => getBookById(id, locale))
      .filter(Boolean) as BookDto[];

    const dataStream = createDataStream({
      execute: async writer => {
        // pass traceId to frontend to be able to give feedback (thumbs up/down)
        writer.writeMessageAnnotation({ type: 'CHAT_ID', value: traceId });

        // Check if this is an example query and if we have a cached response
        // Skip cache if this is a retry/regeneration
        try {
          const cachedResponse =
            !body.isRetry
              ? await getCachedResponse(lastMessage, locale)
              : null;

          if (cachedResponse) {
            // Stream cached response
            writer.writeMessageAnnotation({
              type: 'STATUS',
              value: 'searching',
              queries: cachedResponse.queries,
            });

            writer.writeMessageAnnotation({
              type: 'STATUS',
              value: 'generating-response',
            });

            // Create a streamText-like result from cached text and merge it
            try {
              const cachedStream = createCachedTextStream(cachedResponse.text);
              // Await the merge to ensure all text is streamed before continuing
              await cachedStream.mergeIntoDataStream(writer);

              // Get book details from cached sources
              const sourcesBooks = [
                ...new Set(
                  cachedResponse.sources.map(source => source.node.metadata.bookId),
                ),
              ]
                .map(bookId => getBookById(bookId, locale))
                .filter(Boolean) as BookDto[];

              writeSourcesToStream(writer, cachedResponse.sources, sourcesBooks);
              return;
            } catch (streamError) {
              console.error('Error streaming cached response, falling back to normal flow:', streamError);
              // Fall through to normal flow if streaming fails
            }
          }
        } catch (cacheError) {
          console.error('Error checking cache, falling back to normal flow:', cacheError);
          // Fall through to normal flow if cache check fails
        }

        // Normal flow for non-cached queries
        writer.writeMessageAnnotation({ type: 'STATUS', value: 'generating-queries' });

        const queryLanguagePromise = detectLanguage({ query: lastMessage, sessionId, userId });
        const queries = (
          await generateQueries({ chatHistory: body.messages, sessionId, userId })
        ).map(q => q.query);

        writer.writeMessageAnnotation({
          type: 'STATUS',
          value: 'searching',
          queries,
        });

        // search the queries in parallel
        const [searchResults, queryLanguage, rerankQuery] = await Promise.all([
          searchQueriesInParallel([...queries, lastMessage], {
            books: books.length > 0 ? books.map(book => ({ id: book.id })) : undefined,
          }),
          queryLanguagePromise,
          (async () => {
            if (chatHistory.length === 0) return lastMessage;

            return condenseMessageHistory({
              chatHistory,
              query: lastMessage,
              isRetry: body.isRetry,
              sessionId,
              userId,
            });
          })(),
        ]);

        // pass de-duplicated sources to rerank
        const sources = await rerankChunks(rerankQuery, searchResults, {
          topK: 20,
        });

        writer.writeMessageAnnotation({
          type: 'STATUS',
          value: 'generating-response',
        });

        const result = await answerMultiBookRagQuery({
          history: chatHistory,
          query: lastMessage, // use last message and not ragQuery to preserve context
          sources,
          isRetry: body.isRetry,
          traceId,
          sessionId,
          language: queryLanguage,
          userId,
        });

        // Stream the result
        result.mergeIntoDataStream(writer);

        // if there are books specified in filters, use them to get book details, otherwise use sources to get book details
        const sourcesBooks =
          books.length > 0
            ? books
            : ([...new Set(sources.map(source => source.node.metadata.bookId))]
              .map(bookId => getBookById(bookId, locale))
              .filter(Boolean) as BookDto[]);

        writeSourcesToStream(writer, sources, sourcesBooks);

        // Cache the response if this is an example query
        // We need to wait for the stream to complete before caching
        const isExample = isExampleQuery(lastMessage, locale);
        if (isExample) {
          // Get the full text from the result (this will wait for streaming to complete)
          try {
            const fullText = await result.text;

            if (fullText) {
              // Cache in the background - don't block the response if caching fails
              await setCachedResponse(
                lastMessage,
                locale,
                {
                  text: fullText,
                  sources,
                  queries,
                  language: queryLanguage,
                },
              );
            }
          } catch (error) {
            console.error('Failed to cache example query response:', error);
            console.error('Error details:', {
              locale,
              query: lastMessage.substring(0, 50),
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      },
      onError: error => {
        console.log(error);
        return error instanceof Error ? error.message : String(error);
      },
    });

    return dataStreamToResponse(c, dataStream);
  },
);

export default multiChatRoutes;
