import type { AzureSearchResult } from '@/book-search/search';
import { env } from '@/env';
import { CohereClient } from 'cohere-ai';

const cohere = new CohereClient({
  token: env.COHERE_API_KEY,
});

export const rerankChunks = async (
  query: string,
  chunks: AzureSearchResult[],
  options?: { topK?: number },
) => {
  // DISABLED COHERE
  // const response = await cohere.rerank({
  //   documents: chunks.map(chunk => chunk.node.text),
  //   query,
  //   topN: options?.topK,
  // });

  // return response.results.map(result => chunks[result.index]!);

  const sorted = chunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (options?.topK) {
    return sorted.slice(0, options?.topK ?? sorted.length);
  }
  return sorted;
};
