import { langfuse } from '@/lib/langfuse';
import { generateObject } from '@/lib/llm';
import { AppLocale } from '@/lib/locale';
import { z } from 'zod';

const schema = z.object({
  translatedText: z.string(),
});

export async function translateChunk(chunk: string, languageCode: AppLocale) {
  const prompt = await langfuse.getPrompt('translate-source');
  const compiledPrompt = prompt.compile();

  const response = await generateObject({
    schema: schema,
    system: compiledPrompt,
    prompt: `
Language code: ${languageCode}

Text chunk:
${chunk}
`,
    langfuse: {
      name: 'Chat.OpenAI.TranslateChunk',
      prompt,
    },
  });

  return response.object.translatedText;
}
