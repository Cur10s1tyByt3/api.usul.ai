import { db } from '@/lib/db';
import { authorsAirtable } from '../util/airtable';
import { translateAndTransliterateName } from '../util/openai';
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
  const translations = new Map<
    string,
    { translation: string; transliteration: string }
  >();

  // English is the source, so we use it directly
  translations.set('en', {
    translation: englishName,
    transliteration: '',
  });

  // Translate to all other locales
  for (const locale of locales) {
    if (locale.code === 'en-US') continue; // Skip English as it's the source

    console.log(`  Translating to ${locale.name}...`);
    const result = await translateAndTransliterateName(
      type,
      englishName,
      locale.code,
    );

    if (result) {
      const dbLocale = appLocaleToDbLocale(locale.code);
      translations.set(dbLocale, {
        translation: result.translation,
        transliteration: result.transliteration,
      });
    } else {
      console.warn(`    Failed to translate to ${locale.name}`);
    }
  }

  return translations;
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

// Add this function after calculateRegionCounts
const linkAuthorsToRegions = async (
  regionIdToName: Map<string, string>,
  regionNameToSlug: Map<string, string>,
) => {
  console.log('\nLinking authors to regions via locations...');

  // Fetch all authors from Airtable
  const authors = await authorsAirtable('Authors').select().all();

  // Fetch existing authors from database
  const existingAuthors = await db.author.findMany({
    select: {
      id: true,
      slug: true,
    },
  });
  const authorBySlug = new Map(existingAuthors.map(a => [a.slug, a]));

  // Fetch existing locations
  const existingLocations = await db.location.findMany({
    select: {
      id: true,
      slug: true,
      type: true,
      regionId: true,
    },
  });

  // Create a map: regionSlug -> Location (for "Resided" type as default)
  const locationByRegionSlug = new Map<string, typeof existingLocations[number]>();
  for (const loc of existingLocations) {
    if (loc.regionId && loc.type === 'Resided') {
      locationByRegionSlug.set(loc.regionId, loc);
    }
  }

  let linkedCount = 0;
  let createdLocationsCount = 0;

  // Process authors in batches
  for (const author of authors) {
    const fields = author.fields;
    const authorSlug = fields['Slug'] as string | undefined;
    if (!authorSlug) continue;

    const dbAuthor = authorBySlug.get(authorSlug);
    if (!dbAuthor) {
      console.warn(`Author not found in DB: ${authorSlug}`);
      continue;
    }

    const regionIds = (fields['Regions الدول المعاصرة'] as string[]) || [];
    if (regionIds.length === 0) continue;

    // Get location IDs for this author's regions
    const locationIds: string[] = [];

    for (const regionId of regionIds) {
      const regionName = regionIdToName.get(regionId);
      if (!regionName) continue;

      const regionSlug = regionNameToSlug.get(regionName);
      if (!regionSlug) continue;

      // Check if location exists for this region
      let location = locationByRegionSlug.get(regionSlug);

      if (!location) {
        // Create a new location for this region
        const locationSlug = slugify(`${regionName}-resided`, { lower: true, trim: true });
        const locationId = `${locationSlug}-resided`;

        try {
          // Check if location with this slug+type already exists
          const existing = existingLocations.find(
            l => l.slug === locationSlug && l.type === 'Resided'
          );

          if (existing) {
            // Update existing location to point to this region
            await db.location.update({
              where: { id: existing.id },
              data: { regionId: regionSlug },
            });
            location = { ...existing, regionId: regionSlug };
            locationByRegionSlug.set(regionSlug, location);
          } else {
            // Create new location
            await db.location.create({
              data: {
                id: locationId,
                slug: locationSlug,
                name: regionName,
                type: 'Resided',
                regionId: regionSlug,
              },
            });
            location = {
              id: locationId,
              slug: locationSlug,
              type: 'Resided',
              regionId: regionSlug,
            };
            locationByRegionSlug.set(regionSlug, location);
            createdLocationsCount++;
          }
        } catch (e) {
          console.error(`Failed to create/update location for region ${regionName}:`, e);
          continue;
        }
      }

      locationIds.push(location.id);
    }

    // Link author to locations
    if (locationIds.length > 0) {
      try {
        // Get current author locations
        const currentAuthor = await db.author.findUnique({
          where: { id: dbAuthor.id },
          select: { locations: { select: { id: true } } },
        });

        const currentLocationIds = currentAuthor?.locations.map(l => l.id) || [];
        const newLocationIds = [...new Set([...currentLocationIds, ...locationIds])];

        await db.author.update({
          where: { id: dbAuthor.id },
          data: {
            locations: {
              set: newLocationIds.map(id => ({ id })),
            },
          },
        });
        linkedCount++;
      } catch (e) {
        console.error(`Failed to link author ${authorSlug} to locations:`, e);
      }
    }
  }

  console.log(`Created ${createdLocationsCount} locations`);
  console.log(`Linked ${linkedCount} authors to regions`);
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

  const regionNameToSlug = new Map<string, string>();
  for (const region of await db.region.findMany({ select: { id: true, nameTranslations: true } })) {
    const englishName = region.nameTranslations.find(t => t.locale === 'en');
    if (englishName) {
      regionNameToSlug.set(englishName.text, region.id);
    }
  }

  // Link authors to regions
  await linkAuthorsToRegions(regionIdToName, regionNameToSlug);

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

