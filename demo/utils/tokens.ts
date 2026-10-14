// The CSS token reference (P-25 S6b). The names, purposes and groups are written here; every value
// is read from the library's stylesheet text, so the reference shows what ships. The tests compare
// these names with the tokens the stylesheet declares, so a token added, removed or renamed there
// fails them until the reference follows.

export interface TokenInfo {
  readonly name: `--ret-${string}`;
  /** What the token styles. */
  readonly purpose: string;
  /** Anything a consumer needs to know before overriding it. */
  readonly note?: string;
}

export interface TokenGroup {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly tokens: readonly TokenInfo[];
}

const accent = (type: string, label: string, note?: string): TokenInfo[] => [
  {
    name: `--ret-${type}`,
    purpose: `${label} toast icon glyph.`,
    ...(note === undefined ? {} : { note }),
  },
  { name: `--ret-${type}-subtle`, purpose: `${label} toast icon tint, behind the glyph.` },
];

export const TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    id: 'surface',
    title: 'Card and text',
    summary: 'The neutral card every normal toast shares, and the focus ring.',
    tokens: [
      { name: '--ret-surface', purpose: 'Card background, and the halo of the region focus ring.' },
      { name: '--ret-text', purpose: 'Title text, and the close button on hover.' },
      {
        name: '--ret-text-muted',
        purpose: 'Description text, the close button and an untyped icon.',
      },
      { name: '--ret-border', purpose: 'The card’s 1px border.' },
      { name: '--ret-shadow', purpose: 'The card’s elevation, as a box-shadow value.' },
      {
        name: '--ret-focus',
        purpose: 'Focus ring of the region, each toast and the action and close buttons.',
        note: 'Keep it at 3:1 or more against --ret-surface.',
      },
    ],
  },
  {
    id: 'action',
    title: 'Action button',
    summary: 'The one filled button a toast can carry.',
    tokens: [
      { name: '--ret-action-surface', purpose: 'Action button background.' },
      { name: '--ret-action-text', purpose: 'Action button label.' },
    ],
  },
  {
    id: 'accents',
    title: 'Type accents',
    summary: 'Each type colours only its icon: a glyph on a tint of the same family.',
    tokens: [
      ...accent('success', 'Success'),
      ...accent('error', 'Error'),
      ...accent('warning', 'Warning'),
      ...accent('info', 'Info'),
      ...accent('loading', 'Loading', 'Neutral, so a pending toast reads as in progress.'),
    ],
  },
  {
    id: 'progress',
    title: 'Progress',
    summary: 'The strip along the card’s bottom edge, when progress is on.',
    tokens: [
      {
        name: '--ret-progress',
        purpose: 'Progress fill colour, the same for every type.',
        note: 'Keep it at 3:1 or more against --ret-surface.',
      },
      { name: '--ret-progress-height', purpose: 'Thickness of the progress strip.' },
    ],
  },
  {
    id: 'layout',
    title: 'Layout and type',
    summary: 'Shape, spacing and placement of the stacks.',
    tokens: [
      {
        name: '--ret-font-family',
        purpose: 'Font family of the toasts.',
        note: 'The family only: sizes and weights stay the library’s. inherit keeps your app’s font.',
      },
      { name: '--ret-radius', purpose: 'Card corner radius; the progress strip follows it.' },
      { name: '--ret-gap', purpose: 'Space between toasts in a stack.' },
      {
        name: '--ret-offset',
        purpose: 'Distance of each stack from the viewport edges.',
        note: 'The safe-area inset of each edge is added to it.',
      },
      {
        name: '--ret-width',
        purpose: 'Preferred width of a stack.',
        note: 'Narrow screens shrink it to fit between the offsets.',
      },
      { name: '--ret-z-index', purpose: 'Stacking order of the toast stacks above the page.' },
    ],
  },
  {
    id: 'motion',
    title: 'Motion',
    summary: 'How toasts enter and leave. Reduced motion removes the motion whatever these say.',
    tokens: [
      { name: '--ret-enter-duration', purpose: 'Length of the enter animation.' },
      {
        name: '--ret-exit-duration',
        purpose: 'Length of the exit animation, and of a swiped toast’s fly-out.',
        note: 'A toast keeps its place until its exit ends; 0ms removes it at once.',
      },
      { name: '--ret-enter-easing', purpose: 'Timing function of the enter animation.' },
      { name: '--ret-exit-easing', purpose: 'Timing function of the exit and the fly-out.' },
    ],
  },
];

/** Every documented token, in reference order. */
export const TOKENS: readonly TokenInfo[] = TOKEN_GROUPS.flatMap(group => group.tokens);

// The stylesheet's token blocks (§21): the light defaults on the toaster root, and the dark theme,
// which sets only the tokens that change. The `system` theme repeats the dark block inside a
// `prefers-color-scheme: dark` query, which the library's own tests keep identical.
const LIGHT_SELECTOR = ':where(.ret-toaster)';
const DARK_SELECTOR = ":where(.ret-toaster[data-theme='dark'])";

/** The custom properties declared in the first block for `selector`, with their values. */
function declarationsOf(css: string, selector: string): ReadonlyMap<string, string> {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = text.indexOf(`${selector} {`);
  if (start === -1) return new Map();
  const open = start + selector.length + 1;
  const body = text.slice(open + 1, text.indexOf('}', open));
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
      name!,
      value!.replace(/\s+/g, ' ').trim(),
    ])
  );
}

export interface TokenEntry extends TokenInfo {
  /** The default, which is also the light theme's value. */
  readonly light: string | undefined;
  /** The dark theme's value, or undefined when the token is the same in every theme. */
  readonly dark: string | undefined;
}

export interface TokenReferenceGroup extends Omit<TokenGroup, 'tokens'> {
  readonly tokens: readonly TokenEntry[];
}

/** The reference: each documented token with its values from the stylesheet text `css`. */
export function tokenReference(css: string): TokenReferenceGroup[] {
  const light = declarationsOf(css, LIGHT_SELECTOR);
  const dark = declarationsOf(css, DARK_SELECTOR);
  return TOKEN_GROUPS.map(group => ({
    ...group,
    tokens: group.tokens.map(token => ({
      ...token,
      light: light.get(token.name),
      dark: dark.get(token.name),
    })),
  }));
}

/** Whether a value is a colour a swatch can show. */
export const isSwatchColour = (value: string | undefined): value is string =>
  value !== undefined && /^#[0-9a-f]{6}$/i.test(value);

// The override model (§21), shown in the reference with a copy button. The tests check that it
// sets only public tokens, through the documented selectors.
export const OVERRIDE_EXAMPLE = `/* Every toast in a Toaster, in every theme. */
.ret-toaster {
  --ret-radius: 6px;
  --ret-width: 400px;
}

/* One theme only: theme="dark", and theme="system" in a dark colour scheme. */
.ret-toaster[data-theme='dark'] {
  --ret-surface: #1c1917;
}

@media (prefers-color-scheme: dark) {
  .ret-toaster[data-theme='system'] {
    --ret-surface: #1c1917;
  }
}

/* One toast, through its className option. Set colour pairs together, so they keep contrast. */
.receipt-toast {
  --ret-action-surface: #047857;
  --ret-action-text: #ffffff;
}
`;
