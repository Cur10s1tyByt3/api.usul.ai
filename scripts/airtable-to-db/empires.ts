import { db } from '@/lib/db';
import { authorsAirtable } from '../util/airtable';
import {
    translateToLocalesBatch,
    generateEmpireOverviewsBatch,
} from '../util/openai';
import { locales, AppLocale } from '@/lib/locale';
import slugify from 'slugify';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// Helper function to convert AppLocale to database locale code
const appLocaleToDbLocale = (appLocale: AppLocale): string => {
    return appLocale.split('-')[0];
};

// Translate empire name to all supported languages
const translateToAllLocales = async (
    type: 'empire',
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

// Generate overviews for all locales
const generateOverviewsForAllLocales = async (
    empireName: string,
): Promise<Map<string, string>> => {
    console.log(`  Generating overviews for "${empireName}" in all languages in one request...`);

    // Get all locale codes
    const localeCodes = locales.map(locale => locale.code) as AppLocale[];

    // Use batch overview generation
    const overviews = await generateEmpireOverviewsBatch(empireName, localeCodes);

    // Convert locale codes to database locale codes
    const result = new Map<string, string>();
    for (const [locale, overview] of overviews.entries()) {
        result.set(locale, overview);
    }

    return result;
};

// Fetch empires from Airtable
const getAirtableEmpires = async () => {
    return (
        await authorsAirtable('Empires & Eras').select().all()
    ).map(e => {
        const fields = e.fields;
        const name = fields['Empire & Era'] as string;
        const hijriDate = fields['Hijri Date'] as string | undefined;
        const georgianDate = fields['Georgian Date'] as string | undefined;
        const regions = (fields['Regions'] as string[]) || [];
        const authors = (fields['Authors'] as string[]) || [];

        return {
            _airtableReference: e.id,
            name: name || '',
            hijriDate,
            georgianDate,
            regionIds: regions,
            authorIds: authors,
        };
    });
};

// Fetch authors from Airtable and calculate empire counts
const calculateEmpireCounts = async (
    empireIdToAuthorIds: Map<string, string[]>,
) => {
    console.log('Fetching authors from Airtable to calculate empire counts...');
    const authors = await authorsAirtable('Authors').select().all();

    // Create a map of author Airtable ID -> number of books
    const authorBookCounts = new Map<string, number>();
    for (const author of authors) {
        const fields = author.fields;
        const numberOfBooks = (fields['Number of Books'] as number) || 0;
        authorBookCounts.set(author.id, numberOfBooks);
    }

    // Map to store empire name -> { numberOfAuthors, numberOfBooks }
    const empireCounts = new Map<
        string,
        { numberOfAuthors: number; numberOfBooks: number }
    >();

    for (const [empireId, authorIds] of empireIdToAuthorIds.entries()) {
        let numberOfAuthors = 0;
        let numberOfBooks = 0;

        for (const authorId of authorIds) {
            const bookCount = authorBookCounts.get(authorId) || 0;
            numberOfAuthors += 1;
            numberOfBooks += bookCount;
        }

        empireCounts.set(empireId, { numberOfAuthors, numberOfBooks });
    }

    console.log(`Calculated counts for ${empireCounts.size} empires`);
    return empireCounts;
};

// Link authors to empires
const linkAuthorsToEmpires = async (
    empireIdToName: Map<string, string>,
    empireNameToSlug: Map<string, string>,
) => {
    console.log('\nLinking authors to empires...');

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

    // Fetch existing empires from database
    const existingEmpires = await db.empire.findMany({
        select: {
            id: true,
            slug: true,
        },
    });
    const empireBySlug = new Map(existingEmpires.map(e => [e.slug, e]));
    console.log(`Found ${existingEmpires.length} empires in database`);

    // Create a map of empire Airtable ID -> empire database ID
    const empireAirtableIdToDbId = new Map<string, string>();
    for (const [empireAirtableId, empireName] of empireIdToName.entries()) {
        const empireSlug = empireNameToSlug.get(empireName);
        if (empireSlug) {
            const dbEmpire = empireBySlug.get(empireSlug);
            if (dbEmpire) {
                empireAirtableIdToDbId.set(empireAirtableId, dbEmpire.id);
            }
        }
    }

    let authorsWithEmpires = 0;
    let authorsSkipped = 0;
    let empiresNotFound = 0;

    // Collect all updates first (batch processing)
    const updates: Array<{ authorId: string; empireIds: string[] }> = [];

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

        const empireAirtableIds = (fields['Empires & Eras الممالك'] as string[]) || [];
        if (empireAirtableIds.length === 0) {
            continue;
        }

        authorsWithEmpires++;
        // Get empire IDs for this author
        const dbEmpireIds: string[] = [];

        for (const empireAirtableId of empireAirtableIds) {
            const dbEmpireId = empireAirtableIdToDbId.get(empireAirtableId);
            if (!dbEmpireId) {
                empiresNotFound++;
                continue;
            }
            dbEmpireIds.push(dbEmpireId);
        }

        // Collect update
        if (dbEmpireIds.length > 0) {
            updates.push({ authorId, empireIds: dbEmpireIds });
        }
    }

    console.log(`\n  Collected ${updates.length} author-empire updates to apply`);
    console.log(`  - Authors with empires in Airtable: ${authorsWithEmpires}`);
    console.log(`  - Authors skipped (no Author ID or not in DB): ${authorsSkipped}`);
    console.log(`  - Empires not found: ${empiresNotFound}`);

    // Batch update authors (process in chunks to avoid overwhelming the database)
    const BATCH_SIZE = 50;
    let linkedCount = 0;

    console.log(`\n  Applying updates in batches of ${BATCH_SIZE}...`);
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        await Promise.all(
            batch.map(async ({ authorId, empireIds }) => {
                try {
                    await db.author.update({
                        where: { id: authorId },
                        data: {
                            empires: {
                                set: empireIds.map(id => ({ id })),
                            },
                        },
                    });
                    linkedCount++;
                } catch (e) {
                    console.error(`Failed to link author ${authorId} to empires:`, e);
                }
            })
        );

        // Progress logging
        if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= updates.length) {
            console.log(`  Updated ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length} authors...`);
        }
    }

    console.log(`\nLinked ${linkedCount} authors to empires`);
};

