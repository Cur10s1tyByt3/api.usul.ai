import { db } from '@/lib/db';
import { authorsAirtable } from '../util/airtable';
import { chunk } from '@/lib/utils';
import { parse } from 'path';

const main = async () => {
  try {
    const table = authorsAirtable('Authors');

    const count = await db.author.count();
    console.log('🧠 Total authors in DB:', count);

    const authors = await db.author.findMany({
      select: {
        id: true,
        year: true,
        numberOfBooks: true,
        primaryNameTranslations: {
          where: { locale: { in: ['ar', 'en'] } },
          select: { locale: true, text: true },
        },
      },
    });

    console.log(`ℹ️ Found ${authors.length} authors to upload.`);

    // Helper to pick Arabic or English text
    const getText = (translations: any[], locale: string) =>
      translations.find(t => t.locale === locale)?.text || '';

    const batches = chunk(authors, 10);

    let i = 0;
    for (const batch of batches) {
      console.log(`📦 Processing batch ${++i} / ${batches.length}`);

      const records = batch.map(a => ({


        fields: {
          'Author ID': a.id,
          'Arabic Name': getText(a.primaryNameTranslations, 'ar'),
          'English Name': getText(a.primaryNameTranslations, 'en'),
          'Death Year': a.year || 0, 
          'Number of Books': a.numberOfBooks || 0,
        },
      }));

      await table.create(records).catch(e => {
        console.error('❌ Airtable error:', e);
      });
    }

    console.log('✅ Finished uploading all authors!');
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
};

main();
