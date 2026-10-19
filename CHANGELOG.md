# react-elegant-toasts

## 2.0.0-next.0

### Major Changes

- f5a556c: Version 2.0 is a rewrite of react-elegant-toasts with a new API and a new stylesheet. It directly follows 0.1.2: there was no 1.x. There is no compatibility layer, so every use of the 0.x API has to change. The [migration guide](docs/MIGRATION.md) covers the move from 0.x → 2.0 in full.

  - **`ToastProvider` and `useToast` are replaced by `<Toaster />` and `toast`.** Render one `<Toaster />` near the root; it wraps nothing, and a second one renders nothing. `toast` is imported, not taken from a hook, and works outside components. `addToast({ type, title, message })` becomes `toast.success(title, { description })` and the other type functions; a plain `toast()` is neutral, not info. `removeToast(id)` becomes `toast.dismiss(id)`, and `removeAll()` becomes `toast.dismiss()`.
  - **Public exports and types changed.** The package has named exports only, `Toaster` and `toast`, and no default export. The `Toast` and `ToastContainer` components and the `ToastProps`, `ToastAnimation`, `ToastProviderProps` and `ToastContextValue` types are removed. The exported types are `CustomToastOptions`, `DismissReason`, `ToastAction`, `ToastId`, `ToastOptions`, `ToastPosition`, `ToastPromiseMessages`, `ToastSnapshot`, `ToastTheme`, `ToastType` and `ToasterProps`. `ToastType` adds `"default"`, `"loading"` and `"custom"`. A creation call returns `ToastId | undefined`.
  - **ESM only.** There is no CommonJS build, and loading the package with `require()` is not supported. Test runners that load packages as CommonJS, such as Jest, need configuration.
  - **New stylesheet import.** Import `react-elegant-toasts/styles.css` instead of `react-elegant-toasts/dist/styles.css`, which no longer resolves. Classes are prefixed `ret-` and themed with `--ret-*` tokens; the 0.x classes, such as `.toast` and `.toast-container`, no longer match anything.
  - **Updates replace instead of merging.** `updateToast(id, changes)` is gone. A creation call with the same `id` replaces the toast: options it leaves out are not kept, the timer starts again, a missing toast is created, and neither `onDismiss` nor `onAutoClose` is called. `onClose` is replaced by `onDismiss(toast, reason)` and `onAutoClose(toast)`.
  - **The queue is per position.** `maxToasts` (5 across all positions, dropping the oldest) becomes the Toaster's `maxVisible` (4 per position). Further toasts wait in that position's queue and none is dropped. The newest toast is nearest its anchored edge. Countdowns pause while hovered, focused, or while the window is unfocused or the page hidden, and resume with the time they had left; these pauses are always on. The progress bar is off by default.
  - **React 18 or 19.** `react` and `react-dom` 18 or 19 are peer dependencies; React 16 and 17 are no longer supported. TypeScript users need 5.0 or later, with `moduleResolution` set to `bundler`, `node16` or `nodenext`.

## 0.1.2 and earlier

No changelog was kept for the 0.x releases (0.1.0 to 0.1.2). Version 2.0 is a rewrite that directly follows 0.1.2; the [migration guide](docs/MIGRATION.md) describes the move from 0.x to 2.0.
