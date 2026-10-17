// The README's Next.js client component (P-26 S4), the pattern N1 builds: a 'use client' module
// that calls toast() from an event handler. Comments may precede the directive.
// Type-checked here in F1 to F4; never imported.

// #region readme-next-client
// app/save-button.tsx
'use client';

import { toast } from 'react-elegant-toasts';

export function SaveButton() {
  return (
    <button type="button" onClick={() => toast.success('Saved')}>
      Save
    </button>
  );
}
// #endregion
