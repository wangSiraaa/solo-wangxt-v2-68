import type { FrameItem, PackResult, Rect, Settings } from './types';

/** IndexedDB 中保存的项目记录；Blob 可被结构化克隆直接入库。 */
export interface StoredProject {
  version: 1;
  savedAt: number;
  settings: Settings;
  frames: {
    id: string;
    name: string;
    duration: number;
    width: number;
    height: number;
    trim: Rect | null;
    blob: Blob;
  }[];
  pack: PackResult | null;
}

const DB_NAME = 'sprite-atlas-tool';
const STORE = 'projects';
const KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('打开 IndexedDB 失败'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'));
    });
  } finally {
    db.close();
  }
}

export async function saveProject(record: StoredProject): Promise<void> {
  await withStore('readwrite', (s) => s.put(record, KEY));
}

export async function loadProject(): Promise<StoredProject | undefined> {
  const v = await withStore<StoredProject | undefined>('readonly', (s) => s.get(KEY));
  return v;
}

export async function clearProject(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(KEY));
}

export function toStoredProject(
  settings: Settings,
  frames: FrameItem[],
  pack: PackResult | null,
): StoredProject {
  return {
    version: 1,
    savedAt: Date.now(),
    settings: { ...settings },
    frames: frames.map((f) => ({
      id: f.id,
      name: f.name,
      duration: f.duration,
      width: f.width,
      height: f.height,
      trim: f.trim ? { ...f.trim } : null,
      blob: f.blob,
    })),
    pack,
  };
}
