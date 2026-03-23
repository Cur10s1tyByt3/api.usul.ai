/**
 * Langfuse buckets traces with no `userId` as "Unknown". Anonymous traffic should
 * send this value so User consumption shows a clear label instead.
 */
export const LANGFUSE_UNKNOWN_USER_ID = 'Unsigned';

export function resolveLangfuseUserId(
  session: { user: { id: string } } | undefined,
): string {
  return session?.user?.id ?? LANGFUSE_UNKNOWN_USER_ID;
}
