import { AppLocale, locales } from '@/lib/locale';
import { sleep } from '@/lib/utils';
import { createAzure } from '@ai-sdk/azure';
import { generateObject } from 'ai';
import { AzureOpenAI } from 'openai';
import { z } from 'zod';

if (
  !process.env.AZURE_ENDPOINT_URL ||
  !process.env.AZURE_SECRET_KEY ||
  !process.env.AZURE_4_1_DEPLOYMENT
) {
  throw new Error(
    'AZURE_ENDPOINT_URL, AZURE_SECRET_KEY and AZURE_4_1_DEPLOYMENT are not set',
  );
}

const azure = createAzure({
  baseURL: process.env.AZURE_ENDPOINT_URL,
  apiKey: process.env.AZURE_SECRET_KEY,
  apiVersion: '2025-01-01-preview',
});

export const model = azure.languageModel(process.env.AZURE_4_1_DEPLOYMENT);

type Type = 'genre' | 'region' | 'empire';

const SYSTEM_PROMPT = (type: Type, locale: AppLocale) => {
  const language = locales.find(lang => lang.code === locale)!;

  const typeDescription =
    type === 'region'
      ? 'a historical region'
      : type === 'empire'
        ? 'an historical empire or era'
        : 'an islamic genre';

  return `
  You are a bot that takes ${typeDescription} name as an input and return two words in (${language.name}): 
  
  a) translation: the translation of the word in (${language.name})
  b) transliteration: how the Arabic word is spelled in English ${locale === 'en-US' ? '[using IJMES format]' : ''
    }
  
  You should return a json in this format: 
  
  {
    translation: String,
    transliteration: String,
  }
  `.trim();
};

const schema = z.object({
  translation: z.string(),
  transliteration: z.string(),
});

export const translateAndTransliterateName = async (
  type: Type,
  name: string,
  localeCode: AppLocale,
): Promise<{
  translation: string;
  transliteration: string;
} | null> => {
  try {
    const completion = await generateObject({
      model: model,
      output: 'no-schema',
      system: SYSTEM_PROMPT(type, localeCode),
      prompt: `${name}`,
    });

    const parsedResult = schema.safeParse(completion.object);
    if (!parsedResult.success) return null;

    return parsedResult.data;
  } catch (e: any) {
    if (e?.status === 429) {
      await sleep(2000);
      return translateAndTransliterateName(type, name, localeCode);
    }
    console.log(e);

    return null;
  }
};

const overviewSchema = z.object({
  overview: z.string(),
});

export const generateEmpireOverview = async (
  empireName: string,
  localeCode: AppLocale,
): Promise<string | null> => {
  const language = locales.find(lang => lang.code === localeCode)!;

  const systemPrompt = `
  You are a bot that generates a brief historical overview of an Islamic empire or era.
  The overview should be 2-3 sentences in ${language.name}, providing context about the empire's significance, time period, and key characteristics.
  Keep it concise and informative.
  
  You should return a json in this format:
  
  {
    overview: String,
  }
  `.trim();

  try {
    const completion = await generateObject({
      model: model,
      output: 'no-schema',
      system: systemPrompt,
      prompt: `Generate an overview for: ${empireName}`,
    });

    const parsedResult = overviewSchema.safeParse(completion.object);
    if (!parsedResult.success) return null;

    return parsedResult.data.overview;
  } catch (e: any) {
    if (e?.status === 429) {
      await sleep(2000);
      return generateEmpireOverview(empireName, localeCode);
    }
    console.log(e);

    return null;
  }
};

// Batch translation schema - returns translations for all requested locales
const batchTranslationSchema = z.record(
  z.string(),
  z.object({
    translation: z.string(),
    transliteration: z.string(),
  }),
);