// Link regions to empires
const linkRegionsToEmpires = async (
    empireIdToRegionIds: Map<string, string[]>,
    empireNameToSlug: Map<string, string>,
    empireIdToName: Map<string, string>,
    regionIdToName: Map<string, string>,
) => {
    console.log('\nLinking regions to empires...');

    // Fetch existing regions from database
    const existingRegions = await db.region.findMany({
        select: {
            id: true,
            slug: true,
            nameTranslations: {
                select: {
                    locale: true,
                    text: true,
                },
            },
        },
    });

    // Create a map of region English name -> region id (which is the slug)
    const regionNameToId = new Map<string, string>();
    for (const region of existingRegions) {
        const englishName = region.nameTranslations.find(t => t.locale === 'en');
        if (englishName) {
            regionNameToId.set(englishName.text, region.id);
        }
    }

    // Fetch existing empires from database
    const existingEmpires = await db.empire.findMany({
        select: {
            id: true,
            slug: true,
        },
    });
    const empireBySlug = new Map(existingEmpires.map(e => [e.slug, e]));

    let linkedCount = 0;

    // Process each empire
    for (const [empireAirtableId, regionIds] of empireIdToRegionIds.entries()) {
        // Find the empire name and slug
        const empireName = empireIdToName.get(empireAirtableId);
        if (!empireName) continue;

        const empireSlug = empireNameToSlug.get(empireName);
        if (!empireSlug) continue;

        const dbEmpire = empireBySlug.get(empireSlug);
        if (!dbEmpire) continue;

        // Get region IDs for this empire
        const dbRegionIds: string[] = [];

        for (const regionAirtableId of regionIds) {
            const regionName = regionIdToName.get(regionAirtableId);
            if (!regionName) continue;

            const regionId = regionNameToId.get(regionName);
            if (!regionId) continue;

            dbRegionIds.push(regionId);
        }

        // Link regions to empire
        if (dbRegionIds.length > 0) {
            try {
                await db.empire.update({
                    where: { id: dbEmpire.id },
                    data: {
                        region: {
                            set: dbRegionIds.map(id => ({ id })),
                        },
                    },
                });
                linkedCount++;
            } catch (e) {
                console.error(
                    `Failed to link regions to empire ${empireSlug}:`,
                    e,
                );
            }
        }
    }

    console.log(`Linked ${linkedCount} empires to regions`);
};

