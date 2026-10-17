# Theming and styling

See the [README](../README.md) for installation, the quick start and the API.

This is the styling reference for react-elegant-toasts 2.x. The library ships one plain CSS file. You customise it through CSS custom properties (the `--ret-*` tokens), the documented `ret-*` classes and data attributes, and a `className` on the Toaster or on a toast.

Only what this page documents is public. Anything else is an implementation detail and can change in any release: other `ret-*` classes, keyframe names, the element structure inside a toast or the region, inline styles, and the library's values for properties that are not tokens, such as font sizes, weights and padding.

## Contents

- [Loading the stylesheet](#loading-the-stylesheet)
- [Choosing a theme](#choosing-a-theme)
- [Overriding tokens](#overriding-tokens)
- [Token reference](#token-reference)
- [Classes and data attributes](#classes-and-data-attributes)
- [Styling one toast](#styling-one-toast)
- [Custom toasts](#custom-toasts)
- [Progress](#progress)
- [Motion and reduced motion](#motion-and-reduced-motion)
- [Forced colours](#forced-colours)
- [Limitations and ownership](#limitations-and-ownership)

## Loading the stylesheet

Import the stylesheet once, in code your bundler processes, such as the app's entry module or a Next.js root layout:

<!-- example: theming-setup -->

```tsx
import 'react-elegant-toasts/styles.css';
import { Toaster, toast } from 'react-elegant-toasts';

export function App() {
  return <Toaster theme="system" />;
}
```

- `react-elegant-toasts/styles.css` is the only stylesheet path. The package's `exports` map blocks paths into its build output, so do not import files from the package's `dist` folder.
- The library injects no styles at runtime and loads no web fonts. Toasts use your application's font family unless you set `--ret-font-family`.
- The region's hidden live regions also carry inline styles that hide them without the stylesheet. A Content Security Policy whose `style-src` blocks inline `style` attributes also blocks those inline styles in server-rendered HTML, so in that case the stylesheet is what keeps the live regions hidden.

## Choosing a theme

The `theme` prop of `<Toaster />` takes `"light"`, `"dark"` or `"system"`, the default. It sets `data-theme` on the `.ret-toaster` element.

- `"system"` follows the operating system's colour scheme through `@media (prefers-color-scheme: dark)`, in CSS only. No JavaScript reads the preference and nothing re-renders, so server-rendered HTML and the first paint already match the user's scheme.
- Each theme also sets `color-scheme`, so native parts of the toasts follow it.
- The theme applies to the toasts only. If your application has its own theme switch, pass its value to `theme`; the library does not read your page's classes or attributes.

<!-- example: theming-toaster-class -->

```tsx
export function BrandedApp() {
  return <Toaster theme="dark" className="app-toaster" />;
}
```

The Toaster's `className` is added to the `.ret-toaster` element, so a rule for `.app-toaster` can set tokens for that Toaster.

## Overriding tokens

The tokens are declared on `.ret-toaster`, not on `:root`. A token set on `:root`, `html` or `body` has no effect, because the library's own declaration on `.ret-toaster` takes precedence over the inherited value. Set tokens on `.ret-toaster`, on the class you pass as the Toaster's `className`, or on a toast (see [Styling one toast](#styling-one-toast)).

The library's rules for the toaster and the toasts sit inside `:where()`, which has zero specificity, and none uses `!important`. A rule of yours with a class or attribute selector therefore wins, whatever the order of the stylesheets.

```css
/* Every toast, in every theme. */
.ret-toaster {
  --ret-radius: 6px;
  --ret-width: 400px;
}

/* The dark theme: theme="dark", and theme="system" in a dark colour scheme. */
.ret-toaster[data-theme='dark'] {
  --ret-surface: #1c1917;
}

@media (prefers-color-scheme: dark) {
  .ret-toaster[data-theme='system'] {
    --ret-surface: #1c1917;
  }
}
```

- A rule for `.ret-toaster` alone applies in every theme, because it outranks the library's dark-theme rule too.
- To change one theme only, cover both ways of reaching it: its `data-theme` value, and `data-theme='system'` inside the matching `prefers-color-scheme` media query, as above. For the light theme, use `[data-theme='light']` and `(prefers-color-scheme: light)`.
- Set colour pairs together, such as a text colour and the surface it sits on, so they keep their contrast.

## Token reference

There are 30 tokens. The colour tokens have a light value (the default, which also applies to `system` in a light colour scheme) and a dark value. The others are the same in every theme.

Every token can be set on the Toaster. All except the four stack tokens, `--ret-gap`, `--ret-offset`, `--ret-width` and `--ret-z-index`, can also be set on one toast. Those four are read by the stacks that hold the toasts, so setting them on a toast has no effect.

### Card and text

| Token              | Light                                                       | Dark                                                      | Styles                                                                                                                       |
| ------------------ | ----------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--ret-surface`    | `#ffffff`                                                   | `#27272a`                                                 | The card background, and the halo around the region's focus ring.                                                            |
| `--ret-text`       | `#18181b`                                                   | `#fafafa`                                                 | The message text, and the close button on hover.                                                                             |
| `--ret-text-muted` | `#52525b`                                                   | `#a1a1aa`                                                 | The description, the close button, and an icon on a default toast.                                                           |
| `--ret-border`     | `#e4e4e7`                                                   | `#3f3f46`                                                 | The card's 1px border.                                                                                                       |
| `--ret-shadow`     | `0 1px 2px rgb(0 0 0 / 0.05), 0 4px 12px rgb(0 0 0 / 0.08)` | `0 1px 2px rgb(0 0 0 / 0.3), 0 4px 16px rgb(0 0 0 / 0.4)` | The card's elevation, as a `box-shadow` value.                                                                               |
| `--ret-focus`      | `#2563eb`                                                   | `#93c5fd`                                                 | The focus rings of the region, each toast, and the action and close buttons. Keep it at 3:1 or more against `--ret-surface`. |

### Action button

| Token                  | Light     | Dark      | Styles                          |
| ---------------------- | --------- | --------- | ------------------------------- |
| `--ret-action-surface` | `#18181b` | `#fafafa` | The action button's background. |
| `--ret-action-text`    | `#ffffff` | `#18181b` | The action button's label.      |

### Type accents

Each type colours only its icon: a glyph in the accent colour on a subtle tint of the same family. The card itself stays neutral.

| Token                  | Light     | Dark      | Styles                                                                                              |
| ---------------------- | --------- | --------- | --------------------------------------------------------------------------------------------------- |
| `--ret-success`        | `#15803d` | `#4ade80` | The success icon's glyph.                                                                           |
| `--ret-success-subtle` | `#dcfce7` | `#1c3a28` | The success icon's tint.                                                                            |
| `--ret-error`          | `#b91c1c` | `#f87171` | The error icon's glyph.                                                                             |
| `--ret-error-subtle`   | `#fee2e2` | `#4a2326` | The error icon's tint.                                                                              |
| `--ret-warning`        | `#b45309` | `#fbbf24` | The warning icon's glyph.                                                                           |
| `--ret-warning-subtle` | `#fef3c7` | `#45351a` | The warning icon's tint.                                                                            |
| `--ret-info`           | `#1d4ed8` | `#60a5fa` | The info icon's glyph.                                                                              |
| `--ret-info-subtle`    | `#dbeafe` | `#1e3354` | The info icon's tint.                                                                               |
| `--ret-loading`        | `#52525b` | `#a1a1aa` | The loading icon's glyph. Neutral, so a pending toast reads as in progress rather than as a result. |
| `--ret-loading-subtle` | `#f4f4f5` | `#3f3f46` | The loading icon's tint.                                                                            |

A custom icon drawn in `currentColor` takes its type's accent. An icon with its own colours keeps them on the tint.

### Progress

| Token                   | Light     | Dark      | Styles                                                                                              |
| ----------------------- | --------- | --------- | --------------------------------------------------------------------------------------------------- |
| `--ret-progress`        | `#52525b` | `#a1a1aa` | The progress bar's colour, the same for every type. Keep it at 3:1 or more against `--ret-surface`. |
| `--ret-progress-height` | `3px`     | same      | The progress strip's thickness.                                                                     |

### Layout and type

| Token               | Default   | Styles                                                                                                                                         |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ret-font-family` | `inherit` | The toasts' font family. It sets the family only; sizes, weights and line heights stay the library's. `inherit` keeps your application's font. |
| `--ret-radius`      | `10px`    | The card's corner radius. The progress strip follows it.                                                                                       |
| `--ret-gap`         | `10px`    | The space between toasts in a stack. Stack token.                                                                                              |
| `--ret-offset`      | `16px`    | The distance between a stack and each viewport edge it is placed against. The edge's safe-area inset is added to it. Stack token.              |
| `--ret-width`       | `360px`   | A stack's preferred width. On narrow screens the stack shrinks to fit between the offsets. Stack token.                                        |
| `--ret-z-index`     | `9999`    | The stacking order of the stacks, and of the region's focus ring, above the page. Stack token.                                                 |

### Motion

| Token                  | Default                      | Styles                                                             |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `--ret-enter-duration` | `180ms`                      | The length of the enter animation.                                 |
| `--ret-exit-duration`  | `120ms`                      | The length of the exit animation, and of a swiped toast's fly-out. |
| `--ret-enter-easing`   | `cubic-bezier(0.2, 0, 0, 1)` | The timing function of the enter animation.                        |
| `--ret-exit-easing`    | `cubic-bezier(0.4, 0, 1, 1)` | The timing function of the exit and the fly-out.                   |

See [Motion and reduced motion](#motion-and-reduced-motion) for how the lifecycle uses them.

## Classes and data attributes

These classes and attributes are stable for 2.x. Use them as selectors; the [limitations](#limitations-and-ownership) below list the properties the library keeps for itself.

| Class                     | Element                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `.ret-toaster`            | The region `<Toaster />` renders. It carries `data-theme`, the Toaster's `className` and the tokens. It has no visible box of its own. |
| `.ret-toaster__list`      | The stack for one position. See [Per-position styling](#per-position-styling) for what it supports.                                    |
| `.ret-toast`              | The root of every toast, normal and custom. It carries `data-position`, `data-phase`, `data-paused` and the toast's `className`.       |
| `.ret-toast--default`     | A normal toast from `toast()`.                                                                                                         |
| `.ret-toast--success`     | A toast from `toast.success()`, or a promise toast that resolved.                                                                      |
| `.ret-toast--error`       | A toast from `toast.error()`, or a promise toast that rejected.                                                                        |
| `.ret-toast--warning`     | A toast from `toast.warning()`.                                                                                                        |
| `.ret-toast--info`        | A toast from `toast.info()`.                                                                                                           |
| `.ret-toast--loading`     | A toast from `toast.loading()`, or a pending promise toast.                                                                            |
| `.ret-toast--custom`      | A toast from `toast.custom()`.                                                                                                         |
| `.ret-toast__icon`        | The decorative icon slot of a normal toast, present only while an icon is shown.                                                       |
| `.ret-toast__content`     | The text column of a normal toast: the message and, when there is one, the description.                                                |
| `.ret-toast__description` | The description.                                                                                                                       |
| `.ret-toast__action`      | The action button.                                                                                                                     |
| `.ret-toast__close`       | The library's close button, on a normal toast or, when asked for, a custom one.                                                        |
| `.ret-toast__progress`    | The progress strip. See [Progress](#progress).                                                                                         |

A toast's type class follows its current type: it changes when a promise toast settles, or when a toast is replaced with another type.

| Attribute       | On                                    | Values                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-theme`    | `.ret-toaster`                        | `light`, `dark` or `system`.                                                                                                                                                                                                                    |
| `data-position` | `.ret-toaster__list` and `.ret-toast` | `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center` or `bottom-right`. Positions are physical: `top-right` stays at the right in a right-to-left page.                                                                        |
| `data-phase`    | `.ret-toast`                          | `entering`, `visible` or `exiting`. There is no timing guarantee: a phase can be short enough never to be seen, for example under reduced motion, so do not rely on observing every phase. Replacing an exiting toast returns it to `entering`. |
| `data-paused`   | `.ret-toast`                          | Present while the toast's finite auto-close countdown is held, on normal and custom toasts. It does not say why. It is never present on a persistent, loading or exiting toast.                                                                 |

### Per-position styling

`.ret-toaster__list` is a limited hook: use it with `data-position` to set the stack tokens for one position.

```css
/* Wider stacks at the centre positions only. */
.ret-toaster__list[data-position$='-center'] {
  --ret-width: 480px;
}
```

- A stack exists only while its position has toasts. The number and order of the stacks in the DOM are not part of the contract.
- `--ret-offset` on a stack moves it away from every viewport edge it is placed against: a `bottom-left` stack from both the bottom and the left edges.
- The library places the stacks. Do not change their `position`, `inset`, `display`, `flex-direction` or `margin`.

## Styling one toast

Every toast takes a `className`, which is added to its `.ret-toast` root next to the library's classes:

<!-- example: theming-toast-class -->

```tsx
toast.success('Payment received', { className: 'receipt-toast' });
```

```css
.receipt-toast {
  --ret-action-surface: #047857;
  --ret-action-text: #ffffff;
}
```

- Setting tokens on the toast's class changes that toast only. Every token except the four stack tokens works this way.
- `--ret-focus` set on a toast changes that toast's rings. The region's ring keeps the Toaster's value.
- You can style the documented classes inside that toast, such as `.receipt-toast .ret-toast__description`.
- There is no `style` option for a toast, and no map of class names for its parts.

## Custom toasts

`toast.custom()` renders your content inside a `.ret-toast.ret-toast--custom` root with no visual chrome: the library gives it no surface, border, shadow, padding, typography or type colour. You style the content. The library still positions, stacks, animates and swipes the root.

<!-- example: theming-custom -->

```tsx
toast.custom(
  <div className="sync-banner">
    <strong>Sync paused</strong>
    <p>Changes are saved on this device until you are back online.</p>
  </div>,
  { id: 'sync-status', className: 'sync-toast', closeButton: true }
);
```

```css
.sync-toast {
  color: #1e3a8a;
  --ret-focus: #1e3a8a;
}

.sync-banner {
  padding-block: 12px;
  padding-inline: 16px 40px;
  border: 1px solid #93c5fd;
  border-radius: 10px;
  background: #eff6ff;
}
```

- **Close button.** A custom toast has no close button unless you pass `closeButton: true`; the Toaster's `closeButton` prop does not apply. When present, the library's 24×24 button sits over your content in its top inline-end corner, 8px from both edges, so leave room for it, as the inline-end padding above does.
- **Close button colour.** The close button takes the toast root's `color`, so set `color` on the toast's `className`, not on your content: the button is your content's sibling, not its descendant. Its focus ring is drawn in that same colour, so it contrasts with your background as well as the glyph does.
- **Root focus ring.** When the hotkey or focus restoration focuses the toast, its ring is drawn just outside the toast in `--ret-focus`. The library cannot know what lies behind your toast, so set `--ret-focus` on the toast's `className` when the default does not contrast with the page.
- **Focus inside your content** is yours to style; no library rule reaches into it.
- **Library class names.** Do not give your own elements library class names. In particular, an outermost element of your content with the class `ret-toast__close` is left out of the toast's announcement; a nested element with that class is still announced.

## Progress

Progress is off by default. Turn it on with the `progress` prop of `<Toaster />` or the `progress` option of a toast; the toast's option wins.

<!-- example: theming-progress -->

```tsx
toast.info('Uploading report.pdf', { duration: 8000, progress: true });
```

- The bar shows only on a normal toast with a finite duration: never on a custom, loading or persistent toast.
- It depletes with the auto-close countdown, holds while the countdown is held (`data-paused`) and continues from where it held.
- Style it with `--ret-progress` and `--ret-progress-height`. The strip runs along the card's bottom edge and follows `--ret-radius` at its corners. `.ret-toast__progress` selects the strip, for example to hide it or change its opacity; its position, size, clipping and overflow belong to the library, and the moving part inside it is not a public hook.
- The bar is decorative: it is hidden from assistive technology and cannot be focused.
- To anchor the strip, a normal toast's card is `position: relative`. An absolutely positioned element in a description or a custom icon is therefore positioned against the card.

**Right-to-left.** The remaining bar is anchored at the inline start: the left in a left-to-right page and the right in a right-to-left one, and it shrinks toward that edge. Direction comes from the DOM, such as a `dir` attribute on an ancestor; there is no direction prop. No library selector reads the direction or the language, so CSS minifiers that rewrite direction selectors, as default Vite 8 and Next.js 16 builds do, leave it unchanged. The browser test suite checks eleven direction cases, including `dir="auto"` and nested directions, in Chromium, Firefox and WebKit in both themes, and package validation checks the built Vite 8 and Next.js 16 consumer apps in Chromium.

## Motion and reduced motion

A toast enters from its anchored edge, from above at top positions and from below at bottom ones, and exits in reverse. The motion uses the individual `translate` and `scale` properties and opacity.

- The four motion tokens set the enter and exit timing, on the Toaster or on one toast.
- The lifecycle follows the resolved values: a longer exit keeps the toast, and its place in the stack, for that much longer, and `0ms` removes the motion.
- `--ret-exit-duration` and `--ret-exit-easing` also time a swiped toast's fly-out, so overriding them changes both.
- When a stack gains or loses a toast, the others move smoothly to their new places. That timing is not a token and cannot be customised in 2.x.
- The keyframe animations are internal. Replacing them is not supported; change the timing through the tokens.

**Reduced motion.** Under `prefers-reduced-motion: reduce`, in CSS only:

- toasts appear and disappear without any motion, not even a fade;
- the loading spinner is still;
- toasts move to their new places in a stack at once;
- a swiped toast leaves from where it was released, with no fly-out;
- the progress bar keeps depleting, because it shows the remaining time rather than decorating.

The tokens keep their values; the stylesheet removes the motion instead. The automated browser tests check the enter and exit, the spinner, the stack moves and the swipe release under emulated reduced motion in Chromium, Firefox and WebKit.

## Forced colours

In a forced-colours mode, such as Windows contrast themes, the user's palette replaces the authored colours and removes shadows and tints. The stylesheet keeps the structure visible:

- a normal toast's card keeps a visible edge in `CanvasText`;
- the action button gains a border in `ButtonText`;
- the focus rings of the toasts, the action and close buttons and the region use `Highlight`, with the region ring's halo in `Canvas`;
- the progress bar is drawn in `CanvasText`, with no track behind it.

No authored colour is preserved and nothing opts out of forced colours. Each type stays recognisable by its icon's shape: the loading toast by its spinner, while a default toast has no type icon. A custom toast has no library edge, so give your content a border if it needs a visible boundary.

**What was verified.**

- **Emulated:** automated browser tests run with `forced-colors: active` emulation in Chromium, Firefox and WebKit. The engines' emulations differ from each other, and emulation is not a real contrast theme.
- **Real contrast theme:** a manual visual check on Windows 11 (26H2) with the Aquatic contrast theme, in Chrome 154 and Firefox 157.
- **Not verified:** other contrast themes, Microsoft Edge, and other platforms' contrast settings.

## Limitations and ownership

- **The toast root's `transform`** belongs to the library, which uses it to move toasts within a stack and during a swipe. A `transform` on the root, for example through a toast's `className`, is not supported; apply transforms to an element inside custom content instead.
- **The toast root's transitions** belong to the library too. Animate an element inside your content instead. If you do set transitions on the root:
  - When a stack's toasts change, each moved toast's root briefly has its transitions switched off. A transition of yours running on that root at that moment, on any property, jumps to its end.
  - A rule that replaces `transition-property` on the root turns off the smooth move for that toast: the toast still ends in the right place, without the move. List `transform` alongside your own property to keep it.
  - A `transition-duration` or `transition-timing-function` on the root that wins the cascade changes the move's timing, and because the library's rules have zero specificity, it also overrides reduced motion, so the move animates even under `prefers-reduced-motion: reduce`.
- **During a swipe** the library also sets the root's opacity.
- **The region** has no box of its own. Use the Toaster's `className` for tokens and descendant rules, not to give the region a size, position or background.
- **Values that are not tokens**, such as font sizes, font weights, padding and spacing other than `--ret-radius` and `--ret-gap`, are not part of the contract. You can override them through the documented classes, but the library's values may change.
- **Not in 2.x:** an `@layer` contract, a map of class names for a toast's parts, and a per-toast `style` option.
- **No 0.x class or variable** carries over: every public name starts with `ret-` or `--ret-`.
