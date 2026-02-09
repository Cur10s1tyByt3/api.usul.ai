import type { DataStreamWriter } from 'ai';
import { formatDataStreamPart } from 'ai';

/**
 * Creates a streamText-like result from cached text that can be merged into a data stream
 * This mimics the behavior of streamText().mergeIntoDataStream()
 */
export const createCachedTextStream = (text: string) => {
  return {
    mergeIntoDataStream: async (writer: DataStreamWriter) => {
      // Stream text chunk by chunk directly to the writer
      const chunkSize = 20;
      const delayMs = 10;

      // Ensure we have text to stream
      if (!text || text.length === 0) {
        console.warn('Empty text provided to createCachedTextStream');
        return;
      }

      console.log(`Starting to stream ${text.length} characters in chunks of ${chunkSize}`);

      // Write text deltas chunk by chunk using the correct format
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, i + chunkSize);
        
        try {
          // Use formatDataStreamPart to format the text delta correctly
          // Format: "0:text:chunk" (the AI SDK formats it internally)
          const formatted = formatDataStreamPart('text', chunk);
          writer.write(formatted);
          console.log(`Wrote chunk ${i / chunkSize + 1}, length: ${chunk.length}`);
        } catch (writeError) {
          console.error('Error writing chunk:', writeError);
          throw writeError;
        }

        // Add a small delay to simulate streaming
        if (i + chunkSize < text.length) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      console.log('Finished streaming all chunks');
    },
    text: Promise.resolve(text),
    textStream: (async function* () {
      const chunkSize = 15;
      for (let i = 0; i < text.length; i += chunkSize) {
        yield text.slice(i, i + chunkSize);
        await new Promise(resolve => setTimeout(resolve, 15));
      }
    })(),
  };
};