// Main sync function
const main = async () => {
    console.log('Fetching empires from Airtable...');
    const airtableEmpires = await getAirtableEmpires();
    console.log(`Found ${airtableEmpires.length} empires in Airtable`);

    // Create maps for lookups
    const empireIdToAuthorIds = new Map<string, string[]>();
    const empireIdToRegionIds = new Map<string, string[]>();
    const empireIdToName = new Map<string, string>();

    for (const empire of airtableEmpires) {
        empireIdToAuthorIds.set(empire._airtableReference, empire.authorIds);
        empireIdToRegionIds.set(empire._airtableReference, empire.regionIds);
        empireIdToName.set(empire._airtableReference, empire.name);
    }

    // Calculate empire counts from authors
    const empireCounts = await calculateEmpireCounts(empireIdToAuthorIds);

    // Debug: Show some sample counts
    console.log('\nSample empire counts:');
    let sampleCount = 0;
    for (const [empireId, counts] of empireCounts.entries()) {
        if (sampleCount < 5) {
            const empireName = empireIdToName.get(empireId) || 'Unknown';
            console.log(
                `  ${empireName}: ${counts.numberOfAuthors} authors, ${counts.numberOfBooks} books`,
            );
            sampleCount++;
        }
    }

    console.log('\nFetching existing empires from database...');
    const existingEmpires = await db.empire.findMany({
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
    console.log(`Found ${existingEmpires.length} existing empires in database`);

    // Create maps for matching
    const existingBySlug = new Map(existingEmpires.map(e => [e.slug, e]));
    const existingSlugs = new Set(existingEmpires.map(e => e.slug));

    // Create a map by English name for matching
    const existingByEnglishName = new Map<
        string,
        (typeof existingEmpires)[number]
    >();
    for (const empire of existingEmpires) {
        const englishName = empire.nameTranslations.find(t => t.locale === 'en');
        if (englishName) {
            existingByEnglishName.set(englishName.text, empire);
        }
    }

    // Plan changes
    const toCreate: typeof airtableEmpires = [];
    const toUpdate: Array<{
        airtable: (typeof airtableEmpires)[number];
        existing: (typeof existingEmpires)[number];
    }> = [];

    for (const airtableEmpire of airtableEmpires) {
        if (!airtableEmpire.name) {
            console.warn(
                `Skipping empire with empty name (Airtable ID: ${airtableEmpire._airtableReference})`,
            );
            continue;
        }

        // Try to match by English name first (most reliable)
        let existing = existingByEnglishName.get(airtableEmpire.name);

        // If not found by name, try to match by slug
        if (!existing) {
            const potentialSlug = slugify(airtableEmpire.name, {
                lower: true,
                trim: true,
            });
            existing = existingBySlug.get(potentialSlug);
        }

        if (existing) {
            // Check if update is needed (compare English name or counts)
            const existingEnglishName = existing.nameTranslations.find(
                (t: { locale: string; text: string }) => t.locale === 'en',
            );
            const counts =
                empireCounts.get(airtableEmpire._airtableReference) || {
                    numberOfAuthors: 0,
                    numberOfBooks: 0,
                };

            const nameChanged =
                !existingEnglishName ||
                existingEnglishName.text !== airtableEmpire.name;
            const countsChanged =
                existing.numberOfAuthors !== counts.numberOfAuthors ||
                existing.numberOfBooks !== counts.numberOfBooks;

            if (nameChanged || countsChanged) {
                toUpdate.push({ airtable: airtableEmpire, existing });
            }
        } else {
            toCreate.push(airtableEmpire);
        }
    }

    // Also check existing empires that might need count updates
    for (const existingEmpire of existingEmpires) {
        // Skip if already in update list
        if (toUpdate.some(u => u.existing.id === existingEmpire.id)) {
            continue;
        }

        // Try to find matching counts by English name
        const englishName = existingEmpire.nameTranslations.find(
            (t: { locale: string; text: string }) => t.locale === 'en',
        );
        if (englishName) {
            // Find the Airtable empire for this name
            const airtableEmpire = airtableEmpires.find(
                e => e.name === englishName.text,
            );
            if (airtableEmpire) {
                const counts = empireCounts.get(airtableEmpire._airtableReference);
                if (
                    counts &&
                    (existingEmpire.numberOfAuthors !== counts.numberOfAuthors ||
                        existingEmpire.numberOfBooks !== counts.numberOfBooks)
                ) {
                    toUpdate.push({
                        airtable: airtableEmpire,
                        existing: existingEmpire,
                    });
                }
            }
        }
    }

    // Note: We don't delete empires automatically since we can't reliably match by Airtable ID
    const deletedEmpires: typeof existingEmpires = [];

    // Summary
    console.log('\nPlanned changes:');
    console.log(`- Creates: ${toCreate.length}`);
    console.log(`- Updates: ${toUpdate.length}`);
    console.log(`- Deletes: ${deletedEmpires.length}`);

    if (toCreate.length) {
        console.log('\nCreates:');
        for (const empire of toCreate) {
            console.log(`- ${empire.name}`);
        }
    }

    if (toUpdate.length) {
        console.log('\nUpdates:');
        for (const { airtable, existing } of toUpdate) {
            const existingName = existing.nameTranslations[0]?.text ?? '—';
            const counts =
                empireCounts.get(airtable._airtableReference) || {
                    numberOfAuthors: 0,
                    numberOfBooks: 0,
                };
            console.log(
                `- ${existingName} -> ${airtable.name} (id: ${existing.id}) [Authors: ${existing.numberOfAuthors} -> ${counts.numberOfAuthors}, Books: ${existing.numberOfBooks} -> ${counts.numberOfBooks}]`,
            );
        }
    }

    if (deletedEmpires.length) {
        console.log('\nDeletes:');
        for (const deletedEmpire of deletedEmpires) {
            const name = deletedEmpire.nameTranslations[0]?.text ?? deletedEmpire.slug;
            console.log(`- ${name} (slug: ${deletedEmpire.slug})`);
        }
    }

    const rl = createInterface({ input, output });
    const answer = await rl.question(
        '\nProceed with applying these changes? (y/N) ',
    );
    await rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
        console.log('Aborted. No changes applied.');
        process.exit(0);
    }

    // Apply creates
    console.log('\nCreating empires...');
    for (const airtableEmpire of toCreate) {
        console.log(
            `\nTranslating "${airtableEmpire.name}" to all languages...`,
        );

        // Translate to all locales
        const allTranslations = await translateToAllLocales(
            'empire',
            airtableEmpire.name,
        );

        if (allTranslations.size === 0) {
            console.warn(`Failed to translate empire name: ${airtableEmpire.name}`);
            continue;
        }

        // Generate overviews for all locales
        console.log(`\nGenerating overviews for "${airtableEmpire.name}"...`);
        const allOverviews = await generateOverviewsForAllLocales(
            airtableEmpire.name,
        );

        // Get Arabic transliteration (used for the main transliteration field)
        const arabicTranslation = allTranslations.get('ar');
        const transliteration = arabicTranslation?.transliteration || '';

        // Generate slug from English name
        let slug = slugify(airtableEmpire.name, { lower: true, trim: true });
        let suffix = 1;
        while (existingSlugs.has(slug)) {
            slug = slugify(`${airtableEmpire.name}-${suffix++}`, {
                lower: true,
                trim: true,
            });
        }
        existingSlugs.add(slug);

        // Get counts for this empire
        const counts =
            empireCounts.get(airtableEmpire._airtableReference) || {
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

        // Prepare overview data for all locales
        const overviewData = Array.from(allOverviews.entries()).map(
            ([locale, overview]) => ({
                locale,
                text: overview,
            }),
        );

        try {
            await db.empire.create({
                data: {
                    id: slug,
                    slug,
                    numberOfAuthors: counts.numberOfAuthors,
                    numberOfBooks: counts.numberOfBooks,
                    nameTranslations: {
                        createMany: {
                            data: translationData,
                        },
                    },
                    overviewTranslations: {
                        createMany: {
                            data: overviewData,
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
            console.error(`Failed to create empire ${airtableEmpire.name}:`, e);
        }
    }

    // Apply updates
    console.log('\nUpdating empires...');
    for (const { airtable, existing } of toUpdate) {
        console.log(`\nTranslating "${airtable.name}" to all languages...`);

        // Translate to all locales
        const allTranslations = await translateToAllLocales('empire', airtable.name);

        if (allTranslations.size === 0) {
            console.warn(`Failed to translate empire name: ${airtable.name}`);
            continue;
        }

        // Generate overviews for all locales
        console.log(`\nGenerating overviews for "${airtable.name}"...`);
        const allOverviews = await generateOverviewsForAllLocales(airtable.name);

        // Get Arabic transliteration (used for the main transliteration field)
        const arabicTranslation = allTranslations.get('ar');
        const transliteration = arabicTranslation?.transliteration || '';

        // Get counts for this empire
        const counts =
            empireCounts.get(airtable._airtableReference) || {
                numberOfAuthors: 0,
                numberOfBooks: 0,
            };

        // Prepare upsert data for all locales (names)
        const upsertNameData = Array.from(allTranslations.entries()).map(
            ([locale, { translation }]) => ({
                where: {
                    empireId_locale: {
                        empireId: existing.id,
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

        // Prepare upsert data for all locales (overviews)
        const upsertOverviewData = Array.from(allOverviews.entries()).map(
            ([locale, overview]) => ({
                where: {
                    empireId_locale: {
                        empireId: existing.id,
                        locale,
                    },
                },
                create: {
                    locale,
                    text: overview,
                },
                update: {
                    text: overview,
                },
            }),
        );

        try {
            await db.empire.update({
                where: { id: existing.id },
                data: {
                    numberOfAuthors: counts.numberOfAuthors,
                    numberOfBooks: counts.numberOfBooks,
                    nameTranslations: {
                        upsert: upsertNameData,
                    },
                    overviewTranslations: {
                        upsert: upsertOverviewData,
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
            console.error(`Failed to update empire ${existing.id}:`, e);
        }
    }

    // Apply deletes
    if (deletedEmpires.length > 0) {
        console.log(`\nDeleting ${deletedEmpires.length} removed empires...`);
        for (const deletedEmpire of deletedEmpires) {
            try {
                await db.empire.delete({
                    where: { id: deletedEmpire.id },
                });
                console.log(`Deleted: ${deletedEmpire.slug}`);
            } catch (e) {
                console.error(`Failed to delete empire ${deletedEmpire.slug}:`, e);
            }
        }
    }

    // Create maps for linking
    const empireNameToSlug = new Map<string, string>();
    for (const empire of await db.empire.findMany({
        select: { id: true, nameTranslations: true },
    })) {
        const englishName = empire.nameTranslations.find(t => t.locale === 'en');
        if (englishName) {
            empireNameToSlug.set(englishName.text, empire.id);
        }
    }

    // Fetch regions from Airtable for linking
    const airtableRegions = await authorsAirtable('Regions').select().all();
    const regionIdToName = new Map(
        airtableRegions.map(r => [r.id, (r.fields['Name'] as string) || '']),
    );

    // Link authors to empires
    await linkAuthorsToEmpires(
        empireIdToName,
        empireNameToSlug,
    );

    // Link regions to empires
    await linkRegionsToEmpires(
        empireIdToRegionIds,
        empireNameToSlug,
        empireIdToName,
        regionIdToName,
    );

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

