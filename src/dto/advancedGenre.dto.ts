import { PathLocale } from '@/lib/locale';
import { getPrimaryLocalizedText, getSecondaryLocalizedText } from '@/lib/localization';
import { AdvancedGenre, AdvancedGenreName } from '@prisma/client';

export type AdvancedGenreDto = ReturnType<typeof makeGenreDto>;

export const makeGenreDto = (
  advancedGenre: AdvancedGenre & { nameTranslations: AdvancedGenreName[] },
  locale: PathLocale,
) => {
  const name = getPrimaryLocalizedText(advancedGenre.nameTranslations, locale);
  return {
    id: advancedGenre.id,
    slug: advancedGenre.slug,
    numberOfBooks: advancedGenre.numberOfBooks,
    name,
    secondaryName: getSecondaryLocalizedText(advancedGenre.nameTranslations, locale),
  };
};
