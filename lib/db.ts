import { ChatSession, LibraryItem, Memory } from '@/types/framecode';

const DB_NAME = 'framecode';
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;
let hasRequestedPersistence = false;

function requestStoragePersistence() {
  if (hasRequestedPersistence) return;
  hasRequestedPersistence = true;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {
      // Ignore result per specification
    });
  }
}

export function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('Storage is unavailable in this browser mode.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('chats')) {
          db.createObjectStore('chats', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('library')) {
          const libStore = db.createObjectStore('library', { keyPath: 'id' });
          libStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
        if (!db.objectStoreNames.contains('thumbs')) {
          db.createObjectStore('thumbs');
        }
        if (!db.objectStoreNames.contains('memories')) {
          db.createObjectStore('memories', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(new Error('Storage is unavailable in this browser mode.'));
      };
    } catch {
      dbPromise = null;
      reject(new Error('Storage is unavailable in this browser mode.'));
    }
  });

  return dbPromise;
}

export function handleQuotaError(err: unknown): never {
  const errorName = err instanceof Error ? err.name : (err as { name?: string })?.name;
  if (errorName === 'QuotaExceededError' || errorName === 'NS_ERROR_DOM_QUOTA_REACHED') {
    throw new Error('Browser storage is full. Delete some items in the Library.');
  }
  if (err instanceof Error) {
    throw err;
  }
  throw new Error(String(err));
}

export async function loadChats(): Promise<ChatSession[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chats', 'readonly');
      const store = tx.objectStore('chats');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Storage is unavailable in this browser mode.'));
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function saveChat(chat: ChatSession): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chats', 'readwrite');
      const store = tx.objectStore('chats');
      const request = store.put(chat);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
    requestStoragePersistence();
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function deleteChat(id: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chats', 'readwrite');
      const store = tx.objectStore('chats');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function addLibraryItem(
  metaOrOptions: LibraryItem | { item: LibraryItem; blob: Blob; thumb?: Blob | null },
  blobArg?: Blob,
  thumbArg?: Blob | null
): Promise<void> {
  let meta: LibraryItem;
  let blob: Blob;
  let thumb: Blob | null | undefined;

  if ('item' in metaOrOptions && 'blob' in metaOrOptions) {
    meta = metaOrOptions.item;
    blob = metaOrOptions.blob;
    thumb = metaOrOptions.thumb;
  } else {
    meta = metaOrOptions as LibraryItem;
    blob = blobArg!;
    thumb = thumbArg;
  }

  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const stores = ['library', 'blobs'];
      if (thumb) stores.push('thumbs');

      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore('library').put(meta);
      tx.objectStore('blobs').put(blob, meta.id);
      if (thumb) {
        tx.objectStore('thumbs').put(thumb, meta.id);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject((e.target as IDBRequest).error);
    });
    requestStoragePersistence();
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function listLibrary(): Promise<LibraryItem[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('library', 'readonly');
      const store = tx.objectStore('library');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Storage is unavailable in this browser mode.'));
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function getBlob(id: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('blobs', 'readonly');
      const store = tx.objectStore('blobs');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Storage is unavailable in this browser mode.'));
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function getThumb(id: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('thumbs', 'readonly');
      const store = tx.objectStore('thumbs');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Storage is unavailable in this browser mode.'));
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function deleteLibraryItem(id: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['library', 'blobs', 'thumbs'], 'readwrite');
      tx.objectStore('library').delete(id);
      tx.objectStore('blobs').delete(id);
      tx.objectStore('thumbs').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function dbLoadMemories(): Promise<Memory[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('memories', 'readonly');
      const store = tx.objectStore('memories');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Storage is unavailable in this browser mode.'));
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function dbPutMemory(memory: Memory): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      const request = store.put(memory);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
    requestStoragePersistence();
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function dbDeleteMemory(id: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}

export async function dbClearMemories(): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (err) {
    return handleQuotaError(err);
  }
}
