export type PersistenceState = 'persistent' | 'best-effort' | 'unknown';

/** Asks the browser to protect storage from eviction, then reports what it granted. */
export async function requestPersistence(): Promise<PersistenceState> {
  try {
    const storage = navigator.storage as StorageManager | undefined;
    if (!storage || typeof storage.persisted !== 'function') return 'unknown';
    if (typeof storage.persist === 'function') await storage.persist();
    return (await storage.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unknown';
  }
}
