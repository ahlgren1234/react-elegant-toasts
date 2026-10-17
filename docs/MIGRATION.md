# Migrating from 0.x → 2.0

This guide moves an application from react-elegant-toasts 0.x (0.1.0 to 0.1.2) to 2.0. Version 2.0.0 directly follows 0.1.x: **there was no 1.x**. 2.0 is a rewrite with a new API and a new stylesheet, and it has no compatibility layer, so every use of the 0.x API has to change. The [README](../README.md) documents 2.0 in full; this guide covers what is different.

Code examples marked **0.x** are historical. They show code written against the 0.1.2 package, for comparison only, and are neither type-checked nor tested. The 2.0 examples are type-checked against the package, and some are shared with the README.

## Contents

- [Before you start](#before-you-start)
- [Installing and importing](#installing-and-importing)
- [A minimal migration](#a-minimal-migration)
- [API mapping](#api-mapping)
- [Creating and replacing toasts](#creating-and-replacing-toasts)
- [Dismissing and callbacks](#dismissing-and-callbacks)
- [Positions, the queue and timers](#positions-the-queue-and-timers)
- [Styling](#styling)
- [Right-to-left and accessibility](#right-to-left-and-accessibility)
- [Next.js App Router](#nextjs-app-router)
- [Jest](#jest)
- [Vitest](#vitest)
- [Common pitfalls](#common-pitfalls)
- [Verification checklist](#verification-checklist)

## Before you start

- **React 18 or 19.** `react` and `react-dom` 18 or 19 are peer dependencies. 0.x accepted React 16.8 and later; 2.0 does not support React 16 or 17.
- **TypeScript 5.0 or later**, with `moduleResolution` set to `bundler`, `node16` or `nodenext`. 0.x stated no TypeScript requirement.
- **ESM only.** 2.0 has no CommonJS build, and loading it with `require()` is not supported. Bundlers such as Vite and Next.js and Node's native ESM load it. Test runners that load packages as CommonJS need configuration: see [Jest](#jest) and [Vitest](#vitest).
- **One Toaster.** Render one `<Toaster />`. A second one renders nothing and logs a warning in development.
- **Find the 0.x code.** Search for `ToastProvider`, `useToast`, `addToast`, `updateToast`, `removeToast`, `removeAll`, `ToastContainer`, the `Toast` component, the types `ToastProps`, `ToastAnimation`, `ToastProviderProps` and `ToastContextValue`, the stylesheet import `react-elegant-toasts/dist/styles.css`, and CSS that selects the 0.x classes, such as `.toast` and `.toast-container`.

## Installing and importing

Upgrade the `react-elegant-toasts` dependency to 2.0 with your package manager. Then:

- Replace the stylesheet import `react-elegant-toasts/dist/styles.css` with `react-elegant-toasts/styles.css`. Import it once, in code your bundler processes. The package's `exports` map blocks every path into its build output, so the 0.x path no longer resolves.
- Replace the default import, `import useToast from 'react-elegant-toasts'`, with named imports. 2.0 exports `Toaster` and `toast`, and no default export.

## A minimal migration

**0.x**, for comparison:

<!-- 0.x -->

```tsx
import { ToastProvider, useToast } from 'react-elegant-toasts';
import 'react-elegant-toasts/dist/styles.css';

export function App() {
  return (
    <ToastProvider>
      <SaveButton />
    </ToastProvider>
  );
}

function SaveButton() {
  const { addToast } = useToast();
  const save = () =>
    addToast({ type: 'success', title: 'Changes saved', message: 'Your profile is up to date.' });
  return (
    <button type="button" onClick={save}>
      Save
    </button>
  );
}
```

**2.0:**

<!-- example: migration-quick-start -->

```tsx
import 'react-elegant-toasts/styles.css';
import { Toaster, toast } from 'react-elegant-toasts';

export function App() {
  return (
    <>
      <SaveButton />
      <Toaster />
    </>
  );
}

function SaveButton() {
  const save = () => toast.success('Changes saved', { description: 'Your profile is up to date.' });
  return (
    <button type="button" onClick={save}>
      Save
    </button>
  );
}
```

- The provider is gone. Render `<Toaster />` once, near the root; it does not wrap your application.
- `toast` is imported, not taken from a hook. It works outside components, and before the Toaster has mounted: such toasts wait and appear once it mounts. 0.x's `useToast` threw outside `ToastProvider`.
- The type is a function: `type: 'success'` becomes `toast.success`.
- `title` becomes the content, the first argument, and `message` becomes the `description` option. A 0.x toast with only a `message` becomes `toast.success(message)`.

## API mapping

**Exact** means the same name and meaning, or a one-to-one replacement. **Conceptual** means a replacement that behaves differently: read the linked section. **Removed** means 2.0 has no direct replacement.

**Components and functions**

| 0.x                             | 2.0                                                                                       | Change     |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| `ToastProvider`                 | `<Toaster />`, rendered once and wrapping nothing                                         | Conceptual |
| `useToast()`                    | `import { toast } from 'react-elegant-toasts'`                                            | Conceptual |
| The default export (`useToast`) | Named imports only                                                                        | Removed    |
| `addToast({ type, title, … })`  | `toast.success(title, { description })` and the other type functions                      | Conceptual |
| `addToast` with no `type`       | `toast.info(…)`; a plain `toast()` is neutral, not info                                   | Conceptual |
| `updateToast(id, changes)`      | A creation call with `{ id }`, which [replaces](#replacing-instead-of-updating) the toast | Conceptual |
| `removeToast(id)`               | `toast.dismiss(id)`                                                                       | Exact      |
| `removeAll()`                   | `toast.dismiss()`                                                                         | Exact      |
| `Toast` and `ToastContainer`    | None. `toast.custom` shows your content inside the library's toast; it is not a component | Removed    |

**Toast options**

| 0.x                                 | 2.0                                                                              | Change     |
| ----------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| `type`                              | The type function: `toast.success`, `toast.error`, `toast.warning`, `toast.info` | Conceptual |
| `title` and `message` (strings)     | The content and `description` (any React node)                                   | Conceptual |
| `position`, `duration`, `className` | The same options                                                                 | Exact      |
| `duration: Infinity`                | The same: the toast is persistent                                                | Exact      |
| `icon`, where `null` hides it       | The same; icons are now hidden from assistive technology                         | Exact      |
| `onClose`                           | `onDismiss(toast, reason)` or `onAutoClose(toast)`; see [callbacks](#callbacks)  | Conceptual |
| `progressBar` (on by default)       | `progress` (off by default)                                                      | Conceptual |
| `pauseOnHover`                      | None: pausing is always on                                                       | Removed    |
| `closeOnClick`                      | None: clicking the body never dismisses; use the close button                    | Removed    |
| `animation`                         | None: there is one motion system                                                 | Removed    |
| `style`                             | None: use `className` and set `--ret-*` tokens on it                             | Removed    |
| `rtl`                               | None: direction comes from the page                                              | Removed    |
| `role`                              | None: the type sets how a toast is announced                                     | Removed    |

**Provider props**

| 0.x                                   | 2.0                                                                   | Change     |
| ------------------------------------- | --------------------------------------------------------------------- | ---------- |
| `defaultPosition`, `defaultDuration`  | `<Toaster position duration />`, with the same defaults               | Exact      |
| `maxToasts`                           | `<Toaster maxVisible />`, which counts per position and queues        | Conceptual |
| `containerClassName`                  | `<Toaster className />`, on the one region element                    | Conceptual |
| `containerStyle`                      | None: set tokens such as `--ret-z-index` on the Toaster's `className` | Removed    |
| `pauseOnPageIdle`, `pauseOnFocusLoss` | None: pausing is always on                                            | Removed    |
| `defaultAnimation`                    | None: there is one motion system                                      | Removed    |

**Types**

| 0.x                                                                       | 2.0                                                                                                           | Change     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- |
| `ToastPosition`                                                           | The same six positions                                                                                        | Exact      |
| `ToastType`                                                               | Adds `"default"`, `"loading"` and `"custom"`                                                                  | Conceptual |
| `ToastProps`, `ToastAnimation`, `ToastProviderProps`, `ToastContextValue` | None. `ToastOptions` and `ToasterProps` describe 2.0's options and props, but neither is a drop-in equivalent | Removed    |

## Creating and replacing toasts

### Types and content

- A 0.x toast with no `type` was an info toast. In 2.0 a plain `toast()` is a neutral toast of type `"default"`, so use `toast.info` to keep the info style and icon.
- 2.0 adds `toast.loading`, `toast.promise` and `toast.custom`. `ToastType` gains `"default"`, `"loading"` and `"custom"`, so an exhaustive `switch` over it must handle them.
- The content and the description can be any React node; in 0.x they were strings.
- `addToast` always returned an ID. A 2.0 creation call returns `ToastId | undefined`: it is `undefined` when the toast is rejected, on the server or when 100 toasts are already waiting for a `<Toaster />` to mount.
- You can choose a toast's ID with the `id` option. 0.x always generated it.

### Replacing instead of updating

`updateToast(id, changes)` merged the changes into the toast, kept its running timer, and did nothing when no toast had that ID. 2.0 has no update function. A creation call with the same `id` **replaces** the toast:

- The call is a new definition. Options it leaves out are not taken from the earlier call.
- The timer starts again with the new duration.
- If no toast has that ID, the call creates one.
- Replacing a toast calls neither `onDismiss` nor `onAutoClose`.

<!-- example: migration-replace -->

```ts
toast.loading('Uploading report.pdf', { id: 'upload', position: 'bottom-center' });

// The replacement keeps nothing it leaves out: repeat every option you still want.
toast.success('Report uploaded', { id: 'upload', position: 'bottom-center' });
```

**Loading toasts.** In 0.x a loading message was an ordinary toast that you updated later, and it closed after the default 5000 ms unless you set `duration: Infinity`. `toast.loading` stays until you replace or dismiss it. For work that is a promise, `toast.promise` does both steps:

<!-- example: readme-promise -->

```tsx
toast.promise(saveProject(), {
  loading: 'Saving project…',
  success: project => `Saved ${project.name}`,
  error: error => (error instanceof Error ? error.message : 'Could not save the project'),
});
```

## Dismissing and callbacks

`removeToast(id)` becomes `toast.dismiss(id)`, and `removeAll()` becomes `toast.dismiss()`. In 0.x the toast disappeared at once; in 2.0 it plays its exit animation first, and its `onDismiss` receives the reason `"programmatic"`.

<!-- example: readme-update-dismiss -->

```tsx
toast.loading('Uploading report.pdf', { id: 'upload' });

// Later: the same id replaces that toast. Options are not merged with the earlier call.
toast.success('Report uploaded', { id: 'upload' });

// Dismiss one toast by its id, or every toast.
toast.dismiss('upload');
toast.dismiss();

// A creation call returns undefined when it is rejected, so check the id before using it.
const id = toast('Link copied');
if (id) toast.dismiss(id);
```

- **Clicking.** 0.x dismissed a toast when its body was clicked (`closeOnClick`, on by default) and had no close button. In 2.0 clicking the body never dismisses. Every normal toast has a close button unless you pass `closeButton: false`, on the toast or on the Toaster.
- **Action.** 2.0 adds an `action` option: one button that dismisses the toast unless its handler calls `event.preventDefault()`.

### Callbacks

In 0.x a toast's `onClose` was never called: the container replaced it with its own handler. Code you moved from `onClose` will run for the first time in 2.0, so check that it is still what you want.

<!-- example: readme-callbacks -->

```tsx
toast('Export started', {
  onAutoClose: snapshot => console.log(`${snapshot.id} timed out`),
  onDismiss: (snapshot, reason) => console.log(`${snapshot.id} closed: ${reason}`),
});
```

`onDismiss` is called once for any removal, with the reason `"timeout"`, `"close-button"`, `"swipe"`, `"programmatic"` or `"action"`. `onAutoClose` is called only when the duration runs out, before `onDismiss`.

## Positions, the queue and timers

Provider props become props of `<Toaster />`:

<!-- example: readme-toaster -->

```tsx
export function ConfiguredToaster() {
  return (
    <Toaster
      position="bottom-right"
      maxVisible={3}
      duration={6000}
      progress
      theme="dark"
      className="app-toaster"
    />
  );
}
```

- **Defaults.** `defaultPosition` and `defaultDuration` become `position` and `duration`, with the same defaults: `"top-right"` and 5000 ms. A toast's own `position` and `duration` still override them.
- **The queue.** `maxToasts` (5 by default) counted toasts across all positions and silently deleted the oldest when there were too many. `maxVisible` (4 by default) counts each position separately; further toasts wait in that position's queue and appear as shown ones close, so none is dropped. A persistent toast keeps its place until it is dismissed, so a position full of persistent toasts holds its queue.
- **Order.** 0.x added each toast at the end of its position's container, so in top positions the newest toast was furthest from the edge. In 2.0 the newest toast is nearest the edge its position is anchored to.
- **Pausing.** In 0.x, `pauseOnHover` paused the hovered toast, and `pauseOnPageIdle` and `pauseOnFocusLoss` paused every toast through one shared flag; resuming restarted the full duration. In 2.0 a countdown resumes with the time it had left. It is held while the pointer is over the stack of toasts at that position (every toast in that stack), while keyboard focus is inside the toast, while the window does not have focus, and while the page is hidden. These pauses are always on and cannot be turned off.
- **Progress.** `progressBar` was on by default. `progress` is off by default; turn it on per toast or on the Toaster. Only toasts with a finite duration show it.
- **Motion.** `animation` and `defaultAnimation` are gone. 2.0 has one enter and exit motion, and none under the `prefers-reduced-motion: reduce` setting.
- **Container class and style.** `containerClassName` was added to each position's container. The Toaster's `className` goes on its one region element, `.ret-toaster`. There is no replacement for `containerStyle`: set the stack tokens on that class instead, for example the stacking order and the distance from the viewport edges:

```css
.app-toaster {
  --ret-z-index: 1000;
  --ret-offset: 24px;
}
```

## Styling

The 0.x classes and keyframes were global and unprefixed. 2.0's are prefixed with `ret-`, and only the documented classes, attributes and `--ret-*` tokens are a stable contract. The [theming reference](THEMING.md) lists them all.

| 0.x selector                                                      | 2.0                                                                                   | Change     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| `.toast`                                                          | `.ret-toast`                                                                          | Conceptual |
| `.toast.success`, `.toast.error`, `.toast.warning`, `.toast.info` | `.ret-toast--success`, `.ret-toast--error`, `.ret-toast--warning`, `.ret-toast--info` | Conceptual |
| `.toast-message`                                                  | `.ret-toast__content`, the text column                                                | Conceptual |
| `.toast-icon`                                                     | `.ret-toast__icon`                                                                    | Conceptual |
| `.toast-progress`                                                 | `.ret-toast__progress`, with the `--ret-progress` and `--ret-progress-height` tokens  | Conceptual |
| `.toast-container` and its position class, such as `.top-right`   | `.ret-toaster__list[data-position="top-right"]`, a limited hook for the stack tokens  | Conceptual |
| `.toast-title`, `.toast-content`, `.toast.rtl`                    | None                                                                                  | Removed    |
| The animation classes and keyframes, such as `.slideIn`           | None                                                                                  | Removed    |

The title has no class of its own in 2.0: it is the toast's content, styled through `.ret-toast__content` and the tokens. A 0.x `message` that you moved to `description` is styled through `.ret-toast__description`. The toast's other inner elements are not part of the CSS contract.

Set tokens rather than overriding the library's properties. **0.x**, for comparison:

<!-- 0.x -->

```css
.toast-container.top-right {
  z-index: 1000;
}
```

**2.0**, on the class passed as the Toaster's `className`:

```css
.app-toaster {
  --ret-z-index: 1000;
}
```

- **Type colours.** 0.x coloured the whole card by type. 2.0 colours only the icon, with tokens such as `--ret-success`, on a neutral card; see [type accents](THEMING.md#type-accents). There is no direct replacement for a card coloured by type. Tokens such as `--ret-surface` and `--ret-text` can be set on a type class such as `.ret-toast--success`, and keeping the contrast is then yours.
- The per-toast `style` option is gone. Pass a `className` and set tokens on it; see [styling one toast](THEMING.md#styling-one-toast).
- 0.x had dark colours only through a `prefers-color-scheme` media query. 2.0's `theme` prop chooses `"light"`, `"dark"` or `"system"`, the default, which follows that preference.

## Right-to-left and accessibility

- **Direction.** The per-toast `rtl` option is gone. A toast takes its direction from the page, such as a `dir` attribute on an ancestor, and mirrors its layout and progress bar. Positions are physical: `top-right` stays at the right in a right-to-left page.
- **Announcements.** 0.x gave every toast `role="alert"` unless you passed `role`. 2.0 announces toasts through live regions: politely, except errors, which are announced assertively. Choose the type by urgency, since `toast.error` interrupts.
- **Icons.** 0.x's icon glyphs were exposed to assistive technology. 2.0's icons are hidden from it.
- **Keyboard.** Alt+T moves focus to the toasts and Escape returns it. Escape never dismisses a toast. Toasts can also be swiped away on touch screens.

The [accessibility reference](ACCESSIBILITY.md) explains what the library does, what it leaves to you, and what was verified.

## Next.js App Router

**0.x**, as its README showed it. 0.x had no `"use client"` directive, so its provider had to sit in a Client Component of your own. This code is historical and was not tested with current Next.js versions.

<!-- 0.x -->

```tsx
// app/providers.tsx
'use client';

import { ToastProvider } from 'react-elegant-toasts';
import 'react-elegant-toasts/dist/styles.css';

export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**2.0.** The package is marked `"use client"`, so `<Toaster />` goes straight into the root layout, which stays a Server Component. Delete the providers file if it only held `ToastProvider`.

<!-- example: readme-next-layout -->

```tsx
// app/layout.tsx
import 'react-elegant-toasts/styles.css';
import type { ReactNode } from 'react';
import { Toaster } from 'react-elegant-toasts';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

Call `toast` from client code, such as an event handler in a Client Component:

<!-- example: readme-next-client -->

```tsx
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
```

- **On the server,** `<Toaster />` renders an empty region, so hydration matches. A toast call during server rendering is ignored and returns `undefined`, with a warning in development.
- **In a Server Component,** calling `toast` throws at request time, because it is a client function. Move the call into a Client Component.

Package validation builds and serves a Next.js 16 App Router app with this pattern, using React 19, and checks in Chromium that the region is empty on the server and that a toast appears. The two examples above are type-checked against the package.

## Jest

2.0 has no CommonJS build. Jest loads modules as CommonJS by default, and loading this package that way fails with "Must use import to load ES Module". The configuration below runs the tests as native ES modules instead. It is the `package.json` configuration of this package's Jest consumer test, which installs the packed package, renders a toast and removes it:

<!-- jest-config -->

```json
{
  "type": "module",
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"
  },
  "jest": {
    "testEnvironment": "jsdom",
    "moduleNameMapper": {
      "\\.css$": "<rootDir>/style-stub.js"
    }
  }
}
```

- **`"type": "module"`** makes the `.js` test files ES modules. It applies to every `.js` file in your package, so check your other `.js` files, such as configuration files, before you set it.
- **`--experimental-vm-modules`.** Jest runs ES modules through Node's VM modules API, which Node provides only behind this flag. Without it, Jest loads the tests as CommonJS and fails as above. Jest's ESM support is experimental, and Node prints an experimental warning.
- **`testEnvironment: "jsdom"`** needs the `jest-environment-jsdom` package installed next to Jest.
- **The CSS mapping** is needed only when the code under test imports a stylesheet, such as `react-elegant-toasts/styles.css`. Jest resolves that import to the real CSS file and then fails to parse it as JavaScript. The mapping replaces every `.css` import with a stub module, the fixture's [style-stub.js](../fixtures/consumer-jest/style-stub.js), which is `export default {}`. The package's JavaScript imports no CSS itself.
- **No transform.** The tests are plain JavaScript modules with no JSX or TypeScript, as in the fixture's [toaster.test.js](../fixtures/consumer-jest/toaster.test.js).

**Tested scope:** Jest 30.5.2 with `jest-environment-jsdom` 30.5.2, React 19.3.0, on Node 24 and Node 26. Not tested: test files that need a JSX or TypeScript transform, Babel or ts-jest, module mocking in ESM mode, and other Jest versions.

**What this does not cover:**

- **`transformIgnorePatterns` alone does not help.** It only lets a transform reach this package; without a Babel configuration that compiles ES modules, the package fails to load the same way. A Babel-based transform is a separate approach that is not tested, and this guide gives no configuration for it.
- **`require()` is not a migration path.** CommonJS is not part of the package's contract. Under the flag, whether Jest can `require()` the package depends on the Jest 30 minor version: it failed with 30.3.0 and worked with 30.4.2. It is neither supported nor tested.

## Vitest

Vitest runs test files as ES modules, so it normally needs nothing like Jest's flag. There is no Vitest consumer test of this package: the evidence is the library's own test suite, which runs in Vitest 5.0.4 with jsdom against the library's source, not against the installed package. This guide therefore gives no Vitest configuration, and makes no claim about how a Vitest setup handles the package's stylesheet import.

## Common pitfalls

- **`toast.dismiss(undefined)` dismisses every toast.** A creation call can return `undefined`, so check the ID before you pass it to `toast.dismiss`.
- **A replacement drops what it leaves out.** Repeat every option you still want, as in [Replacing instead of updating](#replacing-instead-of-updating).
- **A plain `toast()` is not info.** Use `toast.info` where 0.x relied on the default type.
- **The progress bar is off.** Turn on `progress` if you relied on 0.x's `progressBar` default.
- **Persistent toasts hold the queue.** A position whose shown toasts are all persistent shows no new toasts there until one is dismissed.
- **Tests find a toast's text twice.** Each announcement copies the toast's text into a hidden live region for about seven seconds, so a query by text can match the toast and its copy. See [Testing your integration](ACCESSIBILITY.md#testing-your-integration).
- **`toast` in a Server Component throws.** Call it from client code.
- **A second Toaster renders nothing.** Keep one `<Toaster />`, near the root.
- **Old CSS selects nothing.** Rules for `.toast` and the other 0.x classes no longer match; move them to the 2.0 classes and tokens.

## Verification checklist

- [ ] No 0.x names remain: `ToastProvider`, `useToast`, `addToast`, `updateToast`, `removeToast`, `removeAll`, `ToastContainer`, and the 0.x types and options.
- [ ] The stylesheet is imported as `react-elegant-toasts/styles.css`, and nothing imports from the package's `dist` folder.
- [ ] One `<Toaster />` is rendered, near the root.
- [ ] TypeScript passes with `moduleResolution` set to `bundler`, `node16` or `nodenext`.
- [ ] Toasts appear at the expected positions, close after their duration, close from their close button, and can be reached with Alt+T.
- [ ] Every ID passed to `toast.dismiss` is checked first.
- [ ] Your CSS uses the documented classes and tokens.
- [ ] Your tests pass, including with the configuration above if you use Jest.
