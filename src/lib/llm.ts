import { env } from '@/env';
import { createAzure } from '@ai-sdk/azure';
import {
  streamText as baseStreamText,
  generateText as baseGenerateText,
  smoothStream,
  ToolSet,
} from 'ai';
import type { ChatPromptClient, TextPromptClient } from 'langfuse';

const azure = createAzure({
  baseURL: env.AZURE_ENDPOINT_URL,
  apiKey: env.AZURE_SECRET_KEY,
  apiVersion: '2025-01-01-preview',
});

export const model = azure.languageModel(env.AZURE_BASE_DEPLOYMENT);
export const miniModel = azure.languageModel('usul-gpt-5-mini');

export type LangfuseTracingOptions = {
  name?: string;
  sessionId?: string;
  traceId?: string;
  userId?: string;
  prompt?: ChatPromptClient | TextPromptClient;
};

export const getLangfuseArgs = (args?: LangfuseTracingOptions) => ({
  experimental_telemetry: {
    isEnabled: true,
    ...(args?.name && { functionId: args.name }),
    ...(args?.sessionId && { sessionId: args.sessionId }),
    ...(args?.userId && { userId: args.userId }),
    metadata: {
      ...(args?.sessionId && { sessionId: args.sessionId }),
      ...(args?.traceId && { langfuseTraceId: args.traceId }),
      ...(args?.prompt && { langfusePrompt: args.prompt.toJSON() }),
    },
  },
});

export const streamText = <
  TOOLS extends ToolSet,
  OUTPUT = never,
  PARTIAL_OUTPUT = never,
>({
  langfuse,
  model: modelName = 'large',
  ...params
}: Omit<
  Parameters<typeof baseStreamText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0],
  'model' | 'experimental_transform' | 'experimental_telemetry'
> & {
  langfuse?: LangfuseTracingOptions;
  model?: 'mini' | 'large';
}) => {
  return baseStreamText({
    model: modelName === 'mini' ? miniModel : model,
    ...params,
    // usul-gpt-5.1-chat only supports temperature 1.
    // Minimize reasoning tokens. Azure only supports 'low' | 'medium' | 'high' (no 'none').
    ...(env.AZURE_BASE_DEPLOYMENT === 'usul-gpt-5.1-chat' && {
      temperature: 1,
      providerOptions: {
        ...params.providerOptions,
        azure: {
          reasoningEffort: 'low' as const,
          ...(params.providerOptions as { azure?: { reasoningEffort?: string } } | undefined)?.azure,
        },
      },
    }),
    experimental_transform: smoothStream(),
    ...getLangfuseArgs(langfuse),
  });
};

export const generateText = <
  TOOLS extends ToolSet,
  OUTPUT = never,
  PARTIAL_OUTPUT = never,
>({
  langfuse,
  model: modelName = 'large',
  ...params
}: Omit<
  Parameters<typeof baseGenerateText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0],
  'model' | 'experimental_telemetry'
> & {
  langfuse?: LangfuseTracingOptions;
  model?: 'mini' | 'large';
}) => {
  return baseGenerateText({
    model: modelName === 'mini' ? miniModel : model,
    ...params,
    // usul-gpt-5.1-chat only supports temperature 1.
    // Minimize reasoning tokens. Azure only supports 'low' | 'medium' | 'high' (no 'none').
    ...(env.AZURE_BASE_DEPLOYMENT === 'usul-gpt-5.1-chat' && {
      temperature: 1,
      providerOptions: {
        ...params.providerOptions,
        azure: {
          reasoningEffort: 'low' as const,
          ...(params.providerOptions as { azure?: { reasoningEffort?: string } } | undefined)?.azure,
        },
      },
    }),
    ...getLangfuseArgs(langfuse),
  });
};
