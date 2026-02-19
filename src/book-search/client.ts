import { env } from '@/env';
import { KeywordSearchBookChunk, VectorSearchBookChunk } from '@/types/search';
import { AzureKeyCredential, SearchClient } from '@azure/search-documents';

export const keywordSearchClient = new SearchClient<KeywordSearchBookChunk>(
  env.AZURE_SEARCH_ENDPOINT,
  env.AZURE_KEYWORD_SEARCH_INDEX,
  new AzureKeyCredential(env.AZURE_SEARCH_KEY),
);

const parsedVectorIndexNames = env.AZURE_VECTOR_SEARCH_INDEXES?.split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const vectorSearchIndexNames =
  parsedVectorIndexNames && parsedVectorIndexNames.length > 0
    ? parsedVectorIndexNames
    : [env.AZURE_VECTOR_SEARCH_INDEX];

const searchCredential = new AzureKeyCredential(env.AZURE_SEARCH_KEY);

export const vectorSearchClients = vectorSearchIndexNames.map(
  (indexName) =>
    new SearchClient<VectorSearchBookChunk>(
      env.AZURE_SEARCH_ENDPOINT,
      indexName,
      searchCredential,
    ),
);

/** Backwards-compatible single-client export (primary index). */
export const vectorSearchClient = vectorSearchClients[0]!;
