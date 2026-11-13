'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  Trash2,
  Check,
  AlertCircle,
  Brain,
  Pencil,
  Download,
  Upload,
  Plus,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { ProviderId, Memory } from '@/types/framecode';
import { ProviderLogo } from '@/components/ProviderLogo';
import { useKeyStatus } from '@/lib/keyStatus';
import { clearModelsCache } from '@/lib/modelsCache';
import {
  loadMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  clearMemories,
  exportMemories,
  importMemories,
  isMemoryEnabled,
  setMemoryEnabled,
} from '@/lib/memory';

interface KeyCardState {
  apiKey: string;
  showKey: boolean;
  loading: boolean;
  error: string | null;
  success: boolean;
}

const PROVIDERS: Array<{
  id: ProviderId;
  name: string;
  description: string;
  keyUrl: string;
}> = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic Claude models for planning, chat, and Remotion video coding.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified gateway for chat, coding, and image generation models.',
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini multimodal models and native image generation.',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
];

export default function SettingsPage() {
  const { status: keyStatus, loaded: keysLoaded, apply: applyKeyStatus } = useKeyStatus();

  const [cards, setCards] = useState<Record<ProviderId, KeyCardState>>({
    claude: { apiKey: '', showKey: false, loading: false, error: null, success: false },
    openrouter: { apiKey: '', showKey: false, loading: false, error: null, success: false },
    gemini: { apiKey: '', showKey: false, loading: false, error: null, success: false },
  });

  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);
  const [activeNav, setActiveNav] = useState<'keys' | 'memory'>('keys');

  // Memory state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const [memoryOn, setMemoryOn] = useState(true);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const [deleteMemoryId, setDeleteMemoryId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    const initSettings = async () => {
      await Promise.resolve();
      if (!active) return;

      try {
        const stored = localStorage.getItem('fc_selection');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            parsed?.provider &&
            ['claude', 'openrouter', 'gemini'].includes(parsed.provider)
          ) {
            setActiveProvider(parsed.provider as ProviderId);
          }
        }
      } catch {
        // Ignore storage read error
      }

      if (window.location.hash === '#memory') {
        setActiveNav('memory');
      }

      setMemoryOn(isMemoryEnabled());
      try {
        const list = await loadMemories();
        if (active) {
          setMemories(list);
          setMemoriesLoaded(true);
        }
      } catch (err) {
        console.warn('Could not load memories:', err);
        if (active) setMemoriesLoaded(true);
      }
    };

    initSettings();

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
        clearModelsCache(provider);
        applyKeyStatus({
          ...keyStatus,
          [provider]: {
            connected: true,
            last4: typeof data.last4 === 'string' ? data.last4 : card.apiKey.trim().slice(-4),
          },
        });
        setCards((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], loading: false, apiKey: '', success: true },
        }));
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
        clearModelsCache(provider);
        applyKeyStatus({
          ...keyStatus,
          [provider]: { connected: false, last4: null },
        });
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

  const handleToggleMemoryEnabled = () => {
    const next = !memoryOn;
    setMemoryOn(next);
    setMemoryEnabled(next);
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemoryError(null);
    setMemoryNotice(null);

    const trimmed = newMemoryText.trim();
    if (!trimmed) return;

    const added = await addMemory(trimmed, 'user');
    if (!added) {
      setMemoryError('Could not save memory. Avoid API keys, passwords, or long tokens.');
      return;
    }

    setMemories((prev) => [added, ...prev]);
    setNewMemoryText('');
  };

  const handleStartEdit = (m: Memory) => {
    setEditingId(m.id);
    setEditingText(m.text);
    setMemoryError(null);
  };

  const handleSaveEdit = async (id: string) => {
    setMemoryError(null);
    const updated = await updateMemory(id, editingText);
    if (!updated) {
      setMemoryError('Could not update memory. Avoid empty text or secret tokens.');
      return;
    }

    setMemories((prev) =>
      prev
        .map((m) => (m.id === id ? updated : m))
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        )
    );
    setEditingId(null);
    setEditingText('');
  };

  const handleConfirmDeleteMemory = async () => {
    if (!deleteMemoryId) return;
    await deleteMemory(deleteMemoryId);
    setMemories((prev) => prev.filter((m) => m.id !== deleteMemoryId));
    setDeleteMemoryId(null);
  };

  const handleConfirmClearAll = async () => {
    await clearMemories();
    setMemories([]);
    setConfirmClearAll(false);
    setMemoryNotice('All memories cleared.');
  };

  const handleExportMemories = async () => {
    setMemoryError(null);
    const json = await exportMemories();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'framecode-memory.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMemoryError(null);
    setMemoryNotice(null);

    try {
      const text = await file.text();
      const { imported, skipped } = await importMemories(text);
      const list = await loadMemories();
      setMemories(list);
      setMemoryNotice(`Imported ${imported}, skipped ${skipped}`);
    } catch (err: unknown) {
      setMemoryError(err instanceof Error ? err.message : 'Failed to import memories');
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };

  const formatMemoryDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 h-16 border-b border-border bg-surface-1/90 backdrop-blur-xs px-4 sm:px-8 flex items-center">
        <div className="max-w-[1040px] mx-auto w-full flex items-center space-x-3">
          <Link
            href="/"
            className="flex h-11 w-11 lg:h-9 lg:w-9 items-center justify-center rounded-lg bg-surface-2 border border-border hover:bg-surface-3 hover:border-border-strong transition text-text"
            aria-label="Back to chat"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        </div>
      </header>

      {/* Main Content Layout: Sticky Left Nav on Desktop (>= 1024px) + Single Column Content */}
      <div className="max-w-[1040px] mx-auto px-4 sm:px-8 py-6 sm:py-8 flex flex-col lg:flex-row gap-8">
        {/* Left Navigation Column */}
        <aside className="hidden lg:block w-[220px] shrink-0">
          <nav className="sticky top-24 space-y-1.5" aria-label="Settings sections">
            <a
              href="#keys"
              onClick={() => setActiveNav('keys')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition border ${
                activeNav === 'keys'
                  ? 'bg-surface-2 border-border text-text'
                  : 'border-transparent text-muted hover:text-text hover:bg-surface-2/60'
              }`}
            >
              <Key className="w-4 h-4 text-accent-text shrink-0" />
              <span>API keys</span>
            </a>

            <a
              href="#memory"
              onClick={() => setActiveNav('memory')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition border ${
                activeNav === 'memory'
                  ? 'bg-surface-2 border-border text-text'
                  : 'border-transparent text-muted hover:text-text hover:bg-surface-2/60'
              }`}
            >
              <Brain className="w-4 h-4 text-accent-text shrink-0" />
              <span>Memory</span>
            </a>
          </nav>
        </aside>

        {/* Right Content Column */}
        <main className="flex-1 max-w-[760px] space-y-8">
          {/* Security Notice */}
          <div className="p-4 bg-surface-2 border border-border rounded-[16px] flex items-start space-x-3">
            <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
            <div className="text-xs text-muted leading-relaxed">
              <span className="font-medium text-text">Secure Vault:</span> API keys are
              encrypted using the server&apos;s{' '}
              <code className="text-accent-text font-mono">KEYS_SECRET</code> and stored in an
              HTTP-only browser cookie. Keys never leak to client JavaScript, third parties, or
              server logs.
            </div>
          </div>

          {/* API Keys Section */}
          <section id="keys" className="scroll-mt-24 space-y-4">
            <h2 className="text-sm font-semibold text-text">API keys</h2>
            {PROVIDERS.map((p) => {
              const pStatus = keyStatus[p.id];
              const isConfigured = pStatus?.connected ?? false;
              const last4 = pStatus?.last4;
              const isActive = activeProvider === p.id;
              const card = cards[p.id];

              return (
                <div
                  key={p.id}
                  className="bg-surface-2 border border-border rounded-[16px] p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <ProviderLogo provider={p.id} size={22} />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-text">{p.name}</h3>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full bg-accent-soft border border-accent/30 text-[10px] font-medium text-accent-text">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5">{p.description}</p>
                      </div>
                    </div>

                    {!keysLoaded ? (
                      <div className="w-28 h-6 rounded-full bg-surface-1 border border-border animate-pulse shrink-0" />
                    ) : (
                      <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-surface-1 border border-border rounded-full text-xs shrink-0">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isConfigured ? 'bg-success' : 'bg-border-strong'
                          }`}
                        />
                        <span className="text-muted font-medium">
                          {isConfigured
                            ? last4
                              ? `Key ending ${last4}`
                              : 'Connected'
                            : 'No key'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
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
                              ? last4
                                ? `••••••••••••••••${last4}`
                                : '••••••••••••••••••••••••••••'
                              : `Paste your ${p.name} API key`
                          }
                          className="w-full min-h-[44px] lg:min-h-[38px] bg-surface-1 border border-border rounded-xl pl-9 pr-11 py-2 text-base lg:text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCards((prev) => ({
                              ...prev,
                              [p.id]: { ...prev[p.id], showKey: !card.showKey },
                            }))
                          }
                          aria-label={card.showKey ? 'Hide API key' : 'Show API key'}
                          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-text cursor-pointer"
                        >
                          {card.showKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveKey(p.id)}
                          disabled={card.loading || !card.apiKey.trim()}
                          className={`flex-1 sm:flex-none min-h-[44px] lg:min-h-[38px] px-4 py-2 rounded-xl text-xs font-medium transition ${
                            card.apiKey.trim() && !card.loading
                              ? 'bg-accent hover:bg-accent-hover active:bg-accent-pressed text-white cursor-pointer'
                              : 'bg-surface-3 text-faint cursor-not-allowed'
                          }`}
                        >
                          {card.loading ? 'Verifying...' : 'Save & verify'}
                        </button>

                        {isConfigured && (
                          <button
                            type="button"
                            onClick={() => handleRemoveKey(p.id)}
                            disabled={card.loading}
                            className="flex min-h-[44px] lg:min-h-[38px] items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface-1 hover:border-danger/50 hover:bg-danger/10 text-xs text-muted hover:text-danger transition cursor-pointer"
                            title="Remove API key"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-0.5">
                      <a
                        href={p.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent-text hover:text-text transition"
                      >
                        <span>Get a key</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {card.error && (
                      <div className="flex items-center space-x-1.5 text-xs text-danger pt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{card.error}</span>
                      </div>
                    )}

                    {card.success && (
                      <div className="flex items-center space-x-1.5 text-xs text-success pt-1">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>API key verified and saved securely.</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          {/* Long-Term Memory Section */}
          <section
            id="memory"
            className="scroll-mt-24 bg-surface-2 border border-border rounded-[16px] p-5 space-y-5"
          >
            <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-surface-1 border border-border">
                  <Brain className="w-4 h-4 text-accent-text" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-semibold text-text">Memory</h2>
                    <span className="px-2 py-0.5 rounded-full bg-surface-1 border border-border text-[11px] text-muted">
                      {memoriesLoaded ? `${memories.length} saved` : 'Loading...'}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    Framecode remembers helpful facts and preferences across chats. Stored locally in your browser&apos;s IndexedDB.
                  </p>
                </div>
              </div>

              {/* Use Memory Switch */}
              <label className="flex items-center space-x-2 cursor-pointer shrink-0 select-none min-h-[44px] lg:min-h-0">
                <span className="text-xs text-muted">Use memory</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={memoryOn}
                  onClick={handleToggleMemoryEnabled}
                  className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors cursor-pointer ${
                    memoryOn ? 'bg-accent' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-text transition-transform ${
                      memoryOn ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>

            {/* Add Memory Form */}
            <form onSubmit={handleAddMemory} className="flex items-center space-x-2">
              <input
                type="text"
                value={newMemoryText}
                onChange={(e) => {
                  setNewMemoryText(e.target.value);
                  setMemoryError(null);
                }}
                maxLength={240}
                placeholder="Add something to remember (e.g., Prefer dark kinetic typography)..."
                className="flex-1 min-h-[44px] lg:min-h-[38px] bg-surface-1 border border-border rounded-xl px-3 py-2 text-base lg:text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={!newMemoryText.trim()}
                className={`flex min-h-[44px] lg:min-h-[38px] items-center space-x-1 px-4 py-2 rounded-xl text-xs font-medium transition ${
                  newMemoryText.trim()
                    ? 'bg-accent hover:bg-accent-hover active:bg-accent-pressed text-white cursor-pointer'
                    : 'bg-surface-3 text-faint cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {/* Actions Bar: Export / Import / Clear all */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExportMemories}
                  disabled={memories.length === 0}
                  className="flex min-h-[44px] lg:min-h-[34px] items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-1 hover:bg-surface-3 text-xs text-text transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5 text-muted" />
                  <span>Export</span>
                </button>

                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="flex min-h-[44px] lg:min-h-[34px] items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-1 hover:bg-surface-3 text-xs text-text transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-muted" />
                  <span>Import</span>
                </button>
              </div>

              {memories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="flex min-h-[44px] lg:min-h-[34px] items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-danger/40 bg-surface-1 hover:bg-danger/10 text-xs text-danger transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear all</span>
                </button>
              )}
            </div>

            {memoryError && (
              <div className="flex items-center space-x-1.5 text-xs text-danger">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{memoryError}</span>
              </div>
            )}

            {memoryNotice && (
              <div className="flex items-center justify-between p-2.5 bg-surface-1 border border-border rounded-lg text-xs text-text">
                <span>{memoryNotice}</span>
                <button
                  type="button"
                  onClick={() => setMemoryNotice(null)}
                  className="flex h-8 w-8 items-center justify-center text-muted hover:text-text cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Memories List */}
            {memoriesLoaded && memories.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted">
                No memories saved yet. Add preferences here or tell Framecode what to remember in chat.
              </div>
            ) : (
              <div className="space-y-2">
                {memories.map((m) => {
                  const isEditing = editingId === m.id;
                  return (
                    <div
                      key={m.id}
                      className="p-3 bg-surface-1 border border-border rounded-xl space-y-2"
                    >
                      {isEditing ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            maxLength={240}
                            className="flex-1 min-h-[44px] lg:min-h-[34px] bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-base lg:text-xs text-text focus:outline-none focus:border-accent"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(m.id)}
                            className="min-h-[44px] lg:min-h-[34px] px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditingText('');
                            }}
                            className="min-h-[44px] lg:min-h-[34px] px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs text-muted hover:text-text cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0 flex-1">
                            <p className="text-xs text-text leading-relaxed break-words">
                              {m.text}
                            </p>
                            <div className="flex items-center space-x-2 text-[10px] text-muted">
                              <span
                                className={`px-1.5 py-0.5 rounded font-medium ${
                                  m.source === 'ai'
                                    ? 'bg-accent-soft text-accent-text'
                                    : 'bg-surface-3 text-text'
                                }`}
                              >
                                {m.source === 'ai' ? 'AI' : 'You'}
                              </span>
                              <span className="font-mono">
                                {formatMemoryDate(m.updatedAt || m.createdAt)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(m)}
                              className="flex h-9 w-9 items-center justify-center text-muted hover:text-text hover:bg-surface-2 rounded-md transition cursor-pointer"
                              title="Edit memory"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteMemoryId(m.id)}
                              className="flex h-9 w-9 items-center justify-center text-muted hover:text-danger hover:bg-danger/10 rounded-md transition cursor-pointer"
                              title="Delete memory"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Delete Memory Confirm Modal */}
      {deleteMemoryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-xs">
          <div className="bg-surface-2 border border-border rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-text">Delete this memory?</h3>
            <p className="text-xs text-muted">
              Framecode will no longer use this fact in future chats.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteMemoryId(null)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-border bg-surface-1 text-xs font-medium text-text hover:bg-surface-3 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMemory}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-danger hover:bg-danger/90 text-xs font-medium text-white transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Memories Confirm Modal */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-xs">
          <div className="bg-surface-2 border border-border rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-text">Clear all memories?</h3>
            <p className="text-xs text-muted">This cannot be undone.</p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-border bg-surface-1 text-xs font-medium text-text hover:bg-surface-3 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-danger hover:bg-danger/90 text-xs font-medium text-white transition cursor-pointer"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
