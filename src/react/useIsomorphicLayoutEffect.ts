import { useEffect, useLayoutEffect, type DependencyList, type EffectCallback } from 'react';
import { isServer } from '../store/env';

// A layout effect in the browser (§23). On the server neither kind runs, but React 18 warns about a
// layout effect there, so the passive one is used instead. The environment is checked when the
// hook is called, not at import, and it never changes within a process, so hook order is stable.
// Effects given to it must be idempotent: StrictMode replays them like any other effect. Without
// `deps` it runs after every commit, as the hooks it wraps do.
export function useIsomorphicLayoutEffect(effect: EffectCallback, deps?: DependencyList): void {
  (isServer() ? useEffect : useLayoutEffect)(effect, deps);
}
