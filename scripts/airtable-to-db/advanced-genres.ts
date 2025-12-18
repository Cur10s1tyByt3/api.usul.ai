import { db } from '@/lib/db';
import { genresAirtable } from '../util/airtable';
import { translateAndTransliterateName } from '../util/openai';
import slugify from 'slugify';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const getAirtableAdvancedGenres = async () => {
  return (await genresAirtable('Advanced Genres').select().all()).map(g => {
    const fields = g.fields;
    const name = fields['Name'] as string;
    const simpleGenreId = (fields['Merging Genre'] as string[]) ?? [];

    return {
      _airtableReference: g.id,
      name,
      simpleGenreId: simpleGenreId[0] ?? null,
    };
  });
};

const getAirtableAdvancedGenreHierarchy = async () => {
  const records = await genresAirtable('Advanced Genres Hierarchy').select().all();

  return records.map(r => {
    const f = r.fields;
    return {
      _airtableReference: r.id,
      childAirtableId: Array.isArray(f['Child Genre']) ? f['Child Genre'][0] : null,
      parentAirtableId: Array.isArray(f['Parent Genre']) ? f['Parent Genre'][0] : null,
    };
  });
};

const simpleGenres = await db.genre.findMany({
  select: {
    id: true,
    extraProperties: true,
  },
});

const airtableAdvancedGenres = await getAirtableAdvancedGenres();
const existingAdvancedGenres = await db.advancedGenre.findMany({
  select: {
    id: true,
    extraProperties: true,
    slug: true,
    nameTranslations: {
      where: {
        locale: 'ar',
      },
    },
  },
});
const existingAdvancedGenresSet = new Set(
  existingAdvancedGenres.map(g => g.extraProperties._airtableReference),
);

const existingSlugs = new Set(existingAdvancedGenres.map(g => g.slug));

// Plan changes
const toCreate = airtableAdvancedGenres.filter(
  ag => !existingAdvancedGenresSet.has(ag._airtableReference),
);

const toUpdate = airtableAdvancedGenres
  .map(ag => {
    const existing = existingAdvancedGenres.find(
      g => g.extraProperties._airtableReference === ag._airtableReference,
    );
    const existingArabicName = existing?.nameTranslations[0]?.text;
    if (existing && existingArabicName !== ag.name) {
      return { airtable: ag, existing };
    }
    return null;
  })
  .filter(
    (
      v,
    ): v is {
      airtable: (typeof airtableAdvancedGenres)[number];
      existing: (typeof existingAdvancedGenres)[number];
    } => Boolean(v),
  );

// Check for deleted genres
const deletedGenres = existingAdvancedGenres.filter(
  existingGenre =>
    existingGenre.extraProperties._airtableReference &&
    !airtableAdvancedGenres.some(
      airtableGenre =>
        airtableGenre._airtableReference ===
        existingGenre.extraProperties._airtableReference,
    ),
);

// Summary
console.log('Planned changes:');
console.log(`- Creates: ${toCreate.length}`);
console.log(`- Updates: ${toUpdate.length}`);
console.log(`- Deletes: ${deletedGenres.length}`);

if (toCreate.length) {
  console.log('\nCreates:');
  for (const ag of toCreate) {
    const simpleGenre = simpleGenres.find(
      g => g.extraProperties._airtableReference === ag.simpleGenreId,
    );
    console.log(
      `- [AR] ${ag.name}${simpleGenre ? ` (simple -> ${simpleGenre.id})` : ''}`,
    );
  }
}

if (toUpdate.length) {
  console.log('\nUpdates (Arabic name change):');
  for (const { airtable, existing } of toUpdate) {
    const prev = existing.nameTranslations[0]?.text ?? '—';
    console.log(`- [AR] ${prev} -> ${airtable.name} (id: ${existing.id})`);
  }
}

