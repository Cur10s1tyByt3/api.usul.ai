import type { AzureSearchResult } from '@/book-search/search';
import { env } from '@/env';

interface CohereRerankResult {
  index: number;
  relevance_score: number;
}

interface CohereRerankResponse {
  results: CohereRerankResult[];
}

export const rerankChunks = async (
  query: string,
  chunks: AzureSearchResult[],
  options?: { topK?: number },
) => {
  const response = await fetch(env.AZURE_COHERE_ENDPOINT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: env.AZURE_COHERE_API_KEY,
    },
    body: JSON.stringify({
      model: env.AZURE_COHERE_RERANK_DEPLOYMENT,
      query,
      documents: chunks.map(chunk => chunk.node.text),
      top_n: options?.topK,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Cohere rerank failed with status ${response.status}: ${errorBody}`,
    );
  }

  const data: CohereRerankResponse = await response.json();
  return data.results.map(result => chunks[result.index]!);
};
