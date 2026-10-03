import { useEffect } from 'react';
import { setGlobalPause } from '../store/store';

// Window focus and document visibility, which pause every toast (§10). Only the active Toaster
// listens, so a waiting one attaches and seeds nothing. Both reasons survive detach (P-11), so the
// new owner seeds both, on and off, before listening. Cleanup removes the listeners and leaves the
// reasons: they describe the environment, and clearing them could resume timers for a moment.
// Nothing is visible when a Toaster becomes active, so no timer runs before the seed.
export function useEnvironmentPause(owner: boolean): void {
  useEffect(() => {
    if (!owner) return;
    const onBlur = () => setGlobalPause('window-blur', true);
    const onFocus = () => setGlobalPause('window-blur', false);
    const onVisibilityChange = () => setGlobalPause('document-hidden', document.hidden);

    setGlobalPause('window-blur', !document.hasFocus());
    onVisibilityChange();
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [owner]);
}
