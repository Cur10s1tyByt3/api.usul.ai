import { env } from '@/env';
import { Langfuse } from 'langfuse';

export const langfuseConfig = {
  secretKey: env.LANGFUSE_SECRET_KEY,
  publicKey: env.LANGFUSE_PUBLIC_KEY,
  baseUrl: env.LANGFUSE_BASE_URL,
};

export const langfuse = new Langfuse(langfuseConfig);
