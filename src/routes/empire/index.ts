import { localeQueryValidator } from '@/validators/locale';
import { getAllEmpires, getEmpireBySlug, getEmpireCount } from '@/services/empire';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const empireRoutes = new Hono();

empireRoutes.get(
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
    const empires = getAllEmpires(locale, { yearRange, genreId });

    return c.json(empires);
  },
);

empireRoutes.get('/count', async c => {
  const count = await getEmpireCount();
  return c.json({ total: count });
});

empireRoutes.get(
  '/:slug',
  zValidator('param', z.object({ slug: z.string() })),
  localeQueryValidator,
  c => {
    const { slug } = c.req.valid('param');
    const { locale } = c.req.valid('query');

    const empire = getEmpireBySlug(slug, locale);
    if (!empire) {
      throw new HTTPException(404, { message: 'Empire not found' });
    }

    return c.json(empire);
  },
);

export default empireRoutes;
