import { ModelOption, ProviderId } from '@/types/framecode';

const CACHE_PREFIX = 'fc_models_';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PROVIDERS: ProviderId[] = ['claude', 'openrouter', 'gemini'];

interface CachedModelsPayload {
  fetchedAt: number;
  models: ModelOption[];
}

export function getCachedModels(provider: ProviderId): ModelOption[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${provider}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedModelsPayload;
    if (!parsed || !Array.isArray(parsed.models) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
      return null;
    }
    return parsed.models;
  } catch {
    return null;
  }
}

export function getStaleCachedModels(provider: ProviderId): ModelOption[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${provider}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedModelsPayload;
    if (!parsed || !Array.isArray(parsed.models)) {
      return null;
    }
    return parsed.models;
  } catch {
    return null;
  }
}

export function setCachedModels(provider: ProviderId, models: ModelOption[]): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedModelsPayload = {
      fetchedAt: Date.now(),
      models,
    };
    localStorage.setItem(`${CACHE_PREFIX}${provider}`, JSON.stringify(payload));
  } catch {
    // ignore storage quota issues
  }
}

export function clearModelsCache(provider?: ProviderId): void {
  if (typeof window === 'undefined') return;
  try {
    if (provider) {
      localStorage.removeItem(`${CACHE_PREFIX}${provider}`);
    } else {
      for (const p of PROVIDERS) {
        localStorage.removeItem(`${CACHE_PREFIX}${p}`);
      }
    }
  } catch {
    // ignore
  }
}
