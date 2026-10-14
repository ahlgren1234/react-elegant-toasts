// The page's install command and its sections (P-25 S7). Tests check the command against the
// package's name and each section against the component that renders it.

/** The package's one install step. React and React DOM are peers an app already has. */
export const INSTALL_COMMAND = 'npm install react-elegant-toasts';

/**
 * The in-page navigation, in page order. Each `id` is a section's own ID, and each label is that
 * section's eyebrow, so a link reads as the place it leads to.
 */
export const SECTIONS = [
  { id: 'playground', label: 'Playground' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'custom', label: 'Custom toast' },
  { id: 'theming', label: 'Theming' },
  { id: 'accessibility', label: 'Accessibility' },
] as const;
