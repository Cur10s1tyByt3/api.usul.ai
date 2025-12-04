import { localeQueryValidator } from '@/validators/locale';
import {
  getAllAdvancedGenres,
  getAdvancedGenreById,
  getAdvancedGenreBySlug,
  getAdvancedGenreCount,
  getAdvancedGenresHierarchy,
} from '@/services/advanced-genre';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const advancedGenreRoutes = new Hono();

const homepageAdvancedGenres = [
  {
    id: 'prophetic-biography',
    color: 'yellow',
    pattern: 1,
  },
  {
    id: 'spiritual-reflections-and-etiquettes-with-remembrances-and-purification',
    color: 'red',
    pattern: 2,
  },
  {
    id: 'hadith-and-its-sciences',
    color: 'green',
    pattern: 3,
  },
  {
    id: 'doctrines-and-sects',
    color: 'gray',
    pattern: 5,
  },
  {
    id: 'jurisprudence-and-its-principles',
    color: 'indigo',
    pattern: 4,
  },
  {
    id: 'quranic-sciences-and-exegesis',
    color: 'green',
    pattern: 7,
  },
  {
    id: 'philosophy-and-logic',
    color: 'gray',
    pattern: 9,
  },
  {
    id: 'islamic-banking',
    color: 'yellow',
    pattern: 1,
  },
  {
    id: 'the-other-sciences',
    color: 'red',
    pattern: 2,
  },
  {
    id: 'human-sciences',
    color: 'green',
    pattern: 3,
  },
  {
    id: 'arabic-language',
    color: 'indigo',
    pattern: 5,
  },
  {
    id: 'compilations-essays-and-various-studies',
    color: 'yellow',
    pattern: 4,
  },
  {
    id: 'orientalism-and-orientalists',
    color: 'gray',
    pattern: 7,
  },
  {
    id: 'biographies-and-classes-and-virtues',
    color: 'indigo',
    pattern: 9,
  },
];

advancedGenreRoutes.get('/homepage', localeQueryValidator, async c => {
  const { locale } = c.req.valid('query');

  const genres = await Promise.all(
    homepageAdvancedGenres.map(async genre => ({
      ...genre,
      ...((await getAdvancedGenreById(genre.id, locale)) ?? {}),
    }))
  );

  return c.json(genres);
});


advancedGenreRoutes.get('/hierarchy', localeQueryValidator, async c => {
  const { locale } = c.req.valid('query');

  const hierarchy = await getAdvancedGenresHierarchy(locale);

  return c.json(hierarchy);
});

advancedGenreRoutes.get(
  '/',
  localeQueryValidator,
  zValidator(
    'query',
    z.object({
      bookIds: z
        .string()
        .transform(val => val.split(','))
        .optional(),
      yearRange: z
        .string()
        .transform(val => val.split(','))
        .pipe(z.tuple([z.coerce.number(), z.coerce.number()]))
        .optional(),
      authorId: z.string().optional(),
      regionId: z.string().optional(),
    }),
  ),
  async c => {
    const { locale, bookIds, yearRange, authorId, regionId } = c.req.valid('query');
    const genres = await getAllAdvancedGenres(locale, { bookIds, yearRange, authorId, regionId });

    return c.json(genres);
  },
);

advancedGenreRoutes.get('/count', async c => {
  const count = await getAdvancedGenreCount();
  return c.json({ total: count });
});

advancedGenreRoutes.get(
  '/:slug',
  zValidator('param', z.object({ slug: z.string() })),
  localeQueryValidator,
  async c => {
    const { slug } = c.req.valid('param');
    const { locale } = c.req.valid('query');

    const genre = await getAdvancedGenreBySlug(slug, locale);
    if (!genre) {
      throw new HTTPException(404, { message: 'Genre not found' });
    }

    return c.json(genre);
  },
);

export default advancedGenreRoutes;
