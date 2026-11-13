'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, EyeOff, AlertCircle, ArrowUpRight, X } from 'lucide-react';
import { ProviderId } from '@/types/framecode';
import { ProviderLogo } from './ProviderLogo';
import { useKeyStatus } from '@/lib/keyStatus';
import { clearModelsCache } from '@/lib/modelsCache';

interface ApiKeysSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider: ProviderId | null;
  onActivateProvider: (provider: ProviderId) => void;
  onOpenSettings: () => void;
}

const PROVIDERS: Array<{ id: ProviderId; name: string }> = [
  { id: 'claude', name: 'Claude' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'openrouter', name: 'OpenRouter' },
];

export function ApiKeysSheet({
  isOpen,
  onClose,
  activeProvider,
  onActivateProvider,
  onOpenSettings,
}: ApiKeysSheetProps) {
  const { status: keyStatus, apply: applyKeyStatus } = useKeyStatus();

  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setExpandedProvider(null);
    setApiKeyInput('');
    setShowKey(false);
    setError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent | PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-switcher-pill]')) {
        return;
      }
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleRowClick = (provider: ProviderId) => {
    const isConnected = Boolean(keyStatus[provider]?.connected);
    if (isConnected) {
      onActivateProvider(provider);
      handleClose();
      return;
    }

    if (expandedProvider === provider) {
      setExpandedProvider(null);
      setApiKeyInput('');
      setError(null);
    } else {
      setExpandedProvider(provider);
      setApiKeyInput('');
      setShowKey(false);
      setError(null);
    }
  };

  const handleSaveAndVerify = async (e: React.FormEvent, provider: ProviderId) => {
    e.preventDefault();
    const trimmed = apiKeyInput.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: trimmed }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        clearModelsCache(provider);
        applyKeyStatus({
          ...keyStatus,
          [provider]: {
            connected: true,
            last4: typeof data.last4 === 'string' ? data.last4 : trimmed.slice(-4),
          },
        });
        onActivateProvider(provider);
        handleClose();
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect API key');
    } finally {
      setSaving(false);
    }
  };

  const sheetCard = (
    <div
      ref={sheetRef}
      className="flex w-full sm:max-w-[520px] lg:w-[380px] lg:max-w-[380px] max-h-[85dvh] lg:max-h-[520px] flex-col rounded-t-[20px] lg:rounded-[16px] border-t sm:border border-border bg-surface-1 shadow-2xl overflow-hidden"
    >
      <div className="pt-2.5 pb-1 lg:hidden">
        <div className="mx-auto h-1 w-10 rounded-full bg-border-strong" />
      </div>

      <div className="flex items-start justify-between px-4 pt-3 pb-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-text">API keys</h3>
          <p className="text-xs text-muted mt-0.5">Choose the provider and key to use</p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-11 w-11 lg:h-8 lg:w-8 -mr-1.5 -mt-1 items-center justify-center rounded-full text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
          aria-label="Close API keys sheet"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {PROVIDERS.map((p) => {
          const info = keyStatus[p.id];
          const isConnected = Boolean(info?.connected);
          const isSelected = activeProvider === p.id;
          const isExpanded = expandedProvider === p.id;

          return (
            <div
              key={p.id}
              className={`rounded-[12px] border transition-colors ${
                isSelected
                  ? 'border-accent bg-surface-3'
                  : 'border-border bg-surface-2 hover:border-border-strong'
              }`}
            >
              <button
                type="button"
                onClick={() => handleRowClick(p.id)}
                className="flex w-full min-h-[56px] items-center justify-between gap-3 px-3.5 py-2.5 text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-3">
                    <ProviderLogo provider={p.id} size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text">{p.name}</div>
                    <div className={`text-xs truncate ${isConnected ? 'text-muted' : 'text-faint'}`}>
                      {isConnected
                        ? info?.last4
                          ? `Key ending ${info.last4}`
                          : 'Connected'
                        : 'No key'}
                    </div>
                  </div>
                </div>

                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isSelected ? 'border-accent bg-accent' : 'border-border-strong bg-surface-1'
                  }`}
                >
                  {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                </div>
              </button>

              {isExpanded && !isConnected && (
                <form
                  onSubmit={(e) => handleSaveAndVerify(e, p.id)}
                  className="border-t border-border px-3.5 py-3 space-y-2.5 bg-surface-1"
                >
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => {
                        setApiKeyInput(e.target.value);
                        setError(null);
                      }}
                      placeholder={`Paste your ${p.name} API key`}
                      autoFocus
                      className="w-full min-h-[44px] lg:min-h-[38px] rounded-[10px] border border-border bg-surface-2 pl-3 pr-10 py-2 text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => !prev)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-9 w-9 lg:h-7 lg:w-7 items-center justify-center rounded-md text-muted hover:text-text cursor-pointer"
                      aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {error && (
                    <div className="flex items-start gap-1.5 text-xs text-danger">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="break-words">{error}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedProvider(null);
                        setError(null);
                      }}
                      className="min-h-[44px] lg:min-h-[34px] px-3 py-1.5 rounded-[8px] border border-border bg-surface-2 hover:bg-surface-3 text-xs font-medium text-muted hover:text-text transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !apiKeyInput.trim()}
                      className="min-h-[44px] lg:min-h-[34px] px-3.5 py-1.5 rounded-[8px] bg-accent hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-40 text-xs font-medium text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      {saving ? 'Verifying...' : 'Save & verify'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3 bg-surface-1">
        <button
          type="button"
          onClick={() => {
            handleClose();
            onOpenSettings();
          }}
          className="flex w-full min-h-[44px] lg:min-h-[32px] items-center justify-between text-xs font-medium text-accent-text hover:text-text transition-colors cursor-pointer"
        >
          <span>Manage in Settings</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/75 backdrop-blur-xs lg:hidden">
        {sheetCard}
      </div>

      <div className="hidden lg:block lg:absolute lg:bottom-full lg:left-0 lg:mb-2 lg:z-40">
        {sheetCard}
      </div>
    </>
  );
}
