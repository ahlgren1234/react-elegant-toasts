// The exports map blocks deep imports, so TypeScript must not resolve this path.
// Not imported by main.ts, so Vite never bundles it.
// @ts-expect-error -- dist/ is not part of the package contract
import type { ToastProps as DeepToastProps } from 'react-elegant-toasts/dist/index.js';

export type { DeepToastProps };
