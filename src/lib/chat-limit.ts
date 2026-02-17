import type { Context } from 'hono';
import { createRedis } from './redis';
import { env } from '../env';

const REDIS_KEY_PREFIX = 'chat:anon:';
const MESSAGE_LIMIT = 3;
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export const CHAT_LIMIT_REACHED_CODE = 'CHAT_LIMIT_REACHED';

/**
 * Get client IP from request, respecting common proxy headers.
 */
function getClientIp(c: Context): string {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }
    const realIp = c.req.header('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
}

/**
 * Check anonymous chat limit by IP. If under limit, increments count and returns allowed.
 * If already at limit, returns not allowed (does not increment). Caller should return 403 when not allowed.
 */
export async function checkAndIncrementChatLimit(c: Context): Promise<{
    allowed: boolean;
    code?: string;
    message?: string;
}> {
    const ip = getClientIp(c);

    // When IP can't be determined (e.g. dev, or proxy not setting headers), skip the limit
    if (ip === 'unknown') {
        return { allowed: true };
    }

    const key = `${REDIS_KEY_PREFIX}${ip}`;

    const redis = createRedis();
    try {
        const current = await redis.get(key);
        const count = current ? parseInt(current, 10) : 0;
        if (count >= MESSAGE_LIMIT) {
            return {
                allowed: false,
                code: CHAT_LIMIT_REACHED_CODE,
                message: 'Sign up to continue using Usul AI chat features',
            };
        }
        const newCount = await redis.incr(key);
        if (newCount === 1) {
            await redis.expire(key, TTL_SECONDS);
        }
        return { allowed: true };
    } finally {
        redis.quit();
    }
}
