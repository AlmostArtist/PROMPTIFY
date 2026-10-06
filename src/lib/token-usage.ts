import type { AiProvider, TokenUsage } from './connections';

export interface UsageTotal extends TokenUsage { requests: number; unreported: number; since: number; updatedAt: number }
export type UsageStore = Partial<Record<AiProvider, UsageTotal>>;
export const USAGE_KEY = 'pf_token_usage';
let pending: Promise<void> = Promise.resolve();

/** All writes run in the background worker, serialized to preserve concurrent requests. */
export function recordTokenUsage(provider: AiProvider, usage?: TokenUsage): Promise<void> {
  const write = pending.then(async () => {
    const stored = await chrome.storage.local.get(USAGE_KEY);
    const totals: UsageStore = stored[USAGE_KEY] || {};
    const current = totals[provider] || { input: 0, output: 0, cachedInput: 0, cacheWrite: 0, requests: 0, unreported: 0, since: Date.now(), updatedAt: 0 };
    const number = (value?: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    totals[provider] = { ...current, requests: current.requests + 1, unreported: current.unreported + (usage ? 0 : 1), updatedAt: Date.now(),
      input: current.input + number(usage?.input), output: current.output + number(usage?.output),
      cachedInput: current.cachedInput + number(usage?.cachedInput), cacheWrite: current.cacheWrite + number(usage?.cacheWrite) };
    await chrome.storage.local.set({ [USAGE_KEY]: totals });
  });
  // Storage failure must never turn a completed model response into a failed request.
  pending = write.catch(() => undefined);
  return pending;
}
