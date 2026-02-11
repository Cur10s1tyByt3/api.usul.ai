import { db } from '@/lib/db';
import { genresAirtable } from '../util/airtable';
import { chunk } from '@/lib/utils';

/**
 * Maps AirTable advanced genre IDs to Neon DB advanced genre IDs
 */
const getAirtableToNeonGenreMap = async () => {
  const advancedGenres = await db.advancedGenre.findMany({
    select: {
      id: true,
      extraProperties: true,
    },
  });

  const map = new Map<string, string>();
  for (const genre of advancedGenres) {
    const airtableRef = genre.extraProperties?._airtableReference;
    if (airtableRef && typeof airtableRef === 'string') {
      map.set(airtableRef, genre.id);
    }
  }

  return map;
};

/**
 * Gets all books from AirTable "Genre population" table with their advanced genres
 */
const getAirtableBookGenres = async () => {
  const records = await genresAirtable('Genre population')
    .select({
      fields: ['Book id', 'Advanced Genres'],
    })
    .all();

  const bookGenresMap = new Map<string, string[]>();

  for (const record of records) {
    const bookId = record.fields['Book id'] as string | undefined;
    const advancedGenres = (record.fields['Advanced Genres'] as string[]) || [];

    if (bookId) {
      bookGenresMap.set(bookId, advancedGenres);
    }
  }

  return bookGenresMap;
};

const main = async () => {
  console.log('Fetching AirTable to Neon genre mapping...');
  const airtableToNeonMap = await getAirtableToNeonGenreMap();
  console.log(`Mapped ${airtableToNeonMap.size} advanced genres`);

  console.log('Fetching book genres from AirTable...');
  const airtableBookGenres = await getAirtableBookGenres();
  console.log(`Found ${airtableBookGenres.size} books in AirTable`);

  console.log('Fetching books from Neon DB...');
  const books = await db.book.findMany({
    select: {
      id: true,
      slug: true,
      advancedGenres: {
        select: {
          id: true,
          extraProperties: true,
        },
      },
      primaryNameTranslations: {
        where: { locale: { in: ['ar', 'en'] } },
      },
    },
  });
  console.log(`Found ${books.length} books in Neon DB`);

  // Find books that need updating
  const booksToUpdate: Array<{
    bookId: string;
    currentGenreIds: Set<string>;
    targetGenreIds: string[];
  }> = [];

  for (const book of books) {
    const airtableGenreIds = airtableBookGenres.get(book.id) || [];

    // Map AirTable genre IDs to Neon DB genre IDs
    const targetNeonGenreIds = airtableGenreIds
      .map(airtableId => airtableToNeonMap.get(airtableId))
      .filter((id): id is string => Boolean(id));

    const currentGenreIds = new Set(book.advancedGenres.map(g => g.id));
    const targetGenreIdsSet = new Set(targetNeonGenreIds);

    // Check if sets are different
    const isDifferent =
      currentGenreIds.size !== targetGenreIdsSet.size ||
      ![...currentGenreIds].every(id => targetGenreIdsSet.has(id));

    if (isDifferent) {
      booksToUpdate.push({
        bookId: book.id,
        currentGenreIds,
        targetGenreIds: targetNeonGenreIds,
      });
    }
  }

  console.log(`\nFound ${booksToUpdate.length} books that need updating`);

  if (booksToUpdate.length === 0) {
    console.log('All books are in sync!');
    return;
  }

  // Show some examples
  const examples = booksToUpdate.slice(0, 5);
  console.log('\nExample books to update:');
  for (const { bookId, currentGenreIds, targetGenreIds } of examples) {
    const book = books.find(b => b.id === bookId);
    const bookName = book?.primaryNameTranslations.find(t => t.locale === 'ar')?.text ||
      book?.primaryNameTranslations.find(t => t.locale === 'en')?.text ||
      bookId;
    console.log(`  - ${bookName} (${bookId})`);
    console.log(`    Current: [${Array.from(currentGenreIds).join(', ')}]`);
    console.log(`    Target:  [${targetGenreIds.join(', ')}]`);
  }

  // Update books in batches
  const batches = chunk(booksToUpdate, 10);
  let updated = 0;
  let failed = 0;

  console.log(`\nUpdating ${booksToUpdate.length} books in ${batches.length} batches...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1} / ${batches.length}`);

    for (const { bookId, targetGenreIds } of batch) {
      try {
        await db.book.update({
          where: { id: bookId },
          data: {
            advancedGenres: {
              connect: targetGenreIds.map(id => ({ id })),
            },
          },
        });
        updated++;
      } catch (error) {
        console.error(`Failed to update book ${bookId}:`, error);
        failed++;
      }
    }
  }

  console.log(`\nDone!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed: ${failed}`);
};

main().catch(console.error);
