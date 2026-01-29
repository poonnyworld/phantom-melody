/**
 * Simple per-guild lock to prevent concurrent bot actions (e.g. multiple users
 * adding songs at the same time). Ensures one action per guild at a time.
 */
const activeGuilds = new Map<string, { action: string; timeoutId: NodeJS.Timeout }>();

const LOCK_TIMEOUT_MS = 90_000; // 90 seconds max hold

export function tryAcquire(guildId: string, action: string): boolean {
  if (activeGuilds.has(guildId)) {
    return false;
  }
  const timeoutId = setTimeout(() => {
    activeGuilds.delete(guildId);
    console.log(`[ConcurrencyGuard] Released guild ${guildId} (${action}) after timeout`);
  }, LOCK_TIMEOUT_MS);
  activeGuilds.set(guildId, { action, timeoutId });
  return true;
}

export function release(guildId: string): void {
  const entry = activeGuilds.get(guildId);
  if (entry) {
    clearTimeout(entry.timeoutId);
    activeGuilds.delete(guildId);
  }
}

export function isBusy(guildId: string): boolean {
  return activeGuilds.has(guildId);
}

export function getActiveAction(guildId: string): string | null {
  return activeGuilds.get(guildId)?.action ?? null;
}
