'use client';
// Calls toast() from client code, as §23 documents.
import { toast } from 'react-elegant-toasts';

export const FIXTURE_TOAST = 'Saved by the Next.js fixture';
// A finite toast with progress on, for the direction check (Issue #45).
export const PROGRESS_TOAST = 'Progress from the Next.js fixture';

export function ShowToast() {
  return (
    <button type="button" onClick={() => toast.success(FIXTURE_TOAST)}>
      Show a toast
    </button>
  );
}

export function ShowProgressToast() {
  return (
    <button
      type="button"
      onClick={() => toast.info(PROGRESS_TOAST, { duration: 8000, progress: true })}
    >
      Show a progress toast
    </button>
  );
}
