'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ModelOption, ModelSelection, ProviderId } from '@/types/framecode';
import { ProviderLogo } from './ProviderLogo';
import { Search, Eye, Key, Check, X } from 'lucide-react';

interface ModelPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selection: ModelSelection | null;
  onSelect: (selection: ModelSelection) => void;
  onOpenSettings: () => void;
}

const TAB_LABELS: Record<ProviderId, string> = {
  claude: 'Claude',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
};

const PROVIDER_LIST: ProviderId[] = ['claude', 'openrouter', 'gemini'];

export function ModelPicker({
  isOpen,
  onClose,
  selection,
  onSelect,
  onOpenSettings,
}: ModelPickerProps) {
  const [activeTab, setActiveTab] = useState<ProviderId>(selection?.provider || 'claude');
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [configured, setConfigured] = useState<Record<ProviderId, boolean>>({
    claude: false,
    openrouter: false,
    gemini: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const loadModelsForTab = async (tab: ProviderId, isConfigured: boolean) => {
    if (!isConfigured) {
      setModels([]);
      setError(null);
      setLoading(false);
      return;
    }

    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setModels([]);

    try {
      const res = await fetch(`/api/models?provider=${tab}`, { cache: 'no-store' });
      const data = await res.json();
      if (reqId !== requestIdRef.current) return;

      if (!res.ok || data.error) {
        setError(data.error || 'Failed to load models');
      } else {
        setModels(data.models || []);
      }
    } catch (err: unknown) {
      if (reqId !== requestIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load models';
      setError(msg);
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const init = async () => {
      try {
        const res = await fetch('/api/keys', { cache: 'no-store' });
        const data = await res.json();
        const conf: Record<ProviderId, boolean> = data.configured || {
          claude: false,
          openrouter: false,
          gemini: false,
        };
        if (!active) return;
        setConfigured(conf);

        const targetTab = selection?.provider || activeTab;
        setActiveTab(targetTab);
        loadModelsForTab(targetTab, Boolean(conf[targetTab]));
      } catch {
        if (!active) return;
        loadModelsForTab(activeTab, false);
      }
    };

    init();

    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleTabChange = (tab: ProviderId) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSearch('');
    setError(null);
    loadModelsForTab(tab, Boolean(configured[tab]));
  };

  const handleRetry = () => {
    loadModelsForTab(activeTab, Boolean(configured[activeTab]));
  };

  // Close on pointerdown outside as well as on mousedown, and on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent | PointerEvent) => {
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

  // Filter only by query (no filtering by m.provider because models are already from activeTab)
  const query = search.trim().toLowerCase();
  const filteredModels = models.filter((m) => {
    if (!query) return true;
    return (
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    );
  });

  const visibleModels = filteredModels.slice(0, 100);
  const isTabConfigured = configured[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div
        ref={containerRef}
        className="w-full sm:max-w-md bg-[#2A2927] border border-[#3A3835] rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3A3835]">
          <h3 className="text-sm font-medium text-[#FAF9F5]">Select Model</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#3A3835] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="grid grid-cols-3 gap-1 p-2 border-b border-[#3A3835] bg-[#1F1E1D]">
          {PROVIDER_LIST.map((p) => {
            const isConfig = configured[p];
            const isActive = activeTab === p;
            return (
              <button
                key={p}
                onClick={() => handleTabChange(p)}
                className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-[#2A2927] text-[#FAF9F5] border border-[#3A3835]'
                    : 'text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#2A2927]/50'
                }`}
              >
                <ProviderLogo provider={p} className="w-3.5 h-3.5" />
                <span>{TAB_LABELS[p]}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConfig ? 'bg-emerald-500' : 'bg-[#3A3835]'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[#3A3835]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#A8A59E]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-[#1F1E1D] border border-[#3A3835] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#FAF9F5] placeholder-[#A8A59E] focus:outline-none focus:border-[#D97757]"
            />
          </div>
        </div>

        {/* Model List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[220px]">
          {!isTabConfigured ? (
            <div className="m-2 p-3 bg-[#1F1E1D] border border-amber-900/40 rounded-lg text-xs text-[#A8A59E] space-y-2">
              <p>No API key configured for {TAB_LABELS[activeTab]}. Add key to enable.</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#D97757] hover:bg-[#D97757]/90 text-white font-medium rounded-md text-xs transition cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Add Key in Settings</span>
              </button>
            </div>
          ) : loading ? (
            <div className="p-8 text-center text-xs text-[#A8A59E]">Loading models...</div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-[#A8A59E] space-y-3">
              <p className="text-red-400 break-words">{error}</p>
              <button
                onClick={handleRetry}
                className="inline-flex items-center px-3 py-1.5 bg-[#3A3835] hover:bg-[#484542] text-[#FAF9F5] rounded-md text-xs font-medium transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : models.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#A8A59E]">This account returned no models.</div>
          ) : filteredModels.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#A8A59E]">No matching models found</div>
          ) : (
            <>
              {visibleModels.map((m) => {
                const isSelected =
                  selection?.provider === activeTab && selection?.modelId === m.id;
                return (
                  <button
                    key={m.id}
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
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#1F1E1D] text-[#FAF9F5] border border-[#3A3835]'
                        : 'hover:bg-[#1F1E1D]/60 text-[#A8A59E] hover:text-[#FAF9F5]'
                    }`}
                  >
                    <div className="flex flex-col space-y-0.5">
                      <div className="font-medium text-[#FAF9F5] flex items-center space-x-2">
                        <span>{m.name}</span>
                        {m.vision && (
                          <span className="flex items-center space-x-1 px-1.5 py-0.5 bg-[#3A3835] text-[10px] text-[#FAF9F5] rounded">
                            <Eye className="w-3 h-3 text-[#D97757]" />
                            <span>Vision</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#A8A59E] font-mono">{m.id}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#D97757]" />}
                  </button>
                );
              })}
              {filteredModels.length > 100 && (
                <div className="p-3 text-center text-[11px] text-[#A8A59E]/70 select-none">
                  Showing first 100. Search to narrow.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
