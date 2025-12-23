import { makeEmpireDto, EmpireDto } from '@/dto/empire.dto';
import { db } from '@/lib/db';
import { PathLocale } from '@/lib/locale';
import { env } from '@/env';
import fs from 'fs';
import path from 'path';
import { getAllBooks } from './book';

export const getEmpireById = (
  id: string,
  locale: PathLocale = 'en',
): EmpireDto | null => {
  const empire = empireIdToEmpire?.[id];
  if (!empire) return null;

  return makeEmpireDto(empire, locale);
};

export const getEmpireBySlug = (
  slug: string,
  locale: PathLocale = 'en',
): EmpireDto | null => {
  const empire = empireSlugToEmpire?.[slug];

  if (!empire) return null;

  return makeEmpireDto(empire, locale);
};

export const getAllEmpires = (
  locale: PathLocale = 'en',
  params?: {
    yearRange?: [number, number];
    genreId?: string;
  },
): EmpireDto[] => {
  let empires = Object.values(empireIdToEmpire ?? {});
  if (params && (params.yearRange || params.genreId)) {
    const books = getAllBooks(locale, params);

    const empireIdsToCount: Record<string, number> = {};
    const empireIdsToAuthorIds: Record<string, Set<string>> = {};

    for (const book of books) {
      const empireIds = book.author.empires?.map(empire => empire.id) ?? [];

      for (const empireId of empireIds) {
        if (!empireId) continue;
        empireIdsToCount[empireId] = (empireIdsToCount[empireId] ?? 0) + 1;
        empireIdsToAuthorIds[empireId] = (
          empireIdsToAuthorIds[empireId] ?? new Set()
        ).add(book.author.id);
      }
    }
  }

  return empires.map(empire => makeEmpireDto(empire, locale));
};

export const getEmpireCount = async () => {
  if (empireIdToEmpire) {
    return Object.keys(empireIdToEmpire).length;
  }

  return db.empire.count();
};

const get = () =>
  db.empire.findMany({
    include: {
      nameTranslations: true,
      overviewTranslations: true,
    },
  });

type RawEmpire = Awaited<ReturnType<typeof get>>[number];

let empireIdToEmpire: Record<string, RawEmpire> | null = null;
let empireSlugToEmpire: Record<string, RawEmpire> | null = null;
export const populateEmpires = async () => {
  let empires: Awaited<ReturnType<typeof get>> | undefined;
  const filePath = path.resolve('.cache/empires.json');
  if (env.NODE_ENV === 'development') {
    // load from local
    if (fs.existsSync(filePath)) {
      empires = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }

  if (!empires) {
    empires = await get();
    if (env.NODE_ENV === 'development') {
      // write to cache
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(empires), 'utf-8');
    }
  }

  empireIdToEmpire = {};
  empireSlugToEmpire = {};

  for (const empire of empires) {
    empireIdToEmpire[empire.id] = empire;
    empireSlugToEmpire[empire.slug] = empire;
  }
};
