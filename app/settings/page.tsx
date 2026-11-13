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

export default function SettingsPage() {
  const { status: keyStatus, loaded: keysLoaded, apply: applyKeyStatus } = useKeyStatus();

  const [cards, setCards] = useState<Record<ProviderId, KeyCardState>>({
    claude: { apiKey: '', showKey: false, loading: false, error: null, success: false },
    openrouter: { apiKey: '', showKey: false, loading: false, error: null, success: false },
    gemini: { apiKey: '', showKey: false, loading: false, error: null, success: false },
  });

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
    const initMemory = async () => {
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
    initMemory();
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
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Navigation */}
        <div className="flex items-center space-x-3">
          <Link
            href="/"
            className="p-2 rounded-lg bg-[#2A2927] border border-[#3A3835] hover:bg-[#3A3835] transition text-[#FAF9F5]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
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
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[#FAF9F5]">API Keys</h2>
          {providers.map((p) => {
            const pStatus = keyStatus[p.id];
            const isConfigured = pStatus?.connected ?? false;
            const last4 = pStatus?.last4;
            const card = cards[p.id];

            return (
              <div
                key={p.id}
                className="bg-[#2A2927] border border-[#3A3835] rounded-xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <ProviderLogo provider={p.id} className="w-5 h-5" />
                    <div>
                      <h3 className="text-sm font-medium text-[#FAF9F5]">{p.name}</h3>
                      <p className="text-xs text-[#A8A59E]">{p.description}</p>
                    </div>
                  </div>
                  {!keysLoaded ? (
                    <div className="w-24 h-6 rounded-full bg-[#1F1E1D] border border-[#3A3835] animate-pulse shrink-0" />
                  ) : (
                    <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#1F1E1D] border border-[#3A3835] rounded-full text-xs shrink-0">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isConfigured ? 'bg-emerald-500' : 'bg-[#3A3835]'
                        }`}
                      />
                      <span className="text-[#A8A59E] font-medium">
                        {isConfigured
                          ? last4
                            ? `Connected · ••••${last4}`
                            : 'Connected'
                          : 'Not Configured'}
                      </span>
                    </div>
                  )}
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
                            ? last4
                              ? `••••••••••••••••${last4}`
                              : '••••••••••••••••••••••••••••'
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
        </section>

        {/* Long-Term Memory Section */}
        <section
          id="memory"
          className="bg-[#2A2927] border border-[#3A3835] rounded-xl p-5 space-y-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-[#1F1E1D] border border-[#3A3835]">
                <Brain className="w-4 h-4 text-[#D97757]" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm font-semibold text-[#FAF9F5]">Memory</h2>
                  <span className="px-2 py-0.5 rounded-full bg-[#1F1E1D] border border-[#3A3835] text-[11px] text-[#A8A59E]">
                    {memoriesLoaded ? `${memories.length} saved` : 'Loading...'}
                  </span>
                </div>
                <p className="text-xs text-[#A8A59E] mt-0.5">
                  Framecode remembers helpful facts and preferences across chats. Stored locally in your browser&apos;s IndexedDB.
                </p>
              </div>
            </div>

            {/* Use Memory Switch */}
            <label className="flex items-center space-x-2 cursor-pointer shrink-0 select-none">
              <span className="text-xs text-[#A8A59E]">Use memory</span>
              <button
                type="button"
                role="switch"
                aria-checked={memoryOn}
                onClick={handleToggleMemoryEnabled}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                  memoryOn ? 'bg-[#D97757]' : 'bg-[#3A3835]'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#FAF9F5] transition-transform ${
                    memoryOn ? 'translate-x-4.5' : 'translate-x-1'
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
              className="flex-1 bg-[#1F1E1D] border border-[#3A3835] rounded-lg px-3 py-2 text-xs text-[#FAF9F5] placeholder-[#A8A59E] focus:outline-none focus:border-[#D97757]"
            />
            <button
              type="submit"
              disabled={!newMemoryText.trim()}
              className={`flex items-center space-x-1 px-3.5 py-2 rounded-lg text-xs font-medium transition ${
                newMemoryText.trim()
                  ? 'bg-[#D97757] hover:bg-[#D97757]/90 text-white cursor-pointer'
                  : 'bg-[#3A3835] text-[#A8A59E]/50 cursor-not-allowed'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          {/* Actions Bar: Export / Import / Clear all */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#3A3835]">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleExportMemories}
                disabled={memories.length === 0}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-[#33322F] text-xs text-[#FAF9F5] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5 text-[#A8A59E]" />
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
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-[#33322F] text-xs text-[#FAF9F5] transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#A8A59E]" />
                <span>Import</span>
              </button>
            </div>

            {memories.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-red-900/40 bg-[#1F1E1D] hover:bg-red-500/10 text-xs text-red-400 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear all</span>
              </button>
            )}
          </div>

          {memoryError && (
            <div className="flex items-center space-x-1.5 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{memoryError}</span>
            </div>
          )}

          {memoryNotice && (
            <div className="flex items-center justify-between p-2.5 bg-[#1F1E1D] border border-[#3A3835] rounded-lg text-xs text-[#FAF9F5]">
              <span>{memoryNotice}</span>
              <button
                type="button"
                onClick={() => setMemoryNotice(null)}
                className="text-[#A8A59E] hover:text-[#FAF9F5]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Memories List */}
          {memoriesLoaded && memories.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#A8A59E]">
              No memories saved yet. Add preferences here or tell Framecode what to remember in chat.
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => {
                const isEditing = editingId === m.id;
                return (
                  <div
                    key={m.id}
                    className="p-3 bg-[#1F1E1D] border border-[#3A3835] rounded-lg space-y-2"
                  >
                    {isEditing ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          maxLength={240}
                          className="flex-1 bg-[#2A2927] border border-[#3A3835] rounded-md px-2.5 py-1.5 text-xs text-[#FAF9F5] focus:outline-none focus:border-[#D97757]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(m.id)}
                          className="px-2.5 py-1.5 rounded-md bg-[#D97757] text-white text-xs font-medium hover:bg-[#D97757]/90 cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingText('');
                          }}
                          className="px-2.5 py-1.5 rounded-md border border-[#3A3835] bg-[#2A2927] text-xs text-[#A8A59E] hover:text-[#FAF9F5] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <p className="text-xs text-[#FAF9F5] leading-relaxed break-words">
                            {m.text}
                          </p>
                          <div className="flex items-center space-x-2 text-[10px] text-[#A8A59E]">
                            <span
                              className={`px-1.5 py-0.5 rounded font-medium ${
                                m.source === 'ai'
                                  ? 'bg-[#D97757]/15 text-[#D97757]'
                                  : 'bg-[#3A3835] text-[#FAF9F5]'
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
                            className="p-1.5 text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#2A2927] rounded-md transition cursor-pointer"
                            title="Edit memory"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteMemoryId(m.id)}
                            className="p-1.5 text-[#A8A59E] hover:text-red-400 hover:bg-red-500/10 rounded-md transition cursor-pointer"
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
      </div>

      {/* Delete Memory Confirm Modal */}
      {deleteMemoryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#2A2927] border border-[#3A3835] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-[#FAF9F5]">Delete this memory?</h3>
            <p className="text-xs text-[#A8A59E]">Framecode will no longer use this fact in future chats.</p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteMemoryId(null)}
                className="px-3.5 py-1.5 rounded-lg border border-[#3A3835] bg-[#1F1E1D] text-xs font-medium text-[#FAF9F5] hover:bg-[#33322F] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMemory}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-medium text-white transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Memories Confirm Modal */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#2A2927] border border-[#3A3835] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-[#FAF9F5]">Clear all memories?</h3>
            <p className="text-xs text-[#A8A59E]">This cannot be undone.</p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="px-3.5 py-1.5 rounded-lg border border-[#3A3835] bg-[#1F1E1D] text-xs font-medium text-[#FAF9F5] hover:bg-[#33322F] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-medium text-white transition cursor-pointer"
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
