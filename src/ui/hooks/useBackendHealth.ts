import { useCallback, useEffect, useRef, useState } from 'react';
import { requestHealth, type HealthResult } from '@/lib/messages';

export type ConnState = 'checking' | 'online' | 'offline';

export interface BackendHealth {
  state: ConnState;
  info: HealthResult | null;
  refresh: () => void;
}

/** Polls OpenRouter (via the SW) so the UI can show a live connection status. */
export function useBackendHealth(pollMs = 15_000, enabled = true): BackendHealth {
  const [state, setState] = useState<ConnState>('checking');
  const [info, setInfo] = useState<HealthResult | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState((s) => (s === 'checking' ? s : 'checking'));
    const result = await requestHealth();
    setInfo(result);
    setState(result.ok ? 'online' : 'offline');
    busy.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    if (pollMs <= 0) return; // initial check + manual refresh only
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs, enabled]);

  return { state, info, refresh };
}
