'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ModelOption,
  ModelSelection,
  ImageSelection,
  ProviderId,
} from '@/types/framecode';
import { ModelLogo, ProviderLogo } from './ProviderLogo';
import { Search, Eye, Key, RefreshCw, X, Sparkles } from 'lucide-react';
import { useKeyStatus } from '@/lib/keyStatus';
import {
  getCachedModels,
  getStaleCachedModels,
  setCachedModels,
  clearModelsCache,
} from '@/lib/modelsCache';

interface ModelPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selection: ModelSelection | null;
  imageSelection: ImageSelection | null;
  activeProviderOverride?: ProviderId | null;
  onSelect: (selection: ModelSelection) => void;
  onSelectImage: (imageSelection: ImageSelection | null) => void;
  onOpenApiKeys: () => void;
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: 'Claude',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
};

type ModelCategorySegment = 'chat' | 'images';

const ModelPickerInner: React.FC<ModelPickerProps> = ({
  isOpen,
  onClose,
  selection,
  imageSelection,
  activeProviderOverride,
  onSelect,
  onSelectImage,
  onOpenApiKeys,
}) => {
  const { status: keyStatus } = useKeyStatus();

  const resolvedProvider: ProviderId =
    activeProviderOverride || selection?.provider || 'claude';

  const [activeTab, setActiveTab] = useState<ProviderId>(resolvedProvider);
  const [segment, setSegment] = useState<ModelCategorySegment>('chat');
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshFailedWithCache, setRefreshFailedWithCache] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const loadModelsForTab = useCallback(
    async (tab: ProviderId, isConfigured: boolean, bypassCache = false) => {
      if (!isConfigured) {
        setModels([]);
        setError(null);
        setRefreshFailedWithCache(false);
        setLoading(false);
        return;
      }

      const reqId = ++requestIdRef.current;
      if (bypassCache) {
        clearModelsCache(tab);
      }

      const freshCache = bypassCache ? null : getCachedModels(tab);
      const fallbackCache = bypassCache ? null : freshCache || getStaleCachedModels(tab);

      if (fallbackCache && fallbackCache.length > 0) {
        setModels(fallbackCache);
        setLoading(false);
      } else {
        if (!bypassCache) setModels([]);
        setLoading(true);
      }

      setError(null);
      setRefreshFailedWithCache(false);

      try {
        const res = await fetch(`/api/models?provider=${tab}`, { cache: 'no-store' });
        const data = await res.json();
        if (reqId !== requestIdRef.current) return;

        if (!res.ok || data.error) {
          const msg = data.error || 'Failed to load models';
          if (fallbackCache && fallbackCache.length > 0) {
            setRefreshFailedWithCache(true);
          } else {
            setError(msg);
          }
        } else {
          const liveModels: ModelOption[] = data.models || [];
          setModels(liveModels);
          setCachedModels(tab, liveModels);
        }
      } catch (err: unknown) {
        if (reqId !== requestIdRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to load models';
        if (fallbackCache && fallbackCache.length > 0) {
          setRefreshFailedWithCache(true);
        } else {
          setError(msg);
        }
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const initOnOpen = async () => {
      await Promise.resolve();
      if (!active) return;
      const targetTab: ProviderId =
        activeProviderOverride || selection?.provider || 'claude';
      setActiveTab(targetTab);
      await loadModelsForTab(targetTab, Boolean(keyStatus[targetTab]?.connected));
    };

    initOnOpen();
    return () => {
      active = false;
    };
  }, [isOpen, activeProviderOverride, selection?.provider, keyStatus, loadModelsForTab]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent | PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-switcher-pill]')) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isTabConfigured = Boolean(keyStatus[activeTab]?.connected);
  const last4 = keyStatus[activeTab]?.last4;
  const query = search.trim().toLowerCase();

  const chatCapableModels = models.filter((m) => !m.imageOutput);
  const filteredChatModels = chatCapableModels.filter((m) => {
    if (!query) return true;
    return m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
  });
  const visibleChatModels = filteredChatModels.slice(0, 100);

  const imageCapableModels = models.filter((m) => Boolean(m.imageOutput));
  const filteredImageModels = imageCapableModels.filter((m) => {
    if (!query) return true;
    return m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
  });
  const visibleImageModels = filteredImageModels.slice(0, 100);

  const handleRefresh = () => {
    loadModelsForTab(activeTab, isTabConfigured, true);
  };

  const sheetCard = (
    <div
      ref={containerRef}
      className="flex w-full sm:max-w-[520px] lg:w-[380px] lg:max-w-[380px] max-h-[85dvh] lg:max-h-[520px] flex-col rounded-t-[20px] lg:rounded-[16px] border-t sm:border border-border bg-surface-1 shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)] lg:pb-0"
    >
      <div className="pt-2.5 pb-1 lg:hidden">
        <div className="mx-auto h-1 w-10 rounded-full bg-border-strong" />
      </div>

      <div className="flex items-start justify-between px-4 pt-3 pb-2.5">
        <div className="min-w-0 pr-2">
          <h3 className="text-sm font-semibold text-text">Choose a model</h3>
          <p className="text-xs text-muted mt-0.5">
            Select the AI model that best fits your task
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={!isTabConfigured || loading}
            className="flex h-11 w-11 lg:h-8 lg:w-8 items-center justify-center rounded-full border border-border bg-surface-2 hover:bg-surface-3 text-muted hover:text-text transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Refresh model list"
            title="Refresh models"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-accent-text' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 lg:hidden items-center justify-center rounded-full text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
            aria-label="Close model picker"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 space-y-2.5 border-b border-border">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="w-full min-h-[44px] lg:min-h-[36px] bg-surface-2 border border-border rounded-full pl-9 pr-4 py-1.5 text-xs text-text placeholder:text-faint focus:outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-[10px] bg-surface-2 border border-border">
          <button
            type="button"
            onClick={() => setSegment('chat')}
            className={`min-h-[44px] lg:min-h-[30px] rounded-[7px] px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
              segment === 'chat'
                ? 'bg-surface-3 text-text border border-border'
                : 'text-muted hover:text-text border border-transparent'
            }`}
          >
            Chat &amp; video
          </button>
          <button
            type="button"
            onClick={() => setSegment('images')}
            className={`min-h-[44px] lg:min-h-[30px] rounded-[7px] px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
              segment === 'images'
                ? 'bg-surface-3 text-text border border-border'
                : 'text-muted hover:text-text border border-transparent'
            }`}
          >
            Images
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenApiKeys();
          }}
          className="flex w-full min-h-[44px] lg:min-h-[28px] items-center justify-between px-2 py-1 rounded-[8px] hover:bg-surface-2 text-xs transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 text-muted truncate">
            <ProviderLogo provider={activeTab} size={14} />
            <span className="truncate">
              {isTabConfigured
                ? `Using ${PROVIDER_LABELS[activeTab]}${last4 ? ` - key ending ${last4}` : ''}`
                : `No ${PROVIDER_LABELS[activeTab]} key configured`}
            </span>
          </span>
          <span className="text-accent-text font-medium shrink-0 ml-2">Switch</span>
        </button>

        {refreshFailedWithCache && (
          <div className="flex items-center justify-between px-2 text-[11px] text-muted">
            <span>Couldn&apos;t refresh</span>
            <button
              type="button"
              onClick={handleRefresh}
              className="text-accent-text hover:underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 min-h-[220px]">
        {segment === 'chat' ? (
          !isTabConfigured ? (
            <div className="m-1.5 p-4 bg-surface-2 border border-border rounded-[12px] text-xs text-muted space-y-3">
              <p>
                No API key configured for {PROVIDER_LABELS[activeTab]}. Add your key to browse models.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenApiKeys();
                }}
                className="inline-flex min-h-[44px] lg:min-h-[34px] items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent-hover active:bg-accent-pressed text-white font-medium rounded-[8px] text-xs transition-colors cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Add API Key</span>
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-[12px] border border-border bg-surface-2 animate-pulse"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 rounded-full bg-surface-3 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-36 rounded bg-surface-3" />
                      <div className="h-2.5 w-24 rounded bg-surface-3/70" />
                    </div>
                  </div>
                  <div className="w-5 h-5 rounded-full bg-surface-3 shrink-0" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-muted space-y-3">
              <p className="text-danger break-words">{error}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex min-h-[44px] lg:min-h-[34px] items-center px-3.5 py-1.5 bg-surface-3 hover:bg-border text-text rounded-[8px] text-xs font-medium transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : chatCapableModels.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">
              This account returned no models.
            </div>
          ) : filteredChatModels.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">No matching models found</div>
          ) : (
            <>
              {visibleChatModels.map((m) => {
                const isSelected =
                  selection?.provider === activeTab && selection?.modelId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect({
                        provider: activeTab,
                        modelId: m.id,
                        modelName: m.name,
                        vision: m.vision,
                        jsonMode: m.jsonMode,
                      });
                      onClose();
                    }}
                    className={`w-full min-h-[56px] flex items-center justify-between gap-3 p-2.5 rounded-[12px] border text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-surface-3 border-accent text-text'
                        : 'bg-surface-2/50 border-transparent hover:bg-surface-2 hover:border-border text-muted hover:text-text'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ModelLogo modelId={m.id} provider={activeTab} size={32} />
                      <div className="flex flex-col min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-text truncate">{m.name}</span>
                          {m.vision && (
                            <span className="inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 bg-surface-3 border border-border text-[10px] text-muted rounded">
                              <Eye className="w-2.5 h-2.5 text-accent-text" />
                              <span>Vision</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-faint font-mono truncate">{m.id}</span>
                      </div>
                    </div>

                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isSelected
                          ? 'border-accent bg-accent'
                          : 'border-border-strong bg-surface-1'
                      }`}
                    >
                      {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}

              {filteredChatModels.length > 100 && (
                <div className="p-3 text-center text-[11px] text-faint select-none">
                  Showing first 100. Search to narrow.
                </div>
              )}
            </>
          )
        ) : (
          <div className="space-y-1.5">
            <div className="px-2 py-1 text-[11px] text-faint">
              {activeTab === 'claude'
                ? "Claude can't create images"
                : `Images use ${PROVIDER_LABELS[activeTab]}`}
            </div>

            <button
              type="button"
              onClick={() => {
                onSelectImage(null);
                onClose();
              }}
              className={`w-full min-h-[56px] flex items-center justify-between gap-3 p-2.5 rounded-[12px] border text-left text-xs transition-colors cursor-pointer ${
                imageSelection === null
                  ? 'bg-surface-3 border-accent text-text'
                  : 'bg-surface-2/50 border-transparent hover:bg-surface-2 hover:border-border text-muted hover:text-text'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 text-accent-text">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-text">
                    Design with code (no image model)
                  </div>
                  <div className="text-[11px] text-faint">
                    Render crisp vector &amp; typography graphics with Remotion
                  </div>
                </div>
              </div>
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  imageSelection === null
                    ? 'border-accent bg-accent'
                    : 'border-border-strong bg-surface-1'
                }`}
              >
                {imageSelection === null && <span className="h-2 w-2 rounded-full bg-white" />}
              </div>
            </button>

            {activeTab !== 'claude' && (
              <>
                {!isTabConfigured ? (
                  <div className="m-1.5 p-3.5 bg-surface-2 border border-border rounded-[12px] text-xs text-muted space-y-2.5">
                    <p>Add a {PROVIDER_LABELS[activeTab]} API key to list image models.</p>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenApiKeys();
                      }}
                      className="inline-flex min-h-[44px] lg:min-h-[34px] items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-[8px] text-xs transition-colors cursor-pointer"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Add API Key</span>
                    </button>
                  </div>
                ) : loading ? (
                  <div className="space-y-2 p-1">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-[12px] border border-border bg-surface-2 animate-pulse"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-8 h-8 rounded-full bg-surface-3 shrink-0" />
                          <div className="space-y-1.5 flex-1">
                            <div className="h-3.5 w-32 rounded bg-surface-3" />
                            <div className="h-2.5 w-20 rounded bg-surface-3/70" />
                          </div>
                        </div>
                        <div className="w-5 h-5 rounded-full bg-surface-3 shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : filteredImageModels.length === 0 ? (
                  <div className="p-6 text-center text-xs text-faint">
                    {imageCapableModels.length === 0
                      ? `No dedicated image models returned by ${PROVIDER_LABELS[activeTab]}.`
                      : 'No matching image models found.'}
                  </div>
                ) : (
                  visibleImageModels.map((m) => {
                    const isSelected =
                      imageSelection?.provider === activeTab &&
                      imageSelection?.modelId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectImage({
                            provider: activeTab,
                            modelId: m.id,
                            modelName: m.name,
                          });
                          onClose();
                        }}
                        className={`w-full min-h-[56px] flex items-center justify-between gap-3 p-2.5 rounded-[12px] border text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-surface-3 border-accent text-text'
                            : 'bg-surface-2/50 border-transparent hover:bg-surface-2 hover:border-border text-muted hover:text-text'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <ModelLogo modelId={m.id} provider={activeTab} size={32} />
                          <div className="flex flex-col min-w-0 flex-1 space-y-0.5">
                            <span className="font-medium text-text truncate">{m.name}</span>
                            <span className="text-[11px] text-faint font-mono truncate">{m.id}</span>
                          </div>
                        </div>

                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            isSelected
                              ? 'border-accent bg-accent'
                              : 'border-border-strong bg-surface-1'
                          }`}
                        >
                          {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}
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
};

export const ModelPicker = React.memo(ModelPickerInner);
