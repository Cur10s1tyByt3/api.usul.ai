import { makeRegionDto, RegionDto } from '@/dto/region.dto';
import { db } from '@/lib/db';
import { PathLocale } from '@/lib/locale';
import { getPrimaryLocalizedText, getSecondaryLocalizedText } from '@/lib/localization';
import { env } from '@/env';
import fs from 'fs';
import path from 'path';
import { getAllBooks } from './book';

export const getRegionById = (
  id: string,
  locale: PathLocale = 'en',
): RegionDto | null => {
  const region = regionIdToRegion?.[id];
  if (!region) return null;

  return makeRegionDto(region, locale);
};

export const getRegionBySlug = (
  slug: string,
  locale: PathLocale = 'en',
): RegionDto | null => {
  const region = regionSlugToRegion?.[slug];

  if (!region) return null;

  return makeRegionDto(region, locale);
};

export const getAllRegions = (
  locale: PathLocale = 'en',
  params?: {
    yearRange?: [number, number];
    genreId?: string;
  },
): RegionDto[] => {
  let regions = Object.values(regionIdToRegion ?? {});
  if (params && (params.yearRange || params.genreId)) {
    const books = getAllBooks(locale, params);

    const regionIdsToCount: Record<string, number> = {};
    const regionIdsToAuthorIds: Record<string, Set<string>> = {};

    for (const book of books) {
      const regionIds = book.author.regions?.map(region => region.id) ?? [];

      for (const regionId of regionIds) {
        if (!regionId) continue;
        regionIdsToCount[regionId] = (regionIdsToCount[regionId] ?? 0) + 1;
        regionIdsToAuthorIds[regionId] = (
          regionIdsToAuthorIds[regionId] ?? new Set()
        ).add(book.author.id);
      }
    }

    regions = regions
      .filter(region => regionIdsToCount[region.id] !== undefined)
      .map(region => ({
        ...region,
        numberOfBooks: regionIdsToCount[region.id] ?? 0,
        numberOfAuthors: regionIdsToAuthorIds[region.id]?.size ?? 0,
      }));
  }

  return regions.map(region => makeRegionDto(region, locale));
};

export const getRegionsHierarchy = (locale: PathLocale = 'en') => {
  const regions = Object.values(regionIdToRegion ?? {});

  type TreeNode = {
    id: string;
    slug: string;
    primaryName: string;
    secondaryName?: string;
    numberOfAuthors: number;
    numberOfBooks: number;
    children?: TreeNode[];
  };

  const idToNode = new Map<string, TreeNode>();

  for (const r of regions) {
    const primaryName = getPrimaryLocalizedText(r.nameTranslations, locale) as
      | string
      | undefined;
    const secondaryName = getSecondaryLocalizedText(
      r.nameTranslations,
      locale,
    ) as string | undefined;

    idToNode.set(r.id, {
      id: r.id,
      slug: r.slug,
      primaryName: primaryName || r.transliteration || r.slug,
      secondaryName,
      numberOfAuthors: r.numberOfAuthors,
      numberOfBooks: r.numberOfBooks,
    });
  }

  const roots: TreeNode[] = [];

  for (const r of regions) {
    const node = idToNode.get(r.id)!;
    const parentId = r.parentId ?? null;

    if (!parentId) {
      roots.push(node);
      continue;
    }

    const parent = idToNode.get(parentId);
    if (!parent) {
      roots.push(node);
      continue;
    }

    if (!parent.children) parent.children = [];
    parent.children.push(node);
  }

  const sortHierarchy = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .map(node => ({
        ...node,
        children: node.children ? sortHierarchy(node.children) : undefined,
      }))
      .sort((a, b) => a.primaryName.toLowerCase().localeCompare(b.primaryName.toLowerCase()));
  };

  return sortHierarchy(roots);
};

export const getRegionCount = async () => {
  if (regionIdToRegion) {
    return Object.keys(regionIdToRegion).length;
  }

  return db.region.count();
};

const get = () =>
  db.region.findMany({
    include: {
      nameTranslations: true,
      overviewTranslations: true,
    },
  });

type RawRegion = Awaited<ReturnType<typeof get>>[number];

let regionIdToRegion: Record<string, RawRegion> | null = null;
let regionSlugToRegion: Record<string, RawRegion> | null = null;
export const populateRegions = async () => {
  let regions: Awaited<ReturnType<typeof get>> | undefined;
  const filePath = path.resolve('.cache/regions.json');
  if (env.NODE_ENV === 'development') {
    // load from local
    if (fs.existsSync(filePath)) {
      regions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }

  if (!regions) {
    regions = await get();
    if (env.NODE_ENV === 'development') {
      // write to cache
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(regions), 'utf-8');
    }
  }

  regionIdToRegion = {};
  regionSlugToRegion = {};

  for (const region of regions) {
    regionIdToRegion[region.id] = region;
    regionSlugToRegion[region.slug] = region;
  }
};
