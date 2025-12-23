import { localeQueryValidator } from '@/validators/locale';
import { getAllRegions, getRegionBySlug, getRegionCount } from '@/services/region';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const regionRoutes = new Hono();

regionRoutes.get(
  '/',
  localeQueryValidator,
  zValidator(
    'query',
    z.object({
      yearRange: z
        .string()
        .transform(val => val.split(','))
        .pipe(z.tuple([z.coerce.number(), z.coerce.number()]))
        .optional(),
      genreId: z.string().optional(),
    }),
  ),
  c => {
    const { locale, yearRange, genreId } = c.req.valid('query');
    const regions = getAllRegions(locale, { yearRange, genreId });

    return c.json(regions);
  },
);

regionRoutes.get('/count', async c => {
  const count = await getRegionCount();
  return c.json({ total: count });
});

regionRoutes.get(
  '/:slug',
  zValidator('param', z.object({ slug: z.string() })),
  localeQueryValidator,
  c => {
    const { slug } = c.req.valid('param');
    const { locale } = c.req.valid('query');

    const region = getRegionBySlug(slug, locale);
    if (!region) {
      throw new HTTPException(404, { message: 'Region not found' });
    }

    return c.json(region);
  },
);

export default regionRoutes;
