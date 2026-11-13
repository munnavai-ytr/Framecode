import { Memory, MemoryOp } from '@/types/framecode';
import {
  dbLoadMemories,
  dbPutMemory,
  dbDeleteMemory,
  dbClearMemories,
} from './db';

const MEMORY_ENABLED_KEY = 'fc_memory_enabled';
const MAX_MEMORY_LENGTH = 240;

export function isMemoryEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(MEMORY_ENABLED_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

export function setMemoryEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MEMORY_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

export function containsSecret(text: string): boolean {
  if (!text) return false;
  if (/sk-[A-Za-z0-9_-]{8,}/.test(text)) return true;
  if (/AIza[A-Za-z0-9_-]{8,}/.test(text)) return true;
  if (/eyJ[A-Za-z0-9_-]{10,}/.test(text)) return true;
  if (/\bpassword\b/i.test(text)) return true;
  // Long random-looking contiguous token (24+ alphanumeric/_/- characters)
  if (/\b[A-Za-z0-9_-]{24,}\b/.test(text)) return true;
  return false;
}

function sanitizeMemoryText(raw: string): string {
  return raw.trim().slice(0, MAX_MEMORY_LENGTH);
}

export async function loadMemories(): Promise<Memory[]> {
  const list = await dbLoadMemories();
  return [...list].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt).getTime();
    const tb = new Date(b.updatedAt || b.createdAt).getTime();
    return tb - ta;
  });
}

export async function addMemory(
  rawText: string,
  source: 'user' | 'ai' = 'user',
  chatId?: string
): Promise<Memory | null> {
  const text = sanitizeMemoryText(rawText);
  if (!text || containsSecret(text)) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const memory: Memory = {
    id: `mem-${crypto.randomUUID()}`,
    text,
    createdAt: nowIso,
    updatedAt: nowIso,
    source,
    ...(chatId ? { chatId } : {}),
  };

  await dbPutMemory(memory);
  return memory;
}

export async function updateMemory(id: string, rawText: string): Promise<Memory | null> {
  const text = sanitizeMemoryText(rawText);
  if (!text || containsSecret(text)) {
    return null;
  }

  const all = await dbLoadMemories();
  const existing = all.find((m) => m.id === id);
  if (!existing) return null;

  const updated: Memory = {
    ...existing,
    text,
    updatedAt: new Date().toISOString(),
  };

  await dbPutMemory(updated);
  return updated;
}

export async function deleteMemory(id: string): Promise<void> {
  await dbDeleteMemory(id);
}

export async function clearMemories(): Promise<void> {
  await dbClearMemories();
}

export async function exportMemories(): Promise<string> {
  const memories = await loadMemories();
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      memories,
    },
    null,
    2
  );
}

export async function importMemories(
  jsonStr: string
): Promise<{ imported: number; skipped: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  let items: unknown[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { memories?: unknown[] }).memories)
  ) {
    items = (parsed as { memories: unknown[] }).memories;
  } else {
    throw new Error('File does not contain a valid memories list.');
  }

  const existing = await dbLoadMemories();
  const existingTexts = new Set(existing.map((m) => m.text.trim().toLowerCase()));

  let imported = 0;
  let skipped = 0;

  for (const entry of items) {
    const rawText =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object' && typeof (entry as { text?: unknown }).text === 'string'
        ? (entry as { text: string }).text
        : '';

    const text = sanitizeMemoryText(rawText);
    if (!text || containsSecret(text) || existingTexts.has(text.toLowerCase())) {
      skipped++;
      continue;
    }

    const rawSource =
      entry && typeof entry === 'object' && (entry as { source?: unknown }).source === 'ai'
        ? 'ai'
        : 'user';

    const nowIso = new Date().toISOString();
    const memory: Memory = {
      id: `mem-${crypto.randomUUID()}`,
      text,
      createdAt:
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { createdAt?: unknown }).createdAt === 'string'
          ? (entry as { createdAt: string }).createdAt
          : nowIso,
      updatedAt: nowIso,
      source: rawSource,
    };

    await dbPutMemory(memory);
    existingTexts.add(text.toLowerCase());
    imported++;
  }

  return { imported, skipped };
}

export function buildMemoryContext(memories: Memory[]): Array<{ id: string; text: string }> {
  return [...memories]
    .sort((a, b) => {
      const ta = new Date(a.updatedAt || a.createdAt).getTime();
      const tb = new Date(b.updatedAt || b.createdAt).getTime();
      return tb - ta;
    })
    .slice(0, 40)
    .map((m) => ({ id: m.id, text: m.text }));
}

export async function applyMemoryOps(
  ops: MemoryOp[],
  chatId?: string
): Promise<string[]> {
  if (!Array.isArray(ops) || ops.length === 0) return [];

  const capped = ops.slice(0, 3);
  const existing = await dbLoadMemories();
  const changes: string[] = [];

  for (const op of capped) {
    if (!op || !op.op) continue;

    if (op.op === 'add' && typeof op.text === 'string') {
      const clean = sanitizeMemoryText(op.text);
      if (!clean || containsSecret(clean)) continue;

      const duplicate = existing.find(
        (m) => m.text.trim().toLowerCase() === clean.toLowerCase()
      );
      if (duplicate) continue;

      const added = await addMemory(clean, 'ai', chatId);
      if (added) {
        existing.push(added);
        changes.push(`Saved: ${added.text}`);
      }
    } else if (op.op === 'update' && op.id && typeof op.text === 'string') {
      const clean = sanitizeMemoryText(op.text);
      if (!clean || containsSecret(clean)) continue;

      const updated = await updateMemory(op.id, clean);
      if (updated) {
        changes.push(`Updated: ${updated.text}`);
      }
    } else if (op.op === 'delete' && op.id) {
      const target = existing.find((m) => m.id === op.id);
      if (target) {
        await deleteMemory(op.id);
        changes.push(`Forgot: ${target.text}`);
      }
    }
  }

  return changes;
}
