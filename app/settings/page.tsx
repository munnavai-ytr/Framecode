'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, ShieldCheck, Eye, EyeOff, Trash2, Check, AlertCircle } from 'lucide-react';
import { ProviderId } from '@/types/framecode';
import { ProviderLogo } from '@/components/ProviderLogo';

interface KeyCardState {
  apiKey: string;
  showKey: boolean;
  loading: boolean;
  error: string | null;
  success: boolean;
}

export default function SettingsPage() {
  const [configured, setConfigured] = useState<Record<ProviderId, boolean>>({
    claude: false,
    openrouter: false,
    gemini: false,
  });

  const [cards, setCards] = useState<Record<ProviderId, KeyCardState>>({
    claude: { apiKey: '', showKey: false, loading: false, error: null, success: false },
    openrouter: { apiKey: '', showKey: false, loading: false, error: null, success: false },
    gemini: { apiKey: '', showKey: false, loading: false, error: null, success: false },
  });

  useEffect(() => {
    let active = true;
    const loadConfigured = async () => {
      try {
        const res = await fetch('/api/keys');
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setConfigured(data.configured || { claude: false, openrouter: false, gemini: false });
          }
        }
      } catch (err) {
        console.error('Failed to load key statuses:', err);
      }
    };
    loadConfigured();
    return () => {
      active = false;
    };
  }, []);

  const handleSaveKey = async (provider: ProviderId) => {
    const card = cards[provider];
    if (!card.apiKey.trim()) return;

    setCards((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], loading: true, error: null, success: false },
    }));

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: card.apiKey.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setCards((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], loading: false, apiKey: '', success: true },
        }));
        setConfigured((prev) => ({ ...prev, [provider]: true }));
        setTimeout(() => {
          setCards((prev) => ({
            ...prev,
            [provider]: { ...prev[provider], success: false },
          }));
        }, 3000);
      } else {
        setCards((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            loading: false,
            error: data.error || 'Verification failed',
          },
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect API key';
      setCards((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], loading: false, error: msg },
      }));
    }
  };

  const handleRemoveKey = async (provider: ProviderId) => {
    setCards((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], loading: true, error: null },
    }));

    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      if (res.ok) {
        setConfigured((prev) => ({ ...prev, [provider]: false }));
        setCards((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], loading: false, apiKey: '', error: null },
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect key';
      setCards((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], loading: false, error: msg },
      }));
    }
  };

  const providers: { id: ProviderId; name: string; description: string }[] = [
    {
      id: 'claude',
      name: 'Anthropic Claude',
      description: 'Supports Claude 3.7 Sonnet & 3.5 Haiku models via Anthropic API.',
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      description: 'Access hundreds of AI models including Claude, Gemini, Llama, and DeepSeek.',
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      description: 'Supports Gemini 2.5 Flash & 2.5 Pro multimodal models.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#1F1E1D] text-[#FAF9F5] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigation */}
        <div className="flex items-center space-x-3">
          <Link
            href="/"
            className="p-2 rounded-lg bg-[#2A2927] border border-[#3A3835] hover:bg-[#3A3835] transition text-[#FAF9F5]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">API Key Settings</h1>
        </div>

        {/* Security Notice */}
        <div className="p-4 bg-[#2A2927] border border-[#3A3835] rounded-xl flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-[#A8A59E] leading-relaxed">
            <span className="font-medium text-[#FAF9F5]">Secure Vault:</span> API keys are
            encrypted using the server&apos;s <code className="text-[#D97757] font-mono">KEYS_SECRET</code> and stored in an HTTP-only browser cookie. Keys never leak to client JavaScript, third parties, or server logs.
          </div>
        </div>

        {/* Provider Cards */}
        <div className="space-y-4">
          {providers.map((p) => {
            const isConfigured = configured[p.id];
            const card = cards[p.id];

            return (
              <div
                key={p.id}
                className="bg-[#2A2927] border border-[#3A3835] rounded-xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <ProviderLogo provider={p.id} className="w-5 h-5" />
                    <div>
                      <h3 className="text-sm font-medium text-[#FAF9F5]">{p.name}</h3>
                      <p className="text-xs text-[#A8A59E]">{p.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#1F1E1D] border border-[#3A3835] rounded-full text-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isConfigured ? 'bg-emerald-500' : 'bg-[#3A3835]'
                      }`}
                    />
                    <span className="text-[#A8A59E] font-medium">
                      {isConfigured ? 'Connected' : 'Not Configured'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                      <Key className="w-4 h-4 absolute left-3 top-2.5 text-[#A8A59E]" />
                      <input
                        type={card.showKey ? 'text' : 'password'}
                        value={card.apiKey}
                        onChange={(e) =>
                          setCards((prev) => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], apiKey: e.target.value, error: null },
                          }))
                        }
                        placeholder={
                          isConfigured
                            ? '••••••••••••••••••••••••••••'
                            : `Enter ${p.name} API Key`
                        }
                        className="w-full bg-[#1F1E1D] border border-[#3A3835] rounded-lg pl-9 pr-10 py-2 text-xs text-[#FAF9F5] placeholder-[#A8A59E] focus:outline-none focus:border-[#D97757]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCards((prev) => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], showKey: !card.showKey },
                          }))
                        }
                        className="absolute right-3 top-2.5 text-[#A8A59E] hover:text-[#FAF9F5]"
                      >
                        {card.showKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveKey(p.id)}
                      disabled={card.loading || !card.apiKey.trim()}
                      className={`px-4 py-2 rounded-lg text-xs font-medium transition ${
                        card.apiKey.trim() && !card.loading
                          ? 'bg-[#D97757] hover:bg-[#D97757]/90 text-white cursor-pointer'
                          : 'bg-[#3A3835] text-[#A8A59E]/50 cursor-not-allowed'
                      }`}
                    >
                      {card.loading ? 'Verifying...' : 'Connect'}
                    </button>

                    {isConfigured && (
                      <button
                        type="button"
                        onClick={() => handleRemoveKey(p.id)}
                        disabled={card.loading}
                        className="p-2 rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-red-500/10 text-[#A8A59E] hover:text-red-400 transition"
                        title="Disconnect API key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {card.error && (
                    <div className="flex items-center space-x-1.5 text-xs text-red-400 pt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{card.error}</span>
                    </div>
                  )}

                  {card.success && (
                    <div className="flex items-center space-x-1.5 text-xs text-emerald-400 pt-1">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>API key verified and saved securely.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
