import type { ToastId } from '../types';

let fallbackCount = 0;

/**
 * Returns an ID that `isTaken` does not report as stored. Uses `crypto.randomUUID()` where it exists
 * (it is undefined in insecure contexts), otherwise a deterministic module-local counter.
 */
export function generateId(isTaken: (id: ToastId) => boolean): ToastId {
  for (;;) {
    const id =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `ret-${++fallbackCount}`;
    if (!isTaken(id)) return id;
  }
}

export function resetIds(): void {
  fallbackCount = 0;
}
