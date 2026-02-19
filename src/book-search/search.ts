import {
  odata,
  SearchDocumentsResult,
  SearchIterator,
  SearchResult,
  SelectFields,
} from '@azure/search-documents';

import { vectorSearchClients, keywordSearchClient } from './client';
import { KeywordSearchBookChunk, VectorSearchBookChunk } from '@/types/search';
import { rerankChunks } from '@/lib/cohere';

async function asyncIterableToArray<T extends object>(
  iterable:
    | SearchIterator<T, SelectFields<T>>
    | AsyncIterable<SearchResult<T, SelectFields<T>>>,
) {
  const results: SearchResult<T, SelectFields<T>>[] = [];
  for await (const result of iterable) {
    results.push(result);
  }
  return results;
}

async function* arrayToAsyncIterable<T>(arr: T[]): AsyncIterable<T> {
  for (const item of arr) {
    yield item;
  }
}

interface SearchParams {
  books?: {
    id: string;
    sourceAndVersion?: string; // source:version, like turath:692
  }[];
  query: string;
  type: 'vector' | 'text';
  limit?: number;
  rerankLimit?: number;
  page?: number;
  rerank?: boolean;
}

export async function searchBook({
  books,
  query,
  type = 'vector',
  limit = 5,
  rerankLimit,
  page = 1,
  rerank = true,
}: SearchParams) {
  let filter: string | undefined;
  if (books) {
    if (books.length === 1) {
      const firstBook = books[0]!;
      filter = odata`book_id eq '${firstBook.id}'`;
      if (firstBook.sourceAndVersion) {
        filter += ` and book_version_id eq '${firstBook.sourceAndVersion}'`;
      }
    } else {
      // filter = books
      //   .map(
      //     b =>
      //       odata`(book_id eq '${b.id}'${
      //         b.sourceAndVersion ? ` and book_version_id eq '${b.sourceAndVersion}'` : ''
      //       })`,
      //   )
      //   .join(' or ');
      const bookIds = books.map(b => b.id);
      filter = odata`search.in(book_id, '${bookIds.join(', ')}')`;
    }
  }

  let total: number;
  let formattedResults: Awaited<ReturnType<typeof formatResults>>;

  if (type === 'text') {
    const results = await keywordSearchClient.search(query, {
      filter,
      top: limit,
      queryType: 'full',
      searchMode: 'all',
      skip: (page - 1) * limit,
      searchFields: ['content'],
      includeTotalCount: true,
      highlightFields: 'content',
    });
    total = results.count!;
    formattedResults = await formatResults(results.results);
  } else {
    // vector search - query all indexes in parallel and merge results
    const skip = (page - 1) * limit;
    const topPerIndex = skip + limit;

    const searchResultsList = await Promise.all(
      vectorSearchClients.map((client) =>
        client.search(undefined, {
          filter,
          top: topPerIndex,
          skip: 0,
          includeTotalCount: true,
          vectorSearchOptions: {
            queries: [
              {
                kind: 'text',
                fields: ['chunk_embedding'],
                text: query,
              },
            ],
          },
        }),
      ),
    );

    const mergedArrays = await Promise.all(
      searchResultsList.map((r) => asyncIterableToArray(r.results)),
    );
    const mergedResults = mergedArrays.flat();

    const idToResult = new Map<
      string,
      SearchResult<
        KeywordSearchBookChunk | VectorSearchBookChunk,
        SelectFields<KeywordSearchBookChunk | VectorSearchBookChunk>
      >
    >();
    for (const r of mergedResults) {
      const existing = idToResult.get(r.document.id);
      if (!existing || (r.score ?? 0) > (existing.score ?? 0)) {
        idToResult.set(r.document.id, r);
      }
    }

    const sortedByScore = [...idToResult.values()].sort(
      (a, b) => (b.score ?? 0) - (a.score ?? 0),
    );
    const paginatedResults = sortedByScore.slice(skip, skip + limit);
    total = sortedByScore.length;
    formattedResults = await formatResults(
      arrayToAsyncIterable(paginatedResults),
    );
  }

  if (rerank) {
    formattedResults = await rerankChunks(query, formattedResults, {
      topK: rerankLimit,
    });
  }

  const totalPages = Math.ceil(total / limit);
  return {
    total,
    totalPages,
    perPage: limit,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    results: formattedResults,
  };
}

const formatResults = async (
  results:
    | SearchIterator<
        KeywordSearchBookChunk | VectorSearchBookChunk,
        SelectFields<KeywordSearchBookChunk | VectorSearchBookChunk>
      >
    | AsyncIterable<
        SearchResult<
          KeywordSearchBookChunk | VectorSearchBookChunk,
          SelectFields<KeywordSearchBookChunk | VectorSearchBookChunk>
        >
      >,
) => {
  return (await asyncIterableToArray(results)).map(r => {
    if ('chunk_content' in r.document) {
      return {
        score: r.score,
        node: {
          id: r.document.id,
          text: r.document.chunk_content,
          highlights: r.highlights?.chunk_content ?? [],
          metadata: {
            bookId: r.document.book_id,
            sourceAndVersion: r.document.book_version_id,
            pages: r.document.pages,
            chapters: r.document.chapters,
          },
        },
      };
    }

    return {
      score: r.score,
      node: {
        id: r.document.id,
        text: r.document.content,
        highlights: r.highlights?.content ?? [],
        metadata: {
          bookId: r.document.book_id,
          sourceAndVersion: r.document.book_version_id,
          pages: [
            {
              index: r.document.index,
              page: r.document.page,
              volume: r.document.volume,
            },
          ],
          chapters: r.document.chapters,
        },
      },
    };
  });
};

export type AzureSearchResponse = Awaited<ReturnType<typeof searchBook>>;
export type AzureSearchResult = Awaited<ReturnType<typeof formatResults>>[number];

export const searchQueriesInParallel = async (
  queries: string[],
  params?: Omit<SearchParams, 'query' | 'type'>,
) => {
  // search the queries in parallel
  const searchResults = (
    await Promise.all(
      queries.map(async query => {
        const result = await searchBook({
          query,
          type: 'vector',
          limit: 20,
          rerank: false,
          ...params,
        });
        return result.results;
      }),
    )
  ).flat();

  const idToSource: Record<string, AzureSearchResult> = {};
  for (const result of searchResults) {
    idToSource[result.node.id] = result;
  }

  return Object.values(idToSource); // return de-duplicated sources
};
