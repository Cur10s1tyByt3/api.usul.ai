import type { LanguageModelV1 } from 'ai';
import { wrapLanguageModel, type Experimental_LanguageModelV1Middleware } from 'ai';

/**
 * Azure chat completions return the catalog model id on non-streaming responses
 * (e.g. gpt-5.1-chat-2025-11-13) while streaming often keeps the deployment name.
 * Langfuse cost uses the reported model string, so we normalize both paths to the
 * deployment id used in URLs (matches AZURE_BASE_DEPLOYMENT / mini deployment).
 */
export function withAzureDeploymentModelForObservability(
  model: LanguageModelV1,
  deploymentId: string,
): LanguageModelV1 {
  const middleware: Experimental_LanguageModelV1Middleware = {
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      return {
        ...result,
        response: {
          ...result.response,
          modelId: deploymentId,
        },
      };
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      return {
        ...rest,
        stream: stream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              if (chunk.type === 'response-metadata') {
                controller.enqueue({
                  ...chunk,
                  modelId: deploymentId,
                });
                return;
              }
              controller.enqueue(chunk);
            },
          }),
        ),
      };
    },
  };

  return wrapLanguageModel({
    model,
    modelId: deploymentId,
    middleware,
  });
}
