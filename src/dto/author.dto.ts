import { PathLocale } from '@/lib/locale';
import { getPrimaryLocalizedText, getSecondaryLocalizedText } from '@/lib/localization';
import { Author, AuthorBio, AuthorOtherNames, AuthorPrimaryName } from '@prisma/client';

export type AuthorDto = ReturnType<typeof makeAuthorDto>;

export const makeAuthorDto = (
  author: Author & {
    primaryNameTranslations: AuthorPrimaryName[];
    otherNameTranslations: AuthorOtherNames[];
    bioTranslations: AuthorBio[];
    regions: { id: string; slug: string; nameTranslations: { locale: string; text: string }[] }[];
    empires: { id: string; slug: string; nameTranslations: { locale: string; text: string }[] }[];
  },
  locale: PathLocale,
) => {
  const primaryName = getPrimaryLocalizedText(author.primaryNameTranslations, locale);
  const otherNames = getPrimaryLocalizedText(author.otherNameTranslations, locale) ?? [];

  return {
    id: author.id,
    slug: author.slug,
    year: author.year,
    numberOfBooks: author.numberOfBooks,
    primaryName:
      locale === 'en' && author.transliteration ? author.transliteration : primaryName,
    otherNames:
      locale === 'en' && author.otherNameTransliterations?.length > 0
        ? author.otherNameTransliterations
        : otherNames,

    secondaryName: getSecondaryLocalizedText(author.primaryNameTranslations, locale),
    secondaryOtherNames:
      getSecondaryLocalizedText(author.otherNameTranslations, locale) ?? [],

    bio: getPrimaryLocalizedText(author.bioTranslations, locale),

    regions: author.regions.map(region => ({ id: region.id, slug: region.slug, name: getPrimaryLocalizedText(region.nameTranslations, locale), secondaryName: getSecondaryLocalizedText(region.nameTranslations, locale) })),

    empires: author.empires.map(empire => ({ id: empire.id, slug: empire.slug, name: getPrimaryLocalizedText(empire.nameTranslations, locale), secondaryName: getSecondaryLocalizedText(empire.nameTranslations, locale) })),
  };
};
