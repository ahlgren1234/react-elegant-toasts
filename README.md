# React Elegant Toasts

[![npm](https://img.shields.io/npm/v/react-elegant-toasts)](https://www.npmjs.com/package/react-elegant-toasts)
[![License](https://img.shields.io/github/license/ahlgren1234/react-elegant-toasts)](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/LICENSE)

Toast notifications for React 18 and 19: one `<Toaster />` and a `toast()` function you can call from anywhere.

**[Try the live demo](https://ahlgren1234.github.io/react-elegant-toasts/)**: every toast type, all six positions, themes and right-to-left.

- No runtime dependencies; React and React DOM are peer dependencies.
- Six positions, each with its own stack and its own queue.
- Success, error, warning, info, loading and promise toasts, plus custom toasts with your own markup.
- Announcements through live regions, a keyboard shortcut to reach the toasts, and pausing on hover, focus and an inactive page.
- Light, dark and system themes, styled with CSS custom properties.
- Server rendering and the Next.js App Router.
- ESM, with TypeScript declarations.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Showing toasts](#showing-toasts)
- [Custom toasts](#custom-toasts)
- [Positions and the queue](#positions-and-the-queue)
- [Toaster props](#toaster-props)
- [Themes and styling](#themes-and-styling)
- [Accessibility](#accessibility)
- [Next.js and server rendering](#nextjs-and-server-rendering)
- [Compatibility](#compatibility)
- [Documentation](#documentation)
- [Contributing and support](#contributing-and-support)
- [License](#license)

## Installation

```bash
npm install react-elegant-toasts
```

> **Upgrading from 0.x?** Version 2 is a rewrite with a new API and a new stylesheet, and there was no 1.x. Follow the [migration guide (0.x → 2.0)](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/MIGRATION.md).

`react` and `react-dom` 18 or 19 are peer dependencies.

## Quick start

Import the stylesheet once, render one `<Toaster />` near the root of your application, and call `toast` from anywhere:

<!-- example: readme-quick-start -->

```tsx
import 'react-elegant-toasts/styles.css';
import { Toaster, toast } from 'react-elegant-toasts';

export function App() {
  return (
    <>
      <button type="button" onClick={() => toast.success('Changes saved')}>
        Save
      </button>
      <Toaster />
    </>
  );
}
```

`toast` works outside React components too, and before the Toaster has mounted: such toasts wait and appear once it mounts. Render only one `<Toaster />`; a second one renders nothing and logs a warning in development.

## Showing toasts

Each type has its own function. `toast()` itself shows a neutral toast.

<!-- example: readme-types -->

```tsx
toast('Draft created');
toast.success('Profile updated');
toast.error('Could not upload the file');
toast.warning('Your session expires in 5 minutes');
toast.info('A new version is available');
toast.loading('Uploading report.pdf');
```

The content can be any React node. A loading toast stays until you replace or dismiss it.

### Options

Every function takes an options object as its second argument:

<!-- example: readme-options -->

```tsx
toast.success('Message archived', {
  description: 'You can find it in the Archive folder.',
  duration: 8000,
  position: 'bottom-center',
  action: { label: 'Undo', onClick: () => restoreMessage() },
});
```

| Option        | Default                   | Description                                                                                                         |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`          | generated                 | The toast's ID. If a toast with this ID exists, it is replaced.                                                     |
| `description` | none                      | Secondary content below the main content.                                                                           |
| `duration`    | the Toaster's (5000 ms)   | How long the toast stays while it is visible and not paused. `Infinity` keeps it until it is dismissed.             |
| `position`    | the Toaster's (top-right) | One of the six [positions](#positions-and-the-queue).                                                               |
| `icon`        | the type's icon           | Replaces the icon; `null` shows none. Icons are hidden from assistive technology.                                   |
| `action`      | none                      | One button: `{ label, onClick }`. Clicking it dismisses the toast, unless `onClick` calls `event.preventDefault()`. |
| `closeButton` | the Toaster's (on)        | Whether the toast shows a close button.                                                                             |
| `progress`    | the Toaster's (off)       | Whether the toast shows a bar with the time it has left. Only finite toasts show one.                               |
| `className`   | none                      | Extra classes for the toast's root element.                                                                         |
| `onDismiss`   | none                      | Called once when the toast is removed, for any reason, with the toast and the reason.                               |
| `onAutoClose` | none                      | Called when the toast closes because its duration ran out, before `onDismiss`.                                      |

Clicking a toast's body never dismisses it.

### Updating and dismissing

Every creation function returns the toast's ID. Calling one again with the same `id` replaces that toast. A replacement is a new definition: options you leave out are not taken from the earlier call.

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

A creation call returns `undefined` only when the toast is rejected: on the server, or when 100 toasts are already waiting for a `<Toaster />` to mount. Because `toast.dismiss()` with no ID dismisses every toast, check an ID before you pass it on.

### Promises

`toast.promise` shows a loading toast and replaces it with a success or error toast when the promise settles. `loading`, `success` and `error` are all required.

<!-- example: readme-promise -->

```tsx
toast.promise(saveProject(), {
  loading: 'Saving project…',
  success: project => `Saved ${project.name}`,
  error: error => (error instanceof Error ? error.message : 'Could not save the project'),
});
```

It also accepts a function that returns a promise. It returns the toast's ID, not the result: await your own promise for that. The promise's rejection counts as handled. If the toast is dismissed or replaced before the promise settles, the settlement changes nothing.

### Callbacks

<!-- example: readme-callbacks -->

```tsx
toast('Export started', {
  onAutoClose: snapshot => console.log(`${snapshot.id} timed out`),
  onDismiss: (snapshot, reason) => console.log(`${snapshot.id} closed: ${reason}`),
});
```

The reason is `"timeout"`, `"close-button"`, `"swipe"`, `"programmatic"` or `"action"`. Replacing a toast calls neither callback.

## Custom toasts

`toast.custom` renders your own markup. The library still positions, queues, times, animates and announces it, but gives it no surface, padding or icon, and no close button unless you pass `closeButton: true`. It does not take `description`, `icon`, `action` or `progress`.

<!-- example: readme-custom -->

```tsx
const INVITE_ID = 'team-invite';

toast.custom(
  <div className="invite-toast">
    <p>Sam invited you to the Design team.</p>{' '}
    <button type="button" onClick={() => toast.dismiss(INVITE_ID)}>
      Dismiss
    </button>
  </div>,
  { id: INVITE_ID, duration: Infinity }
);
```

Give a custom toast a fixed `id` when its own controls dismiss it. Its content's accessibility is yours: names, keyboard operation, focus styles, contrast, and a way to dismiss a persistent one. See [custom toasts in the accessibility reference](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/ACCESSIBILITY.md#custom-toasts) and [in the theming reference](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/THEMING.md#custom-toasts).

## Positions and the queue

There are six positions: `top-left`, `top-center`, `top-right` (the default), `bottom-left`, `bottom-center` and `bottom-right`.

- Each position has its own stack. The newest toast is nearest the edge it is anchored to.
- Each position shows at most `maxVisible` toasts (4 by default). Further toasts wait in that position's queue, in order, and appear as shown ones close; none is dropped.
- A persistent toast keeps its place until it is dismissed, so a position full of persistent toasts holds its queue.
- Positions are physical: `left` stays left in a right-to-left page. Text direction comes from the page, such as a `dir` attribute; there is no direction prop.
- The screen size never changes a toast's position; on narrow screens the stacks only become narrower.

## Toaster props

| Prop          | Default              | Description                                                                                                    |
| ------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `position`    | `"top-right"`        | The position of toasts that do not set their own.                                                              |
| `theme`       | `"system"`           | `"light"`, `"dark"`, or `"system"`, which follows the user's colour-scheme preference.                         |
| `maxVisible`  | `4`                  | How many toasts each position shows at once.                                                                   |
| `duration`    | `5000`               | The duration, in milliseconds, of toasts that do not set their own. `Infinity` makes them persistent.          |
| `closeButton` | `true`               | Whether normal toasts that do not set `closeButton` show a close button. Custom toasts ignore it.              |
| `progress`    | `false`              | Whether normal toasts that do not set `progress` show a progress bar. Only finite-duration toasts can show it. |
| `hotkey`      | `["altKey", "KeyT"]` | The shortcut that moves focus to the toasts: modifier names plus a `KeyboardEvent.code`. `false` turns it off. |
| `labels`      | English              | Text for assistive technology: `region`, `close`, `warningPrefix` and `errorPrefix`.                           |
| `className`   | none                 | Extra classes for the toaster's root element.                                                                  |

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

## Themes and styling

The library ships one plain CSS file, `react-elegant-toasts/styles.css`, and injects no styles at runtime. The `theme` prop chooses light, dark or the user's system preference, in CSS only, so server-rendered HTML matches from the first paint.

Customise the look with the `--ret-*` custom properties, set on `.ret-toaster` or on the class you pass as `className`:

```css
.app-toaster {
  --ret-radius: 6px;
  --ret-width: 400px;
}
```

The [theming reference](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/THEMING.md) lists every token with its defaults, the documented classes and attributes, per-toast styling, progress, motion, reduced motion and forced colours.

## Accessibility

- Toasts are announced through live regions that exist before the first toast: politely, except errors, which are announced assertively.
- Toasts never take focus when they appear. Alt+T moves focus to them, and Escape returns it to where it was.
- A toast is paused while the pointer is over its stack, while it contains keyboard focus, and while the window is inactive or the page is hidden.
- Under `prefers-reduced-motion: reduce`, toasts appear and disappear without motion. The stylesheet also keeps toasts visible in forced-colours modes.
- In a custom toast, the content's accessibility is yours.

No real screen reader has been tested yet, and this package makes no claim of conformance to an accessibility standard. The [accessibility reference](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/ACCESSIBILITY.md) explains what the library does, what it leaves to you, and [what was verified](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/ACCESSIBILITY.md#what-was-verified).

## Next.js and server rendering

The package is marked `"use client"`, so `<Toaster />` can go straight into an App Router root layout, which stays a Server Component:

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

- On the server, `<Toaster />` renders an empty region, so hydration matches.
- A toast call during server rendering is ignored and returns `undefined`, with a warning in development.
- Calling `toast` from a Server Component throws at request time, because it is a client function.

## Compatibility

- **React** 18 and 19. The tests run with React 18.3.1 and 19.3.0.
- **TypeScript** 5.0 or later, with `moduleResolution` set to `bundler`, `node16` or `nodenext`. The declarations are checked with TypeScript 5.0.4 and 7.0.2.
- **ESM only.** There is no CommonJS build. The package is tested in Vite and Next.js builds and under Node's native ESM. Test runners that load packages as CommonJS, such as Jest in its default mode, have to be configured for ESM or to transform this package. Loading it with `require()` is not supported.
- **Imports.** `react-elegant-toasts` and `react-elegant-toasts/styles.css` are the only entry points; paths into the package's build output are blocked.
- **Browsers.** Automated tests run in current Chromium, Firefox and WebKit engines, and manual checks covered Chrome and Firefox on Windows, Safari on iOS, and Chrome and Firefox on Android. macOS Safari and Microsoft Edge have not been verified. The [accessibility reference](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/ACCESSIBILITY.md#what-was-verified) lists the versions.

The package exports `Toaster` and `toast`, with no default export, and these types:

| Type                   | Describes                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `ToasterProps`         | The props of `<Toaster />`.                                      |
| `ToastOptions`         | The options of `toast()` and its type functions.                 |
| `CustomToastOptions`   | The options of `toast.custom()`.                                 |
| `ToastPromiseMessages` | The `loading`, `success` and `error` content of `toast.promise`. |
| `ToastAction`          | The `action` option: `{ label, onClick }`.                       |
| `ToastSnapshot`        | The toast passed to `onDismiss` and `onAutoClose`.               |
| `DismissReason`        | The reason passed to `onDismiss`.                                |
| `ToastId`              | A toast's ID, a string.                                          |
| `ToastPosition`        | One of the six positions.                                        |
| `ToastType`            | A toast's type, such as `"success"` or `"custom"`.               |
| `ToastTheme`           | `"light"`, `"dark"` or `"system"`.                               |

## Documentation

- [Live demo](https://ahlgren1234.github.io/react-elegant-toasts/)
- [Theming and styling reference](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/THEMING.md)
- [Accessibility reference](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/ACCESSIBILITY.md)
- [Migration guide (0.x → 2.0)](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/docs/MIGRATION.md)
- [Issues](https://github.com/ahlgren1234/react-elegant-toasts/issues)

## Contributing and support

- Questions and ideas: [Discussions](https://github.com/ahlgren1234/react-elegant-toasts/discussions).
- Bugs and feature requests: [open an issue](https://github.com/ahlgren1234/react-elegant-toasts/issues/new/choose).
- Contributing: see the [contributing guide](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/CONTRIBUTING.md).
- Security vulnerabilities: report them privately, as the [security policy](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/SECURITY.md) describes, never in a public issue.

## License

[MIT](https://github.com/ahlgren1234/react-elegant-toasts/blob/main/LICENSE) © Peter Anyawantana
