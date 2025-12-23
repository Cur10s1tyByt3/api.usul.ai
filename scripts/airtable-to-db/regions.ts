import { db } from '@/lib/db';
import { authorsAirtable } from '../util/airtable';
import { translateToLocalesBatch } from '../util/openai';
import { locales, AppLocale } from '@/lib/locale';
import slugify from 'slugify';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// Helper function to convert AppLocale to database locale code
const appLocaleToDbLocale = (appLocale: AppLocale): string => {
  return appLocale.split('-')[0];
};

// Translate region name to all supported languages
const translateToAllLocales = async (
  type: 'region',
  englishName: string,
): Promise<Map<string, { translation: string; transliteration: string }>> => {
  console.log(`  Translating "${englishName}" to all languages in one request...`);

  // Get all locale codes
  const localeCodes = locales.map(locale => locale.code) as AppLocale[];

  // Use batch translation
  const translations = await translateToLocalesBatch(type, englishName, localeCodes);

  // Ensure English is set (it should be, but just in case)
  if (!translations.has('en')) {
    translations.set('en', {
      translation: englishName,
      transliteration: '',
    });
  }

  // Convert locale codes to database locale codes
  const result = new Map<string, { translation: string; transliteration: string }>();
  for (const [locale, data] of translations.entries()) {
    result.set(locale, data);
  }

  // Also ensure we have entries for all expected database locales
  for (const locale of locales) {
    const dbLocale = appLocaleToDbLocale(locale.code);
    if (!result.has(dbLocale) && locale.code === 'en-US') {
      result.set('en', {
        translation: englishName,
        transliteration: '',
      });
    }
  }

  return result;
};

// Fetch regions from Airtable
const getAirtableRegions = async () => {
  return (await authorsAirtable('Regions').select().all()).map(r => {
    const fields = r.fields;
    const name = fields['Name'] as string;

    return {
      _airtableReference: r.id,
      name: name || '',
    };
  });
};

// Fetch authors from Airtable and calculate region counts
const calculateRegionCounts = async (
  regionIdToName: Map<string, string>,
) => {
  console.log('Fetching authors from Airtable to calculate region counts...');
  const authors = await authorsAirtable('Authors').select().all();

  // Map to store region name -> { numberOfAuthors, numberOfBooks }
  const regionCounts = new Map<
    string,
    { numberOfAuthors: number; numberOfBooks: number }
  >();

  for (const author of authors) {
    const fields = author.fields;
    const regions = (fields['Regions الدول المعاصرة'] as string[]) || [];
    const numberOfBooks = (fields['Number of Books'] as number) || 0;

    // Get region names from the map
    for (const regionId of regions) {
      const regionName = regionIdToName.get(regionId);
      if (regionName) {
        const existing = regionCounts.get(regionName) || {
          numberOfAuthors: 0,
          numberOfBooks: 0,
        };
        existing.numberOfAuthors += 1;
        existing.numberOfBooks += numberOfBooks;
        regionCounts.set(regionName, existing);
      }
    }
  }

  console.log(`Calculated counts for ${regionCounts.size} regions`);
  return regionCounts;
};

