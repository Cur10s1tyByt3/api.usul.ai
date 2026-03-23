import { Context, Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createDataStream, StreamTextResult, ToolSet } from 'ai';
import { routeQuery } from '@/chat/route-query';
import { getBookDetails } from '../book/details';
import { answerAuthorQuery } from '@/chat/author-chat';
import { answerBookQuery } from '@/chat/book-chat';
import { condenseMessageHistory } from '@/chat/condense-chat';
import { HTTPException } from 'hono/http-exception';
import { searchQueriesInParallel } from '@/book-search/search';
import { answerRagQuery } from '@/chat/rag';
import { dataStreamToResponse } from '@/lib/stream';
import { messagesSchema } from '@/validators/chat';
import { writeSourcesToStream } from '@/chat/utils';
import { generateQueries } from '@/chat/generate-queries';
import { rerankChunks } from '@/lib/cohere';
import { detectLanguage } from '@/chat/detect-language';
import { optionalAuth } from '@/middlewares/auth';
import { resolveLangfuseUserId } from '@/lib/langfuse-user';
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';

const singleChatRoutes = new Hono();

const getStreamResult = async (
  c: Context,
  chatId: string,
  streamResult: StreamTextResult<ToolSet, never>,
) => {
  const dataStream = createDataStream({
    execute: async writer => {
      writer.writeMessageAnnotation({ type: 'CHAT_ID', value: chatId });
      streamResult.mergeIntoDataStream(writer);
    },
    onError: error => {
      console.log(error);
      return error instanceof Error ? error.message : String(error);
    },
  });

  return dataStreamToResponse(c, dataStream);
};

singleChatRoutes.post(
  '/:bookId/:versionId',
  optionalAuth,
  zValidator(
    'json',
    z.object({
      isRetry: z.boolean().optional(),
      messages: messagesSchema,
      chatId: z.string().optional(),
    }),
  ),
  async c => {
    const body = c.req.valid('json');
    const traceId = uuidv4();
    const sessionId = body.chatId ?? uuidv4();
    const userId = resolveLangfuseUserId(c.var.session);

    return propagateAttributes(
      { userId, sessionId, traceName: 'single-book-chat' },
      async () => {
      return startActiveObservation('single-book-chat', async (rootSpan) => {
        const bookId = c.req.param('bookId');
        const versionId = c.req.param('versionId');

        // get last 6 messages
        const lastMessage = body.messages[body.messages.length - 1].content;
        const messages = body.messages.slice(0, body.messages.length - 1);
        const chatHistory = messages.slice(-6);

        rootSpan.updateTrace({ name: 'single-book-chat', input: lastMessage });
        rootSpan.update({
          input: {
            query: lastMessage,
            bookId,
            versionId,
            userId,
            userEmail: c.var.session?.user?.email,
          },
        });

        const setTraceOutput = (text: string) => {
          rootSpan.update({ output: text });
          rootSpan.updateTrace({ output: text });
          rootSpan.end();
        };

        const bookDetails = await getBookDetails(bookId);
        if ('type' in bookDetails) {
          throw new HTTPException(400);
        }

        const version = bookDetails.book.versions.find(v => v.id === versionId);
        if (!version) {
          throw new Error('Version not found');
        }

        const routerResult = await routeQuery(chatHistory, lastMessage, sessionId, userId);
        if (routerResult === 'author') {
          const streamResult = await answerAuthorQuery({
            author: bookDetails.book.author,
            history: chatHistory,
            query: lastMessage,
            traceId,
            sessionId,
            userId,
          });
          streamResult.text.then(setTraceOutput).catch(() => rootSpan.end());
          return getStreamResult(c, traceId, streamResult);
        }

        if (routerResult === 'summary') {
          const streamResult = await answerBookQuery({
            bookDetails,
            history: chatHistory,
            query: lastMessage,
            traceId,
            sessionId,
            userId,
          });
          streamResult.text.then(setTraceOutput).catch(() => rootSpan.end());
          return getStreamResult(c, traceId, streamResult);
        }

        const dataStream = createDataStream({
          execute: async writer => {
            try {
              // pass traceId to frontend to be able to give feedback (thumbs up/down)
              writer.writeMessageAnnotation({ type: 'CHAT_ID', value: traceId });
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
                  books: [
                    {
                      id: bookDetails.book.id,
                      sourceAndVersion: `${version.source}:${version.value}`,
                    },
                  ],
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

              const result = await answerRagQuery({
                bookDetails,
                history: chatHistory,
                query: lastMessage, // use last message and not ragQuery to preserve context
                sources: sources!,
                isRetry: body.isRetry,
                traceId,
                sessionId,
                language: queryLanguage,
                userId,
              });
              result.mergeIntoDataStream(writer);

              writeSourcesToStream(writer, sources);

              const fullText = await result.text;
              setTraceOutput(fullText);
            } catch (e) {
              rootSpan.end();
              throw e;
            }
          },
          onError: error => {
            console.log(error);
            return error instanceof Error ? error.message : String(error);
          },
        });

        return dataStreamToResponse(c, dataStream);
      }, { endOnExit: false });
    },
  );
  },
);

export default singleChatRoutes;
