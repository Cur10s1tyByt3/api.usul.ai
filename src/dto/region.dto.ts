import { PathLocale } from '@/lib/locale';
import { getPrimaryLocalizedText, getSecondaryLocalizedText } from '@/lib/localization';
import { Region, RegionName, RegionOverview } from '@prisma/client';

export const makeRegionDto = (
  region: Region & {
    nameTranslations: RegionName[];
    overviewTranslations: RegionOverview[];
  },
  locale: PathLocale,
): {
  id: string;
  slug: string;
  name: string | undefined;
  secondaryName: string | undefined;
  overview: string | undefined;
  numberOfAuthors: number;
  numberOfBooks: number;
} => {
  const name = getPrimaryLocalizedText(region.nameTranslations, locale);

  return {
    id: region.id,
    slug: region.slug,

    name: name,
    secondaryName: getSecondaryLocalizedText(region.nameTranslations, locale),

    overview: getPrimaryLocalizedText(region.overviewTranslations, locale),
    numberOfAuthors: region.numberOfAuthors,
    numberOfBooks: region.numberOfBooks,
  };
};

export type RegionDto = ReturnType<typeof makeRegionDto>;
