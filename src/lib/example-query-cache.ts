import { createRedis } from './redis';
import { AzureSearchResult } from '@/book-search/search';
import { isExampleQuery, EXAMPLE_QUERIES } from './example-queries';

const normalizeQuery = (query: string): string => {
  return query.trim().toLowerCase();
};

/**
 * Get the actual locale for a query by checking which locale it matches
 */
const getQueryLocale = (query: string): string | null => {
  const normalized = normalizeQuery(query);

  for (const [locale, queries] of Object.entries(EXAMPLE_QUERIES)) {
    if (!queries) continue;

    const isMatch = Object.values(queries).some(
      (exampleQuery: { shortText: string; longText: string }) =>
        normalizeQuery(exampleQuery.longText) === normalized,
    );
    if (isMatch) {
      return locale;
    }
  }

  return null;
};

const getCacheKey = (query: string, locale: string): string => {
  const normalized = normalizeQuery(query);
  // Use the detected locale for the query, not the passed locale
  const actualLocale = getQueryLocale(query) || locale;
  return `example_query_cache:${actualLocale}:${normalized}`;
};

export interface CachedResponse {
  text: string;
  sources: AzureSearchResult[];
  queries: string[];
  language: string;
}

export const getCachedResponse = async (
  query: string,
  locale: string,
): Promise<CachedResponse | null> => {
  const isExample = isExampleQuery(query, locale);
  if (!isExample) {
    return null;
  }

  const redis = createRedis();
  const cacheKey = getCacheKey(query, locale);

  try {
    const cached = await redis.get(cacheKey);
    if (!cached) {
      return null;
    }

    console.log(`Cache hit for locale: ${locale}`);
    return JSON.parse(cached) as CachedResponse;
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
  } finally {
    redis.quit();
  }
};

export const setCachedResponse = async (
  query: string,
  locale: string,
  response: CachedResponse,
): Promise<void> => {
  if (!isExampleQuery(query, locale)) {
    return;
  }

  const redis = createRedis();
  const cacheKey = getCacheKey(query, locale);

  try {
    // Cache for 7 days
    await redis.setex(cacheKey, 60 * 60 * 24 * 7, JSON.stringify(response));
  } catch (error) {
    console.error('Error writing to cache:', error);
  } finally {
    redis.quit();
  }
};
