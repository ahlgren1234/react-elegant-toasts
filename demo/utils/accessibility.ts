import type { ToasterProps, ToastPosition, toast } from 'react-elegant-toasts';

// The accessibility guidance (P-25 S6a). Every claim the section makes is here, with an ID, and
// `accessibility.test.ts` checks each ID against the library's own source: a claim without
// evidence, or evidence without a claim, fails. The copy claims nothing beyond the P-16 and P-22
// evidence (D-22).

/** The public `toast` API, so the practice toasts can be run against the library in tests. */
export type ToastApi = typeof toast;

/** One keyboard behaviour: the keys, or the situation when no key is pressed, and its effect. */
export interface KeyboardClaim {
  readonly id: 'hotkey' | 'tab' | 'escape' | 'focus-pause' | 'closing';
  /** Key combinations, each a list of keys held together. Empty when `when` describes it. */
  readonly keys: readonly (readonly string[])[];
  readonly when?: string;
  readonly text: string;
}

/** The default hotkey, as the toast region advertises it in `aria-keyshortcuts`. */
export const HOTKEY = ['Alt', 'T'] as const;

export const KEYBOARD: readonly KeyboardClaim[] = [
  {
    id: 'hotkey',
    keys: [HOTKEY],
    text: 'Moves focus to the first toast: the top one of its stack, and a stack at the top of the screen before one at the bottom.',
  },
  {
    id: 'tab',
    keys: [['Tab'], ['Shift', 'Tab']],
    text: 'Move through the buttons of each toast in turn. There is no focus trap: Tab carries on past the last toast.',
  },
  {
    id: 'escape',
    keys: [['Escape']],
    text: 'Returns focus to where it was before Alt+T. It closes nothing: the toast stays.',
  },
  {
    id: 'focus-pause',
    keys: [],
    when: 'Focus in a toast',
    text: 'Pauses that toast’s timer until focus leaves.',
  },
  {
    id: 'closing',
    keys: [],
    when: 'A focused toast closes',
    text: 'Focus moves to the same button on the next toast, or to the next toast itself. Failing that, to the previous toast, then to the toast region, never to the top of the page.',
  },
];

/** One change reduced motion makes, as the library's stylesheet applies it. */
export interface MotionClaim {
  readonly id: 'enter-exit' | 'spinner' | 'stack' | 'swipe' | 'progress';
  readonly text: string;
}

export const REDUCED_MOTION: readonly MotionClaim[] = [
  { id: 'enter-exit', text: 'Toasts appear and leave at once, with no movement and no fade.' },
  { id: 'spinner', text: 'The loading spinner stands still.' },
  { id: 'stack', text: 'When a toast leaves, the others take their new places at once.' },
  {
    id: 'swipe',
    text: 'A swiped toast springs back, or leaves from where it was let go, with no travel.',
  },
  {
    id: 'progress',
    text: 'The progress bar still counts down: it shows the time left, so it is not decoration.',
  },
];

/** One swipe behaviour. */
export interface SwipeClaim {
  readonly id: 'pointers' | 'commit' | 'scroll' | 'controls' | 'reason';
  readonly text: string;
}

export const SWIPE: readonly SwipeClaim[] = [
  {
    id: 'pointers',
    text: 'Touch and pen drag a toast sideways. A mouse never drags one: use its close button.',
  },
  {
    id: 'commit',
    text: 'Drag far enough, or flick, and the toast is dismissed. A shorter, slower drag springs back.',
  },
  { id: 'scroll', text: 'A vertical drag that starts on a toast scrolls the page as usual.' },
  { id: 'controls', text: 'A swipe never starts on a button or link, or while text is selected.' },
  { id: 'reason', text: 'A swiped toast calls its onDismiss with the reason "swipe".' },
];

/** Which physical way a toast at each position is swiped. RTL never changes it. */
export const SWIPE_WAYS: readonly {
  readonly positions: readonly ToastPosition[];
  readonly label: string;
  readonly way: 'left' | 'right' | 'either';
  readonly text: string;
}[] = [
  {
    positions: ['top-left', 'bottom-left'],
    label: 'Left positions',
    way: 'left',
    text: 'Toward the left edge',
  },
  {
    positions: ['top-center', 'bottom-center'],
    label: 'Centre positions',
    way: 'either',
    text: 'Left or right',
  },
  {
    positions: ['top-right', 'bottom-right'],
    label: 'Right positions',
    way: 'right',
    text: 'Toward the right edge',
  },
];

type LabelName = keyof NonNullable<ToasterProps['labels']>;

/** The Toaster's `labels`, with the default each one keeps when it is left out. */
export const LABELS: readonly {
  readonly name: LabelName;
  readonly fallback: string;
  readonly use: string;
}[] = [
  { name: 'region', fallback: 'Notifications', use: 'Names the toast region, a landmark' },
  { name: 'close', fallback: 'Close notification', use: 'Names every library close button' },
  { name: 'warningPrefix', fallback: 'Warning:', use: 'Read before a warning; never shown' },
  { name: 'errorPrefix', fallback: 'Error:', use: 'Read before an error; never shown' },
];

/** One part of how toasts are announced. */
export interface AnnouncementClaim {
  readonly id: 'politeness' | 'once' | 'text' | 'custom';
  readonly text: string;
}

export const ANNOUNCEMENTS: readonly AnnouncementClaim[] = [
  {
    id: 'politeness',
    text: 'Toasts are announced politely, after what the screen reader is saying. Errors interrupt.',
  },
  {
    id: 'once',
    text: 'Each toast is announced once when it appears, and again when it is updated by its ID.',
  },
  {
    id: 'text',
    text: 'A toast reads as its message and description. Its icon is silent; its buttons are not read.',
  },
  {
    id: 'custom',
    text: 'A custom toast reads as all of its text content, except the library close button.',
  },
];

/**
 * The practice toasts. Persistent, so there is time to try the keys, with the library close
 * button, so each can be closed from the keyboard. Fixed IDs, so showing them again replaces them.
 */
export const PRACTICE = [
  {
    id: 'a11y-practice-tab',
    message: 'Practice: move with Tab',
    description: 'Tab reaches this toast’s buttons, and Shift+Tab goes back.',
    action: 'Done',
  },
  {
    id: 'a11y-practice-escape',
    message: 'Practice: return with Escape',
    description: 'Escape takes focus back to where it was. Nothing closes.',
  },
] as const;

/** Shows the practice toasts at the Toaster's position. */
export function showPracticeToasts(api: ToastApi): void {
  for (const practice of PRACTICE) {
    api(practice.message, {
      id: practice.id,
      description: practice.description,
      duration: Infinity,
      closeButton: true,
      ...('action' in practice && {
        action: { label: practice.action, onClick: () => undefined },
      }),
    });
  }
}
