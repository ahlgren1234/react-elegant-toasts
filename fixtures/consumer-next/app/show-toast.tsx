'use client';
// Calls toast() from client code, as §23 documents.
import { toast } from 'react-elegant-toasts';

export const FIXTURE_TOAST = 'Saved by the Next.js fixture';

export function ShowToast() {
  return (
    <button type="button" onClick={() => toast.success(FIXTURE_TOAST)}>
      Show a toast
    </button>
  );
}
