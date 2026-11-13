'use client';

import { createContext, useContext } from 'react';
import { KeyStatusMap } from '@/types/framecode';

export const KEY_STATUS_STORAGE_KEY = 'fc_keystatus';

export const DEFAULT_KEY_STATUS: KeyStatusMap = {
  claude: { connected: false, last4: null },
  openrouter: { connected: false, last4: null },
  gemini: { connected: false, last4: null },
};

export interface KeyStatusContextValue {
  status: KeyStatusMap;
  loaded: boolean;
  refresh: (force?: boolean) => Promise<void>;
  apply: (next: KeyStatusMap) => void;
}

export const KeyStatusContext = createContext<KeyStatusContextValue>({
  status: DEFAULT_KEY_STATUS,
  loaded: false,
  refresh: async () => {},
  apply: () => {},
});

export function useKeyStatus(): KeyStatusContextValue {
  return useContext(KeyStatusContext);
}
