import { PathLocale } from '@/lib/locale';
import { getPrimaryLocalizedText, getSecondaryLocalizedText } from '@/lib/localization';
import { Empire, EmpireName, EmpireOverview } from '@prisma/client';

export const makeEmpireDto = (
  empire: Empire & {
    nameTranslations: EmpireName[];
    overviewTranslations: EmpireOverview[];
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
  const name = getPrimaryLocalizedText(empire.nameTranslations, locale);

  return {
    id: empire.id,
    slug: empire.slug,

    name: name,
    secondaryName: getSecondaryLocalizedText(empire.nameTranslations, locale),

    overview: getPrimaryLocalizedText(empire.overviewTranslations, locale),
    numberOfAuthors: empire.numberOfAuthors,
    numberOfBooks: empire.numberOfBooks,
  };
};

export type EmpireDto = ReturnType<typeof makeEmpireDto>;
