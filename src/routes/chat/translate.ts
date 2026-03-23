import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';
import { localeQueryValidator } from '@/validators/locale';
import { translateChunk } from '@/chat/translate';
import { pathLocaleToAppLocale } from '@/lib/locale';

const translateRoutes = new Hono();

translateRoutes.post(
  '/translate',
  localeQueryValidator,
  zValidator(
    'json',
    z.object({
      text: z.string(),
    }),
  ),
  async c => {
    const body = c.req.valid('json');
    const locale = c.req.valid('query').locale;

    return propagateAttributes({ traceName: 'translate-chunk' }, async () => {
      return startActiveObservation('translate-chunk', async rootSpan => {
        rootSpan.updateTrace({ name: 'translate-chunk', input: body.text });
        const translatedText = await translateChunk(
          body.text,
          pathLocaleToAppLocale(locale),
        );
        rootSpan.updateTrace({ output: translatedText });
        return c.json({ text: translatedText });
      });
    });
  },
);

export default translateRoutes;
