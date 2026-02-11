/**
 * Test script: calls two Azure OpenAI endpoint/deployment configs with the same prompt,
 * then writes response, total token count, and latency to a CSV file.
 * Only supports Cognitive Services (cognitiveservices.azure.com); endpoint URLs are used as-is.
 *
 * Token counts: For reasoning models (e.g. gpt-5.1), completion_tokens and total_tokens
 * already include reasoning (thinking) tokens—they are billed as output tokens.
 *
 * Config 1: AZURE_ENDPOINT_URL + AZURE_BASE_DEPLOYMENT (required)
 * Config 2: AZURE_ENDPOINT_URL_2 + AZURE_BASE_DEPLOYMENT_2 (required)
 *
 * Run: pnpm tsx scripts/testing/test_llm_models.ts
 * Or:  pnpm run:script scripts/testing/test_llm_models.ts
 */

import 'dotenv/config';
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PROMPT =
    'What hadiths in Islam mention wudu and a river? Tell me in detail and in a concise way as if Im a scholar.';

function escapeCsvCell(value: string): string {
    const hasNewlineOrQuote = /[\n"]/.test(value);
    if (!hasNewlineOrQuote) return value;
    return `"${value.replace(/"/g, '""')}"`;
}

async function runOne(
    label: string,
    baseUrl: string,
    apiKey: string,
    deployment: string,
): Promise<{
    response: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number | undefined;
    latencyMs: number;
}> {
    const azure = createAzure({
        baseURL: baseUrl,
        apiKey,
        apiVersion: '2025-01-01-preview',
    });
    const model = azure.languageModel(deployment);

    const start = performance.now();
    const result = await generateText({
        model,
        prompt: TEST_PROMPT,
        temperature: 1, // required for gpt-5.1-chat (only 1 is supported)
    });
    const latencyMs = Math.round(performance.now() - start);

    const response = result.text ?? '';
    const u = result.usage as
        | {
            totalTokens?: number;
            promptTokens?: number;
            completionTokens?: number;
            completion_tokens_details?: { reasoning_tokens?: number };
            output_tokens_details?: { reasoning_tokens?: number };
        }
        | undefined;
    const totalTokens =
        u?.totalTokens ??
        (typeof u?.promptTokens === 'number' && typeof u?.completionTokens === 'number'
            ? u.promptTokens + u.completionTokens
            : 0);

    const promptTokens =
        typeof u?.promptTokens === 'number'
            ? u.promptTokens
            : typeof u?.totalTokens === 'number'
                ? Math.round(u.totalTokens / 2)
                : 0;
    const completionTokens =
        typeof u?.completionTokens === 'number'
            ? u.completionTokens
            : typeof u?.totalTokens === 'number'
                ? u.totalTokens - promptTokens
                : 0;

    const reasoningTokens =
        u?.completion_tokens_details?.reasoning_tokens ??
        u?.output_tokens_details?.reasoning_tokens;

    return {
        response,
        totalTokens,
        promptTokens,
        completionTokens,
        reasoningTokens,
        latencyMs,
    };
}

async function main() {
    const endpoint1 = process.env.AZURE_ENDPOINT_URL;
    const apiKey1 = process.env.AZURE_SECRET_KEY;
    const deployment1 = process.env.AZURE_BASE_DEPLOYMENT;

    if (!endpoint1 || !apiKey1 || !deployment1) {
        throw new Error('AZURE_ENDPOINT_URL, AZURE_SECRET_KEY and AZURE_BASE_DEPLOYMENT are not set');
    }

    const endpoint2 = process.env.AZURE_ENDPOINT_URL_2;
    const apiKey2 = process.env.AZURE_SECRET_KEY_2;
    const deployment2 = process.env.AZURE_BASE_DEPLOYMENT_2;

    if (!endpoint2 || !apiKey2 || !deployment2) {
        throw new Error('AZURE_ENDPOINT_URL_2, AZURE_SECRET_KEY_2 and AZURE_BASE_DEPLOYMENT_2 are not set');
    }

    const configs: {
        label: string;
        baseUrl: string;
        apiKey: string;
        deployment: string;
    }[] = [
            {
                label: 'config 1',
                baseUrl: endpoint1,
                apiKey: apiKey1,
                deployment: deployment1,
            },
            {
                label: 'config 2',
                baseUrl: endpoint2,
                apiKey: apiKey2,
                deployment: deployment2,
            },
        ];

    const rows: string[][] = [
        [
            'label',
            'endpoint',
            'deployment',
            'response',
            'total_tokens',
            'prompt_tokens',
            'completion_tokens',
            'reasoning_tokens',
            'latency_ms',
        ],
    ];

    for (const cfg of configs) {
        console.log(`Calling ${cfg.label} (${cfg.deployment})...`);
        try {
            const {
                response,
                totalTokens,
                promptTokens,
                completionTokens,
                reasoningTokens,
                latencyMs,
            } = await runOne(
                cfg.label,
                cfg.baseUrl,
                cfg.apiKey,
                cfg.deployment,
            );
            rows.push([
                cfg.label,
                cfg.baseUrl,
                cfg.deployment,
                escapeCsvCell(response),
                String(totalTokens),
                String(promptTokens),
                String(completionTokens),
                reasoningTokens !== undefined ? String(reasoningTokens) : '',
                String(latencyMs),
            ]);
            console.log(
                `  -> ${totalTokens} tokens${reasoningTokens !== undefined ? ` (${reasoningTokens} reasoning)` : ''}, ${latencyMs} ms`,
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            rows.push([
                cfg.label,
                cfg.baseUrl,
                cfg.deployment,
                escapeCsvCell(`ERROR: ${msg}`),
                '',
                '',
                '',
                '',
            ]);
            console.error(`  -> Error: ${msg}`);
        }
    }

    const csv = rows.map(r => r.join(',')).join('\n');
    const outPath = path.join(
        process.cwd(),
        'scripts',
        'testing',
        'llm_test',
        `llm_test_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
    );
    fs.writeFileSync(outPath, csv, 'utf-8');
    console.log(`\nWrote: ${outPath}`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
