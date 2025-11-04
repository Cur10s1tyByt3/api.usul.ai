import { localeQueryValidator } from '@/validators/locale';
import {
  getAllAdvancedGenres,
  getAdvancedGenreById,
  getAdvancedGenreBySlug,
  getAdvancedGenreCount,
} from '@/services/advanced-genre';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const advancedGenreRoutes = new Hono();

const hierarchyAdvancedGenres = [
  {
    id: 'quranic-sciences',
    color: 'gray',
    pattern: 1,
  },
  {
    id: 'hadith',
    color: 'red',
    pattern: 2,
  },
];

advancedGenreRoutes.get('/hierarchy', localeQueryValidator, c => {
  const { locale } = c.req.valid('query');

  const genres = hierarchyAdvancedGenres.map(genre => ({
    ...genre,
    ...(getAdvancedGenreById(genre.id, locale) ?? {}),
  }));

  return c.json(genres);
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
  c => {
    const { locale, bookIds, yearRange, authorId, regionId } = c.req.valid('query');
    const genres = getAllAdvancedGenres(locale, { bookIds, yearRange, authorId, regionId });

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
  c => {
    const { slug } = c.req.valid('param');
    const { locale } = c.req.valid('query');

    const genre = getAdvancedGenreBySlug(slug, locale);
    if (!genre) {
      throw new HTTPException(404, { message: 'Genre not found' });
    }

    return c.json(genre);
  },
);

export default advancedGenreRoutes;
