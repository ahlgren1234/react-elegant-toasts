// Built-in icons (§17.2, D-19): inline SVG, decorative, never announced and never focusable. Each
// type has a distinct shape, so type is not conveyed by colour alone. Neutral toasts have no icon.
// The loading icon is static until motion arrives (P-18).
import type { ReactElement, ReactNode } from 'react';
import type { ToastType } from '../types';

function Svg({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const ICONS: Partial<Record<ToastType, ReactElement>> = {
  success: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </Svg>
  ),
  error: (
    <Svg>
      <path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z" />
      <path d="m9 9 6 6m0-6-6 6" />
    </Svg>
  ),
  warning: (
    <Svg>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4m0 3h.01" />
    </Svg>
  ),
  info: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </Svg>
  ),
  loading: (
    <Svg>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Svg>
  ),
};

/** The built-in icon for a type, or undefined for types without one (neutral and custom). */
export const typeIcon = (type: ToastType): ReactElement | undefined => ICONS[type];

/** The close button's glyph. */
export const CLOSE_ICON = (
  <Svg>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);