if (deletedGenres.length) {
  console.log('\nDeletes:');
  for (const dg of deletedGenres) {
    console.log(`- ${dg.slug} [AR: ${dg.nameTranslations[0]?.text ?? '—'}]`);
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
for (const advancedGenre of toCreate) {
  const englishName = await translateAndTransliterateName(
    'genre',
    advancedGenre.name,
    'en-US',
  );
  if (!englishName) continue;

  let slug = slugify(englishName.translation, { lower: true, trim: true });
  let suffix = 1;
  while (existingSlugs.has(slug)) {
    slug = slugify(`${englishName.translation}-${suffix++}`, { lower: true, trim: true });
  }
  existingSlugs.add(slug);

  const simpleGenre = simpleGenres.find(
    g => g.extraProperties._airtableReference === advancedGenre.simpleGenreId,
  );

  try {
    await db.advancedGenre.create({
      data: {
        id: slug,
        slug,
        transliteration: englishName.transliteration,
        nameTranslations: {
          createMany: {
            data: [
              { locale: 'en', text: englishName.translation },
              { locale: 'ar', text: advancedGenre.name },
            ],
          },
        },
        extraProperties: {
          _airtableReference: advancedGenre._airtableReference,
          ...(simpleGenre ? { simpleGenreId: simpleGenre.id } : {}),
        },
      },
    });
    console.log(`Created: ${slug}`);
  } catch (e) {
    console.log(e);
  }
}

// Apply updates
for (const { airtable, existing } of toUpdate) {
  const englishName = await translateAndTransliterateName(
    'genre',
    airtable.name,
    'en-US',
  );
  if (!englishName) continue;

  let slug = slugify(englishName.translation, { lower: true, trim: true });
  let suffix = 1;
  while (existingSlugs.has(slug)) {
    slug = slugify(`${englishName.translation}-${suffix++}`, { lower: true, trim: true });
  }
  existingSlugs.add(slug);

  const simpleGenre = simpleGenres.find(
    g => g.extraProperties._airtableReference === airtable.simpleGenreId,
  );

  try {
    await db.advancedGenre.update({
      where: { id: existing.id },
      data: {
        transliteration: englishName.transliteration,
        slug,
        nameTranslations: {
          upsert: [
            {
              where: {
                genreId_locale: { genreId: existing.id, locale: 'en' },
              },
              create: { locale: 'en', text: englishName.translation },
              update: { text: englishName.translation },
            },
            {
              where: {
                genreId_locale: { genreId: existing.id, locale: 'ar' },
              },
              create: { locale: 'ar', text: airtable.name },
              update: { text: airtable.name },
            },
          ],
        },
        extraProperties: {
          ...(existing.extraProperties ?? {}),
          ...(simpleGenre ? { simpleGenreId: simpleGenre.id } : {}),
        },
      },
    });
    console.log(`Updated: ${existing.id} -> ${slug}`);
  } catch (e) {
    console.log(e);
  }
}

// Apply deletes
if (deletedGenres.length > 0) {
  console.log(`\nDeleting ${deletedGenres.length} removed genres...`);
  for (const deletedGenre of deletedGenres) {
    try {
      await db.advancedGenre.delete({
        where: { slug: deletedGenre.slug },
      });
      console.log(`Deleted: ${deletedGenre.slug}`);
    } catch (e) {
      console.log(e);
    }
  }
}

// Sync parent relationships
console.log('\n=== Syncing Parent Relationships ===');
const airtableRelations = await getAirtableAdvancedGenreHierarchy();

const childToParentAirMap = new Map();
for (const r of airtableRelations) {
  if (r.childAirtableId) {
    childToParentAirMap.set(r.childAirtableId, r.parentAirtableId ?? null);
  }
}

// Refresh genres after creates/updates/deletes
const allNeonGenres = await db.advancedGenre.findMany({
  select: {
    id: true,
    extraProperties: true,
  },
});

const airtableToNeonId = new Map();
for (const g of allNeonGenres) {
  const airtableRef = g.extraProperties?._airtableReference;
  if (airtableRef) airtableToNeonId.set(airtableRef, g.id);
}

let parentUpdated = 0;
for (const g of allNeonGenres) {
  const childAirId = g.extraProperties?._airtableReference;
  if (!childAirId) continue;

  const parentAirId = childToParentAirMap.get(childAirId);
  if (parentAirId === undefined) {
    continue;
  }

  const parentNeonId = parentAirId ? airtableToNeonId.get(parentAirId) : null;

  if (parentAirId && !parentNeonId) {
    console.warn(
      `Skipping set parent for ${g.id}: parent Airtable ${parentAirId} not found in Neon mappings`,
    );
    continue;
  }

  const current = await db.advancedGenre.findUnique({
    where: { id: g.id },
    select: { parentGenre: true },
  });

  const newParentValue = parentNeonId ?? null;
  const curParentValue = current?.parentGenre ?? null;

  if (curParentValue === newParentValue) {
    continue;
  }

  try {
    await db.advancedGenre.update({
      where: { id: g.id },
      data: { parentGenre: newParentValue },
    });
    parentUpdated++;
    console.log(`Updated parentGenre for ${g.id} -> ${newParentValue ?? 'null'}`);
  } catch (err) {
    console.error(`Failed to update parentGenre for ${g.id}:`, err);
  }
}

console.log(`\nDone. Updated ${parentUpdated} parent relationships.`);
