'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  KeyStatusContext,
  DEFAULT_KEY_STATUS,
  KEY_STATUS_STORAGE_KEY,
} from '@/lib/keyStatus';
import { KeyStatusMap, ProviderId } from '@/types/framecode';

const REVALIDATE_THROTTLE_MS = 60_000;
const PROVIDERS: ProviderId[] = ['claude', 'openrouter', 'gemini'];

function normalizeKeyStatus(data: unknown): KeyStatusMap {
  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const configured = (obj.configured as Record<string, unknown>) || {};
  const last4Map = (obj.last4 as Record<string, unknown>) || {};

  const next: KeyStatusMap = {
    claude: { connected: false, last4: null },
    openrouter: { connected: false, last4: null },
    gemini: { connected: false, last4: null },
  };

  for (const p of PROVIDERS) {
    // Support both API response shape { configured, last4 } and stored KeyStatusMap shape
    if (obj[p] && typeof obj[p] === 'object' && 'connected' in (obj[p] as object)) {
      const item = obj[p] as { connected?: unknown; last4?: unknown };
      next[p] = {
        connected: Boolean(item.connected),
        last4: typeof item.last4 === 'string' ? item.last4 : null,
      };
    } else {
      next[p] = {
        connected: Boolean(configured[p]),
        last4: typeof last4Map[p] === 'string' ? (last4Map[p] as string) : null,
      };
    }
  }

  return next;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<KeyStatusMap>(DEFAULT_KEY_STATUS);
  const [loaded, setLoaded] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const apply = useCallback((next: KeyStatusMap) => {
    setStatus(next);
    setLoaded(true);
    try {
      localStorage.setItem(KEY_STATUS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < REVALIDATE_THROTTLE_MS) {
      return;
    }
    lastFetchRef.current = now;

    try {
      const res = await fetch('/api/keys', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const normalized = normalizeKeyStatus(data);
      setStatus(normalized);
      setLoaded(true);
      try {
        localStorage.setItem(KEY_STATUS_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore
      }
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const init = async () => {
      await Promise.resolve();
      if (!active) return;

      // 1. Hydrate from localStorage immediately if cached
      try {
        const raw = localStorage.getItem(KEY_STATUS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setStatus(normalizeKeyStatus(parsed));
          setLoaded(true);
        }
      } catch {
        // ignore invalid cache
      }

      // 2. Revalidate in background from /api/keys
      await refresh(true);
    };

    init();

    // 3. Revalidate on window focus (throttled max 1/60s)
    const handleFocus = () => {
      refresh(false);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, [refresh]);

  return (
    <KeyStatusContext.Provider value={{ status, loaded, refresh, apply }}>
      {children}
    </KeyStatusContext.Provider>
  );
}