// Translate name to all requested locales in one request
export const translateToLocalesBatch = async (
  type: Type,
  name: string,
  localeCodes: AppLocale[],
): Promise<Map<string, { translation: string; transliteration: string }>> => {
  const translations = new Map<
    string,
    { translation: string; transliteration: string }
  >();

  // English is the source, so we use it directly
  if (localeCodes.includes('en-US' as AppLocale)) {
    translations.set('en', {
      translation: name,
      transliteration: '',
    });
  }

  // Get all non-English locales
  const nonEnglishLocales = localeCodes.filter(locale => locale !== 'en-US');
  if (nonEnglishLocales.length === 0) {
    return translations;
  }

  // Create a map of database locale code -> AppLocale for reverse lookup
  const dbLocaleToAppLocale = new Map<string, AppLocale>();
  for (const locale of locales) {
    const dbLocale = locale.code.split('-')[0];
    dbLocaleToAppLocale.set(dbLocale, locale.code as AppLocale);
  }

  // Build language list for the prompt with database locale codes
  const languageList = nonEnglishLocales
    .map(locale => {
      const lang = locales.find(l => l.code === locale);
      const dbLocale = locale.split('-')[0];
      return lang ? `${lang.name} (use locale code "${dbLocale}" in response)` : `${locale} (use locale code "${locale.split('-')[0]}" in response)`;
    })
    .join(', ');

  const systemPrompt = `
  You are a bot that takes ${type === 'region'
      ? 'a historical region'
      : type === 'empire'
        ? 'an historical empire or era'
        : 'an islamic genre'
    } name as an input and returns translations and transliterations for multiple languages.
  
  For each requested language, provide:
  a) translation: the translation of the word in that language
  b) transliteration: how the Arabic word is spelled in English using IJMES format (for English) or standard transliteration (for other languages)
  
  You should return a JSON object where each key is a locale code (use the short form like "ar", "fr", "es", "en" - NOT "ar-SA", "fr-FR", etc.) and each value is an object with "translation" and "transliteration" fields.
  
  Example format:
  {
    "ar": { "translation": "...", "transliteration": "..." },
    "fr": { "translation": "...", "transliteration": "..." },
    "es": { "translation": "...", "transliteration": "..." }
  }
  
  Translate to these languages: ${languageList}
  `.trim();

  try {
    const completion = await generateObject({
      model: model,
      output: 'no-schema',
      system: systemPrompt,
      prompt: `Translate this name to all requested languages: ${name}`,
    });

    const parsedResult = batchTranslationSchema.safeParse(completion.object);
    if (!parsedResult.success) {
      console.warn('Failed to parse batch translation result:', parsedResult.error);
      return translations;
    }

    // Map the results to our format (using database locale codes)
    for (const [locale, data] of Object.entries(parsedResult.data)) {
      // The locale from AI should already be in database format (e.g., "ar", "fr")
      // but handle both cases
      const dbLocale = locale.includes('-') ? locale.split('-')[0] : locale;
      translations.set(dbLocale, {
        translation: data.translation,
        transliteration: data.transliteration,
      });
    }

    return translations;
  } catch (e: any) {
    if (e?.status === 429) {
      await sleep(2000);
      return translateToLocalesBatch(type, name, localeCodes);
    }
    console.log('Batch translation error:', e);
    return translations;
  }
};

// Batch overview generation schema
const batchOverviewSchema = z.record(z.string(), z.string());

// Generate overviews for all requested locales in one request
export const generateEmpireOverviewsBatch = async (
  empireName: string,
  localeCodes: AppLocale[],
): Promise<Map<string, string>> => {
  const overviews = new Map<string, string>();

  if (localeCodes.length === 0) {
    return overviews;
  }

  // Build language list for the prompt with database locale codes
  const languageList = localeCodes
    .map(locale => {
      const lang = locales.find(l => l.code === locale);
      const dbLocale = locale.split('-')[0];
      return lang ? `${lang.name} (use locale code "${dbLocale}" in response)` : `${locale} (use locale code "${dbLocale}" in response)`;
    })
    .join(', ');

  const systemPrompt = `
  You are a bot that generates brief historical overviews of Islamic empires or eras.
  For each requested language, generate a 2-3 sentence overview in that language, providing context about the empire's significance, time period, and key characteristics.
  Keep each overview concise and informative.
  
  You should return a JSON object where each key is a locale code (use the short form like "en", "ar", "fr", "es" - NOT "en-US", "ar-SA", "fr-FR", etc.) and each value is the overview text in that language.
  
  Example format:
  {
    "en": "The Abbasid Caliphate was...",
    "ar": "الخلافة العباسية كانت...",
    "fr": "Le califat abbasside était..."
  }
  
  Generate overviews in these languages: ${languageList}
  `.trim();

  try {
    const completion = await generateObject({
      model: model,
      output: 'no-schema',
      system: systemPrompt,
      prompt: `Generate overviews for this empire: ${empireName}`,
    });

    const parsedResult = batchOverviewSchema.safeParse(completion.object);
    if (!parsedResult.success) {
      console.warn('Failed to parse batch overview result:', parsedResult.error);
      return overviews;
    }

    // Map the results (using database locale codes)
    for (const [locale, overview] of Object.entries(parsedResult.data)) {
      // The locale from AI should already be in database format (e.g., "ar", "fr")
      // but handle both cases
      const dbLocale = locale.includes('-') ? locale.split('-')[0] : locale;
      overviews.set(dbLocale, overview);
    }

    return overviews;
  } catch (e: any) {
    if (e?.status === 429) {
      await sleep(2000);
      return generateEmpireOverviewsBatch(empireName, localeCodes);
    }
    console.log('Batch overview generation error:', e);
    return overviews;
  }
};
