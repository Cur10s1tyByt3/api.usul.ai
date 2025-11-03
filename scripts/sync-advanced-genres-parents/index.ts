import { db } from '@/lib/db';
import { genresAirtable } from '../util/airtable';

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

async function syncParentGenreColumn() {
  const airtableRelations = await getAirtableAdvancedGenreHierarchy();

  const childToParentAirMap = new Map();
  for (const r of airtableRelations) {
    if (r.childAirtableId) {
      childToParentAirMap.set(r.childAirtableId, r.parentAirtableId ?? null);
    }
  }

  const neonGenres = await db.advancedGenre.findMany({
    select: {
      id: true,
      extraProperties: true,
    },
  });

  const airtableToNeonId = new Map();
  for (const g of neonGenres) {
    const airtableRef = g.extraProperties?._airtableReference;
    if (airtableRef) airtableToNeonId.set(airtableRef, g.id);
  }

  let updated = 0;
  for (const g of neonGenres) {
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
      updated++;
      console.log(`Updated parentGenre for ${g.id} -> ${newParentValue}`);
    } catch (err) {
      console.error(`Failed to update parentGenre for ${g.id}:`, err);
    }
  }

  console.log(`Done. Updated ${updated} records.`);
}

syncParentGenreColumn().catch(err => {
  console.error('Error syncing parentGenre column:', err);
  process.exit(1);
});