// Link authors directly to regions via AuthorToRegion relation
const linkAuthorsToRegionsDirect = async (
  regionIdToName: Map<string, string>,
  regionNameToSlug: Map<string, string>,
  regionSlugToId: Map<string, string>,
) => {
  console.log('\nLinking authors directly to regions...');

  // Fetch all authors from Airtable
  const authors = await authorsAirtable('Authors').select().all();
  console.log(`Found ${authors.length} authors in Airtable`);

  // Fetch all existing authors from database to create a lookup map
  const existingAuthors = await db.author.findMany({
    select: {
      id: true,
    },
  });
  const authorIdsSet = new Set(existingAuthors.map(a => a.id));
  console.log(`Found ${existingAuthors.length} authors in database`);

  // Fetch existing regions from database (fetch again to get latest after creates/updates)
  const existingRegions = await db.region.findMany({
    select: {
      id: true,
      slug: true,
    },
  });
  console.log(`Found ${existingRegions.length} regions in database`);

  let authorsWithRegions = 0;
  let authorsSkipped = 0;
  let regionsNotFound = 0;

  // Collect all updates first (batch processing)
  const updates: Array<{ authorId: string; regionIds: string[] }> = [];

  // Process authors and collect updates
  for (let i = 0; i < authors.length; i++) {
    const author = authors[i];
    const fields = author.fields;
    const authorId = fields['Author ID'] as string | undefined;

    // Progress logging every 100 authors
    if (i % 100 === 0) {
      console.log(`  Processing authors ${i + 1}/${authors.length}...`);
    }

    if (!authorId) {
      authorsSkipped++;
      continue;
    }

    // Check if author exists in database
    if (!authorIdsSet.has(authorId)) {
      authorsSkipped++;
      continue;
    }

    const regionIds = (fields['Regions الدول المعاصرة'] as string[]) || [];
    if (regionIds.length === 0) {
      continue;
    }

    authorsWithRegions++;
    // Get region IDs for this author
    const dbRegionIds: string[] = [];

    for (const regionAirtableId of regionIds) {
      const regionName = regionIdToName.get(regionAirtableId);
      if (!regionName) {
        regionsNotFound++;
        continue;
      }

      // Try to find region by name (exact match first, then normalized)
      let regionId = regionNameToSlug.get(regionName);
      if (!regionId) {
        // Try normalized name
        const normalizedName = regionName.trim().toLowerCase();
        regionId = regionNameToSlug.get(normalizedName);
      }

      // If still not found, try to generate slug and match
      if (!regionId) {
        const potentialSlug = slugify(regionName, { lower: true, trim: true });
        regionId = regionSlugToId.get(potentialSlug);
      }

      if (!regionId) {
        regionsNotFound++;
        continue;
      }

      dbRegionIds.push(regionId);
    }

    // Collect update
    if (dbRegionIds.length > 0) {
      updates.push({ authorId, regionIds: dbRegionIds });
    }
  }

  console.log(`\n  Collected ${updates.length} author-region updates to apply`);
  console.log(`  - Authors with regions in Airtable: ${authorsWithRegions}`);
  console.log(`  - Authors skipped (no Author ID or not in DB): ${authorsSkipped}`);
  console.log(`  - Regions not found: ${regionsNotFound}`);

  // Batch update authors (process in chunks to avoid overwhelming the database)
  const BATCH_SIZE = 50;
  let linkedCount = 0;

  console.log(`\n  Applying updates in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    await Promise.all(
      batch.map(async ({ authorId, regionIds }) => {
        try {
          await db.author.update({
            where: { id: authorId },
            data: {
              regions: {
                set: regionIds.map(id => ({ id })),
              },
            },
          });
          linkedCount++;
        } catch (e) {
          console.error(`Failed to link author ${authorId} to regions:`, e);
        }
      })
    );

    // Progress logging
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= updates.length) {
      console.log(`  Updated ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length} authors...`);
    }
  }

  console.log(`\nLinked ${linkedCount} authors directly to regions`);
};

// Main sync function
const main = async () => {
  console.log('Fetching regions from Airtable...');
  const airtableRegions = await getAirtableRegions();
  console.log(`Found ${airtableRegions.length} regions in Airtable`);

  // Create a map of region ID -> region name for quick lookup
  const regionIdToName = new Map(
    airtableRegions.map(r => [r._airtableReference, r.name]),
  );

  // Calculate region counts from authors
  const regionCounts = await calculateRegionCounts(regionIdToName);

  // Debug: Show some sample counts
  console.log('\nSample region counts:');
  let sampleCount = 0;
  for (const [name, counts] of regionCounts.entries()) {
    if (sampleCount < 5) {
      console.log(`  ${name}: ${counts.numberOfAuthors} authors, ${counts.numberOfBooks} books`);
      sampleCount++;
    }
  }

  console.log('\nFetching existing regions from database...');
  const existingRegions = await db.region.findMany({
    select: {
      id: true,
      slug: true,
      numberOfAuthors: true,
      numberOfBooks: true,
      nameTranslations: {
        select: {
          locale: true,
          text: true,
        },
      },
    },
  });
  console.log(`Found ${existingRegions.length} existing regions in database`);

  // Create maps for matching
  const existingBySlug = new Map(existingRegions.map(r => [r.slug, r]));
  const existingSlugs = new Set(existingRegions.map(r => r.slug));

  // Create a map by English name for matching
  const existingByEnglishName = new Map<string, typeof existingRegions[number]>();
  for (const region of existingRegions) {
    const englishName = region.nameTranslations.find(t => t.locale === 'en');
    if (englishName) {
      existingByEnglishName.set(englishName.text, region);
    }
  }

  // Plan changes
  const toCreate: typeof airtableRegions = [];
  const toUpdate: Array<{
    airtable: (typeof airtableRegions)[number];
    existing: (typeof existingRegions)[number];
  }> = [];

  for (const airtableRegion of airtableRegions) {
    if (!airtableRegion.name) {
      console.warn(`Skipping region with empty name (Airtable ID: ${airtableRegion._airtableReference})`);
      continue;
    }

    // Try to match by English name first (most reliable)
    let existing = existingByEnglishName.get(airtableRegion.name);

    // If not found by name, try to match by slug
    if (!existing) {
      const potentialSlug = slugify(airtableRegion.name, { lower: true, trim: true });
      existing = existingBySlug.get(potentialSlug);
    }

    if (existing) {
      // Check if update is needed (compare English name or counts)
      const existingEnglishName = existing.nameTranslations.find((t: { locale: string; text: string }) => t.locale === 'en');
      const counts = regionCounts.get(airtableRegion.name) || {
        numberOfAuthors: 0,
        numberOfBooks: 0,
      };

      const nameChanged = !existingEnglishName || existingEnglishName.text !== airtableRegion.name;
      const countsChanged =
        existing.numberOfAuthors !== counts.numberOfAuthors ||
        existing.numberOfBooks !== counts.numberOfBooks;

      if (nameChanged || countsChanged) {
        toUpdate.push({ airtable: airtableRegion, existing });
      }
    } else {
      toCreate.push(airtableRegion);
    }
  }

  // Also check existing regions that might need count updates
  // (even if they're not in Airtable regions list but we have counts for them)
  for (const existingRegion of existingRegions) {
    // Skip if already in update list
    if (toUpdate.some(u => u.existing.id === existingRegion.id)) {
      continue;
    }

    // Try to find matching counts by English name
    const englishName = existingRegion.nameTranslations.find(
      (t: { locale: string; text: string }) => t.locale === 'en',
    );
    if (englishName) {
      const counts = regionCounts.get(englishName.text);
      if (
        counts &&
        (existingRegion.numberOfAuthors !== counts.numberOfAuthors ||
          existingRegion.numberOfBooks !== counts.numberOfBooks)
      ) {
        // Find the Airtable region for this name
        const airtableRegion = airtableRegions.find(r => r.name === englishName.text);
        if (airtableRegion) {
          toUpdate.push({ airtable: airtableRegion, existing: existingRegion });
        }
      }
    }
  }

  // Note: We don't delete regions automatically since we can't reliably match by Airtable ID
  // Regions will only be updated if they match by name or slug
  const deletedRegions: typeof existingRegions = [];

  // Summary
  console.log('\nPlanned changes:');
  console.log(`- Creates: ${toCreate.length}`);
  console.log(`- Updates: ${toUpdate.length}`);
  console.log(`- Deletes: ${deletedRegions.length}`);

  if (toCreate.length) {
    console.log('\nCreates:');
    for (const region of toCreate) {
      console.log(`- ${region.name}`);
    }
  }

  if (toUpdate.length) {
    console.log('\nUpdates:');
    for (const { airtable, existing } of toUpdate) {
      const existingName = existing.nameTranslations[0]?.text ?? '—';
      const counts = regionCounts.get(airtable.name) || {
        numberOfAuthors: 0,
        numberOfBooks: 0,
      };
      console.log(
        `- ${existingName} -> ${airtable.name} (id: ${existing.id}) [Authors: ${existing.numberOfAuthors} -> ${counts.numberOfAuthors}, Books: ${existing.numberOfBooks} -> ${counts.numberOfBooks}]`,
      );
    }
  }

  if (deletedRegions.length) {
    console.log('\nDeletes:');
    for (const deletedRegion of deletedRegions) {
      const name = deletedRegion.nameTranslations[0]?.text ?? deletedRegion.slug;
      console.log(`- ${name} (slug: ${deletedRegion.slug})`);
    }
  }

  const rl = createInterface({ input, output });
  const answer = await rl.question('\nProceed with applying these changes? (y/N) ');
  await rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Aborted. No changes applied.');
    process.exit(0);
  }

  // Apply creates
  console.log('\nCreating regions...');
  for (const airtableRegion of toCreate) {
    console.log(`\nTranslating "${airtableRegion.name}" to all languages...`);

    // Translate to all locales
    const allTranslations = await translateToAllLocales('region', airtableRegion.name);

    if (allTranslations.size === 0) {
      console.warn(`Failed to translate region name: ${airtableRegion.name}`);
      continue;
    }

    // Get Arabic transliteration (used for the main transliteration field)
    const arabicTranslation = allTranslations.get('ar');
    const transliteration = arabicTranslation?.transliteration || '';

    // Generate slug from English name
    let slug = slugify(airtableRegion.name, { lower: true, trim: true });
    let suffix = 1;
    while (existingSlugs.has(slug)) {
      slug = slugify(`${airtableRegion.name}-${suffix++}`, { lower: true, trim: true });
    }
    existingSlugs.add(slug);

    // Get counts for this region
    const counts = regionCounts.get(airtableRegion.name) || {
      numberOfAuthors: 0,
      numberOfBooks: 0,
    };

    // Prepare translation data for all locales
    const translationData = Array.from(allTranslations.entries()).map(
      ([locale, { translation }]) => ({
        locale,
        text: translation,
      }),
    );

    try {
      await db.region.create({
        data: {
          id: slug,
          slug,
          transliteration,
          numberOfAuthors: counts.numberOfAuthors,
          numberOfBooks: counts.numberOfBooks,
          nameTranslations: {
            createMany: {
              data: translationData,
            },
          },
        },
      });

      const translationsList = Array.from(allTranslations.entries())
        .map(([locale, { translation }]) => `${locale.toUpperCase()}: ${translation}`)
        .join(', ');
      console.log(
        `Created: ${slug} [${translationsList}] (Authors: ${counts.numberOfAuthors}, Books: ${counts.numberOfBooks})`,
      );
    } catch (e) {
      console.error(`Failed to create region ${airtableRegion.name}:`, e);
    }
  }

  // Apply updates
  console.log('\nUpdating regions...');
  for (const { airtable, existing } of toUpdate) {
    console.log(`\nTranslating "${airtable.name}" to all languages...`);

    // Translate to all locales
    const allTranslations = await translateToAllLocales('region', airtable.name);

    if (allTranslations.size === 0) {
      console.warn(`Failed to translate region name: ${airtable.name}`);
      continue;
    }

    // Get Arabic transliteration (used for the main transliteration field)
    const arabicTranslation = allTranslations.get('ar');
    const transliteration = arabicTranslation?.transliteration || '';

    // Get counts for this region
    const counts = regionCounts.get(airtable.name) || {
      numberOfAuthors: 0,
      numberOfBooks: 0,
    };

    // Prepare upsert data for all locales
    const upsertData = Array.from(allTranslations.entries()).map(
      ([locale, { translation }]) => ({
        where: {
          regionId_locale: {
            regionId: existing.id,
            locale,
          },
        },
        create: {
          locale,
          text: translation,
        },
        update: {
          text: translation,
        },
      }),
    );

    try {
      await db.region.update({
        where: { id: existing.id },
        data: {
          transliteration,
          numberOfAuthors: counts.numberOfAuthors,
          numberOfBooks: counts.numberOfBooks,
          nameTranslations: {
            upsert: upsertData,
          },
        },
      });

      const translationsList = Array.from(allTranslations.entries())
        .map(([locale, { translation }]) => `${locale.toUpperCase()}: ${translation}`)
        .join(', ');
      console.log(
        `Updated: ${existing.id} [${translationsList}] (Authors: ${counts.numberOfAuthors}, Books: ${counts.numberOfBooks})`,
      );
    } catch (e) {
      console.error(`Failed to update region ${existing.id}:`, e);
    }
  }

  // Apply deletes
  if (deletedRegions.length > 0) {
    console.log(`\nDeleting ${deletedRegions.length} removed regions...`);
    for (const deletedRegion of deletedRegions) {
      try {
        await db.region.delete({
          where: { id: deletedRegion.id },
        });
        console.log(`Deleted: ${deletedRegion.slug}`);
      } catch (e) {
        console.error(`Failed to delete region ${deletedRegion.slug}:`, e);
      }
    }
  }

  // Create maps for linking - need both name->slug and also create a slug-based lookup
  const regionNameToSlug = new Map<string, string>();
  const regionSlugToId = new Map<string, string>();

  for (const region of await db.region.findMany({
    select: { id: true, slug: true, nameTranslations: true }
  })) {
    const englishName = region.nameTranslations.find(t => t.locale === 'en');
    if (englishName) {
      // Normalize the name (trim whitespace, lowercase for matching)
      const normalizedName = englishName.text.trim().toLowerCase();
      regionNameToSlug.set(normalizedName, region.id);
      // Also store the original name mapping
      regionNameToSlug.set(englishName.text, region.id);
    }
    regionSlugToId.set(region.slug, region.id);
  }

  console.log(`Created region mapping with ${regionNameToSlug.size} name entries`);

  // Link authors directly to regions via AuthorToRegion relation
  await linkAuthorsToRegionsDirect(regionIdToName, regionNameToSlug, regionSlugToId);

  console.log('\n✅ Sync completed!');
};

main()
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

