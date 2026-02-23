import { langfuse } from '@/lib/langfuse';
import { generateObject, getLangfuseArgs } from '@/lib/llm';
import type { CoreMessage } from 'ai';

export async function routeQuery(
  history: CoreMessage[],
  query: string,
  sessionId: string,
  userId?: string,
) {
  const prompt = await langfuse.getPrompt('router');
  const compiledPrompt = prompt.compile();

  const response = await generateObject({
    output: 'no-schema',
    system: compiledPrompt,
    messages: [
      ...history,
      {
        role: 'user',
        content: query,
      },
    ],
    langfuse: {
      name: 'Chat.OpenAI.Router',
      sessionId,
      userId,
      prompt,
    },
  });

  const result = response.object as {
    intent: 'A' | 'B' | 'C';
  };

  if (!result) {
    return 'content';
  }

  const parsedIntent = ({ A: 'author', B: 'summary', C: 'content' } as const)[
    result.intent
  ];

  return parsedIntent;
}
