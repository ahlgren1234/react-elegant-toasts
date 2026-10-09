# react-elegant-toasts v2: engineering and product plan

|          |                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------- |
| Status   | Draft, revision 2. The open-question review decisions are incorporated.                        |
| Baseline | v0.1.2 (`v2` branch at `7a662f7`)                                                              |
| Target   | 2.0.0                                                                                          |
| Scope    | Planning only. This document makes no changes to source, tests, config, workflows or the demo. |

## How to read this document

- Sections 1–38 follow the agreed plan structure. Appendix A maps every known v0.1.2 defect to the v2 section, phase and acceptance criterion that addresses it. Appendix B records how each earlier open question was decided.
- Statements written with **must**, **is** or **are** in sections 5–34 are normative. They come from the authoritative v2 decisions or from the open-question review the maintainer accepted.
- **OPEN QUESTION (OQ-n)** marks an item that is still undecided. Any such item is listed in §38, which has been empty since P-17 D2. Question IDs from revision 1 are kept so the history stays readable. Resolved IDs are logged in Appendix B and are never reused.
- **Defect IDs (D-nn)** refer to v0.1.2 problems (§4). **Phase IDs (P-nn)** refer to §35. **Acceptance criteria (AC-xx-n)** are in §36.
- "0.x" means the published 0.1.x line. No 1.x release exists, so the upgrade path is **0.x → 2.0**.

---

## 1. Vision

**Beautiful by default. Accessible by design.**

react-elegant-toasts 2.0 is a small toast library for React 18 and 19, published as ESM only, with zero runtime dependencies:

- One line to render: `<Toaster />`.
- One function to notify: `toast("…")`, which can be called from anywhere, including code outside React.
- Polished, opinionated visuals that work out of the box in light, dark and system themes.
- Accessible behaviour is part of the architecture and has tests from the start. That covers announcements, keyboard access, reduced motion and pausing.
- Package engineering is treated as part of the product: exports, types, CSS delivery, CI gates and provenance.

2.0 is a clean break from 0.x. There is no compatibility layer.

## 2. Goals

1. A module-level external store, so `toast()` works anywhere and React subscribes through `useSyncExternalStore`.
2. The decided public API (§6), with nothing else exported.
3. An explicit lifecycle (`queued → entering → visible → exiting → removed`), with real enter and exit animations.
4. Remaining-time timers with four independent pause reasons that combine: pointer hover, focus within the toast, window focus loss and document visibility loss.
5. A deterministic queue with `maxVisible` (default 4) per position. No accepted toast is ever dropped silently.
6. Correct live-region semantics, native controls, keyboard access to the region and reduced motion, all verified by automated tests.
7. Plain CSS with a `ret-` namespace, themed through custom properties and delivered at `react-elegant-toasts/styles.css`.
8. An ESM-only package, validated as a packed tarball in consumer fixtures (Vite and Next.js) under React 18 and React 19.
9. Blocking CI gates, a bundle-size budget, and Changesets-based releases with provenance.
10. A migration guide from 0.x to 2.0.

## 3. Non-goals

These are out of scope for 2.0 unless a hard architectural requirement emerges. If one does, it must be recorded in this document before implementation.

- A full headless API.
- A compatibility layer for the 0.x `ToastProvider` and `useToast` API.
- Multiple animation presets, including the 0.x slide, fade, zoom and bounce options.
- Tailwind as a dependency or integration.
- CSS-in-JS.
- More than one action per toast, or dialog-like interaction.
- An `onOpen` callback, unless implementation shows a clear need.
- More than one `<Toaster />`, or scoped Toasters.
- A function form of `toast.custom`, such as `toast.custom((id) => …)`.
- Public toggles for pause behaviour.
- **CommonJS output, or any official CommonJS support.**
- React 16 and 17.
- Features unrelated to toast notifications.

## 4. v0.1.2 baseline and known problems

### 4.1 Baseline inventory (factual)

| Area           | v0.1.2 state                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source         | `src/ToastContext.tsx` (provider and state), `src/ToastContainer.tsx` (one fixed `div` per position), `src/Toast.tsx` (timer, progress, click), `src/types.ts`, `src/utils.ts`, `src/styles.css`                                                 |
| Public exports | `Toast`, `ToastContainer`, `ToastProvider`, `useToast`, a default export (`useToast`). Types: `ToastProps`, `ToastPosition`, `ToastType`, `ToastAnimation`, `ToastProviderProps`, `ToastContextValue`                                            |
| API            | `useToast()` returns `{ addToast, updateToast, removeToast, removeAll }`. `addToast({ type, title, message, … })` returns an ID.                                                                                                                 |
| State          | A `useState` array in `ToastProvider`. One provider-wide `isPaused` boolean is copied onto every toast.                                                                                                                                          |
| Types          | `success`, `error`, `warning`, `info`. No default or loading type. `title` and `message` are both `string`.                                                                                                                                      |
| Timers         | A `setTimeout(duration)` per toast. Progress uses a `requestAnimationFrame` loop that calls `setProgress` every frame.                                                                                                                           |
| Animation      | Enter classes for `slide`, `fade`, `zoom` and `bounce`. Exit keyframes are defined but never used.                                                                                                                                               |
| Styling        | Global, unprefixed classes (`.toast`, `.success`, `.rtl`, `.top-right`, …) and keyframes (`slideIn`, `fadeIn`, …). Inline container styles (`z-index: 9999`, `padding: 12px`). Dark mode only through a media query.                             |
| Package        | `main`, `module`, `types` and `style` fields. No `exports` map. `sideEffects: false`. `react` and `react-dom` appear in **both** `dependencies` (`^18.2.0`) and `peerDependencies` (`>=16.8.0`). `engines.node >= 14`. `prepare` runs the build. |
| Build          | tsup 7.2 (`tsup.config.ts` plus CLI flags in `build:js`) and `cp` for the CSS. Output is `dist/index.{js,mjs,d.ts,d.mts}` plus `dist/styles.css`.                                                                                                |
| TS config      | A single `tsconfig.json` covering `src` and the tests. `jsx: "react"` (classic runtime), `moduleResolution: "node"`, `target: es2018`.                                                                                                           |
| Tests          | Jest 29 with ts-jest, jsdom and Testing Library 14. Two suites. `requestAnimationFrame` is mocked through `setTimeout`. No accessibility tests and no tests against the built package.                                                           |
| Lint/format    | ESLint 8 (legacy config) and Prettier 3. The `format` script runs `prettier --write` and then `git add -A src/`.                                                                                                                                 |
| CI             | `ci.yml`, Node 18, `npm install`. Typecheck, lint and tests are all `continue-on-error: true`.                                                                                                                                                   |
| Release        | `release.yml` runs on GitHub release creation: `npm ci`, build, then publish with `NPM_TOKEN`. No tests, no package validation, no provenance.                                                                                                   |
| Demo           | A Vite app in `demo/` that imports from `../src`. Deployed to GitHub Pages from `main` by `deploy-demo.yml`.                                                                                                                                     |
| Repo           | No `LICENSE` file, although `package.json` says MIT. No `CHANGELOG.md`. A stale `.github/workflows/deploy-demo` file with no extension.                                                                                                          |

### 4.2 Known defects and problems

Every defect has a v2 response. The full traceability matrix is in Appendix A.

**Architecture and API**

- **D-01: toasts can only be created inside React, under a provider.** `useToast` throws outside `ToastProvider`.
- **D-02: IDs and internal state can be overwritten.** `updateToast(id, Partial<ToastProps>)` merges `id` and `isPaused`. `addToast` spreads caller options after the internal `isPaused`. The implementation signature is `Omit<ToastProps,'id'>`, but the public type is `Omit<…,'id'|'isPaused'>`.
- **D-03: weak IDs that callers cannot control.** IDs come from `Math.random().toString(36).substring(2, 9)`. There are no custom IDs.
- **D-04: content can only be a string.** `title` and `message` are typed `string`.
- **D-05: internals are exported.** `Toast`, `ToastContainer`, `ToastContextValue`, `ToastProps` (including the internal `isPaused`) and a default export are all public.
- **D-06: a user's `onClose` never fires.** `ToastContainer` renders `<Toast {...toast} onClose={() => onRemove(toast.id)} />`, which overwrites the caller's `onClose`.

**Timers, pausing and progress**

- **D-07: pause reasons overwrite each other.** One `isPaused` boolean is shared by `visibilitychange`, `blur` and `focus`. For example, a `focus` event un-pauses even while the document is still hidden.
- **D-08: resuming restarts the full duration.** `startTimer()` always schedules `setTimeout(duration)`.
- **D-09: hover pause is not combined with global pause.** When the global pause clears, the timer restarts even if the pointer is still over the toast. Hover detection uses only `mouseenter` and `mouseleave`.
- **D-10: progress re-renders every frame and resets on resume.** The `requestAnimationFrame` loop calls `setState` every frame. On resume, progress jumps back to 100%.
- **D-11: progress is wrong in RTL.** The bar is fixed at `left: 0`. The per-toast `rtl` flag only swaps the icon margin.

**Visibility, ordering and lifecycle**

- **D-12: `maxToasts` silently deletes toasts.** `slice(-maxToasts)` drops the oldest toasts without any callback.
- **D-13: there is no exit lifecycle.** A toast unmounts immediately. The exit keyframes are dead code, and the opacity transition never runs.
- **D-14: the left-position slide animation is broken.** This was found by static analysis and has not been checked at runtime. `slideIn … forwards reverse` ends at `translateX(100%)`, which leaves the toast offset by its own width.
- **D-15: stack order ignores position.** New toasts are always appended to the end, so in top positions the newest toast sits furthest from the edge.
- **D-16: adding any toast re-renders all of them.** An effect keyed on `toasts.length` maps every toast to a new object.

**Accessibility**

- **D-17: clicking anywhere on a toast dismisses it.** `closeOnClick` defaults to `true` and is handled by a `div` `onClick`. There is no close button, so keyboard and assistive-technology users cannot dismiss a toast.
- **D-18: everything uses `role="alert"`.** Every toast is assertive, `role` accepts any string, and there is no persistent live region.
- **D-19: decorative icons are announced.** The Unicode glyphs ✓ ✕ ⚠ ℹ are exposed to assistive technology.
- **D-20: the default variants fail WCAG AA contrast.** White text measures 2.78:1 on `#4caf50`, 3.68:1 on `#f44336`, 2.16:1 on `#ff9800` and 3.12:1 on `#2196f3`.
- **D-21: there is no `prefers-reduced-motion` support.**
- **D-22: the README claims accessibility and keyboard navigation that the code does not provide.**

**Styling and theming**

- **D-23: CSS is global and unprefixed,** for both classes and keyframes.
- **D-24: there is no theme control.** Variant colours ignore dark mode. `z-index` and padding are inline styles.

**Package and build**

- **D-25: React is shipped as a runtime dependency.** The peer range `>=16.8.0` is untested.
- **D-26: there is no `exports` map.** Consumers have to import `…/dist/styles.css`.
- **D-27: `sideEffects: false` lets bundlers drop the CSS import.**
- **D-28: there is no `"use client"` directive.**
- **D-29: the build configuration is split.** It lives partly in `tsup.config.ts` and partly in CLI flags. tsup 7, the classic JSX runtime, `moduleResolution: node`, and tests are included in the library typecheck.
- **D-30: `prepare: npm run build`** has side effects on install.

**Process, CI and release**

- **D-31: CI gates do not block.** They use `continue-on-error`, run on Node 18 (end of life) and use `npm install`.
- **D-32: the format gate can never fail.** `format` runs `git add -A src/` before `git diff --exit-code`.
- **D-33: releases publish without validation.** They use a long-lived `NPM_TOKEN`, produce no provenance, and build the changelog ad hoc.
- **D-34: a stale duplicate workflow file exists.** `.github/workflows/deploy-demo` has no extension, so it never runs, and it uploads the wrong path.
- **D-35: repository metadata is missing or wrong.** There is no `LICENSE` file. The README contains placeholders (`yourusername`, `MIT © [Your Name]`), an unverified "~3.5KB" claim and a Remix example that imports from `dist`.
- **D-36: the tests encode behaviour v2 removes, and only test `src/`.**

### 4.3 Conflicts and tensions with the repository (history and status)

| ID   | Tension                                                                                                          | Status                                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Dual ESM and CJS output combined with a module-level singleton store risks two stores (the dual-package hazard). | **Resolved:** 2.0 is ESM-only (§24). No `globalThis` store is used. Duplicate installs of the package can still create separate stores, which is the same limitation React has. The no-Toaster warning (§8.4) is the hint that this has happened. |
| C-02 | No 1.x exists, so 2.0.0 follows 0.1.x directly.                                                                  | **Resolved:** migration language always says "0.x → 2.0" (§30).                                                                                                                                                                                   |
| C-03 | The original pause reasons left out keyboard focus.                                                              | **Resolved:** focus within the toast is a pause reason (§10).                                                                                                                                                                                     |
| C-04 | tsup's `treeshake: true` routes output through Rollup, which strips `"use client"`.                              | **Resolved as a P-03 task:** stay on tsup 8, disable the Rollup tree-shake step, add the directive with `banner`, and verify it in P-07 (§24).                                                                                                    |
| C-05 | `sideEffects: false` conflicts with shipping CSS.                                                                | **Resolved:** `sideEffects: ["**/*.css"]` (§24).                                                                                                                                                                                                  |
| C-06 | The demo deploys from `main`.                                                                                    | **Resolved:** demo deployment waits for the final 2.0.0 release (§29, P-06).                                                                                                                                                                      |
| C-07 | CI runs only for `main`.                                                                                         | **Resolved in P-06:** add the `v2` branch.                                                                                                                                                                                                        |
| C-08 | A module-level store is shared across SSR requests.                                                              | **Resolved:** `toast()` on the server stores nothing (§8.3, §23).                                                                                                                                                                                 |
| C-09 | The 0.x tests assert behaviour v2 removes.                                                                       | **Resolved in P-08:** delete them rather than port them.                                                                                                                                                                                          |
| C-10 | ESM-only affects consumers that run CommonJS, for example CJS-mode Jest.                                         | **Accepted:** documented as compatibility guidance (§24.3, §30).                                                                                                                                                                                  |

---

## 5. v2 architecture overview

```
 ┌──────────────── anywhere (React or not) ────────────────┐
 │  toast(), toast.success(), …, toast.promise(),          │
 │  toast.dismiss()                                        │
 └───────────────────────────┬─────────────────────────────┘
                             │ commands
                             ▼
 ┌──────────── ToastStore (ES module singleton) ───────────┐
 │ records by id · creation sequence · lifecycle phases ·  │
 │ per-position queue/maxVisible · timers + pause reasons ·│
 │ no-Toaster pending cap · callbacks · immutable snapshot │
 └───────────────────────────┬─────────────────────────────┘
                             │ useSyncExternalStore
                             ▼
 ┌────────────── <Toaster /> (exactly one active) ─────────┐
 │ attaches config to store · global pause listeners ·     │
 │ hotkey · persistent live regions · one list per         │
 │ position → internal ToastItem (not exported): shell or  │
 │ chrome-less custom wrapper, icon, action, close,        │
 │ progress, swipe, animation events → lifecycle reports   │
 └─────────────────────────────────────────────────────────┘
                             │
                styles.css (plain CSS, ret- namespace,
                custom properties, themes, motion)
```

Principles:

- **The store owns the truth.** That covers lifecycle phase, queue position, timer state and callbacks. React only renders snapshots and reports DOM events back to the store.
- **Nothing happens at import time.** Importing the module creates an empty store object only. No DOM access, no listeners, no timers.
- **Timers run only for `visible` toasts while a Toaster is active.**
- **No React state changes per animation frame.** Progress and motion are driven by CSS.
- **Rendering components are internal.** The only value exports are `Toaster` and `toast`.

Proposed source layout (file names are indicative and are finalised in P-08):

```
src/
  index.ts            public exports only
  types.ts            public types
  store/              store.ts, lifecycle.ts, queue.ts, timer.ts, ids.ts, warnings.ts
  toast.ts            toast facade
  react/              Toaster.tsx, ToastItem.tsx, useSwipe.ts, useHotkey.ts,
                      announcer.tsx, icons.tsx
  styles/styles.css
```

## 6. Public API specification

### 6.1 Entry points

```ts
import { Toaster, toast } from "react-elegant-toasts";
import "react-elegant-toasts/styles.css";
```

`Toaster` and `toast` are the only value exports, and there is no default export. The package is ESM-only (§24).

### 6.2 `toast`

```ts
toast(content: ReactNode, options?: ToastOptions): ToastId | undefined              // neutral/default
toast.success(content: ReactNode, options?: ToastOptions): ToastId | undefined
toast.error(content: ReactNode, options?: ToastOptions): ToastId | undefined
toast.warning(content: ReactNode, options?: ToastOptions): ToastId | undefined
toast.info(content: ReactNode, options?: ToastOptions): ToastId | undefined
toast.loading(content: ReactNode, options?: ToastOptions): ToastId | undefined      // persistent
toast.custom(content: ReactNode, options?: CustomToastOptions): ToastId | undefined // chrome-less (§6.4)
toast.promise<T>(promise: Promise<T> | (() => Promise<T>),
                 messages: ToastPromiseMessages<T>,
                 options?: ToastOptions): ToastId | undefined
toast.dismiss(id?: ToastId): void                                         // no id = all
```

- **Return value.** Every creation call returns `ToastId | undefined`. `ToastId` is still `string`.
  - When a toast is **accepted**, the call returns its real `ToastId`. That includes a successful replacement of an existing toast, which returns that toast's ID.
  - When creation is **rejected**, the call returns `undefined`. This happens in two cases: on the server (§8.3), and when there is no active Toaster and the pending cap has already been reached (§8.4).
  - A rejected call returns `undefined` **even if the caller supplied an explicit `id`**. Returning that ID would falsely suggest that a toast with that ID had been accepted.
  - The library never returns an empty string or any other placeholder ID.

```ts
const id = toast.success("Saved");
if (id) toast.dismiss(id); // id is undefined only if creation was rejected
```

- `toast.custom` accepts only a `ReactNode` in 2.0. If the custom content needs its own ID, for example to call `toast.dismiss(id)` from inside it, pass an explicit `id`:

```tsx
toast.custom(
  <MyBanner onClose={() => toast.dismiss("sync-status")} />,
  { id: "sync-status" },
);
```

### 6.3 `ToastOptions`

Each option is per toast and overrides the matching `<Toaster />` default. Final names are confirmed in P-08 and must not change behaviour.

| Option        | Type                                                    | Default                            | Notes                                                                        |
| ------------- | ------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `id`          | `ToastId`                                               | generated                          | If the ID exists, the toast is replaced (§14).                               |
| `description` | `ReactNode`                                             | none                               | Secondary content.                                                           |
| `duration`    | `number` (ms)                                           | Toaster `duration` (5000)          | `Infinity` makes the toast persistent. Loading toasts are always persistent. |
| `position`    | `ToastPosition`                                         | Toaster `position` (`"top-right"`) | Changing it through replacement moves the toast (§14).                       |
| `icon`        | `ReactNode \| null`                                     | type icon                          | `null` hides the icon. Always `aria-hidden`.                                 |
| `action`      | `ToastAction`                                           | none                               | Exactly one action (§15).                                                    |
| `closeButton` | `boolean`                                               | Toaster `closeButton` (`true`)     |                                                                              |
| `progress`    | `boolean`                                               | Toaster `progress` (`false`)       |                                                                              |
| `className`   | `string`                                                | none                               | Added to the toast root.                                                     |
| `onDismiss`   | `(toast: ToastSnapshot, reason: DismissReason) => void` | none                               | §16                                                                          |
| `onAutoClose` | `(toast: ToastSnapshot) => void`                        | none                               | §16                                                                          |

### 6.4 `CustomToastOptions`

`toast.custom` is **chrome-less**.

The consumer owns:

- surface and background
- border and padding
- icon
- typography
- every internal control

The library still owns:

- the store and lifecycle
- position, stack and queue
- timers and pausing
- enter and exit motion, and stack movement
- swipe
- the accessibility infrastructure: live-region announcement, the region landmark, hotkey and focus management

| Option                                                                | Default              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `duration`, `position`, `className`, `onDismiss`, `onAutoClose` | as in `ToastOptions` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `closeButton`                                                         | **`false`**          | This is a deliberate exception to the general rule that the close button is on by default. The library close button is never overlaid on custom content unless the caller passes `closeButton: true` explicitly. In that case the library places its standard close button in a predictable, documented spot: the inline-end top corner of the custom wrapper. Adding the button does not change the consumer's ownership of the rest of the custom design: surface, padding and layout. |

`toast.custom` takes custom visual content instead of the normal content model. It does **not** accept `description`, `icon`, `action` or `progress`, which belong to that normal model and to its visual chrome. The type checker enforces this. `closeButton` is the only deliberate exception: it is off by default and can be turned on explicitly. The Toaster-level `closeButton` prop does not affect custom toasts.

### 6.5 `<Toaster />` props

| Prop          | Type                                                                                | Default                                                             | Notes                                                                                         |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `position`    | `ToastPosition`                                                                     | `"top-right"`                                                       | The default position for toasts. It is never changed based on viewport width (§12).           |
| `theme`       | `"light" \| "dark" \| "system"`                                                     | `"system"`                                                          |                                                                                               |
| `maxVisible`  | `number`                                                                            | `4`                                                                 | Applies **per position** (§11).                                                               |
| `duration`    | `number`                                                                            | `5000`                                                              | The default for finite toasts.                                                                |
| `closeButton` | `boolean`                                                                           | `true`                                                              | The default for normal toasts. Custom toasts ignore it (§6.4).                                |
| `progress`    | `boolean`                                                                           | `false`                                                             |                                                                                               |
| `hotkey`      | `readonly string[] \| false`                                                        | `["altKey", "KeyT"]`                                                | Modifier property names plus a `KeyboardEvent.code` value. `false` disables the hotkey (§18). |
| `labels`      | `{ region?: string; close?: string; warningPrefix?: string; errorPrefix?: string }` | `"Notifications"`, `"Close notification"`, `"Warning:"`, `"Error:"` | Localisable strings (§17).                                                                    |
| `className`   | `string`                                                                            | none                                                                | Added to the toaster root.                                                                    |

There is no `dir` prop in 2.0. Direction is inherited from the DOM (§20), and a prop could be added later without a breaking change.

### 6.6 Supporting types

```ts
type ToastId = string;
type ToastPosition = "top-left" | "top-center" | "top-right"
                   | "bottom-left" | "bottom-center" | "bottom-right";
type ToastType = "default" | "success" | "error" | "warning" | "info" | "loading" | "custom";
type ToastTheme = "light" | "dark" | "system";
type DismissReason = "timeout" | "close-button" | "swipe" | "programmatic" | "action";

interface ToastAction {
  label: ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

interface ToastPromiseMessages<T> {
  loading: ReactNode;
  success: ReactNode | ((data: T) => ReactNode);      // required
  error: ReactNode | ((error: unknown) => ReactNode); // required
}

interface ToastSnapshot {                             // passed to callbacks, read-only
  readonly id: ToastId;
  readonly type: ToastType;
  readonly content: ReactNode;
  readonly description?: ReactNode;
}
```

### 6.7 Exported types

The package exports these types and no others: `ToasterProps`, `ToastOptions`, `CustomToastOptions`, `ToastId`, `ToastPosition`, `ToastType`, `ToastTheme`, `ToastAction`, `ToastPromiseMessages`, `ToastSnapshot`, `DismissReason`. There is no store type, phase type or internal record type. A test enforces the list (AC-API-1).

### 6.8 Removed in 2.0

The following 0.x API is removed:

- `ToastProvider`, `useToast`, `addToast`, `updateToast`, `removeToast` and `removeAll`.
- The public `Toast` and `ToastContainer` components, and the default export.
- The options `animation`, `closeOnClick`, `role`, per-toast `rtl`, `isPaused`, `title` and `message` (replaced by the content argument and `description`), `pauseOnHover`, `pauseOnPageIdle` and `pauseOnFocusLoss`.

## 7. Core data model

These types are internal and are never exported.

```ts
type ToastPhase = "queued" | "entering" | "visible" | "exiting";   // "removed" = deleted from store

type PauseReason =
  | "hover"            // pointer over the toast's position stack (position-scoped)
  | "focus-within"     // keyboard/programmatic focus inside this toast (toast-scoped)
  | "window-blur"      // global
  | "document-hidden"  // global
  | "swipe";           // internal, toast-scoped, while a gesture is active

interface ToastRecord {
  readonly id: ToastId;
  seq: number;                       // ordering key; assigned at creation, re-assigned only on relocation (§14)
  revision: number;                  // increments on every replacement (re-announce, re-key content)
  type: ToastType;
  custom: boolean;                   // chrome-less custom toast
  content: ReactNode;
  description?: ReactNode;
  position: ToastPosition;
  options: ResolvedOptions;          // icon, action, closeButton, progress, className, callbacks
  phase: ToastPhase;
  timer: {
    duration: number;                // Infinity = persistent
    remaining: number;               // ms left; == duration until first visible
    runningSince: number | null;     // performance.now() while running, else null
  };
  exit?: { reason: DismissReason | "relocate"; relocateTo?: ToastPosition };
  promiseToken?: symbol;             // set by toast.promise; cleared on dismissal or external replacement (§13)
}
```

The snapshot provided to React:

```ts
interface StoreSnapshot {
  readonly byPosition: Readonly<Record<ToastPosition, readonly ToastView[]>>; // rendered toasts, visual order (§12)
}
```

Rules:

- Records are replaced immutably. `getSnapshot` returns the same object until something changes, as `useSyncExternalStore` requires.
- `ToastView` holds only what rendering needs. Queued toasts are not included.
- IDs come from `crypto.randomUUID()` where it is available. It is undefined in insecure contexts, so the fallback is a module counter plus a random suffix. Generated IDs are unique within the store (D-03).

## 8. External store design

### 8.1 Interface (internal)

```ts
interface ToastStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): StoreSnapshot;
  getServerSnapshot(): StoreSnapshot;          // constant empty snapshot

  upsert(input: ToastInput): ToastId | undefined; // create or replace (§14); undefined = rejected (§8.3, §8.4)
  dismiss(id?: ToastId, reason?: DismissReason): void;

  entered(id: ToastId): void;                  // entering → visible
  exited(id: ToastId): void;                   // exiting → removed, or relocation (§14)

  setGlobalPause(reason: "window-blur" | "document-hidden", on: boolean): void;
  setStackPause(position: ToastPosition, on: boolean): void;   // hover
  setToastPause(id: ToastId, reason: "focus-within" | "swipe", on: boolean): void;

  attach(toasterInstance: symbol, config: ToasterConfig): () => void;   // returns detach
}
```

### 8.2 Singleton and import behaviour

- The store is a plain ES-module singleton: one store per loaded copy of the module. It is **not** kept on `globalThis`.
- Importing the module has no side effects (§5).
- A single command notifies subscribers once. A command issued during a notification is queued and runs afterwards.
- Callback exceptions are isolated. A callback runs inside `try/catch`, and any error is re-thrown asynchronously through `reportError` (or `setTimeout(() => { throw e })` as a fallback). A throwing callback never corrupts state or stops other callbacks from running.
- An internal `resetStore()` gives tests a clean store. It is not exported from the package entry (AC-API-1).

### 8.3 Server behaviour (SSR safety)

- When `typeof window === "undefined"`, every creation call is **rejected**. Nothing is stored, no timer starts and no callback fires. The call returns `undefined`.
- No state can therefore build up in the server-side module instance or leak between SSR requests (C-08).
- In development, the first rejected server call logs one warning. In production nothing is logged.
- `toast.dismiss()` on the server does nothing.
- `getServerSnapshot()` returns a constant empty snapshot, so server HTML contains only empty region shells.

### 8.4 No active Toaster: pending retention and its bound

A Toaster is **active** when it is attached to the store and is the one that renders (§8.5).

- Calling `toast()` before any Toaster mounts is allowed. Accepted toasts are kept in the store as `queued`, and they render through the normal queue rules once a Toaster becomes active.
- **Hard cap: 100.** While no Toaster is active, the store holds at most 100 accepted toasts. When it already holds 100 or more, any creation call that would add a **new** record is **rejected**:
  - The toast is never accepted into the system: no record, no timer, no `onDismiss`, no announcement.
  - The call returns `undefined`, even when an explicit `id` was supplied (§6.2).
  - A development warning is logged (see the warning rules below).
- Replacing a toast that is already accepted (same `id`) is not a new record, so it is allowed at the cap.
- The cap applies only while no Toaster is active. With an active Toaster, the queue is bounded only by the rule that queued toasts eventually become visible (§11).
- If the store holds more than 100 accepted toasts when the active Toaster unmounts, they are all kept, because they were already accepted. New creations are rejected until the count falls below 100.
- **No timer runs while no Toaster is active.** A toast's countdown only runs in `visible`, and nothing is `visible` without a Toaster.
- **When the active Toaster unmounts:**
  - `entering` and `visible` toasts go back to `queued`. Their remaining finite duration is kept, their timers are suspended, and their `seq` stays the same.
  - `exiting` toasts finish removal straight away and fire `onDismiss` once with their existing reason.
  - Pause reasons owned by the departed Toaster (hover, focus-within, swipe) are cleared.
- **StrictMode safety.** In development, React StrictMode mounts, unmounts and immediately remounts components. Attaching and detaching the Toaster must cope with that cycle:
  - Toasts must not be falsely moved to `queued`.
  - Timer state must not be lost or reset.
  - No warning may be logged, whether duplicate, no-Toaster or multiple-Toaster.

  One acceptable approach is to defer the detach briefly, for example by a microtask, and cancel it if the same Toaster re-attaches. The requirement is the behaviour above, not that particular mechanism.

- **Development warnings, deduplicated:**
  - **No-Toaster warning.** If a toast is accepted while no Toaster is active, no warning is logged straight away. It is logged only if no Toaster has become active shortly afterwards, and at most once per period without a Toaster. This lets an application create toasts during start-up, just before its Toaster mounts, without a false warning. The exact delay is an internal implementation detail chosen in P-09. It is not part of the public API. This warning is also the hint for a duplicate install (C-01).
  - **Cap warning.** This is logged once the first time a creation is rejected because of the cap. It is logged again only after the store has dropped below the cap and then reached it again.
  - **Production.** No warnings are logged and the warning code is removed from the production build.
- `toast.dismiss()` with no active Toaster removes queued toasts directly. Each fires `onDismiss` exactly once.

### 8.5 One Toaster per runtime

- 2.0 supports exactly one active `<Toaster />`.
- The first Toaster to attach becomes active.
- Any further Toaster that attaches while another is active renders nothing. In development it logs one warning that names the problem and links to the docs.
- If the active Toaster detaches while another mounted Toaster is waiting, the earliest waiting Toaster becomes active and renders the queued toasts.
- StrictMode re-mounting the same Toaster instance never counts as a second Toaster, because attachment is keyed by instance and detach is deferred (§8.4).

## 9. Toast lifecycle and state machine

```
           create (accepted)
                 │
                 ▼
            ┌────────┐  dismiss (no animation)
       ┌───▶│ queued │──────────────────────────────────┐
       │    └───┬────┘                                  │
Toaster│        │ active Toaster & slot free at position│
detach │        ▼                                       │
       │    ┌──────────┐  dismiss                       │
       ├────│ entering │────────────┐                   │
       │    └───┬──────┘            │                   │
       │        │ enter done /      │                   │
       │        │ fallback          ▼                   │
       │    ┌─────────┐  dismiss/timeout/swipe/action ┌─────────┐
       └────│ visible │──────────────────────────────▶│ exiting │
            └─────────┘◀─────────────┐                └───┬─────┘
                 ▲   replace same id │                    │ exit done / fallback
                 │   (revival, §14)  └────── entering ◀───┤ (same position)
                 │                                        │
                 │      relocation: re-queued at new  ◀───┤ (position changed, §14)
                 │      position (new seq)                ▼
                 │                                     removed  (onDismiss fires here)
```

Rules:

1. **A rendered toast is never removed immediately on dismissal.** An `entering` or `visible` toast moves to `exiting`, and it is removed only once the exit has completed (D-13).
2. **A queued toast is removed directly when dismissed.** It has no exit animation, and `onDismiss` still fires.
3. **Completion detection.** The renderer reports `entered` and `exited` from `animationend`, filtered by target and by the `ret-` animation name. A fallback timeout of the configured motion duration plus a margin covers the cases where that event never arrives. Both paths are idempotent. With reduced motion, or a computed animation duration of `0s`, the transition completes on the next frame. The lifecycle never depends only on animation events.
4. **Exiting is terminal except for revival.** Dismissing an `exiting` toast does nothing. Its controls are inert (`inert` or equivalent). The only way out of `exiting` other than removal is a replacement that uses the same ID (§14).
5. **The timer starts when a toast enters `visible`.** It never runs while the toast is `queued`, `entering` or `exiting`, or while no Toaster is active (§8.4).
6. **A toast keeps its slot while exiting.** It counts toward `maxVisible` until it reaches `removed` (§11).

## 10. Timer and pause model

- **Remaining-time semantics:**
  - On entering `visible`: schedule a timeout for `remaining`.
  - On pause: `remaining -= now − runningSince`, then clear the timeout.
  - On resume: schedule `remaining` again (D-08).
  - Time is measured with `performance.now()`.
  - Example: a 5000 ms toast paused at 2000 ms resumes with about 3000 ms left. **Resuming never restarts the full duration.**
- **Default duration:** 5000 ms for finite toasts of every type. It can be configured on the Toaster or per toast.
- **Four independent pause reasons, combined** (D-07, D-09), plus one internal reason:

| Reason             | Source                                                                                                            | Scope                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `hover`            | `pointerenter` / `pointerleave` on the position's list                                                            | **The whole position stack** |
| `focus-within`     | `focusin` / `focusout` on the toast, using `relatedTarget` to ignore moves between controls inside the same toast | **Per toast**                |
| `window-blur`      | `window` `blur` / `focus`, and `document.hasFocus()` at attach                                                    | Global                       |
| `document-hidden`  | `visibilitychange`, and `document.hidden` at attach                                                               | Global                       |
| `swipe` (internal) | an active swipe gesture                                                                                           | Per toast                    |

A toast is paused when the combined set of its toast-scoped reasons, its position's reasons and the global reasons is not empty. It resumes only when **every** active reason has cleared. A toast never expires while focus is on a focusable element inside it.

- **Persistent toasts** (`duration: Infinity` and loading toasts) never schedule a timeout.
- **Expiry** moves the toast to `exiting` with reason `timeout` and fires `onAutoClose` (§16).
- **Replacement** resets the timer to the new duration (`remaining = duration`, `runningSince = null`). The timer starts again when the toast is `visible` and not paused. Active pause reasons stay in effect (§14).
- **Progress** reads `duration` and `remaining` from the snapshot and pauses through CSS (§22). It has no clock of its own.
- **Listeners** are attached once by the active Toaster, not once per toast. They are removed on detach and are idempotent under StrictMode.
- **No public toggles.** The pause behaviours cannot be switched off in 2.0.
- `duration <= 0` is treated as `0`: the toast expires on the first timer tick after it becomes visible. This is tested.

## 11. Queue and maxVisible semantics

- `maxVisible` defaults to **4** and applies **per position**.
- A toast occupies a slot while it is `entering`, `visible` or `exiting`. The slot is freed **only when the toast reaches `removed`**, or when a relocating toast leaves the position (§14).
- **Overflow is queued, never deleted** (D-12). No accepted toast leaves the store without `onDismiss`.
- **The order is deterministic FIFO by `seq` within each position.** When a slot frees, the queued toast with the lowest `seq` at that position moves to `entering`.
- **Positions are independent.** A queue at one position never uses capacity at another.
- Replacing a queued toast keeps its `seq`, so it keeps its place in the queue, unless the position changes (§14).
- **Revival does not need a new slot.** An exiting toast still holds its slot, so reviving it can never push a position over `maxVisible` (§14).
- **Persistent toasts keep their slots.** If all four slots at a position hold persistent toasts, queued toasts at that position wait until one is dismissed or replaced with a finite duration. This is documented and tested.
- `toast.dismiss()` with no ID dismisses everything. Rendered toasts exit and queued toasts are removed directly. Each fires `onDismiss` exactly once.
- If `maxVisible` changes at runtime, the new value applies from then on. Lowering it does not dismiss any visible toast. The count simply falls to the new limit as toasts are removed. Until then a position may hold more rendered toasts than the new limit; no promotion happens while it does (AC-Q-2 is read this way: the store never _creates_ occupancy above the current limit).

## 12. Positioning and stack-order semantics

- All six positions are supported. The default is **`top-right`**.
- **The requested position is never changed based on viewport width.** Responsive CSS may change width, margins and layout. For example, on narrow screens a toast may span the available width minus the gutters, but it keeps its position for stacking order, swipe direction and queueing.
- **The newest toast is nearest the anchored edge** (D-15). At top positions the newest is on top and older toasts move down. At bottom positions the newest is at the bottom.
- **DOM order matches visual order.** Each position renders its list in visual order from top to bottom, so reading order and tab order match the screen. `column-reverse` is not used.
- Each position is one `<ol>`, rendered only while it has toasts. Offsets come from custom properties, and safe-area insets are respected.
- Centre positions are centred without a transform on the container.
- Positions are **physical**, so `left` means left even in RTL (§20).
- Rendering is **inline**, using `position: fixed`, with no portal. The Toaster should be placed near the application root, as the docs will say.

## 13. Promise toast semantics

```ts
const id = toast.promise(saveProject(), {
  loading: "Saving project...",
  success: (project) => `Saved ${project.name}`,
  error: (err) => (err instanceof Error ? err.message : "Could not save project"),
});
```

- **Input:** a `Promise<T>`, or `() => Promise<T>`, which is invoked immediately. A synchronous throw from the function counts as a rejection.
- **`loading`, `success` and `error` are all required.** The type checker enforces this.
- **Loading:** a `loading` toast (persistent, with a spinner) is created immediately and its ID is returned. A custom `options.id` is honoured. The record receives a fresh `promiseToken`.
- **Settlement is internal.** It is **not** a public creation call, so it never triggers the revival rule in §14. It applies only when the record with that ID still exists, still carries the same `promiseToken`, and is not `exiting`. In every other case settlement does nothing. That includes a toast that has been dismissed for any reason, removed, or replaced by another public call.
  - **A dismissed promise toast is never revived or shown again.** Dismissal clears the token.
  - A promise only ever updates the toast it created. It never touches a later toast that reuses the same ID.
- **Resolve** replaces the toast with a `success` toast. The content is `messages.success` or `messages.success(data)`. It receives a finite duration (`options.duration`, or the Toaster default) and its timer starts as for any replacement.
- **Reject** replaces the toast with an `error` toast. The content is `messages.error` or `messages.error(err)`.
- **Message functions that throw:**
  - If `success(data)` throws, the toast moves to the error state with the thrown value.
  - If `error(err)` throws, the toast is dismissed (`programmatic`) and the exception is reported through the callback error path (§8.2).
  - A toast is never left loading forever.
- **One set of `options`** applies to every state. There is no per-state description.
- **Typing:** `T` is inferred, so `success` receives `T`. `error` receives `unknown`.
- **Rejection handling:** the library attaches handlers, so the caller's rejection counts as handled. The library never creates an extra unhandled rejection. Callers still await their own promise for the result. This is documented.
- **Ownership ends when the toast is replaced.** If a separate public toast call replaces the promise toast (same `id`) before the promise settles, the promise no longer owns that toast. When it later settles, it must not change or revive the toast that replaced it.
- **Return value:** `toast.promise` returns the loading toast's real `ToastId`, or `undefined` if creating the loading toast was rejected (server, or the no-Toaster cap). In that case no record exists and settlement does nothing.

## 14. Update and replacement semantics

There is no separate update API. Calling any public creation function with an existing `id` **replaces** that toast. It is not a shallow merge.

- **`id` is only a lookup key.** The stored `id` is `readonly` and immutable (D-02). Internal fields (`phase`, `seq`, the timer, pause state, the promise token) cannot be set through options, either in the types or at runtime.
- **The new call defines the toast.** `type`, `custom`, `content`, `description` and every option come from the new call. Options it leaves out fall back to the Toaster defaults (or the custom defaults in §6.4). Nothing is carried over from the previous definition except:
  - `id`
  - `seq`, unless the toast is relocated
  - `phase`, unless the toast is being revived or relocated
  - active pause reasons
- **Every replacement:**
  - increments `revision`
  - resets the timer to the new duration (§10)
  - clears the `promiseToken` if the call came from outside `toast.promise` (§13)
  - re-announces the toast if it is rendered (§17)
- **Behaviour by phase:**

| Current phase                       | Same position                                                                                                                                                                                                                                                  | Different position (relocation)                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queued`                            | Content and options are replaced. Queue position is kept.                                                                                                                                                                                                      | Moves to the new position's queue with a new `seq` (at the back). No callbacks fire.                                                                                                            |
| `entering` / `visible`              | Replaced in place, with no remount and no new enter animation. The timer is reset.                                                                                                                                                                             | Exits from the old stack with internal reason `relocate`, so no callbacks fire. When the exit completes it frees the old slot, gets a new `seq` and joins the new position as if newly created. |
| `exiting` (dismissed or timing out) | **Revival.** Pending removal is cancelled and the exit reason cleared. The toast goes back to `entering` with the new definition and keeps its slot, so capacity cannot overflow. `onDismiss` does not fire. If `onAutoClose` already fired, it is not undone. | Pending removal is cancelled. The exit continues as a `relocate` exit, then the toast joins the new position as above. `onDismiss` does not fire.                                               |
| removed / unknown ID                | A new toast is created. Below the cap, or with an active Toaster, it is accepted. At the cap with no Toaster, it is rejected (§8.4).                                                                                                                           | Same as the same-position case.                                                                                                                                                                 |

- **Determinism:** revival and relocation are covered by unit tests in every phase combination (AC-API-6, AC-LC-3).
- Calling `toast.dismiss(id)` with an unknown ID does nothing.

## 15. Action semantics

- Each toast has at most one action, `{ label, onClick }`. `label` is a `ReactNode`. There are no confirm/cancel pairs. Custom toasts have no library action (§6.4).
- The action renders as a native `<button type="button" class="ret-toast__action">`, after the content and before the close button in tab order.
- Clicking the action calls `onClick(event)`. **The toast is then dismissed with reason `action`, unless `onClick` called `event.preventDefault()`.**
- The action button never starts a swipe. Clicking the toast body never dismisses it.
- If `onClick` throws, the library does not catch it, because it is the user's handler on a user event. The toast is not dismissed.
- An exiting toast's action cannot be activated (§9 rule 4).

## 16. Dismissal and callback semantics

| Cause                       | `DismissReason` | Notes                                                                                |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Timer expiry                | `timeout`       | The only cause that fires `onAutoClose`.                                             |
| Close button                | `close-button`  | Native button. On by default for normal toasts and off by default for custom toasts. |
| Swipe                       | `swipe`         | §19                                                                                  |
| `toast.dismiss(id?)`        | `programmatic`  | Also used when a throwing `error(err)` message function dismisses the toast (§13).   |
| Action                      | `action`        | Unless `preventDefault()` (§15).                                                     |
| **Click on the toast body** | none            | **Never dismisses** (D-17).                                                          |

- `onAutoClose(snapshot)` fires once, synchronously, when timer expiry moves the toast from `visible` to `exiting`.
- `onDismiss(snapshot, reason)` fires **exactly once** when an accepted toast leaves the store (`→ removed`), whatever the cause. That includes queued toasts that are dismissed, toasts removed by `dismiss()` with no ID, fallback-completed exits, and exiting toasts that finish when the Toaster detaches.
- For a timeout the order is always `onAutoClose`, then the exit, then `onDismiss`.
- These events fire **no** callbacks:
  - a replacement
  - a revival
  - a relocation
  - a creation call that is rejected (server or cap), because that toast was never accepted
- When a callback fires, the version that runs is the one on the record at that moment, which means the most recent replacement's version.
- Callbacks run after the state change is committed and subscribers are notified, never during a React render. Errors are isolated (§8.2).
- There is no `onOpen` callback.

## 17. Accessibility contract

Accessibility is an architectural requirement. Everything that tooling can check is tested automatically. The rest is checked manually in P-29.

### 17.1 Live regions (normal and custom toasts)

- The active Toaster renders **persistent**, visually hidden live regions as soon as it mounts, even when there are no toasts: one polite (`role="status"`, `aria-live="polite"`) and one assertive (`aria-live="assertive"`). They exist before any content is inserted (D-18).
- Individual toasts never have `role="alert"`, and the visible toast list is not itself a live region.
- **Politeness by type:**

| Type              | Politeness    |
| ----------------- | ------------- |
| default (neutral) | polite        |
| success           | polite        |
| info              | polite        |
| warning           | polite        |
| loading           | polite        |
| custom            | polite        |
| error             | **assertive** |

A promise that settles as an error is announced assertively, because the settlement replaces the toast with an error toast.

- **Announcement text** is taken from the rendered toast's text content (content plus description). Warning and error announcements are prefixed with `labels.warningPrefix` and `labels.errorPrefix` ("Warning:" and "Error:" by default). No other type gets a prefix.
- **There is no per-toast politeness override in 2.0.** Interrupting assistive technology is limited to errors.
- **Each toast is announced once when it becomes rendered and once on each replacement.** Re-renders that do not change content, and StrictMode double renders, are not announced. Queued toasts are announced when they become rendered, not when they are created.

### 17.2 Semantics of normal toasts (library-owned shell)

- The toaster root is `<section aria-label={labels.region}>`, with `aria-keyshortcuts` set to the hotkey in effect, in ARIA notation (`Alt+T` by default), when one is configured and ARIA can name it: modifiers as `Control`, `Alt`, `Meta` and `Shift`, in that order, then a letter, digit, F1 to F24, `Space` or a named key such as `Escape` or `ArrowUp`. Other keys, such as punctuation, the numpad and unknown codes, are not advertised, and the hotkey still works. The section needs no `role`. Each position is an `<ol>` and each toast is an `<li>`.
- Icons, including the loading spinner, are inline SVG with `aria-hidden="true"` and `focusable="false"` (D-19).
- The close and action controls are native `<button type="button">` elements. The close button is named by `labels.close`, and its target is at least 24×24 CSS px (WCAG 2.5.8).
- Type is never conveyed by colour alone. Each type has a distinct icon shape, and warnings and errors get a text prefix for screen readers.
- **Inaccessible persistent toasts.** A persistent normal toast with `closeButton: false` and no action cannot be dismissed with a keyboard. Creating one logs a development warning. Custom toasts are excluded, because they may contain their own controls (§17.3).

### 17.3 Custom content: where responsibility lies

| The library provides, for custom toasts                           | The consumer is responsible for                                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent live-region announcement of the rendered text (polite) | The meaning and quality of that text                                                                                                                     |
| Region landmark, list structure, hotkey and focus restoration     | Accessible names, roles and states of every control inside the custom content                                                                            |
| Pausing on hover, focus-within and window/document state          | Keyboard operability of the custom content                                                                                                               |
| Lifecycle, motion (including reduced motion) and swipe            | Contrast, focus-visible styles and target sizes inside the custom content                                                                                |
| No library close button by default (`closeButton: false`)         | A keyboard-accessible way to dismiss a **persistent** custom toast (for example a button that calls `toast.dismiss(id)`), or setting `closeButton: true` |
|                                                                   | Marking decorative content `aria-hidden`                                                                                                                 |

The docs (§31) state this boundary explicitly. The demo's custom-toast example must itself meet it.

### 17.4 Focus

- Toasts never take focus when they appear.
- Every library control has a `:focus-visible` style with at least 3:1 contrast.
- Focus moves deliberately when a focused toast is removed (§18). It is never left on `<body>`.
- A toast that contains focus is paused (§10).

### 17.5 Motion and visuals

- `prefers-reduced-motion: reduce` removes translation and scale motion (§22) (D-21).
- Text in every theme and variant meets 4.5:1 contrast. Icons, borders that carry meaning, and focus rings meet 3:1 (D-20). This applies to the library shell; custom content is the consumer's responsibility (§17.3).
- The toaster is usable in `forced-colors: active`.

### 17.6 Testing

- axe (`vitest-axe`) runs across every theme, every normal type, a toast with an action, the close button, RTL, and a custom toast with accessible sample content. In jsdom it checks structure only: names, roles, landmark and list structure and valid ARIA. It skips content inside an inert toast and has no CSS or colour checks, so it does not replace contrast checks (P-17), real-browser behaviour (P-22) or the screen-reader checklist (P-29).
- Tests assert:
  - live regions are present before content
  - politeness matches the type
  - prefixes are present
  - `aria-hidden` is set on icons
  - controls have accessible names
  - toasts never have `role="alert"`
  - the hotkey and focus restoration work
  - focus-within pauses the timer
  - the warning for an inaccessible persistent normal toast fires
- Playwright verifies reduced motion through emulation.
- Screen-reader output cannot be asserted reliably in CI. A manual checklist (NVDA with Firefox and Chrome, VoiceOver with Safari on macOS and iOS) must be completed before release (P-29).

## 18. Keyboard interaction

- **Hotkey:** the default is **Alt+T**, matched on `altKey` and `KeyboardEvent.code === "KeyT"` so it works regardless of keyboard layout or macOS Option characters. It is configurable through `hotkey`, and `hotkey={false}` disables it.
  - Pressing the hotkey moves focus to the first rendered toast (in visual order) and, when focus came from outside the region, records the element that had focus before.
  - It does nothing when there are no rendered toasts.
- **Tab** moves through the controls in DOM order, which matches visual order (§12).
- **Escape**, while focus is inside the region, returns focus to the element that had it before the hotkey when it can, and otherwise releases focus to the document: when nothing was recorded, or the recorded element has gone or no longer takes focus. **Escape never dismisses a toast.**
- **Focus restoration when the focused toast is removed:** when a toast that holds focus starts to exit, focus moves before the toast becomes inert, and stays in the region:
  1. The equivalent control in the next toast: its close button or action from the same control, the toast itself from the toast. Focus in custom content has no equivalent.
  2. Otherwise, the previous toast.
  3. Otherwise, the region, which takes focus from script only (`tabindex="-1"`).

  Next and previous are the adjacent toasts that are not exiting, in DOM order across every position. Removal restoration never uses the element that had focus before the hotkey: Escape returns focus there, from the region too.

- **There is no focus trap.** The region is never modal.
- The hotkey listener is attached by the active Toaster and removed on detach.

## 19. Swipe and gesture behaviour

- Swipe uses Pointer Events and responds only to `pointerType` `touch` and `pen`. **A mouse drag never dismisses a toast.**
- **Direction:** left positions swipe toward the left edge, right positions toward the right edge, and **centre positions swipe horizontally in either direction**.
- **Threshold:** a toast is dismissed when the drag distance **or** the release velocity passes its threshold. The numeric values are set by prototype in P-21, stored as named constants and covered by tests.
- During a drag, the toast follows the pointer through a custom-property transform and its opacity fades. The timer is paused with the internal reason `swipe`.
- Releasing below the threshold springs the toast back. Releasing above it exits with reason `swipe`, continuing from the dragged offset.
- A swipe never starts on interactive descendants (buttons, links, form fields), including those inside custom content, and never while text is being selected.
- `touch-action: pan-y` keeps vertical scrolling working. `pointercancel` and lost pointer capture restore the toast.
- With reduced motion, swipe still dismisses but there is no travel animation after release.
- Swipe is never the only dismissal path for a normal toast with the default close button. It also satisfies the single-pointer alternative requirement in WCAG 2.5.1.
- Swipe applies to custom toasts too.

## 20. RTL behaviour

- Direction is inherited from the DOM. The CSS uses logical properties and `:dir(rtl)`, so a Toaster inside `dir="rtl"` mirrors without JavaScript. There is no `dir` prop in 2.0.
- Inside a normal toast, the order of icon, content, action and close button mirrors in RTL.
- **Progress** is anchored at the inline-start edge and depletes toward it. `transform-origin` is switched under `:dir(rtl)` (D-11).
- **Positions are physical.** `top-left` stays at the physical top left, and swipe follows the physical edge.
- Enter and exit motion is vertical, so it does not depend on direction.
- Playwright verifies RTL (AC-RTL-1).

## 21. Theme and styling architecture

- Plain CSS, shipped at `react-elegant-toasts/styles.css`. No CSS-in-JS, no Tailwind, and no style injection at runtime.
- **Every class and keyframe uses the `ret-` prefix** (D-23). Indicative names:
  - `.ret-toaster`, `.ret-toaster__list`, `.ret-toast`
  - `.ret-toast--success|error|warning|info|loading|default`, `.ret-toast--custom`
  - `.ret-toast__icon`, `__content`, `__title`, `__description`, `__action`, `__close`, `__progress`
  - `@keyframes ret-enter`, `ret-exit`, `ret-progress`, `ret-spin`
  - State is exposed through data attributes: `data-phase`, `data-position`, `data-theme`, `data-paused`, `data-swiping`.
- **Custom toasts** render inside `.ret-toast.ret-toast--custom`. That wrapper carries layout, motion and swipe only: no surface, border, padding, typography or icon.
- **Themes:** `theme` sets `data-theme="light|dark|system"`. The `system` theme resolves through `@media (prefers-color-scheme: dark)` in CSS, so there is no JavaScript involved and no hydration mismatch (D-24).
- **Custom properties** are the main way to customise styling. They cover surface, text, border, shadow, the accent for each type, radius, gap, offset, width, font, z-index (replacing the inline 9999), motion durations and easings, and progress height. They are `--ret-*` tokens scoped to `.ret-toaster`, never `:root`. Consumers override them for a Toaster globally and through the documented theme selectors. P-17 finalises the token list, except the motion tokens, which P-18 owns because they must agree with the lifecycle fallback timing (§9 rule 3), and the progress tokens, which P-20 owns.
- **Specificity** is kept low: library defaults use single-class selectors or, preferably, `:where()`, so a consumer's selector wins. No `!important`.
- **Escape hatches:** `className` on the Toaster and on each toast.
- **Fonts** inherit from the application. No web fonts are loaded.
- **Public CSS contract (OQ-25, resolved before P-17).** Stable for 2.x: the documented `--ret-*` custom properties, the documented `ret-*` BEM classes, and the documented `data-theme`, `data-position` and `data-phase` attributes. Not part of 2.0: `@layer` as part of the public contract, a `classNames` slot map, and a per-toast public `style`. No 0.x selector or variable is part of the v2 contract. Anything undocumented, such as `tabindex`, `inert`, the live regions' inline styles or DOM order across positions, is an implementation detail.
- **Visual direction (OQ-24, resolved at P-17 D2).** Approved by the maintainer after reviewing the P-17 D1 prototype in Chromium: a **neutral elevated card with a semantic accent**. This is visual design sign-off only, not browser certification (P-22).
  - **Surfaces:** neutral in light and dark themes. Semantic state never colours the whole toast surface.
  - **Accent:** success, error, warning, info and loading are shown by an **accent-coloured icon on a subtle tinted icon container**. The default toast stays neutral. Not used: a dominant inline-start status stripe, full semantic card backgrounds, or a strong semantic border tint as the primary signal.
  - **Card:** a restrained elevated card with a subtle border and soft shadow, roughly a 10px radius, and compact but comfortable spacing.
  - **Typography:** compact, with strong primary text and a visually secondary but accessible description. The prototype's roughly 14/20 primary and 13/18 description sizes are the starting point, not a public contract.
  - **Long content:** it wraps. Long unbroken strings and URLs never overflow, and nothing is truncated automatically to keep a toast short.
  - **Controls:** a compact action, an unobtrusive 24×24 close control, and a visible, accessible focus treatment. The prototype's toast-root ring, drawn inside the toast against the known surface, is the preferred direction. The final focus styles are implemented in P-17 S5.
  - **Custom content:** chrome-less. The library close control sits in the logical top/end corner without a wrapper. Its default colour is an S3 implementation detail, not part of OQ-24.
  - **Themes:** light, dark and system share one visual language, and `system` stays CSS-driven. The light theme's card must stay distinguishable against white and lightly tinted backgrounds through its whole border, surface and elevation treatment. Its decorative border does not need to become a heavy high-contrast one.
  - Exact token values may be refined in S1 to S4 while keeping this character. OQ-24 covers no motion.

## 22. Animation and motion architecture

- **There is one motion system.** Toasts enter from their anchored edge (from above at top positions, from below at bottom positions) with opacity and a subtle scale. They exit in reverse, or from the swipe offset after a swipe.
- **Motion is driven by CSS.** The keyframes are chosen by `data-phase`, and durations and easings are custom properties.
- **Lifecycle integration** follows §9 rule 3.
- **Smooth repositioning:** existing toasts move to their new places using transforms, not layout animation. Two techniques are candidates: measured offsets (ResizeObserver plus custom properties plus CSS transitions), or FLIP with the Web Animations API. **This is a P-19 prototype gate.** P-19 builds both, records the choice and the reasons in its PR, and must stay within these constraints: transforms only, no per-frame React state, and correct behaviour under reduced motion.
- **Progress:** a `ret-progress` keyframe animates `transform: scaleX(1 → 0)` over `duration`. `animation-delay: -(duration − remaining)` keeps it in sync on mount and after replacement, and `animation-play-state: paused` under `data-paused` keeps it in step with the store (D-10). **Progress is off by default.** When it is enabled it still depletes under reduced motion, because it is information rather than decoration.
- **Reduced motion:** enter, exit and reflow use no translation or scale, only a short fade at most. Fallback timeouts are shortened to match.
- **The spinner** (`ret-spin`) stops under reduced motion and becomes a static indicator.
- No animation library is used, and no `requestAnimationFrame` loop sets React state.

## 23. SSR and Next.js considerations

- Nothing touches the DOM at import time or during render. Layout effects use an isomorphic layout-effect helper, which avoids React 18's server warning.
- `getServerSnapshot` returns a constant empty snapshot. Server HTML for `<Toaster />` contains only the empty region and live-region shells, so hydration matches.
- **On the server, `toast()` is rejected and stores nothing** (§8.3). Server state cannot leak between requests. In development it logs one warning.
- The built package entry (`dist/index.js`, the file the `"."` export points to) starts with `"use client"`. The directive is added only through the tsup `banner`, never in `src/index.ts`, because a source directive would be kept by esbuild and duplicated by the banner. This means `<Toaster />` can go straight into an App Router layout. Calling `toast()` from Server Components or server actions has no effect, and the docs say to call it from client code.
- Themes are CSS-only, so there is no theme flash and no hydration mismatch.
- Rendering is inline with `position: fixed`, so no portal target is needed on the server.
- **Verification (§27):**
  - `renderToString(<Toaster />)` runs against the **packed ESM package** in Node.
  - A **Next.js App Router fixture** builds and renders with `<Toaster />` in `app/layout.tsx` and `import "react-elegant-toasts/styles.css"`.

## 24. Package and export design

### 24.1 Package shape (ESM-only)

```jsonc
{
  "name": "react-elegant-toasts",
  "version": "2.0.0",
  "type": "module",
  "sideEffects": ["**/*.css"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./styles.css": "./dist/styles.css",
    "./package.json": "./package.json"
  },
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
  "publishConfig": { "access": "public", "provenance": true }
}
```

### 24.2 Requirements

- **The package is ESM-only.** There is no CJS build, no `require` export condition, no `.cjs`, `.d.cts` or `.d.mts` files, and no `main` field pointing at CJS. The top-level `types` field remains as a fallback for older TypeScript resolution.
- **No runtime `dependencies`.** React and ReactDOM are peer dependencies only (D-25).
- **There is no `engines` field.** This is a browser library, and adding the field only produces install warnings.
- `./styles.css` is the official CSS entry. Consumers never import from `dist/`, and the exports map blocks deep imports (D-26). `sideEffects` keeps the CSS (D-27).
- **`"use client"`:** the built `dist/index.js` starts with the directive (D-28). tsup's Rollup tree-shake step, which strips directives, is disabled, and the directive is added through `banner`. P-07 verifies it.
- `prepare` and `.npmignore` are removed, in favour of the `files` allow-list (D-30). `LICENSE` and `README.md` are included automatically.
- **Minimum TypeScript for consumers: 5.0**, with `moduleResolution` set to `bundler`, `node16` or `nodenext`. The validation step checks this (§27).
- Source maps are shipped. Whether `src/` is also shipped is decided in P-03 and must fit within the size budget.
- **Build:** tsup 8 with a single config file, ESM format, declarations emitted and the JSX runtime set to automatic.

### 24.3 Compatibility guidance (documented in the README and migration guide)

- **CommonJS is not part of the supported package contract.**
- Consumers whose test setups use CommonJS, for example Jest in its default CJS mode, may need to configure ESM support or transform this package (for example through `transformIgnorePatterns`). The docs include a short example. Vitest needs no configuration.
- Some recent Node versions can `require()` ESM. This package makes **no API guarantee** about that, and it is not tested.
- Bundlers (Vite, webpack 5, Next.js, Rspack, esbuild) and modern Node ESM are supported targets.

## 25. React 18/19 compatibility strategy

- **Peer range:** `^18.0.0 || ^19.0.0` for both `react` and `react-dom`.
- **APIs used:** `useSyncExternalStore`, `useEffect`, an isomorphic `useLayoutEffect`, `useRef`, `useState`, `useId` and `memo`. All are stable in both versions, so the `use-sync-external-store` shim is not needed.
- **APIs avoided:**
  - React 19-only: `use`, ref-as-prop without `forwardRef`, Actions, `<Activity>`.
  - Deprecated or removed in 19: `defaultProps` on function components, string refs, `findDOMNode`, `propTypes`.
- **Types:** the declarations must compile against both `@types/react@18` and `@types/react@19`. That means using `React.JSX` and `ReactNode`, not the global `JSX` namespace, and not relying on implicit `children`.
- **JSX:** the automatic runtime (`react/jsx-runtime`). The packed-ESM SSR test checks that this import resolves under native Node ESM for both React versions.
- **StrictMode:** double effects and double renders must not double-attach listeners, double-announce, double-fire callbacks, double-warn, or count as two Toasters (§8.4, §8.5). The suite runs under StrictMode.
- **CI matrix:** unit, component and type tests, plus the consumer fixtures, run against React 18 and React 19, each with matching `@types/react`.

## 26. Testing strategy

| Layer         | Tooling                                                    | Covers                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store unit    | Vitest (node environment), fake timers                     | IDs; replacement, revival and relocation; lifecycle; per-position queue; slot freed on removal; remaining-time timers; combined pause reasons; callbacks and their order; no-Toaster cap, rejection and warnings; detach and re-attach; one-Toaster arbitration; server rejection; error isolation                                                        |
| Facade unit   | Vitest                                                     | `toast.*` variants; `toast.custom` defaults; `toast.promise` (resolve, reject, throwing message functions, function input, never reviving after dismiss, ownership token); `dismiss` with and without an ID                                                                                                                                               |
| Type tests    | Vitest `expectTypeOf`                                      | Export list; immutable `id`; creation functions return `ToastId \| undefined`; promise inference; required `success`/`error`; `CustomToastOptions` excludes chrome options; `ToastId` is `string`                                                                                                                                                         |
| Component     | Vitest + **jsdom** + Testing Library, run under StrictMode | Positions and order; close button default on for normal and off for custom; action dismissal and `preventDefault`; no dismissal on body click; lifecycle with fallbacks; hover pausing the stack; focus-within pausing the toast; blur and visibility; hotkey, Escape and focus restoration; live regions and announcements; theme attribute; `className` |
| Accessibility | **vitest-axe**                                             | The §17.6 matrix                                                                                                                                                                                                                                                                                                                                          |
| Browser       | **Playwright: Chromium, WebKit, Firefox**                  | Real animation lifecycle; reflow; reduced-motion emulation; touch swipe (thresholds, cancel, scrolling, no mouse drag); RTL; progress direction and pause sync; real blur and visibility; forced colours (Chromium)                                                                                                                                       |
| Package       | §27                                                        | Packed ESM tarball in Vite and Next.js fixtures                                                                                                                                                                                                                                                                                                           |
| Compatibility | CI matrix                                                  | React 18 and 19 for every layer except the browser suite, which runs on the latest React                                                                                                                                                                                                                                                                  |

Rules:

- Every behavioural D-nn defect gets a regression test named after it, for example `it("D-08: resuming does not restart full duration")`.
- `requestAnimationFrame` is never mocked just to make timers work.
- Package tests run against the packed artifact, not only `src/` (D-36).
- The 0.x tests are deleted, not ported (C-09).
- There is **no visual-regression suite** for 2.0.
- Whether to add a coverage threshold is decided after P-14. Coverage is reported either way.

## 27. Package-consumer validation strategy

`scripts/validate-package` (or equivalent) and the blocking CI job `build-package`:

1. Build the library.
2. **publint**, plus **AreTheTypesWrong** with the ESM-only profile (`attw --pack --profile esm-only --exclude-entrypoints ./styles.css`). The CSS entry point has no type declarations, so attw always reports it as unresolved and it is excluded. Any other problem fails the step.
3. `npm pack` produces the tarball.
4. Check the tarball contents: it contains `dist/index.js`, `dist/index.d.ts` and `dist/styles.css`, and **no** CJS files. `package.json` has `"type": "module"` and no `require` condition.
5. Verify that `dist/index.js` starts with `"use client"`.
6. **Vite fixture** (`fixtures/consumer-vite`: Vite, strict TypeScript, `moduleResolution: "bundler"`), installed from the tarball, once with React 18 and once with React 19. It must:
   - `import { Toaster, toast } from "react-elegant-toasts"` and `import "react-elegant-toasts/styles.css"`
   - pass `tsc --noEmit` with the **latest TypeScript** and with **TypeScript 5.0** (the documented minimum), using a type-usage file that covers every public API
   - pass `vite build`, with the CSS present in the output so it was not tree-shaken
   - pass a rendering test that mounts `<Toaster />`, calls `toast.success(...)` and asserts the toast appears
   - fail if it tries to import `react-elegant-toasts/dist/...`, because the exports map blocks it
7. **Node ESM SSR smoke test** against the packed package: `renderToString(<Toaster />)` under native Node ESM, once with React 18 and once with React 19, with no errors and no DOM access. Calling `toast()` on the server must store nothing.
8. **Next.js App Router fixture** (`fixtures/consumer-next`), installed from the tarball:
   - `<Toaster />` in `app/layout.tsx`, the CSS imported there, and a client component that calls `toast()`
   - `next build` succeeds
   - a Playwright check against `next start` shows a toast
   - this confirms that `"use client"` works through the real framework

The fixtures are excluded from the library's lint and typecheck. They install with their own lockfiles, or without one, and never touch the root lockfile. **There is no CJS smoke test.**

This list is the final 2.0 state, and it is built up in phases:

- P-07 adds steps 1–6, with the Vite fixture on React 18 and TypeScript 5.0, covering types and imports only.
- P-14 adds the rendering test.
- P-23 adds the React 19, `@types/react` 19 and latest-TypeScript legs, plus steps 7 and 8.

## 28. CI strategy

Every job is **blocking**. No quality gate uses `continue-on-error` (D-31).

| Job                           | Steps                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`                     | `npm ci`, `format:check` (pure check, no `git add`; D-32), `lint`, `typecheck` (library, tests and tooling configs checked separately)                                 |
| `test` (matrix: React 18, 19) | Unit, type, component and axe tests                                                                                                                                    |
| `build-package`               | Build, publint, attw (ESM-only), pack, tarball contents, `"use client"` check, Vite fixture (React 18/19, TS latest and 5.0), Node ESM SSR smoke test, Next.js fixture |
| `size`                        | Bundle-size check with size-limit against the budget (§33)                                                                                                             |
| `browser`                     | Playwright on Chromium, WebKit and Firefox                                                                                                                             |
| `demo`                        | Demo typecheck and build only. **It never deploys before 2.0.0** (§29).                                                                                                |

- **Triggers:** `push` and `pull_request` on `main` and `v2`, plus `workflow_dispatch` (C-07).
- **Node:** a single current Active LTS for tooling, pinned explicitly by major (Node 24 since P-06). It is a CI setting only, not an `engines` field. Moving to the next Active LTS is a deliberate, reviewed change (see P-06).
- **Hygiene:**
  - least-privilege `permissions:`
  - actions pinned to full commit SHAs, with a version comment
  - npm cache
  - no debug `ls` or `npm list` steps
  - automated dev-dependency update PRs (Dependabot, chosen in P-06)
- **Cleanup:** remove the stale `.github/workflows/deploy-demo` (D-34). P-06 guards `deploy-demo.yml` so it cannot deploy the 2.0 demo early.
- **Phasing:** the table is the final 2.0 state. P-06 adds `quality`, `test`, `build-package` and `demo`. P-07 extends `build-package`, P-22 adds `browser`, P-23 turns `test` into the React 18/19 matrix, and P-24 adds `size`. Each gate blocks from the phase that adds it.

## 29. Release and versioning strategy

- **Changesets** handle versions and changelogs. Every user-facing PR includes a changeset, and `CHANGELOG.md` is generated (D-33, D-35).
- **Pre-releases:** `2.0.0-next.N` on the **`next`** dist-tag, through Changesets pre mode. 2.0.0 is then published on `latest`.
- **Release workflow:**
  1. It is triggered by merging the Changesets "Version Packages" PR. The exact trigger is wired in P-28.
  2. It runs the **full** CI gate set, including package validation and size, before publishing.
  3. It publishes with **npm Trusted Publishing (OIDC)**, using `id-token: write` and provenance. There is no long-lived `NPM_TOKEN` once OIDC works. Trusted Publishing needs a recent npm CLI (11.5 or later at the time of writing; P-28 verifies this).
  4. It creates a GitHub release from the changelog entry.
- **LICENSE (MIT)** is added in P-01 (D-35).
- **No releases between P-03 and P-28.** P-03 sets `publishConfig.provenance: true`. The legacy `release.yml` (an `NPM_TOKEN` and no `id-token: write`) can then no longer publish. That is intended: no package release may be made from the intermediate P-03 to P-27 state through the legacy workflow. P-28 replaces the workflow with Trusted Publishing.
- **The demo deploys only with the final 2.0.0 release.** Pre-releases never deploy it.
- **After 2.0.0,** the 0.x versions are deprecated on npm with a message pointing to the migration guide.

## 30. Migration from 0.x to 2.0

The guide is `docs/MIGRATION.md`, written in P-27. It must say plainly that 2.0.0 directly follows 0.1.x and that **there was no 1.x**. It always uses the phrase "0.x → 2.0", never "v1". Required mappings:

| 0.x                                                        | 2.0                                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `<ToastProvider>…</ToastProvider>`                         | Render `<Toaster />` once, near the root, and remove the provider. Only one Toaster is supported.                           |
| `useToast().addToast({ type: "success", title, message })` | `toast.success(title, { description: message })`. Without a `title`, use `toast.success(message)`.                          |
| `addToast({ … })` with no `type` (0.x defaulted to `info`) | `toast.info(…)`. Note that a plain `toast()` in 2.0 is neutral, not info.                                                   |
| `updateToast(id, { … })`                                   | Call a creation function with `{ id }`. This **replaces** the toast and does not merge (§14).                               |
| `addToast()` always returned an ID                         | Creation returns `ToastId \| undefined`. It is `undefined` only when creation is rejected (§6.2).                           |
| `removeToast(id)` / `removeAll()`                          | `toast.dismiss(id)` / `toast.dismiss()`                                                                                     |
| `animation`                                                | Removed. There is a single motion system.                                                                                   |
| `closeOnClick`                                             | Removed. Clicking the body never dismisses. Use the close button, which is on by default.                                   |
| `onClose`                                                  | `onDismiss(toast, reason)` for any cause, or `onAutoClose` for timeouts only. In 0.x a user's `onClose` never fired (D-06). |
| `progressBar` (default on)                                 | `progress`, which is **off** by default                                                                                     |
| `rtl` per toast                                            | Inherited from the DOM direction                                                                                            |
| `role`                                                     | Removed. Politeness comes from the type (§17).                                                                              |
| `maxToasts` (default 5, global, drops the oldest)          | `maxVisible` (default 4, **per position**, queues instead of dropping)                                                      |
| `defaultPosition` / `defaultDuration`                      | `<Toaster position duration />` (defaults are `top-right` and 5000)                                                         |
| `containerClassName` / `containerStyle`                    | `<Toaster className />` plus CSS custom properties                                                                          |
| `pauseOnHover` / `pauseOnPageIdle` / `pauseOnFocusLoss`    | Always on, and now joined by focus-within. There are no toggles.                                                            |
| `import "react-elegant-toasts/dist/styles.css"`            | `import "react-elegant-toasts/styles.css"`                                                                                  |
| `.toast`, `.toast.success`, `.toast-title`, …              | `.ret-toast`, `.ret-toast--success`, `.ret-toast__title`, … plus custom properties                                          |
| `import useToast from "react-elegant-toasts"`              | Named imports only                                                                                                          |
| CommonJS `require("react-elegant-toasts")`                 | Not supported. The package is ESM-only (§24.3), and the guide includes Jest guidance.                                       |
| React ≥ 16.8                                               | React 18 or 19                                                                                                              |
| Content was a `string`                                     | Content is a `ReactNode`                                                                                                    |

The guide also includes before-and-after examples for Next.js.

## 31. Documentation and demo requirements

**README** (rewritten in P-26):

- Install, quick start, every `toast.*` API, and the Toaster props table with defaults (`top-right`, `maxVisible` 4 per position, 5000 ms, close button on, progress off, `system` theme, Alt+T).
- Custom toasts and their chrome-less contract.
- Theming and the custom-property reference.
- Accessibility, SSR and Next.js, RTL, and ESM-only compatibility guidance.
- Browser support and a link to the migration guide.
- No placeholders, and no claims that have not been checked (D-22, D-35). Any size claim comes from the measured value (§33).

**Docs:**

- `docs/MIGRATION.md`.
- A theming reference, either in the README or in `docs/THEMING.md`.
- `docs/ACCESSIBILITY.md`, which covers:
  - the politeness table
  - the hotkey and Escape behaviour
  - pausing
  - reduced motion
  - the **custom-content responsibility boundary** (§17.3)
  - the warning for inaccessible persistent toasts

**Demo** (rebuilt in P-25):

- Shows every type, all six positions, promise, action, custom (with an accessible example), dismiss, the theme switch, an RTL toggle and the per-position `maxVisible` queue.
- Notes how to try reduced motion and the hotkey.
- Uses the built package through its public exports.
- Has its own `tsconfig`.
- Deploys only with the final 2.0.0 release.

**TSDoc:** every public export has TSDoc, which is shipped in the `.d.ts`.

## 32. Performance goals

- No per-frame React state (D-10).
- A change to one toast re-renders only that item, plus its position list when the order changes, because items are memoised and snapshots are stable (D-16). Component tests check render counts.
- A fixed number of global listeners for the active Toaster, regardless of how many toasts exist.
- Creating N toasts renders at most `maxVisible` (4) items per position. The rest stay in memory as data.
- Store operations are O(n) or better in the number of toasts.
- No layout reads during render.
- Nothing runs at import time. The package tree-shakes, and only the CSS has side effects.

## 33. Bundle-size strategy

- **size-limit** (a dev dependency) measures the **ESM entry** (minified, gzip and brotli) and **`styles.css`** separately, with React marked as external. A CSS minifier dev dependency is optional and decided in P-24.
- **This plan sets no numeric budget.** P-24 records the measured baseline of the feature-complete 2.0 build. The budget is that baseline plus headroom agreed in the P-24 PR. CI fails when the budget is exceeded, and raising the budget requires a reviewed change to the budget file.
- The README size claim is updated from the measurement (D-35).

## 34. Security and dependency goals

- **Zero runtime dependencies,** and CI checks that `dependencies` is empty or absent.
- **No unsafe rendering:** no `dangerouslySetInnerHTML`, `eval` or `new Function`. React escapes all content.
- **CSP-friendly:**
  - no injected `<style>` elements
  - inline styles only through React's `style` property (CSSOM)
  - caveat, found in the P-17 review: on the server, React's `style` property becomes a `style="…"` attribute in the HTML. A restrictive `style-src` (without `'unsafe-inline'`) blocks that attribute when the HTML is parsed, and hydration does not apply it again. Styling that must hold on that path, such as the visually hidden live regions (§17.1), therefore also needs an equivalent `ret-*` rule in the stylesheet (P-17, decision 4).
- **No network access, storage, cookies or telemetry.**
- **Dev dependencies:**
  - committed lockfile and `npm ci`
  - automated update PRs
- **Supply chain:**
  - Trusted Publishing with provenance
  - least-privilege workflow permissions
  - pinned actions
  - `NPM_TOKEN` removed once OIDC works

## 35. Implementation phases

Each phase is one reviewable PR, or a small series of PRs, into `v2`, and must leave every enabled CI gate green. Each phase lists its scope, then what it must **not** do, then the defects it addresses. **Phases P-01 to P-16 have no unresolved product or architecture decisions.**

### Track A: Foundations (tooling; the 0.x code still builds)

**P-00 Planning.** This document.

**P-01 Repository hygiene**

- Scope:
  - add `LICENSE` (MIT)
  - delete `.github/workflows/deploy-demo`
  - remove `git add` from `format` and add a pure `format:check`
  - remove `prepare`
  - move `react` and `react-dom` to `devDependencies`, keeping them as peers
- Not in scope: the README rewrite, source changes.
- Defects: D-25 (in part), D-30, D-32 (in part), D-34, D-35 (LICENSE).

**P-02 TypeScript modernisation**

- Scope:
  - a strict, split `tsconfig` set: base, library (`src` only), tests, tooling and demo
  - `jsx: "react-jsx"`, `moduleResolution: "bundler"`, a modern `target` and `lib`
  - extra strict flags recorded in the PR
  - integration with the existing tooling: tsup is pointed at `tsconfig.lib.json` and ts-jest at `tsconfig.test.json`. Because ts-jest compiles to CommonJS, `tsconfig.test.json` temporarily sets `verbatimModuleSyntax: false`. That override is removed in P-04.
- Not in scope: behaviour changes.
- Defects: D-29 (in part).

**P-03 Build and package shape (ESM-only)**

- Scope:
  - tsup 8 with a single config file, **ESM format only**, `.d.ts` output, Rollup tree-shake step disabled, and `"use client"` added through `banner`
  - a CSS build step to `dist/styles.css`
  - the §24 package shape: `type: module`, the exports map with `./styles.css`, `sideEffects`, `files`, peers `^18 || ^19`, no `engines`, `publishConfig`
- Decisions made in P-03:
  - the output is not minified (`minify: false`), because consumers' bundlers minify, and size-limit measures minified size (§33)
  - `src/` is not shipped (`files: ["dist"]`), because the source maps embed `sourcesContent`
  - the version stays `0.1.2`. Changesets sets the version in P-28/P-29.
  - `"type": "module"` makes Node treat `.js` config files as ESM, so `jest.config.js` and `.eslintrc.js` are renamed to `.cjs` with their content unchanged. P-04 and P-05 replace them.
  - `publishConfig.provenance: true` disables the legacy release workflow until P-28 (§29)
- Not in scope: v2 runtime code, any CJS output, the version, `release.yml`.
- Defects: D-25, D-26, D-27, D-28, D-29.

**P-04 Test runner migration**

- Scope:
  - Vitest, Testing Library, **jsdom**, **vitest-axe**, a fake-timer setup
  - remove Jest, ts-jest and identity-obj-proxy
  - remove the temporary `verbatimModuleSyntax: false` override from `tsconfig.test.json` (added in P-02)
  - port the 0.x tests mechanically only if needed to keep the gate green until P-08
- Decisions made in P-04:
  - **Vitest 3.2.x** (with `@vitest/coverage-v8` at the same version) was chosen on purpose. Vitest 4 and later declare `vite` ≥6 as a peer, so using them would have turned P-04 into a migration of the root Vite. Vite 4 and `@vitejs/plugin-react` 4 are therefore unchanged in P-04. Vitest 3 brings its own nested Vite, and P-25 evaluates the upgrade.
  - `vitest-axe` is pinned exactly to `1.0.0-pre.5`. The stable `0.1.0` extends the obsolete global `Vi` namespace, so `toHaveNoViolations` does not type-check with current Vitest. The pinned prerelease augments the `vitest` module correctly and was verified to run and type-check.
  - The standalone `vitest.config.ts` uses jsdom and no globals: tests import from `vitest` explicitly. The setup file runs Testing Library's `cleanup()` and `vi.useRealTimers()` after every test.
  - The fake-timer setup is this: a test opts in with `vi.useFakeTimers()`, and the shared `afterEach` always restores real timers.
  - The 0.x `requestAnimationFrame` mock is removed and not replaced (§26). The 0.x tests pass without it.
  - `@types/node` is now a direct dev dependency. Before P-04 it came only through Jest's dependency tree.
- Not in scope: new behaviour tests.

**P-05 Lint and format modernisation**

- Scope:
  - ESLint flat config (TypeScript, React, Hooks, jsx-a11y)
  - a Prettier check across `src`, tests, fixtures, config and docs
  - fix existing violations
- Decisions made in P-05:
  - **ESLint 9.x** (with `@eslint/js` 9.x) was chosen on purpose. ESLint 10 is available, but `eslint-plugin-react` 7.37 and `eslint-plugin-jsx-a11y` 6.10 do not declare it as a supported peer, so `npm ci` would fail on the peer conflict. A later phase can upgrade once both plugins support ESLint 10.
  - `eslint.config.js` is a flat config that replaces `.eslintrc.cjs`. It uses `@eslint/js` recommended, typescript-eslint `recommendedTypeChecked` with `projectService`, and for `src` also React, React JSX runtime, the **full** `react-hooks` recommended preset (including the React Compiler rules) and jsx-a11y recommended.
  - `projectService` resolves every TypeScript file through the solution-style `tsconfig.json` to its referenced project (library, tests or tooling), so all TypeScript code is linted with type information. The tsconfig set is unchanged.
  - JavaScript files belong to no tsconfig project, so `**/*.js` uses `disableTypeChecked`. This means `eslint.config.js` is linted, but without type-aware rules, and it is not part of `typecheck`.
  - Prettier is separate from ESLint. `eslint-plugin-prettier` is removed, `eslint-config-prettier` only turns off conflicting rules, and `format:check` is the formatting gate.
  - "Fix existing violations" means the non-behavioural ones. Two violations would need runtime changes in 0.x code that P-08 deletes. Each one gets a single-line `eslint-disable-next-line` with a reason, and no rule is turned off file-wide or in the config:
    - `react-hooks/set-state-in-effect` in `src/ToastContext.tsx`: the effect that copies `isPaused` onto every toast (D-07)
    - `jsx-a11y/click-events-have-key-events` in `src/Toast.tsx`: click-to-dismiss on a `div` (D-17)
  - `reportUnusedDisableDirectives` is `error`, so these directives fail lint once P-08 removes the code they cover.
  - `lint` runs `eslint .`, and `format` and `format:check` run Prettier on the whole repository. `.prettierignore` excludes `dist/`, `coverage/`, `demo-dist/` and `package-lock.json`.
  - The demo is formatted but not linted. Demo linting belongs to P-25.
  - Fixtures are formatted but not linted (§27). The ESLint config already ignores `fixtures/` in preparation for P-07.
  - Prettier is upgraded to 3.9.x and the deprecated `jsxBracketSameLine` option is removed. Markdown files set `embeddedLanguageFormatting: "off"`, so Prettier formats the documents but does not rewrite the code examples in them.
  - P-05 does not add `--max-warnings 0`. P-06 sets the final warning policy.

**P-06 Blocking CI baseline**

- Scope:
  - blocking `quality`, `test` and `build-package` jobs, on the Active LTS Node, with `npm ci`
  - triggers on `main` and `v2`, least-privilege permissions, debug steps removed
  - guard `deploy-demo.yml` so it cannot deploy before 2.0.0
  - Dependabot or Renovate
  - finalise the lint warning policy, including whether `lint` runs with `--max-warnings 0` (P-05 left lint warnings non-blocking)
- Decisions made in P-06:
  - `ci.yml` has four blocking jobs: `quality` (`format:check`, `lint`, `typecheck`), `test`, `build-package` and `demo`. No step uses `continue-on-error`, and CI never runs Prettier in write mode. Triggers are `push` and `pull_request` on `main` and `v2`, plus `workflow_dispatch`.
  - The job is named `build-package` from P-06 on, as in §28. In P-06 it only proves that `npm run build` succeeds. P-07 adds the package validation to the same job without renaming it.
  - `test` is a single React 18 job. The React 18/19 matrix, the Testing Library upgrade, the SSR smoke test and the Next.js fixture stay in P-23.
  - The `demo` job runs `typecheck:demo` and `build:demo` and never deploys. It keeps the demo compiling from P-08 on. Demo linting stays in P-25.
  - Node is pinned explicitly with `NODE_VERSION: '24'` in each workflow, not `lts/*`. There is still no `engines`, `packageManager`, `.nvmrc` or `.node-version`. Node 24 leaves Active LTS on 2026-10-20 and Node 26 becomes Active LTS on 2026-10-28. Node 26 replaces Node 24 in a deliberate, reviewed change after that date and before the final 2.0 release.
  - CI installs with `npm ci --ignore-scripts --no-audit --no-fund`. Every gate was verified green without dependency install scripts: esbuild then uses its JS shim and the platform binary from `optionalDependencies`. There is no repository `.npmrc`, `allowScripts` or `strict-allow-scripts`. The repository-level install-script policy is deferred to the supply-chain and release work (§34, P-28).
  - npm audit and deprecation output is not a CI gate. The dev-only audit findings are left to Dependabot. P-08 decides whether unexpected `console.error` output in tests fails the suite. Build output validation belongs to P-07.
  - `lint` runs `eslint . --max-warnings 0`, both locally and in CI, so ESLint warnings fail the gate. `reportUnusedDisableDirectives` stays `error`. The two P-05 suppressions are unchanged and are removed with the 0.x code in P-08.
  - Hygiene in `ci.yml` and `deploy-demo.yml`:
    - top-level `permissions: contents: read`; `pages: write` and `id-token: write` only on the demo `deploy` job
    - `persist-credentials: false` on checkout, and no `registry-url`
    - every action pinned to a full commit SHA with a version comment
    - setup-node `cache: npm`, keyed on `package-lock.json`, with `node_modules` never cached
    - CI concurrency grouped by workflow and ref, cancelling superseded runs for pull requests only
    - `timeout-minutes: 10` per job
    - no debug steps
  - `deploy-demo.yml` runs only through `workflow_dispatch`, and the `github-pages` environment still accepts deployments only from `main`. It no longer runs lint, typecheck or tests, because `ci.yml` owns those gates. P-29 reconnects it to the final 2.0.0 release (§29).
  - `release.yml` is unchanged. It is a deliberate, temporary exception to the pinning and permissions policy until P-28 replaces it. It cannot publish in the meantime (§29).
  - Dependabot, not Renovate, opens weekly `npm` and `github-actions` updates against `v2`. Minor and patch dev-dependency updates are grouped, and so are action updates. Major updates of the deliberately pinned tooling are ignored until their owning phases: ESLint and `@eslint/js` (P-05), Vite, `@vitejs/plugin-react`, Vitest and `@vitest/coverage-v8` (P-25), React, ReactDOM, their types and `@testing-library/react` (P-23). `vitest-axe` is ignored entirely (P-04). `.github/dependabot.yml` exists only on `v2`. Dependabot reads it only from the default branch, so version updates stay inactive until the file reaches `main`.
  - `demo-dist/` is git-ignored, so `build:demo` leaves the working tree clean.
  - The required status checks (`quality`, `test`, `build-package`, `demo`) are configured in GitHub only after the first green pushed run shows that those check names exist. Each later phase adds its own job.
  - AC-CI-1 is met only for the gates that exist at a given phase. P-06 makes every existing gate blocking, and later phases add the remaining §28 gates.
  - The package `author.name` is corrected to Peter Anyawantana.
- Defects: D-31, D-32, C-06, C-07.

**P-07 Package validation harness**

- Scope:
  - publint and attw `--profile esm-only --exclude-entrypoints ./styles.css` (see §27)
  - `npm pack` and a tarball-content check (no CJS files)
  - a `"use client"` check
  - a Vite fixture (React 18, TypeScript 5.0) using **types and imports only** for now
  - the CSS-present-in-output check and the deep-import-blocked check
  - wiring into the blocking `build-package` job
- Not in scope: rendering (added in P-14), the React 19 and latest-TypeScript legs of the fixture, and the SSR and Next.js fixtures (all added in P-23).
- Decisions made in P-07:
  - `npm run validate:package` runs `npm run build` and then `scripts/validate-package.js`, a dependency-free Node ESM script. It packs the library once with `npm pack --json` into a directory made with `fs.mkdtemp` under `os.tmpdir()`, validates that tarball, and removes the directory in `finally`. With `KEEP_VALIDATE_TMP=1` it keeps the directory and prints its path. Nothing generated lands in the repository, and `*.tgz` is git-ignored as a guard against manual `npm pack` output.
  - The tarball must contain exactly `LICENSE`, `README.md`, `package.json`, `dist/index.d.ts`, `dist/index.js`, `dist/index.js.map` and `dist/styles.css`. No file may end in `.cjs`, `.cts`, `.mjs` or `.mts`, which also rules out `.d.cts` and `.d.mts`.
  - The packed `package.json` is checked from the installed artifact:
    - `name`, and a `version` equal to the packed metadata (not a hard-coded 2.0.0)
    - `type: "module"`, `types: "./dist/index.d.ts"`, `files: ["dist"]`, `sideEffects: ["**/*.css"]`
    - peers exactly `^18.0.0 || ^19.0.0`, and no runtime `dependencies`
    - no `main`, `module`, `style`, `engines` or `packageManager`
    - exactly the `.`, `./styles.css` and `./package.json` exports, with the root export's `types` and `default` entries
    - no `require` condition anywhere in `exports`
  - publint (`publint run <tgz> --strict`) and attw (`attw <tgz> --profile esm-only --exclude-entrypoints ./styles.css`) run against the same tarball. Both are exact-pinned dev dependencies (publint 0.3.25, `@arethetypeswrong/cli` 0.18.5) and never run through `npx`. The CSS entry is excluded because it has no declarations by design (P-03).
  - The installed `dist/index.js` must have no BOM, start with `"use client";` and contain the directive exactly once. The source has no directive (§24).
  - `dist/index.d.ts` must exist and may import only `react`, `react-dom` or files inside the package. The 0.x declarations still use the global `React` namespace. P-08 replaces them.
  - Node ESM checks run from the isolated consumer:
    - the root import succeeds
    - `./styles.css` and `./package.json` resolve inside the installed package
    - `dist/index.js`, `dist/styles.css`, `dist/index.d.ts`, `src/index.ts` and `index.js` fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`
    - the consumer and the package resolve the same React, and only one React copy is installed

    Export names are not asserted, because P-08 owns the export-list test. `require()` of the package is neither tested nor guaranteed (§24.3).

  - `fixtures/consumer-vite` is committed: Vite 8.3.2, strict TypeScript 5.0.4 with `moduleResolution: "bundler"`, `skipLibCheck: false` and `types: []`, React 18.3.1 and `@types/react` 18.3.18, and no JSX or `@vitejs/plugin-react`. It imports the root entry and `react-elegant-toasts/styles.css`, uses public types, and keeps a `@ts-expect-error` deep type import that must stay blocked.
  - The fixture's committed `package.json` and lockfile never contain the library. The script copies the fixture to the temp directory, runs `npm ci --ignore-scripts --no-audit --no-fund`, and installs the tarball with `npm install --no-save`. It then checks that the fixture manifests are byte-identical and that the package is a real copy inside the consumer, so repository source and the root `node_modules` cannot satisfy any import.
  - `vite build` must succeed, and its CSS output must contain `CSS_MARKER` (`.toast-progress`), which must also appear in the packed `styles.css`. P-17 updates the marker when the stylesheet is redesigned (S1 made it `.ret-toaster`). Vite's warning that the module-level `"use client"` directive is not preserved in an SPA bundle is expected.
  - The `build-package` job keeps its name and runs `npm ci --ignore-scripts --no-audit --no-fund` and then `npm run validate:package`, with no separate build step. The setup-node cache is keyed on both lockfiles. `scripts/**/*.js` gets Node globals in ESLint. The fixture is formatted but not linted.
  - Dependabot also tracks `fixtures/consumer-vite`. It never updates the fixture's TypeScript, which is the documented minimum, and ignores major React and `@types/react` updates until P-23. Like the rest of the config, it stays inactive until it reaches `main`.
  - P-07 proves:
    - all of AC-PKG-1 and AC-PKG-3
    - for AC-PKG-2, the Vite part
    - for AC-PKG-4, the directive part
    - for AC-PKG-5, the React 18 typecheck and build
    - for AC-PKG-6, the code part
    - for AC-PKG-9, TypeScript 5.0 with `@types/react` 18

    Rendering (P-14), React 19, the latest-TypeScript leg, `@types/react` 19, SSR and Next.js (P-23), and the README (P-26) complete those criteria.

### Track B: Core (no rendering)

**P-08 Clean break and v2 skeleton**

- Scope:
  - delete the 0.x implementation, its tests, `utils.ts` and the old exports
  - add the v2 `src/` layout
  - add the public types (§6.6, §6.7), including `CustomToastOptions` and `DismissReason`
  - add stubs for `toast` and `Toaster`
  - add the export-list test (AC-API-1)
  - reduce the demo to a minimal placeholder that compiles
  - move the fixture to v2 imports
- Decisions made in P-08:
  - The 0.x implementation is deleted: `Toast`, `ToastContainer`, `ToastContext`, `utils.ts` and their 15 tests, which are not ported (C-09). There is no compatibility layer; 2.0 is a clean break (§6.8). The two P-05 inline suppressions disappeared with the files that contained them.
  - The `src/` layout (§5) is finalised as:
    - `index.ts`: public exports only
    - `types.ts`: the §6.6 types
    - `toast.ts`: the facade
    - `react/Toaster.tsx`

    P-09 adds `store/`, and P-14 the rest of `react/`. `src/styles.css` keeps its location and its 0.x content until P-17, because it is the shipped `./styles.css` and the source of the P-07 `CSS_MARKER`.

  - The package exports exactly `Toaster` and `toast` as values, has no default export, and exports exactly the eleven §6.7 types: `CustomToastOptions`, `DismissReason`, `ToastAction`, `ToastId`, `ToastOptions`, `ToastPosition`, `ToastPromiseMessages`, `ToastSnapshot`, `ToastTheme`, `ToastType` and `ToasterProps`. There is no labels type and no convenience type. `src/__tests__/exports.test.ts` enforces this on the source (AC-API-1): it checks the runtime keys, and uses the TypeScript compiler API to check exactly 13 export names. `validate:package` enforces it on the packed artifact: the installed runtime entry exports exactly `Toaster` and `toast` with no default, and `dist/index.d.ts` has a single export list naming exactly the two values and the eleven types.
  - `toast` is typed by an internal, unexported `ToastApi` interface. It has a call signature, and its members are function-typed properties rather than methods, so `toast.dismiss` and the other members can be passed around unbound without `unbound-method` lint errors. The value is built with a typed `Object.assign`, and every member is a separate function. `toast.promise<T>` infers `T` from the promise under TypeScript 5.0, without `NoInfer`. `toast.dismiss` returns `void`.
  - Optional public fields are typed `?: T | undefined`, so consumers using `exactOptionalPropertyTypes` can forward `undefined`. `CustomToastOptions` declares `description`, `icon`, `action` and `progress` as `?: never`, so TypeScript 5.0 rejects them (§6.4).
  - The runtime is a deliberate skeleton: the signatures are final, the bodies are not.
    - Every creation call returns `undefined`, because nothing is accepted yet, which is the meaning §6.2 gives `undefined`. A fake ID would wrongly claim acceptance.
    - `toast.dismiss` does nothing.
    - `toast.promise` neither invokes function input nor attaches handlers.
    - `<Toaster />` returns `null` and produces no DOM output.
    - There are no development warnings.

    P-09 to P-14 replace these bodies without changing a signature. The temporary `src/__tests__/skeleton.test.tsx` documents this contract and is replaced in P-09 and P-14.

  - Behavioural TSDoc arrives with the behaviour: P-12 for `toast`, P-14 for `Toaster`. P-26 checks completeness (§31). P-08 has short source comments only.
  - The demo is a minimal placeholder until P-25: a heading, a note, the four existing header links (GitHub, npm, portfolio, Buy Me a Coffee, with unchanged URLs), one `toast()` button and `<Toaster />`. The README still describes 0.x until P-26.
  - `fixtures/consumer-vite` uses the v2 API. It still has React 18, TypeScript 5.0.4, Vite 8.3.2 and no rendering, and its `package.json` and lockfile are unchanged. It contains:
    - `Toaster` through `createElement`
    - every `toast` method, in an exported function that is never invoked
    - all eleven public types
    - two `@ts-expect-error` checks that `CustomToastOptions` rejects `description`: one on an object literal, and one on a non-literal `Pick<ToastOptions, 'id' | 'description'>` value. The literal check alone would pass even without `description?: never`, because of TypeScript's excess-property check.
    - the blocked deep import of `ToastOptions`

    The packed declarations now import their React types from `react`, so the 0.x global-namespace issue noted in P-07 is gone.
- Defects: D-05, C-09.

**P-09 Store core**

- Scope:
  - ID generation and custom IDs
  - replacement, revival and relocation bookkeeping (§14)
  - dismissal and the lifecycle phases (§9), driven manually
  - immutable snapshots and `subscribe`
  - **server rejection** (§8.3)
  - **no-Toaster pending cap of 100, rejection and deduplicated development warnings** (§8.4)
  - Toaster attach and detach, with the StrictMode-safe deferred detach and one-Toaster arbitration (§8.5)
  - `onDismiss(snapshot, reason)` and callback error isolation
  - `resetStore`
  - creation calls return `ToastId | undefined`; rejected creation returns `undefined` (§6.2)
- Decisions made in P-09:
  - The store is a plain module singleton in `src/store/store.ts`, never kept on `globalThis` (§8.2). Its internal types are in `store/types.ts`, ID generation in `store/ids.ts`, development warnings in `store/warnings.ts` and the call-time environment checks in `store/env.ts`. Nothing in `store/` is exported from the package entry, and there are no public API changes: the export surface is still the two values and eleven types of P-08.
  - A record holds only `id`, `seq`, `revision`, `type`, `custom`, `content`, `description`, `position` (`options.position`, or `top-right`), the stored options and `phase`, plus `exit` bookkeeping (`reason`, and `relocateTo` for a relocation). The options are copied field by field and never spread, so no option can set a store-owned field (D-02). Records are frozen and replaced rather than mutated. Timer, remaining-time, pause and promise-token fields and the resolved Toaster configuration arrive in P-10, P-11, P-13 and P-14.
  - `getSnapshot()` returns a frozen `{ active, byPosition }`, with frozen lists and frozen views. `active` is the owning Toaster. `byPosition` holds the `entering`, `visible` and `exiting` toasts of each position in `seq` order; P-14 owns the visual order (D-15). Subscribers are notified when a command changes the observable snapshot; otherwise the snapshot, and every position list and view that did not change, keep their identity. In P-09 the snapshot holds only rendered toasts and `active`, so a command that changes only queued records produces no notification. When such a command also changes rendered state, for example through promotion in P-10, the snapshot changes and subscribers are notified.
    - A command mutates synchronously and then notifies once.
    - A command issued while subscribers or callbacks run applies immediately, and its notification follows in a later round.
    - `onDismiss` runs after notification.
    - Subscribers and callbacks are isolated: an error goes to `reportError`, or is re-thrown asynchronously, and never stops the store or other callbacks.

    `getServerSnapshot()` is constant and empty. `useSyncExternalStore` is wired in P-14.

  - IDs come from `crypto.randomUUID()` when it is available. Otherwise they come from a deterministic module counter (`ret-1`, `ret-2`, …), with no random source. Generated IDs skip IDs that are already stored, so they are unique within the store. `resetStore()` restarts the counter. An empty explicit `id` counts as no `id`, because §6.2 forbids empty IDs. The tests check the generator's behaviour deterministically; there is no large-volume stress test.
  - P-09 implements the §14 replacement table. Replacement never merges, and increments `revision`.
    - A queued toast is replaced in place, or moved to the back of a new position with a new `seq`.
    - A rendered toast is replaced in place, or relocated: it exits with reason `relocate` and joins the new position as queued with a new `seq` when `exited` is reported.
    - An exiting toast is revived to `entering` at the same position, or its exit becomes a relocation.

    Replacement, revival and relocation fire no callbacks. Dismissing a relocating toast turns the relocation into a removal.

  - The §9 phases run through `dismiss(id?, reason)`, `entered(id)` and `exited(id)`:
    - a queued toast is removed directly
    - a rendered toast moves to `exiting`
    - an exiting toast ignores further dismissals
    - out-of-phase reports do nothing
    - `onDismiss(snapshot, reason)` fires exactly once on removal, with the latest callback

    The renderer will report `entered` and `exited` from P-14 and P-18; in P-09 the tests drive them.

  - Promotion from `queued` to `entering` goes through one internal `promote()` step, which runs only while a Toaster is active. In P-09 its capacity is deliberately unlimited, so the lifecycle can be exercised through real commands. This is the P-09/P-10 seam: P-10 replaces the policy with per-position `maxVisible` and FIFO slot allocation by `seq`.
  - While no Toaster is active, the store keeps at most 100 records. A new record at the cap is rejected: it returns `undefined`, even with an explicit `id`, stores nothing and fires no callback. Replacing an existing ID is still allowed. An active Toaster lifts the cap. A Toaster with a pending (deferred) detach still counts as active. Detaching never deletes records, and new records are rejected again until the count drops below 100.
  - Development warnings are prefixed `[react-elegant-toasts]` and checked at call time with `isDev()` (`process.env.NODE_ENV !== 'production'`, guarded by `typeof process` and declared locally rather than through `@types/node`). Production logs nothing.
    - **No-Toaster warning:** armed by any accepted creation or replacement while no Toaster is active, and logged only if no Toaster attaches within 1000 ms. That delay is an internal implementation detail, not a 2.x API guarantee. It is logged at most once per period without a Toaster; an attach ends the period. A detach or a rejected call does not arm it.
    - **Cap warning:** logged once, and re-armed when the count is below the cap again.
    - **Extra-Toaster warning:** logged once per Toaster.
    - **Server warning:** logged once.

    This development-only warning timer is the only timer in P-09.

  - On the server (`typeof window === 'undefined'`, checked at call time), creation is rejected before an ID is generated: it returns `undefined`, stores nothing and warns once in development. `dismiss` does nothing on the server. Nothing touches browser globals at import time.
  - Each `<Toaster />` creates a per-instance object token with `useState` and attaches it in `useEffect`. The first Toaster to attach is active; later ones wait in order. Detach is deferred with `queueMicrotask`, and a re-attach of the same token before it runs cancels it, so StrictMode's replay changes nothing: no ownership change, no re-queue, no duplicate warning or registration. There are no ownership timeouts.
  - Every completed detach of the active Toaster runs the §8.4 effects first, then hands over:
    1. `entering` and `visible` toasts go back to `queued`, keeping their `seq`.
    2. A dismissal exit finishes with `onDismiss`; a relocation exit joins its destination.
    3. The earliest waiting Toaster, if any, becomes active.
    4. `promote()` runs.

    An incoming Toaster therefore never inherits another renderer's rendered phases. A waiting Toaster that detaches simply leaves the waiting list. The Toaster still renders `null` until P-14.

  - `toast()`, its variants and `toast.dismiss` pass straight through to the store. `toast.promise` is still the P-08 stub until P-13: it returns `undefined`, creates no toast, and never invokes or observes its input.
  - `resetStore()` and `inspectRecords()` are internal test helpers and are not on the package entry. `resetStore()` clears records, ownership, pending detaches, warning state and timers, and the ID counter; `setupTests.ts` calls it after every test and also restores stubbed globals and environment variables. `inspectRecords()` returns frozen copies, so tests cannot change store state through it. There is no state-seeding helper.
  - The P-08 skeleton test is replaced by `store`, `ids`, `no-toaster`, `server` (node environment), `toaster` and `facade` tests. `exports.test.ts` is unchanged.
- Defects: D-01 (store side), D-02, D-03, D-06.

**P-10 Queue and maxVisible**

- Scope: §11 in full: per-position `maxVisible` of 4, FIFO by `seq`, slot freed only on removal, positions independent, revival without needing a slot, relocation re-queuing.
- Decisions made in P-10:
  - P-10 owns §11 in full, including passing `<Toaster maxVisible>` to the store. P-14 does not own that wiring.
  - The six position queues are logical: there is no queue structure. The queue at a position is its `queued` records in ascending `seq` order, so filtering the global `seq` order by position gives each position's FIFO order. No other ordering field exists.
  - A position's occupancy is its `entering`, `visible` and `exiting` records. `queued` records use no slot. Custom, loading and persistent toasts are counted like any other.
  - A slot is taken only by `queued` → `entering`, and freed only when the toast leaves the position: when `exited()` completes a removal or a relocation, or when the active Toaster detaches (§8.4). Starting an exit frees nothing. A relocating exit keeps `position` set to its old position, so it counts there, not at its destination, until `exited()`.
  - `promote()` is the P-09 seam with a capacity policy. It does nothing without an active Toaster. Otherwise it counts each position's occupancy, then walks the queued records in ascending `seq` order and moves each one to `entering` while its position is below the active limit. Overflow stays queued. It is idempotent, and its result does not depend on the order positions are visited.
  - Promotion runs after an accepted `upsert`, the first attach, a takeover, every completed `exited()` (removal or relocation, so the old position and a destination can both fill in that one command) and a configuration change of the active Toaster. `dismiss()` does not promote: a queued dismissal frees no slot, and a rendered toast keeps its slot until `exited()`.
  - `seq` is kept by a queued same-position replacement, an in-place replacement, revival, a detach re-queue, a takeover, and a relocation exit until it completes. A new `seq`, at the tail of the destination queue, is given to a new toast, a queued toast moved to another position, and a relocation when it completes (including during a detach). The P-09 `seq` model needed no change.
  - Replacement keeps the P-09 semantics; P-10 adds only their capacity consequences. Revival uses the slot the exiting toast already holds, so it never raises occupancy (AC-LC-3). A relocation that is dismissed keeps its old slot until `exited()` and never joins its destination.
  - Configuration is per Toaster: an internal `configure(token, { maxVisible })` stores each Toaster's resolved `ToasterConfig` in a `WeakMap`. `attach(token)` is unchanged and stays the ownership API. Only the active Toaster's configuration takes effect; a waiting Toaster's is stored and applies when it takes over, so takeover promotes under the new owner's limit and never the departing owner's. A Toaster with no configuration uses the default. `resetStore()` clears the configurations.
  - `maxVisible` resolves to itself when it is a whole number of at least 1, and to the default of 4 otherwise: `undefined`, `0`, negative values, `NaN`, fractions, `Infinity` and `-Infinity`. `Infinity` is not an "unlimited" value. The resolution is internal and logs no warning, and the public type is unchanged.
  - A configuration change of the active Toaster applies at once. Raising the limit promotes immediately, FIFO at every position, in one notification. Lowering it dismisses, re-queues and changes nothing; a position may stay above the new limit until its toasts leave, and nothing is promoted while occupancy is at or above the limit (§11). A configuration change that alters nothing rendered notifies nobody.
  - `<Toaster />` configures its token in an effect on `[token, maxVisible]` declared before the attach effect, so the first promotion already uses its limit. The attach effect still depends only on the token, so a prop change never detaches, re-attaches, re-queues or changes ownership. StrictMode replay stays inert. The Toaster still renders `null`.
  - The snapshot is unchanged: it holds no queued records and no `maxVisible`. A slot release and the promotion it allows happen in one command and appear as one snapshot. `command()`, notification and `subscribe` are unchanged.
  - The §8.4 no-Toaster cap of 100 records is unchanged and unrelated to `maxVisible`: it counts every record in every phase.
  - Deferred: the Toaster `position` prop as the default position for toasts (§6.5) is not handled in P-10, which uses the position stored on each record (`options.position`, or `top-right`). The later defaults and rendering work must resolve it without breaking queue consistency, for example by never silently moving records that are already queued.
  - Tests are in `src/__tests__/queue.test.ts` (store level, including the `D-12` regression test) and `toaster.test.tsx` (the React wiring). The P-09 tests are unchanged. A mutation check confirmed the tests catch each of: exits counted as free, one global capacity, LIFO, no promotion after a removal, a kept `seq` on a queued move, an off-by-one limit, takeover under the departing limit, relocations counted at the destination, no promotion on a raise, lowering that re-queues or dismisses, and an inverted effect order. Making the attach effect also depend on `maxVisible` is an equivalent mutant: the deferred detach it schedules is cancelled by the same-token attach that follows, so no behaviour changes.
  - There are no public API changes: the export surface is still the two values and eleven types of P-08.
- Defects: D-12.

**P-11 Timer and pause model**

- Scope: §10 in full:
  - remaining time
  - the four combined reasons plus `swipe`, with stack-scoped hover and toast-scoped focus-within
  - persistent toasts
  - timer reset on replacement
  - `onAutoClose` and the order of callbacks
  - suspending timers on detach
- Decisions made in P-11:
  - P-11 owns the whole store side of §10, including the pause model: the pause-reason state, how reasons combine, remaining time across pause and resume, and the §8.1 commands `setGlobalPause(reason, on)`, `setStackPause(position, on)` and `setToastPause(id, reason, on)`. The DOM triggers stay in P-15 (hover, focus-within, window blur and document visibility, including seeding at attach) and P-21 (swipe). Nothing in P-11 listens to the DOM.
  - Low-level mechanics are in `store/timer.ts`: the clock, duration resolution, remaining-time arithmetic, and one scheduled timeout per toast in a token registry. It has no lifecycle policy and does not import the store. The policy is in `store.ts`: one idempotent `syncTimers()` step runs at the end of every command. A timer runs exactly when a Toaster is active, the toast is `visible`, its duration is finite and it is not paused. Starting a timer schedules `remaining`. Stopping one folds the elapsed time into `remaining` (D-08) and cancels the timeout. Promotion to `entering` starts nothing; the timer starts at `entered()`.
  - Time is measured with `performance.now()`, read only at call time. Nothing reads the clock or creates a timer at import time, and the server never reaches the clock because creation is rejected first. Vitest's default fake timers fake `performance.now()` together with `setTimeout`, so no test configuration changed.
  - A record gains `timer: { duration, remaining, runningSince }` (§7), frozen and replaced, and `pausedBy`, its toast-scoped reasons (`focus-within`, `swipe`). The store also keeps a set of global reasons (`window-blur`, `document-hidden`) and a set of hovered positions. A toast is paused while any of its reasons, its position's hover or a global reason applies. Reasons are sets: setting one twice and clearing it once clears it (D-07, D-09).
  - Duration resolution in P-11: loading toasts and `Infinity` are persistent, a finite value at or below 0 becomes 0 and expires on the next timer tick, and an absent value uses an internal default of 5000 ms (AC-TM-5). As internal hardening only, any other value that is not a finite number (`NaN`, `-Infinity`, a non-number) also becomes 5000, with no warning. Public validation and defaults belong to P-12. **`<Toaster duration>` is not wired in P-11**; it is deferred to the later defaults and configuration work, and `Toaster.tsx` is unchanged.
  - Durations longer than the largest `setTimeout` delay (2³¹−1 ms) are scheduled in bounded chunks against a `performance.now()` deadline, so they never overflow and fire at once.
  - Expiry moves the toast to `exiting` with reason `timeout` and `remaining` 0. `onAutoClose` is queued in that same command, so it runs after subscribers are notified. The toast keeps its slot, and nothing is promoted until `exited()` removes it, when `onDismiss(…, 'timeout')` follows (AC-CB-3). Detach completion likewise finishes a timeout exit with reason `timeout`, without another `onAutoClose`. **`onAutoClose` fires once per actual timeout transition.** A toast revived after a timeout gets a new timer, and if it genuinely times out again its current `onAutoClose` fires again. Revival never undoes an earlier `onAutoClose`. Callbacks use the record's latest definition, and their errors are isolated as before.
  - Every replacement starts a fresh timer with the new effective duration (`runningSince` null) and keeps `pausedBy`. A visible toast replaced in place restarts at once when it is not paused. A relocation runs no timer while it exits or waits at its destination. Replacement, revival and relocation fire no callbacks.
  - Stale timeouts are guarded in three layers: `syncTimers` cancels a timeout whenever its toast should not be running, each schedule carries a token the registry checks on fire, and expiry checks that the record still holds the same timer object, is visible, is unpaused and belongs to the current store generation. `resetStore()` cancels every timeout and clears the pause state.
  - Detach completion re-queues `entering` and `visible` toasts as before, and `syncTimers` suspends their timers with the remaining time kept. It clears hover and every toast's `focus-within` and `swipe` (§8.4). **`window-blur` and `document-hidden` survive detach**, because they describe the environment; P-15 must seed both values, on and off, at attach. A pending detach still counts as active, so timers keep running in its microtask window. A StrictMode replay cancels the detach and never touches timer state. Takeover and re-attach promote to `entering`, and the timer resumes with the remaining time at `entered()` (AC-NT-3).
  - Pause commands do nothing on the server. `setStackPause` and `setToastPause` do nothing while no Toaster is active, and `setToastPause` ignores unknown IDs. A toast-scoped reason may be set on any existing record, even one that is not visible yet; it then keeps the timer from starting at `entered()`. `setGlobalPause` applies whether or not a Toaster is active.
  - **Timer and pause state are not in the render snapshot or views yet.** P-14 and P-20 add what rendering and progress need. Views are no longer cached per record object: the previous view is reused while every render-visible field is unchanged, so timer-only and pause-only changes notify nobody and keep view identity. A timeout notifies because the phase changes.
  - Tests are in `src/__tests__/timer.test.ts` and `pause.test.ts` (store level, fake timers), plus a StrictMode timer test added to `toaster.test.tsx`. No existing test changed. A mutation check confirmed the tests catch: countdown while queued or entering, resume or takeover restarting the full duration, a missing reset on replacement, stale timeouts with every guard removed, a slot freed at timeout, a missing, duplicated or early `onAutoClose`, a wrong timeout reason, reasons combined as booleans in any scope, hover scoped per toast or globally, reasons cleared on replacement, transient reasons kept or global reasons cleared on detach, pause-only notifications, `Date.now()` instead of `performance.now()`, timeout overflow on long durations, persistent toasts scheduling timeouts, missing duration normalisation, `resetStore` leaving timeouts, and pause commands accepted without a Toaster or on the server. Removing `active !== null` from the run condition is an equivalent mutant: no toast is `visible` without an active Toaster.
  - There are no public API changes: the export surface is still the two values and eleven types of P-08.
- Defects: D-07, D-08, D-09 (store side).

**P-12 `toast` facade**

- Scope:
  - `toast()`, `success`, `error`, `warning`, `info`, `loading`, `custom` (chrome-less, `closeButton` false by default, restricted options) and `dismiss`
  - type tests
- Decisions made in P-12:
  - Public options are normalised at the store boundary, not in the facade. `upsert()` calls `normaliseOptions(options, custom)` in the new `store/options.ts`, a pure module with no lifecycle, queue, timer or ownership policy and no browser globals. It replaces the P-09 `copyOptions` and returns the `id`, the `position`, the `description` and a freshly allocated, frozen `StoredOptions` per definition. The facade only maps each member to a type and the custom flag. The server check still runs first, so on the server no option is read, no ID is generated and only the existing server warning is logged.
  - Only fixed defaults are applied when a toast is created. Defaults that depend on the Toaster stay absent from `StoredOptions` for normal toasts: there is no stored `duration: 5000`, `closeButton: true`, `progress: false`, type icon or position option.
  - Each option the caller supplies is read at most once per call, and validation checks only that value, so an accessor cannot pass a check with one value and be stored with another (for example an `id` getter that returns a string and then a number). This includes `action.label` and `action.onClick`. The fields a custom toast drops (`description`, `icon`, `action`, `progress`) are not read for it at all, and `action.label` is read only when `onClick` is a function. A throwing getter is not caught.
  - Invalid runtime values are treated as omitted, silently. There are no new warnings, and malformed options (`null`, primitives, functions, invalid fields) never throw. The rules:
    - `id`: only a non-empty string counts. An empty or non-string value counts as no `id`, and a string ID is generated, with no `String()` coercion.
    - `position`: only the six positions count. Anything else counts as omitted, so a toast can never enter an unknown position that the snapshot does not render.
    - `duration`: a finite value is kept, with values at or below 0 stored as 0, and `Infinity` is kept as persistent. `NaN`, `-Infinity` and non-numbers are left out of `StoredOptions`, and P-11's internal 5000 ms timer fallback applies. Loading toasts stay persistent. `timer.ts` is unchanged.
    - `description` and content: any value is kept by identity, with no ReactNode validation and no stringification (D-04).
    - `icon`: kept when not `undefined`, so `null` (no icon) stays distinct from omitted.
    - `action`: kept only when it is an object with a function `onClick`, and stored as a fresh frozen `{ label, onClick }` copy, so later changes to the caller's object change nothing.
    - `closeButton` and `progress`: kept only as booleans. `className`: kept only as a string. `onDismiss` and `onAutoClose`: kept only as functions, so a malformed callback never reaches `reportError`.
    - Internal fields (`phase`, `seq`, `revision`, `timer`, `pausedBy`, `type`, `custom`) are never read from options.
  - Custom toasts (§6.4) always drop `description`, `icon`, `action` and `progress` at runtime, and a dropped `description` is not passed to callbacks either. `closeButton` is the given boolean, or a stored `false` when it is omitted or invalid. For a normal toast an omitted `closeButton` stays absent, so P-14 can apply the Toaster default. The types still reject the four chrome options.
  - Replacement is a new definition, not a partial update (§14). Nothing from the previous definition is carried over except what the store already keeps (`id`, `seq`, phase, pause reasons). A normal → custom replacement drops the chrome options and stores `closeButton: false`. A custom → normal replacement leaves an omitted `closeButton` absent again. An omitted or invalid `position` on replacement means the default position, so a toast shown elsewhere is relocated.
  - `toast.dismiss(id)` dismisses with the reason `programmatic`. `toast.dismiss()` and `toast.dismiss(undefined)` both dismiss everything, queued toasts included. `arguments.length` is not inspected. An unknown or empty ID does nothing. The TSDoc shows the safe idiom `if (id) toast.dismiss(id)`, because a rejected creation returns `undefined`.
  - **P-14 owns `<Toaster duration>` and `<Toaster position>`**, together with the Toaster `closeButton`, `progress` and icon defaults. P-12 wires neither. It keeps an omitted or invalid `duration` absent from `StoredOptions` and adds no marker for an implicit position, so until P-14 an omitted position resolves to the built-in `top-right` when the toast is created.
  - TSDoc describes the behaviour that is final in P-12. It does not describe the Toaster defaults as working yet, or `toast.promise`. The source comment that suggested `onClick={toast.dismiss}` was corrected, because that does not type-check.
  - Tests:
    - `facade.test.ts` gained the behavioural suites, including the `D-01` and `D-04` regression tests. Its existing tests, including the `toast.promise` stub tests, are unchanged. Accessor tests count the reads of every field and of the action fields, for normal and custom toasts.
    - `server.test.ts` covers every creation variant with explicit IDs and malformed options, and checks that no option is read on the server.
    - The new `types.test.ts` uses `expectTypeOf` and `@ts-expect-error` in a function that is never invoked. It is enforced by `npm run typecheck`.
    - `fixtures/consumer-vite` also rejects `icon`, `action` and `progress` on `CustomToastOptions` under TypeScript 5.0, both as literals and as values.
  - A mutation check confirmed the tests catch:
    - removing the custom `closeButton: false` default, applying it to normal toasts, or carrying it across a custom → normal replacement
    - keeping each of the four custom chrome options
    - storing `closeButton: true`, `progress: false` or `duration: 5000` as defaults
    - collapsing `icon: null`
    - removing the position, callback, action, boolean, `className` or `id` checks
    - storing `NaN` or a negative duration
    - keeping the caller's action object by reference
    - sharing one options object between definitions
    - a second read of `id`, `className` or `action.onClick`, or reading `description` for a custom toast
    - reading options before the server check
    - a wrong variant type, or a normal variant marked custom
    - a wrong dismiss reason
    - a dismiss-all that skips queued toasts
    - removing each `?: never`, widening a creation return type, removing `readonly` from `ToastSnapshot.id`, and adding an index signature to `ToastOptions`

    Narrowing a creation return type to `ToastId` fails to compile against the facade implementation itself, so it needs no type test.

  - There are no public API changes: the export surface is still the two values and eleven types of P-08, and no signature changed.
- Defects: D-01, D-04.

**P-13 `toast.promise`**

- Scope: §13 in full: required messages, the ownership token, never reviving after dismissal, throwing message functions, inference, rejection handling.
- Decisions made in P-13:
  - **Ownership is a token.** Each `toast.promise` call creates a fresh `Symbol` and passes it to `upsert` through an internal `ToastInput.promiseToken` field. Options never supply it (it is not in `ToastOptions` and `normaliseOptions` never reads it), and it is not in the views, the snapshot or the declarations. The record field `promiseToken: symbol | undefined` is part of every definition, so `replace()`'s spread can never carry a stale token over:
    - every public creation or replacement with the same `id` (`toast()`, each variant, `toast.custom`) clears it
    - a second `toast.promise` with the same `id` is a public call: it replaces the toast by the §14 rules, reviving an exiting one, and installs its own token, so the first promise loses the toast
    - dismissal clears it, both on the move to `exiting` and when a relocating exit becomes a removal
    - settlement clears it as part of its replacement
  - **Settlement is guarded and internal.** It never goes through `upsert`: it never creates, revives, relocates, generates an ID or applies the cap. The store's `settleOwned(id, token, type, content)` applies only when the record exists, carries the identical token and is not `exiting`, and it checks this inside the command, immediately before mutating. Otherwise nothing changes and nobody is notified. The token, not the ID, is authoritative, so a later toast that reuses the ID is never touched. Because dismissal clears the token, the `exiting` condition is a second layer: removing it alone changes no behaviour, which the mutation check confirmed.
  - **The settled definition is the loading toast's own.** Options are normalised once, when the loading toast is created. Settlement reuses the record's resolved position, description and option values, in a fresh frozen `StoredOptions` copy (one object per definition, as in P-12), and changes only `type` (`success` or `error`), `content`, `custom: false` and the timer. Options are never re-read, so later changes to the caller's object change nothing, and an omitted position never relocates the toast.
  - **Durations.** Loading persistence comes from the `loading` type (P-11); nothing stores `Infinity` in the options, because the same options apply to the settled toast. The settled toast gets a fresh timer from the stored `duration`, or the internal 5000 ms fallback until P-14 wires `<Toaster duration>`. An explicit `Infinity` is honoured, so the settled toast stays until it is dismissed; §13's "finite duration" is read as "not loading-persistent". `timer.ts` is unchanged.
  - **Order on the client:**
    1. the server check
    2. `loading`, `success` and `error` are each read once, into locals; settlement never reads `messages` again
    3. a fresh token
    4. the loading toast is created
    5. if creation is rejected (the no-Toaster cap), the call returns `undefined` without calling function input or observing a direct promise
    6. otherwise the function is called, or the promise observed, and the ID is returned

    No async work starts without a loading toast.

  - **Input.** A direct promise is observed once with `then(onFulfilled, onRejected)`, never `then().catch()`. Function input is called with no arguments, immediately after the loading toast is accepted. A synchronous throw becomes a rejected promise, so it settles in a promise reaction like an already-rejected promise: the loading toast always exists when the call returns, and settlement is always asynchronous. Internally the source goes through `Promise.resolve`; that does not extend the supported input beyond `Promise<T>` and `() => Promise<T>`, and nothing else is documented or tested. There are no warnings for malformed input.
  - **Message functions run outside store commands.** The facade checks ownership (`ownsToast`) before calling a message function, so a stale settlement calls none, and the store checks again when it applies the result. A message function can therefore call `toast.dismiss(id)` or replace the toast, and the user's call wins. Static content is used by identity; a function receives the resolved value or the rejection reason by identity. Content is never stringified.
  - **Throwing message functions.** If `success(data)` throws, the thrown value takes the error path (ownership is checked again first) and is not reported. If `error(reason)` throws, including after a throwing `success`, the toast is dismissed with `programmatic` through `dismissOwned`, which checks ownership, so a toast that replaced it is never dismissed. The exception is then reported through the P-09 path, now the internal `report()` in `store.ts`, which `isolate()` also uses.
  - **Rejection handling.** Both handlers are total, so the promise `then` returns always fulfils: the library adds no unhandled rejection, and the caller's rejection counts as handled. The caller's promise is unchanged and still rejects when awaited. `toast.promise` returns the ID, not a promise. Both handlers are structurally total. A last-resort boundary catches anything else that escapes, including a `reportError` that throws while reporting a throwing `error` message. It never turns such an error into a rejection value. Inside the boundary, cleanup and reporting are each best effort and wrapped separately: it dismisses the toast if the promise still owns it, so the toast is never left loading, and then reports the error. If `dismissOwned()` or `report()` fails there, that failure is dropped and cannot reject the derived promise. `report()` itself is unchanged, so P-09 callback isolation is unchanged.
  - **Detach and pausing** need nothing new. A re-queued toast keeps its token and can be settled while queued; a later Toaster promotes it with the fresh timer. Settling while paused keeps every pause reason, and the fresh timer starts only when they all clear (AC-TM-4). Like any accepted replacement while no Toaster is active, settlement arms the no-Toaster warning (P-09).
  - **Server.** `toast.promise` checks `isServer()` in the facade before it reads anything the caller passed, logs the shared server warning (`warnServer`, once) and returns `undefined`. It does not read `messages` or `options`, call function input, observe a promise, call message functions, create a token or generate an ID. A rejecting promise passed on the server stays the caller's responsibility.
  - **Types.** The P-08 signature is unchanged. Two consequences of the frozen signature are accepted and not tested: a union of promise types such as `Promise<number> | Promise<string>` is not inferred (use `Promise<number | string>` or an explicit type argument), and because `ReactNode` includes `undefined`, the three required message keys must be present but may hold `undefined`.
  - Tests:
    - `src/__tests__/promise.test.ts` is the P-13 suite: loading, resolve, reject, content, timers, every phase, ownership, re-entrancy, throwing messages, detach and pausing, options and messages read once, the cap, rejection handling and notifications. Rejection handling is checked deterministically on the promise that the library's `then` returns, including when `reportError` throws, plus one `unhandledRejection` listener test.
    - `src/__tests__/promise-containment.test.ts` checks the last-resort boundary. No reachable store path fails while the promise still owns its toast, so it wraps `settleOwned` and `dismissOwned` with `vi.mock` to inject failures; production code is unchanged.
    - The P-08 stub tests were removed from `facade.test.ts`. `server.test.ts` covers `toast.promise`. `types.test.ts` covers inference and the required keys, and `fixtures/consumer-vite` checks function-input inference, a typed messages value and the required keys under TypeScript 5.0.
  - A mutation check confirmed the tests catch:
    - swapped success and error, a new ID or a public `upsert` at settlement, a missing token check, a token kept across a public replacement or a dismissal, and a token accepted from options
    - a non-persistent loading toast, a stale or shared settled timer or options object, a dropped description, relocation, and callbacks fired by settlement
    - a value or reason not passed, static content called, message functions called after ownership is lost, no ownership re-check in the store, a throwing `success` that skips the error path or is reported, and a throwing `error` that does not dismiss, is not reported, or dismisses a newer toast
    - a handler that can reject, a removed last-resort boundary, a `report()` or `dismissOwned()` failure that escapes it, a boundary that does not dismiss or does not report, no rejection handler, synchronous settlement of a synchronous throw, function input called before the loading toast or at the cap, a direct promise observed at the cap, the server calling, observing or reading anything, options or messages re-read at settlement, and a missing no-Toaster arm
    - widened `success` or `error` parameters, optional `success` or `error`, a widened return type, a public `promiseToken`, a function `loading`, `PromiseLike` input, and `NoInfer`, which only the TypeScript 5.0 fixture catches

    Equivalent mutants: removing only the `exiting` condition (dismissal already clears the token, and an owned toast is a loading toast, which never times out and never relocates) and keeping `record.custom` at settlement (an owned toast is always normal).

  - There are no public API changes: the export surface is still the two values and eleven types of P-08, and no signature changed.

### Track C: Rendering and behaviour

**P-14 Toaster rendering**

- Scope:
  - `useSyncExternalStore`, with attachment through the store's arbitration
  - position lists in DOM and visual order
  - the region markup
  - the normal shell: close button on by default, action, SVG icons with `aria-hidden`
  - the custom wrapper: chrome-less, with no close button by default
  - lifecycle reporting through fallbacks (no animation yet)
  - the Toaster defaults for toasts: `duration` and `position` (store side, deferred by P-10, P-11 and P-12), and `closeButton`, `progress` and the type icon (render side)
  - no dismissal on body click
  - the development warning for inaccessible persistent normal toasts
  - SSR safety
  - the Vite fixture now renders a toast
- Not in scope: visual styling, motion, announcements.
- Defects: D-15, D-16, D-17, D-19.
- Decisions made in P-14:
  - **Toaster defaults, store side.** The active Toaster's `position` and `duration` apply to definitions that omit them, on creation, replacement and promise settlement. A definition made while no Toaster is active keeps the built-in values as placeholders, marked pending, and they are resolved against the first Toaster that becomes active, before promotion. Resolution is not a relocation: `seq`, `revision` and phase stay, and no callback fires. A queued replacement gets a new `seq` for its position only when the old and the new position are both resolved and differ. Loading toasts are never pending. Definitions that already have their defaults, including running and re-queued toasts, are never re-resolved by a later prop change or a takeover. `ToastView.persistent` (an `Infinity` duration) is the only timer fact rendering sees.
  - **Rendering.** Every `<Toaster />` subscribes with `useSyncExternalStore`, unconditionally, so a waiting one sees its takeover. Only the active owner renders toast lists. While `active` is `null`, which includes the server and hydration, it renders the empty region; while another Toaster is active, it renders `null`. The store keeps each position's list in `seq` order and the renderer applies visual order: top positions newest first, bottom positions oldest first. Items are memoised on their stable views, keyed by ID, and re-key their content by `revision`.
  - **Render-side defaults** are resolved per item and never stored. A normal toast's close button is its own option, then the Toaster's, then `true`. A custom toast's is its own definition only (stored `false` unless `true` was passed); the Toaster's `closeButton` never overrides it. `progress` is resolved the same way (toast, then Toaster, then `false`; never for custom), but no progress DOM is rendered until P-20.
  - **Chrome.** Built-in icons are decorative inline SVG (`aria-hidden`, `focusable="false"`), for every type except neutral and custom. An explicit icon replaces the built-in one inside an `aria-hidden` slot, and `null` removes the icon. The close button's name is "Close notification" until `labels` (P-16).
  - **Action and close.** The action's `onClick` runs first; the toast is then dismissed with `action` unless `preventDefault()` was called, and an exception skips the dismissal and is not caught. Dismissal is by ID with no revision guard, so a replacement made by the handler is dismissed too. The close button dismisses with `close-button`. An exiting toast's controls do nothing (no `inert` until P-16).
  - **Lifecycle fallback.** Each rendered entering or exiting toast schedules `entered` or `exited` with a named 0 ms timeout, cancelled on phase change or unmount; the store's phase checks make stale reports harmless. P-18 replaces this with animation-driven completion.
  - **Inaccessible persistent warning.** It is evaluated from the rendered values (persistent, effective close button, action), not at creation, so a Toaster prop change can trigger it, and is logged at most once per definition, keyed by the definition's options object. Custom toasts never trigger it.
  - **Packed consumer.** `fixtures/consumer-vite` mounts `<Toaster />` and shows a toast. `validate:package` builds `render-check.mjs` with Vite in SSR mode and runs the fixture app in jsdom 30.1.1 (exact, fixture-only) against the installed tarball: the toast renders, becomes visible and closes from its close button.
  - There are no public API changes: the export surface is still the two values and eleven types.

**P-15 Environmental pause wiring**

- Scope:
  - hover on the position stack (pointer events)
  - focus-within per toast
  - window blur and document visibility
  - StrictMode idempotency
- Defects: D-07, D-09.
- Decisions made in P-15:
  - **Scope.** P-15 adds only the DOM triggers for the four §10 reasons, through P-11's `setGlobalPause`, `setStackPause` and `setToastPause`. The store, the snapshot and the views are unchanged, and pause changes still notify nobody.
  - **Window focus and document visibility.** Only the active Toaster listens, with exactly three global listeners: `window` `blur` and `focus`, and `document` `visibilitychange`. A waiting Toaster neither seeds nor listens. On becoming active, the owner seeds both global reasons from the current state, `window-blur` from `!document.hasFocus()` and `document-hidden` from `document.hidden`, before it listens. It writes on and off alike, so a stale reason left by an earlier owner is corrected. Cleanup removes the listeners but leaves both reasons as they are, which keeps P-11's rule that they survive detach; the next owner seeds them again.
  - **Stack hover.** Hover is scoped to the rendered position `<ol>`, with native `pointerenter` and `pointerleave` and no `pointerType` filtering. The list owns the reason: its cleanup clears its position's hover. So a list that unmounts under the pointer, for example when its last toast leaves before any `pointerleave`, leaves no hover behind.
  - **Focus-within.** Focus-within is scoped to each toast's root `<li>`, with native `focusin` and `focusout`. A `focusout` whose `relatedTarget` is inside the same `<li>` is ignored, so a move between the toast's own controls never clears and re-sets the reason. Cleanup clears `focus-within`. This covers unmount and relocation, where no useful `focusout` arrives (a relocated toast keeps its record but leaves its `<li>` behind).
  - **Consumer-driven DOM changes.** Focus events alone are not enough, because removing the focused node fires no `focusout`. This happens when a replacement re-keys the content, when a custom ↔ normal replacement removes the focused control, and when custom content re-renders itself without a new revision. So while focus is inside a toast, a `MutationObserver` watches that `<li>` (`childList` and `subtree`) and reconciles. It is connected only while the toast holds focus, and it is disconnected when focus leaves and on cleanup. Reconciliation always writes the DOM's answer, whether the `<li>` contains the active element. It never infers focus from the toast's `revision`.
  - **DOM tree, not React tree.** Containment is decided by the actual DOM subtree; React-tree ancestry is not used. Focus in content portalled outside the toast's `<li>` is not focus-within that toast. Likewise, a pointer over content portalled outside the position's `<ol>` is not hover on that stack. This is the ownership model chosen for 2.0.
  - **Shadow roots and realms.** Reconciliation reads the active element of the `<li>`'s own root, from `getRootNode()`: the `activeElement` of that `Document` or `ShadowRoot`. A Toaster mounted in a shadow root therefore sees the focused descendant, not the shadow host that the document reports as active. The `MutationObserver` comes from the window of the toast's `ownerDocument`, so it belongs to the realm the toast renders in.
  - **Listeners (§32).** "A fixed number of global listeners" counts the Toaster's listeners on `window` and `document`. P-15 adds exactly three, and only the active Toaster holds them. The pointer pair on each rendered position list and the focus pair on each rendered toast are element-scoped. They are allowed, and they live and die with their elements. The observer is focus-scoped, so in practice at most one is connected, because only one element has focus. Queued toasts are not rendered and have no element listeners or observer. StrictMode replay leaves no duplicate listener or observer.
  - **Test environment.** jsdom reports `document.hasFocus()` as `false` until something is focused, which would start every Toaster with `window-blur` on. `setupTests.ts` therefore makes it return `true` in every jsdom test and restores it afterwards. Tests of an unfocused start override it.
  - Tests are in `src/__tests__/environment-pause.test.tsx`. They cover listener ownership, seeding and handover; StrictMode; D-07 and D-09 DOM regressions; hover cleanup; focus-within through re-keys, custom content, relocation, portals and a shadow-root mount; and listener and observer cleanup. `render-count.test.tsx` checks that the pause events render nothing (§32, D-16).
  - **Not in P-15:** the hotkey, `inert` and focus restoration (P-16); progress and the `data-paused` attribute (P-20); swipe (P-21); and real-browser verification (P-22). The checks that jsdom cannot make are listed under P-22.
  - There are no public API changes: the export surface is still the two values and eleven types.

**P-16 Accessibility layer**

- Scope:
  - persistent polite and assertive regions, the announcer, the politeness table, warning and error prefixes, re-announcement on replacement
  - `labels`
  - the Alt+T hotkey (configurable and disableable), Escape returning focus, focus restoration
  - `aria-keyshortcuts`
  - the axe suite
  - docs notes on the custom-content boundary for P-26, kept in the P-26 entry below
- Defects: D-18, D-22.
  - **D-18 is closed by P-16:** persistent polite and assertive regions, politeness by type, no `role` option and no `role="alert"` on toasts, covered by the announcement and role tests and backed by the structural axe suite.
  - **D-22 stays open** until P-26 rewrites the 0.x README (AC-REL-2). P-16 makes the keyboard and assistive-technology behaviour real but does not touch the README.
- What P-16 leaves to later phases is recorded in their entries: P-17, P-22, P-23, P-26, P-27 and P-29.

### Track D: Visual (starts behind the P-17 gate)

**P-17 Styling foundation**

- **Status: complete.** D0 to D2 and S1 to S6 are done, and every manual checkpoint is recorded. What P-17 leaves open is listed under Defects below and in the P-20, P-22, P-26 and P-29 entries.
- **Entry gate:** OQ-24 (visual direction signed off from a mockup or prototype) and OQ-25 (public CSS contract) must both be resolved before implementation starts.
  - **OQ-25 is resolved** (§21).
  - **OQ-24 is resolved** (§21). The maintainer approved the visual direction after reviewing the D1 prototype in Chromium (D2 below).
  - **The entry gate is open.** No P-17 entry-gate question remains.
  - `ret-` CSS, the tokens, and the light, dark and system themes
  - variant design and AA contrast checks
  - forced colours, logical properties, safe-area insets
  - responsive width without changing position
  - the chrome-less custom wrapper
  - `className` hooks
- Defects: D-11 (layout), D-20, D-23, D-24.
  - **D-20 is closed by P-17:** the palette meets AC-A11Y-6 in every theme (S4), with the focus pair added in S5, checked from the token values in `styles.test.ts`.
  - **D-23 is closed by P-17:** every selector, class, custom property and keyframe is `ret-` prefixed, enforced by `scripts/check-styles.js` in `npm run lint` (AC-CSS-1, S1).
  - **D-24 is closed by P-17:** the CSS-only `theme` with matching server and client markup (AC-CSS-2, S1 and S4), and no inline `z-index` or padding on the region or its lists, which take `--ret-z-index` and the `--ret-offset` gutters from the stylesheet (AC-CSS-3, S2, with its render guard added in S6).
  - **D-11 stays open.** P-17 mirrors the toast layout in RTL with logical properties (S3), checked by `styles.test.ts` and the S3 manual RTL review. The progress direction is P-20's, and AC-RTL-1 is verified in real browsers by P-22.
- Carried over from P-16. P-16 made two non-control elements focusable from script, and left the live regions styled inline. These are styling requirements, not changes to P-16 behaviour:
  - The region (`<section tabindex="-1">`) takes focus as the last step of focus restoration (§18). It needs an intentional, accessible `:focus-visible` treatment (§17.4, §17.5).
  - Each toast root (`<li tabindex="-1">`) takes focus from the hotkey and from focus restoration (§18). It needs one too.
  - The live regions are hidden by inline styles (`VISUALLY_HIDDEN` in `src/react/announcer.ts`), so they stay hidden even when the stylesheet is not loaded. Review whether they move into the stylesheet and token architecture. Either way they must stay visually hidden and exposed to assistive technology. (Decided: decision 4 below.)
- Decisions locked before implementation (D0), the visual direction approved at D2. They are implemented from S1 on.
  1. **Visual direction:** a neutral elevated card with a semantic accent: an accent-coloured icon on a subtle tinted icon container (§21). Approved at D2, which resolved OQ-24.
  2. **Public CSS contract:** OQ-25 is resolved as recorded in §21. Library defaults use deliberately low specificity, preferably `:where()`. Tokens are scoped to `.ret-toaster`. P-17 does not finalise the motion tokens (P-18) or the progress tokens (P-20).
  3. **Region and containers:**
     - The `<section>` never becomes a permanent viewport-sized fixed overlay. It stays a minimal structural region that is not an overlay.
     - Each rendered position `<ol>` owns its fixed viewport positioning.
     - While the section itself matches `:focus-visible`, a pseudo-element may draw a fixed, viewport-inset focus indicator. It exists only in that state, does not intercept pointer events, and is designed for at least 3:1 non-text contrast.
     - Its real appearance is verified in P-22. Touch exploration with screen readers is checked in P-29.
     - The DOM stays as P-14 to P-16 built it: no wrappers between the section, the lists, the toasts and their controls, which focus restoration and the announcer read as direct children.
  4. **Live regions (hybrid):**
     - The inline `VISUALLY_HIDDEN` styles stay. They are the safety mechanism when a consumer does not import the stylesheet.
     - The persistent live regions also get a `ret-*` class with equivalent visually hidden CSS. That class is the fallback for server rendering under a restrictive CSP, which can block the server-emitted `style` attribute; hydration does not apply it again (§34).
     - The regions stay exposed to assistive technology: no `display: none`, `visibility: hidden`, `hidden` attribute, `aria-hidden` or anything else that removes them from the accessibility tree.
  5. **Interim prototype:**
     - An interim demo or prototype may be used before P-25. Its purposes are to resolve OQ-24 through actual visual sign-off and to support the manual checkpoints while P-17 is implemented.
     - It may expose controls for types, the six positions, theme, description, action, long text, custom content and dismiss-all, only as far as P-17's visual review needs them.
     - It is not the P-25 demo rebuild. P-25 still owns the final demo.
- **Motion boundary.** P-17 adds no animations, no transitions that create motion, no `transform` on `.ret-toast`, no `ret-enter`, `ret-exit` or `ret-spin`, and no reduced-motion implementation. P-18 owns the animation lifecycle and reduced motion, P-19 stack repositioning, P-20 progress and P-21 swipe.
- **Sequence:**
  - **D0, decision record (done):** this entry and §21, §34, §37, §38 and Appendix B. Documentation only.
  - **D1, visual prototype (done):**
    - It was the only implementation allowed before OQ-24 closed.
    - It is `demo/p17-prototype.css`, imported only by the demo, together with an interim review harness in `demo/index.tsx` that drives the real toast API and DOM.
    - It is not shipped, exported or copied by the package build. `src/styles.css`, the production DOM and `CSS_MARKER` were not changed.
    - It stays a demo-only visual reference while S1 to S5 are implemented. It never becomes the production stylesheet, and it stays until an explicit later decision removes or replaces it.
  - **D2, OQ-24 sign-off (done):**
    - The maintainer reviewed D1 in Chromium in the light and dark themes: default, success, error, warning, info and loading toasts, description, close, long content and custom content.
    - The maintainer approved the direction recorded in §21, and OQ-24 is resolved here, in §21, §38 and Appendix B. The entry gate is open.
    - This is visual design sign-off only. P-22 still owns systematic browser verification.
    - D2 does not authorise motion: the motion boundary above still applies.
  - **S1, CSS foundation (done):** remove the 0.x CSS; establish the final `ret-*` stylesheet, its tokens and the light, dark and system token architecture; add the prefix lint and contract check (AC-CSS-1); update `CSS_MARKER` (P-07).
    - **Stylesheet:** `src/styles.css` holds only the token and theme layer: `:where(.ret-toaster)` with the light values and `color-scheme`, `:where(.ret-toaster[data-theme='dark'])`, and the same dark values for `:where(.ret-toaster[data-theme='system'])` inside `@media (prefers-color-scheme: dark)`. No component rule exists until S2 to S5, so a page that loads it alone still shows unstyled toasts.
    - **Tokens:**
      - colour: `--ret-surface`, `--ret-text`, `--ret-text-muted`, `--ret-border`, `--ret-shadow`, `--ret-focus`, `--ret-action-surface`, `--ret-action-text`, and `--ret-{success,error,warning,info,loading}` with a `-subtle` tint each
      - layout: `--ret-font-family` (the family only; sizes, weights and line heights are not tokens), `--ret-radius`, `--ret-gap`, `--ret-offset`, `--ret-width`, `--ret-z-index`
      - Each theme sets every colour token. Values start from the approved D1 palette. Later slices may refine values, and add a token only if a rule needs one.
    - **AC-CSS-1:**
      - `scripts/check-styles.js` runs as part of `npm run lint`. It parses the stylesheet with jsdom's CSSOM, which is already a dev dependency, and fails on: a selector without a `ret-` class or with any other class; an ID; an attribute other than `data-theme`, `data-position` or `data-phase`, or one outside a `ret-` compound; unprefixed keyframes or custom properties; `!important`; and any rule kind other than style, `@media`, `@supports` and keyframes.
      - Later phases extend its attribute list as they document attributes such as `data-paused` (P-20).
    - **Contract test:** `src/__tests__/styles.test.ts` runs the check on the stylesheet and on failing samples, and checks the exact token set and its scope, that every token default is a single zero-specificity `:where()` with no `!important` (so an ordinary consumer rule such as `.ret-toaster { --ret-surface: … }` overrides it), the theme blocks (dark and system-dark identical), that no JavaScript listens for colour-scheme changes, the motion boundary, and the marker.
    - **Marker and renders:**
      - `CSS_MARKER` is now `.ret-toaster`. The 0.x stylesheet had no `ret-` selector, so stale CSS cannot satisfy it.
      - A render-count test shows that a theme change re-renders no toast.
  - **S2, position, stack and responsive structure (done):** the six positions, offsets, safe areas, gaps, the z-index token, the pointer-event architecture (empty space clicks through, while the lists keep the P-15 hover pause) and responsive width, with no visual reordering (§12, §18).
    - **Lists:**
      - Each rendered `.ret-toaster__list` is `position: fixed`, with `--ret-z-index`, a reset and a plain flex column spaced by `--ret-gap`.
      - Placement uses the physical sides: `top`, `bottom`, `left` and `right`, matched on `data-position` prefixes and suffixes, so RTL never moves a position (§20).
      - Each gutter is `--ret-offset` plus that edge's `env(safe-area-inset-*)`, so the offset stays the minimum distance from the usable viewport.
      - Centre positions use `left: 0; right: 0` with auto side margins, with no transform.
    - **Width:** `--ret-width` is a stack's preferred width. The list is `min(--ret-width, 100% − 2 × --ret-offset − left and right safe-area insets)`: never wider than the viewport between its gutters, so narrow screens shrink it. There are no viewport units, which would include the scrollbar.
    - **Order:** the DOM order is unchanged and shown as it is. Top lists start with the newest toast and bottom lists end with it, so the newest is always at the anchored edge, which is the order the hotkey and focus restoration walk. No `order`, reverse direction or other reordering is used.
    - **Pointer input:**
      - The region has no box or pointer rule, so it never covers the page.
      - Only the lists take pointer input, so the page stays clickable around them.
      - The gaps between toasts are inside their list, which keeps the P-15 hover pause steady.
      - Toasts only get `box-sizing: border-box`. Their appearance is S3's.
    - **Tests:** `styles.test.ts` matches the stylesheet's own rules against each position, the region, the toasts and the live regions (which nothing matches). It checks the placement and gutters of all six positions, the column without reordering, the tokens used, the bounded width, the absence of logical placement properties, the region's lack of a box, pointer input, and that the D1 prototype never reaches library source, the stylesheet or the package build.
    - **Demo review switch:** `?production-css` skips the D1 prototype and adds outlines that show the lists' hit areas and the toasts' boxes. Without it the demo is unchanged. The prototype now loads as its own demo chunk. The switch stays until the prototype is removed.
    - **Manual checkpoint (done):**
      - The maintainer reviewed S2 in Chromium with `?production-css`.
      - Observed: top stacks put the newest toast at the top edge, and bottom stacks at the bottom edge, with no CSS reordering. On narrow and mobile widths the stacks shrink between sensible gutters, with no horizontal overflow, and centre and edge positions stay stable.
      - This is visual review evidence, not P-22 browser verification.
  - **S3, toast shell and custom styling (done):**
    - the card and its parts: icon, content, title, description, action and close, with a close target of at least 24×24 CSS px
    - long-text wrapping and logical properties
    - the chrome-less custom wrapper, with its close button in the inline-end top corner (AC-API-10)
    - **Card:**
      - Normal toasts match `:where(.ret-toast:not(.ret-toast--custom))`. Custom toasts are excluded rather than reset, so no card property can reach them.
      - The card is a flex row aligned to the top: `--ret-surface`, a 1px `--ret-border`, `--ret-radius`, `--ret-shadow`, `--ret-text` and `--ret-font-family`, with 12px gaps and padding written logically (12px, and 10px at the inline end).
      - Type is 14/20 at weight 400, with letter spacing, alignment and case reset, so application text styles cannot reshape it.
      - The DOM is unchanged: icon, content, action, close, shown in order with no reordering.
    - **Content:**
      - The title is weight 600. The description is 13/18 in `--ret-text-muted`.
      - The content column is `flex: 1 1 auto; min-inline-size: 0; overflow-wrap: anywhere`, so long words and URLs wrap inside the card.
      - There is no truncation, line clamp, `white-space` or `overflow` rule.
    - **Icon:** a 28px box with an 18px glyph and an 8px radius, in a neutral muted colour. S4 gives each type its accent and tint. The loading icon stays static.
    - **Controls:**
      - Both buttons have their margin, border and font reset.
      - The action is a compact filled button in `--ret-action-surface` and `--ret-action-text`, 13px semibold. It is at most 45% of the card, and a long label wraps.
      - The close is exactly 24×24 with a 16px glyph in `--ret-text-muted`. On normal toasts it turns `--ret-text` on hover.
      - Native focus rings are untouched until S5.
    - **Custom close colour (decided):**
      - On a custom toast the close is absolute at `inset-block-start` and `inset-inline-end` 8px, with `color: inherit` and no hover recolouring.
      - It is a sibling of the custom content, so it inherits the toast root's colour, not the content's own. A consumer sets that colour through the toast's `className`.
      - A theme token would be wrong on an arbitrary custom background. With `inherit`, the toast's own `className` is the single hook for the close's colour and the content's.
      - P-26 documents this.
    - **No new tokens:** padding, sizes, radii and type sizes are implementation details. The public set stays at 24 tokens.
    - **Tests:** `styles.test.ts` checks:
      - the card on every normal type, and no card chrome on custom toasts
      - the description hierarchy, and the shrink and wrap rules without truncation
      - the icon, action and close sizes
      - the custom close's corner, colour and hover isolation
      - that toast parts use logical spacing and no physical side insets
    - **Demo:** the review harness adds Long title, Unbroken URL and an RTL toggle that wraps the Toaster in `dir="rtl"`. The custom example sets its foreground through `className`. The S2 aid now only outlines the lists.
    - **Manual checkpoint (done):**
      - The maintainer reviewed the production stylesheet in Chromium with `?production-css` and approved the normal card in the light and dark themes.
      - Checked: content and control combinations (description, action, close), long content at narrow widths, custom toasts with and without the library close button (including its inherited colour), and the RTL internal layout.
      - This is P-17 visual review evidence, not P-22 browser verification or P-29 assistive-technology checking.
  - **S4, themes, variants and contrast (done):** the semantic accents, complete light, dark and system values, the automated palette contrast check (AC-A11Y-6), and theme render-count and hydration tests (AC-CSS-2).
    - **Mapping:**
      - Each of success, error, warning, info and loading colours only its icon slot: `:where(.ret-toast--<type> > .ret-toast__icon)` sets `color: var(--ret-<type>)` and `background: var(--ret-<type>-subtle)`.
      - Loading uses its own neutral family, so a pending toast reads as in progress rather than as a result.
      - The default type stays neutral: its icon, which only a consumer can give it, is `--ret-text-muted` with no tint.
      - The card's surface, border and text never change with the type, and custom toasts receive no semantic colour.
    - **Consumer icons:** the glyph inherits the slot's `color`, so library icons and consumer icons drawn in `currentColor` take the accent. Other consumer icons keep their own colours on the tint. The DOM does not distinguish library from consumer icons, and needs no change for this.
    - **Contrast (AC-A11Y-6, D-20):**
      - `styles.test.ts` computes WCAG 2.x ratios from the opaque `#rrggbb` token values for light, dark and system dark. A non-opaque value fails, because its contrast is unknown.
      - Text needs 4.5:1, because toast text at 13 to 14px is never large: text and muted text on the surface, and action text on the action surface.
      - Meaningful non-text needs 3:1: each type's glyph on its tint, and the focus colour on the surface.
      - The border, the tints against the surface and the shadow are decorative. The card is told apart by those together, and no single pair of them is claimed.
      - The D1 palette passed every pair, so no value changed. The lowest results are light warning 4.51:1, light success 4.57:1 and dark loading 4.07:1.
    - **Meaning beyond colour:** each type has a distinct icon shape (§17.2), warnings and errors are announced with their prefixes (§17.1), and the content carries the message. Colour is never the only signal.
    - **Themes:** system in a light scheme is the light default itself, because there is no light-scheme media rule. System dark equals dark, which a test checks. `theme.test.tsx` hydrates `light`, `dark`, `system`, the default and an invalid value without a mismatch (AC-CSS-2). The render-count test from S1 covers theme changes.
    - **No new tokens:** the public set stays at 24.
    - **Demo:** an All types button shows all six normal types at once, and the review Toaster shows six per stack.
    - **Manual checkpoint (done):**
      - The maintainer reviewed the All types matrix in Chromium with `?production-css`, in explicit light and explicit dark, and approved both.
      - The neutral card stays dominant and the accents are clear but restrained. Warning was approved in both themes and the palette is kept as it is, with no token change requested. The description hierarchy and the loading and default treatments were checked.
      - The system theme was not separately smoke-checked by hand. Its evidence is automated: the system-dark equality and light-default tests, and the hydration tests.
      - This is P-17 visual review evidence, not P-22 browser verification or P-29 assistive-technology checking.
  - **S5, accessibility styling (done):** `:focus-visible` for the section, the toast root and the action and close buttons (§17.4); forced colours; the hybrid live-region class.
    - **Focus model (unchanged from P-16):** the hotkey focuses the first eligible toast root, never the region. The region (`<section tabindex="-1">`) takes focus only as the last step of removal restoration (§18). Toast roots take focus from script only; the action and close are native buttons in the tab order. S5 changes no focus behaviour, listener or focus order.
    - **Rings:** every focus rule is a zero-specificity `:where(… :focus-visible)` outline, so it never changes layout, and nothing animates it.
      - Toast root: `2px solid var(--ret-focus)` at `outline-offset: -1px`. On a card the ring takes the border's place next to the known surface (the D2 preferred direction). A custom root gets `outline-offset: 2px`, so the ring sits just outside it and never covers consumer content.
      - Action and close: `2px solid var(--ret-focus)` at `outline-offset: 2px`, which stays on the card surface.
      - Region: the section's own outline is `none` while it shows focus, replaced by `:where(.ret-toaster:focus-visible)::after`: `position: fixed; inset: 4px`, `--ret-z-index`, a 3px `--ret-focus` border inside a 2px `--ret-surface` outline, `pointer-events: none`. It exists only in that state; the section keeps no box, focused or not (decision 3).
    - **Contrast:** `--ret-focus` on `--ret-surface` is 5.17:1 in light and 8.26:1 in dark and system dark, already in the AC-A11Y-6 pairs. A new test resolves the colour each focus rule actually draws and requires 3:1 against the surface in every theme. The region's two-tone ring keeps that pair over any page.
    - **Custom close ring (decided in S5):** `outline-color: currentColor`. The close inherits the toast root's colour (S3), which the consumer sets through the toast's `className` to suit their background, so the ring contrasts exactly as well as the glyph. The library guarantees nothing more against an arbitrary background: its contrast is the consumer's (§17.3). A custom root's ring uses `--ret-focus` against whatever lies outside it, also not guaranteed; a consumer can set `--ret-focus` on the toast through `className`. No rule styles anything inside custom content except the library close.
    - **Forced colours:** one `@media (forced-colors: active)` block using only system colours. The card keeps a `CanvasText` edge, since its shadow and surface are dropped; the action gets `1px solid ButtonText` with 1px less padding, so its size holds; every library ring is `Highlight`, the custom close's included; the region ring is a `Highlight` border with a `Canvas` halo. Semantic hues are not preserved, because meaning never depended on them (S4). `forced-color-adjust` is not used anywhere.
    - **Live regions (decision 4):** both regions now also carry `class="ret-toaster__live-region"`, the only React change in P-17 so far (`LIVE_REGION` in `src/react/announcer.ts`). The inline `VISUALLY_HIDDEN` styles stay. The stylesheet rule repeats the inline declarations exactly (`position: absolute; width: 1px; height: 1px; margin: -1px; border: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap`), which a test compares. It is a plain class selector rather than `:where()`, so element rules in the page cannot undo it on the CSP path. Roles, `aria-live`, `aria-atomic`, order and announcement behaviour are unchanged.
      - It is treated as an implementation detail, like the inline styles (OQ-25), not documented contract. P-26 confirms that when it documents the CSP caveat (§34).
      - It covers the path decision 4 names: server HTML whose `style` attribute a restrictive `style-src` blocks, with the stylesheet allowed. It does not cover a page that loads neither.
    - **Tests:** `styles.test.ts` adds the focus, focus contrast, forced-colour and live-region blocks; the S2 live-region case now checks that only the live-region rule matches the real regions. `announcer.test.tsx` checks the class and the absence of `hidden`, `aria-hidden` and `inert`; `ssr.test.tsx` expects the class in server HTML. Seventeen mutations (focus rules removed or recoloured, the region pseudo-element made permanent or pointer-blocking, the region made an overlay, the live-region class hidden with `display` or `visibility`, the inline fallback removed, `forced-color-adjust: none`, a rule reaching custom descendants, a 25th token, `!important`, a transition, keyframes) were each detected and restored.
    - **Demo:** with `?production-css`, a note lists the review steps and a Focus region button focuses the section directly (demo only).
    - **Manual checkpoint (done):**
      - The maintainer reviewed S5 in Chromium with `?production-css` and reported that it works as intended: the toast root, action and close rings, the custom toast and custom close rings, the region's viewport-inset ring when focus falls back to the region, the page staying usable with the pointer, and the hotkey, Escape and restoration flow.
      - The maintainer approved the S5 decisions: the custom close ring in `currentColor`, the custom root's outside ring in `--ret-focus`, `ret-toaster__live-region` as an undocumented implementation detail, and its plain single-class selector.
      - No separate result was recorded for forced colours, so its evidence is the automated forced-colour tests only.
      - This is P-17 Chromium visual and interaction evidence, not P-22 browser verification (including Windows High Contrast) or P-29 assistive-technology checking.
    - **Carried forward:** P-22 verifies real focus-visible and forced-colours rendering, including Windows High Contrast, and the region ring's appearance (decision 3). P-26 documents the custom close and custom root focus guarantee, `--ret-focus` per toast, and the CSP caveat. P-29 checks that the live regions still announce with real screen readers.
  - **S6, integration and reconciliation (done):** the plan and defect status, the P-22 and P-26 carry-forwards, full validation and the final manual checkpoints.
    - **Reconciliation:** every P-17 criterion was traced to its evidence. AC-CSS-1, AC-CSS-2 and AC-A11Y-6 are automated. AC-POS-1 and AC-API-10 are automated, with the S2 and S3 manual reviews. The §17.4 focus styles are automated, with the S5 review. The P-17 part of D-11 is automated, and the rest is deferred (see Defects). §17.5 forced colours has automated structural checks; real rendering is P-22's.
    - **AC-CSS-3 guard:** before S6 only the region was covered, by the exact server markup; an inline `z-index` on a position list passed every test. `render.test.tsx` now renders toasts in all six positions and checks that neither the region nor any list has an inline `z-index` or `padding*`, while toasts are entering and once they are visible. It checks only those properties on those containers, as AC-CSS-3 states. Mutations: an inline `zIndex: 9999` on the lists and an inline padding on the region each fail it; an inline `opacity` on the lists, which AC-CSS-3 does not cover, passes.
    - **Audit:** the only production React change in P-17 is S5's live-region class. The window and document listeners are unchanged, and so are the focus order, the lifecycle and the announcements. There is no motion (P-18). The public set stays at 24 tokens. The D1 prototype and the demo review aids never reach `dist/`, and `dist/styles.css` is the source stylesheet byte for byte.
    - **Carry-forwards:** recorded in the P-22, P-26 and P-29 entries.
    - **Validation (after the S6 changes):** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (29 files, 900 tests), `validate:package` and `build:demo` all pass.
    - **Final manual checkpoint (done):** limited to the two gaps the earlier checkpoints left; S2 to S5 were not reviewed again.
      - **System theme:** the maintainer checked `theme="system"` in Chromium under emulated `prefers-color-scheme`. In light it followed the light design and in dark the dark design, it switched when the emulated preference changed, and the focus styling stayed coherent.
      - **Forced colours:** the maintainer checked Chromium's `forced-colors: active` emulation. The toaster stayed usable: card edges were visible, the action read as a control, the types stayed distinguishable without their authored hues, and the toast, action, close and region focus indicators were visible. Pointer input and dismissal still worked.
      - This is P-17 Chromium implementation and visual evidence. It is not P-22 browser or Windows High Contrast certification, and not P-29 assistive-technology checking; those carry-forwards stay open.

**P-18 Enter and exit motion**

- **Status: complete.** D0 and S1 to S5 are done, the final reconciliation and validation passed, and every manual checkpoint is recorded. The public addition is the four motion tokens (28 in all). What P-18 leaves open is listed under Defects below, in the S5 record and in the P-19, P-21, P-22, P-26 and P-29 entries.
- Scope: `ret-enter` and `ret-exit`, `animationend` plus the fallbacks, reduced motion, the spinner.
- Defects: D-13, D-14, D-21.
  - **D-13 is closed by P-18:** a dismissed toast stays rendered while `exiting` (P-09) and now runs a real exit animation (S2), and it is removed only on its own `animationend` or the computed fallback (S1). `toast-item.test.tsx`, `motion-lifecycle.test.tsx` and `styles.test.ts` show it; real playback in three browsers is AC-MO-1, verified by P-22.
  - **D-14 is closed by P-18:** v2 motion is vertical with no horizontal component, enter keyframes author only `from`, and a `visible` toast has no animation and no authored `translate`, so no position can keep an offset (S2). `styles.test.ts` checks the exact frames, the settled state and that left, centre and right never change the motion, and the S2 manual checkpoint covered all six positions in Chromium. AC-MO-1's three-browser check of left positions is P-22's.
  - **D-21 is closed by P-18:** `prefers-reduced-motion: reduce` removes enter and exit motion entirely and stops the spinner, in CSS only, and the lifecycle completes without animation events (S4). `styles.test.ts` and `motion-lifecycle.test.tsx` show it, with the S4 Chromium emulation checkpoint; AC-MO-3's Playwright emulation is P-22's.
- Acceptance: AC-LC-1, AC-LC-2 and AC-MO-3 are automated here. AC-MO-1 is checked structurally here (keyframes, settled end state, left positions without offset) and in real browsers by P-22.
- Decisions locked before implementation (D0). They are implemented in S1 to S4.
  1. **Lifecycle completion:**
     - A native `animationend` listener on the toast root (`<li>`), not React's `onAnimationEnd`. jsdom has no `AnimationEvent`, so React's choice of native event name is unreliable there, and a native listener follows the DOM tree like the P-15 listeners.
     - A completion is accepted only when `event.target` is the toast root itself, the toast is in the matching phase (`entering` for `entered`, `exiting` for `exited`), and the animation name is the library animation for that phase and the toast's edge (decision 7). Events bubbling from custom content, the spinner or, later, progress are ignored.
     - The store's phase-checked `entered()` and `exited()` stay the final idempotency guard, so the event and the fallback may both arrive and only the first counts.
     - P-18 changes no lifecycle semantics: the phases, slots, timers, callbacks, revival, relocation and detach of §9 to §16 are unchanged. Only the length of the entering and exiting windows changes.
  2. **Fallback source:**
     - The fallback delay is derived from the toast root's resolved computed animation styles, read in the effect that schedules it, never during render. JavaScript holds no copy of the motion durations, so consumer token overrides and the CSS reduced-motion rules always agree with the lifecycle timing (§21, §22).
     - The calculation reads `animation-name`, `animation-duration` and `animation-delay`, and pairs them by the CSS rule for comma-separated lists: a shorter duration or delay list repeats to the length of the name list. A matching entry's end time is its delay plus its duration.
     - Only the library animation for the current phase and edge contributes. Other animations on the toast root, including a consumer's, neither extend nor complete the lifecycle (decision 9).
     - When no matching library animation has a positive end time (none applies, `animation-name: none`, a `0s` duration, reduced motion, or jsdom, whose computed style reports no animation), completion keeps the existing 0 ms `setTimeout`. `requestAnimationFrame` is not used: Vitest fakes it by default, §26 forbids mocking it just to make timers work, and it stops in hidden documents. §9 rule 3's "completes on the next frame" is read as this immediate path, which P-14 already implements as the next task.
  3. **Fallback margin:** a fixed internal 100 ms, a named implementation constant and not a CSS token. It is added only when a matching library animation has a positive end time, so the 0 ms path stays 0 ms.
  4. **Reduced motion:** under `prefers-reduced-motion: reduce`, enter and exit motion is off entirely: no translation, no scale and no fade. This is within §22's "only a short fade at most", and it makes the computed fallback 0, so the lifecycle completes through the 0 ms path (§9 rule 3, AC-MO-3). The built-in spinner stops and stays a static indicator (§22). It is CSS only: no `matchMedia` or other JavaScript detection, so there is nothing to hydrate (§23).
  5. **Public motion tokens:**
     - Exactly four, added in S2: `--ret-enter-duration`, `--ret-exit-duration`, `--ret-enter-easing` and `--ret-exit-easing`. The names follow the existing subject-then-modifier pattern (`--ret-text-muted`).
     - They follow the P-17 token model (OQ-25): declared on `:where(.ret-toaster)` with zero specificity and no `!important`, never on `:root`, overridable by any consumer selector, and not theme-specific, so the dark and system blocks keep only the colour tokens.
     - The public token count becomes 28 after P-18 (P-20's progress tokens come later).
     - The default values are not locked here. S2 proposes them and they are tuned at its manual checkpoint.
  6. **Motion property:**
     - Motion animates `opacity` and the individual `translate` and `scale` properties, never `transform`. The `transform` property stays free for P-19 repositioning and P-21 swipe to compose with later.
     - **Browser support evidence.** The plan sets no numeric browser floor; P-26 writes the README's browser-support statement (§31), and the browsers verified are current Chromium, WebKit and Firefox (§26, §28, P-22). Normative requirements already imply a floor: `:dir()` (§20) needs Chrome and Edge 120, Safari 16.4 and Firefox 49, and `inert` (§9 rule 4) needs Chrome 102, Safari 15.5 and Firefox 112. Individual `translate` and `scale` need Chrome and Edge 104, Safari and iOS Safari 14.1 and Firefox 72 (MDN browser-compat-data), all below that floor, so they add no new requirement. P-26's browser-support statement must not claim a lower floor.
  7. **Direction and keyframes:**
     - Four internal keyframes, by the anchored vertical edge: `ret-enter-top`, `ret-enter-bottom`, `ret-exit-top` and `ret-exit-bottom`. Toasts at top positions enter from above and those at bottom positions from below; each exit reverses its enter. The horizontal placement (left, centre or right) never changes the direction (§20). Each toast root already carries `data-position` and `data-phase`, so no new attribute or custom property is needed.
     - The settled state has opacity 1, no translate offset and scale 1. The enter keyframes end there, and a `visible` toast has no animation, so nothing is left offset at any position (D-14).
     - The exit keeps its final state until removal (`animation-fill-mode: forwards`), so the toast never flashes back between `animationend` and its removal.
     - Enter and exit have different names, so revival (`exiting` → `entering` on the same node, §14) restarts the animation; a change of `animation-direction` alone would not.
     - Keyframe names are implementation details, not public API: OQ-25's contract covers tokens, classes and the `data-*` attributes only, and §21 lists `ret-enter` and `ret-exit` among its "indicative names". Every keyframe stays `ret-` prefixed (AC-CSS-1).
  8. **Spinner ownership:** only the library's built-in loading SVG spins (`ret-spin`), marked in S3 with an internal implementation class that is not public CSS API. A consumer icon on a loading toast does not spin because of the type; the DOM cannot otherwise tell library icons from consumer icons (P-17 S4).
  9. **Animation ownership:** only the library's enter and exit animations take part in lifecycle completion. A consumer animation on the toast root, for example through `className`, never triggers `entered()` or `exited()` and never extends the fallback. What that animation looks like stays the consumer's. Replacing the library keyframes is not a supported customisation in 2.0; the motion tokens are.
- **Invariants P-18 keeps:**
  - Timers run only while a toast is `visible`, so enter and exit time never uses up its duration (§9 rule 5, §10).
  - An exiting toast keeps its slot until `exited()` (§9 rule 6, §11), stays inert (§9 rule 4), and focus restoration runs before `inert` (§18, P-16).
  - `onDismiss` fires only at removal (§16). Revival re-enters on the same node (§14). Detach finishes exits at once (§8.4).
  - DOM order stays visual order (§12). No per-frame React state and no animation library (§5, §22, §32). No JavaScript reduced-motion detection.
  - Custom toasts get the library's enter and exit motion (§6.4, §17.3) but still no card chrome (P-17 S3).
- **Boundaries:** P-19 owns stack repositioning, including the layout shift when an exiting toast is removed; P-20 progress and its tokens; P-21 swipe, including an exit that continues from the swipe offset; P-22 real-browser verification of motion, `animationend`, reduced motion and D-14; P-26 the public documentation of the motion tokens and reduced-motion behaviour; P-29 the reduced-motion part of the manual accessibility audit.
- **Sequence:**
  - **D0, decision record:** this entry. Documentation only.
  - **S1, completion plumbing (done):** the native `animationend` listener, the computed-style fallback with the 100 ms margin, and the 0 ms path kept. No CSS, so nothing changes visibly, and jsdom still completes through the 0 ms path.
    - **Module:** `src/react/motion.ts`, internal and not on the package entry. `libraryAnimationName(phase, position)` gives `ret-enter-top`, `ret-enter-bottom`, `ret-exit-top` or `ret-exit-bottom` from the phase and the position's `top-` or `bottom-` prefix. `fallbackDelay(style, expected)` is a pure function of the three computed longhands; `fallbackDelayOf(item, expected)` reads them with the `getComputedStyle` of the toast's own window, a style read with no layout.
    - **Calculation:** the lists pair by index, with a shorter duration or delay list repeating from its start and the surplus of a longer one ignored; `none` entries keep their index and never match. Each entry named exactly `expected` (a quoted serialisation is unquoted) ends at delay plus duration, and the latest end counts. A negative delay is not clamped: it shortens the run, and at or below `-duration` nothing is left to wait for. A negative or unusable duration counts as 0, an unusable delay as 0; `auto` (jsdom) is unusable. A positive end returns end + 100 ms (`LIFECYCLE_FALLBACK_MARGIN_MS`), capped at the largest `setTimeout` delay; otherwise 0, without the margin. The result is always finite.
    - **Renderer:** `ToastItem`'s fallback effect, still keyed on the phase (now with the position), schedules one `setTimeout` with that delay, so jsdom keeps the 0 ms path, and adds a native `animationend` listener to the `<li>`. An event completes the phase only when its target is the `<li>` itself, the `<li>`'s committed `data-phase` is still the effect's phase, and its `animationName` is the expected library name; it then clears the timer and the listener before reporting. Cleanup clears both on a phase change, revival, unmount or detach. `entered()` and `exited()` remain the final guard. No `requestAnimationFrame`, `matchMedia`, layout read or React state.
    - **Tests:** `motion.test.ts` (the name mapping, time parsing and the calculation: absent, `none`, `0s` and `auto` give 0; seconds, milliseconds, delays, whitespace, quoted names, exact matching; list repetition of durations, delays and both, a repeated name, `none` entries; consumer animations ignored; negative delays; unusable and overflowing values) and `motion-lifecycle.test.tsx` (stubbed computed styles on the fake clock: completion by event before the fallback and only once, bottom names at every bottom position, custom toasts; descendant, spinner, consumer, opposite-phase, other-edge and stale-phase events ignored; the fallback at exactly end + 100 ms and not 1 ms before, without events as with `display: none`, and the 0 ms path for jsdom, `0s` and consumer-only animations; one style read and one timer per transition; no rAF, `matchMedia` or layout read; revival, StrictMode and detach). No existing test changed: every suite that completes the lifecycle with `advanceTimersByTime(0)` passes as it was.
    - **Mutations,** each detected by the full suite and restored: the target filter removed (2 failures), the name filter removed (5), the margin removed (20), consumer animations counted (12), `requestAnimationFrame` on the zero path (302, across the existing suites), and the committed-phase check removed (1).
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (31 files, 977 tests), `validate:package` and `build:demo` all pass. `src/styles.css`, the tokens (still 24), the icons and the public API are unchanged.
  - **S2, enter and exit motion (done):** the four keyframes, the `data-phase` and `data-position` selectors for normal and custom toasts, and the four public tokens. The P-17 motion-boundary and token-set tests are replaced by the P-18 contract. Manual checkpoint in Chromium.
    - **Tokens:** `--ret-enter-duration: 180ms`, `--ret-exit-duration: 120ms`, `--ret-enter-easing: cubic-bezier(0.2, 0, 0, 1)` and `--ret-exit-easing: cubic-bezier(0.4, 0, 1, 1)`, on `:where(.ret-toaster)` only, not repeated in the dark or system blocks. The public set is 28.
    - **Keyframes:** `ret-enter-top` and `ret-enter-bottom` author only `from`, and `ret-exit-top` and `ret-exit-bottom` only `to`: `opacity: 0`, `translate: 0 -8px` (top) or `0 8px` (bottom) and `scale: 0.98`. The other end is the toast's ordinary style, so the settled look is P-17's. Nothing uses `transform`.
    - **Selectors:** zero-specificity rules on the toast root. `[data-phase='entering']` sets the enter tokens, `animation-delay: 0s`, `animation-iteration-count: 1` and `animation-fill-mode: none`; `[data-phase='exiting']` the exit tokens, the same delay and count, and `animation-fill-mode: forwards`, so the exit's last frame holds until removal. Four separate rules set only `animation-name`, by phase and the `top-` or `bottom-` prefix of `data-position`, matching `libraryAnimationName`; a later rule can turn motion off by `animation-name` alone (S4). Longhands only, no shorthand, direction or play state. A `visible` toast has no animation. Custom toasts match the motion rules and still none of the card. No forced-colours or reduced-motion rule, and no spinner.
    - **No React or DOM change.** Only `src/styles.css` changed in production, plus its header and focus comments.
    - **Tests:** `styles.test.ts` replaces the P-17 no-motion token guard and motion boundary with the S2 contract: the 28 tokens and the four motion defaults, root-only; the four keyframes and their exact single frames; all six positions in all three phases, normal, default and custom, cross-checked with `libraryAnimationName`; the exact timing and fill longhands; name rules apart from timing; custom roots without card chrome; no settled `opacity`, `translate`, `scale` or `transform` anywhere; no motion on the region, lists, toast parts or icon; no transition, reduced-motion rule or spinner yet; no `matchMedia` or `prefers-reduced-motion` in JavaScript. `motion-lifecycle.test.tsx` now derives its stubbed timings from the stylesheet's token defaults (180 ms in, 120 ms out) and adds a focused exit: focus is restored and `inert` set as the exit starts, and the toast stays rendered and `exiting` until its `animationend` or the fallback.
    - **Mutations,** each detected and restored: top and bottom names swapped (5 failures), a hard-coded duration (1), `transform` instead of `translate` and `scale` (2), no exit `forwards` (1), an animation on `visible` (7), an explicit settled end on an enter keyframe (2), an inverted travel (1), a fifth motion token (2), custom toasts excluded (13), a transition (1) and the `animation` shorthand (2).
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (31 files, 1,015 tests), `validate:package` and `build:demo` all pass.
    - **Manual checkpoint (done):**
      - The maintainer reviewed S2 in Chromium with `?production-css` and approved the motion profile as implemented: the enter and exit speeds and easings, the 8px travel, the 0.98 scale and the top and bottom directions. No value changed.
      - During the review a toast stayed on screen without timing out. This is the interim harness's **Persistent** option, on by default since the P-17 D1 prototype, which passes `duration: Infinity`; `?production-css` does not change it. With Persistent off, the normal timeout lifecycle applies. It is intentional demo configuration, not a P-18 defect, and the demo is unchanged.
      - This is S2 Chromium visual evidence only. It is not P-22 real-browser or cross-browser animation verification, reduced-motion verification (S4, P-22), screen-reader checking (P-29) or Windows High Contrast verification (P-22).
  - **S3, built-in spinner (done):** the internal class on the built-in loading SVG and `ret-spin`.
    - **DOM:** the built-in loading icon's `<svg>` root gets `class="ret-toast__spinner"` (`src/react/icons.tsx`), an internal implementation class that is not public API. No other built-in icon, no consumer icon and no custom content gets it, and the SVG's geometry is unchanged.
    - **CSS:** `@keyframes ret-spin` turns the individual `rotate` property from `0deg` to `360deg`, never `transform`; `rotate` needs Chrome and Edge 104, Safari 14.1 and Firefox 72 (MDN browser-compat-data), the same floor as `translate` and `scale` (decision 6). `:where(.ret-toast__spinner)` runs it with longhands: `animation-duration: 1s`, `animation-timing-function: linear`, `animation-delay: 0s` and `animation-iteration-count: infinite`. The plan sets no duration, so 1s is S3's choice. No token: the public set stays at 28. The spinner runs in every phase, since it is on the icon, not the toast root, and composes with the root's enter and exit. No forced-colours or reduced-motion rule: S4 makes it static by `animation-name: none`.
    - **Lifecycle isolation:** `ret-spin` is never a name `libraryAnimationName` returns, so S1 neither completes a phase on it nor counts it in the fallback; its events also come from a descendant of the toast root.
    - **Tests:** `styles.test.ts` adds the spinner contract (the exact keyframe, the exact rule and its only selector, every phase and position of a loading toast, no spin for other types, consumer icons or the icon slot, no token, the S2 motion unchanged, not a completing name, not in forced colours) and scopes the S2 keyframe and name-rule guards to the enter and exit motion. `toast-item.test.tsx` checks that only the built-in loading `<svg>` carries the class, and no other built-in icon, consumer icon on a neutral or loading toast, or custom SVG. `motion-lifecycle.test.tsx` checks that spinner events complete neither an enter nor an exit, and that the exit then ends by its fallback. `motion.test.ts` checks that `ret-spin` never counts toward a fallback.
    - **Mutations,** each detected and restored: the class removed from the loading SVG (2 failures), the class on the success icon (1), an unprefixed keyframe (6, including the AC-CSS-1 lint), a finite iteration count (1), a non-linear easing (1), the rule broadened to `.ret-toast svg` (2), a public spinner token (5), `transform` instead of `rotate` (1) and a premature reduced-motion rule (1).
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (31 files, 1,024 tests), `validate:package` and `build:demo` all pass. The S2 rules are unchanged.
    - **Manual checkpoint (done):**
      - The maintainer reviewed the spinner in Chromium with `?production-css` and approved it as implemented: it turns smoothly and stays centred without wobbling, and `1s linear` was accepted. It turns while its toast enters, keeps turning while it is visible, and turns through the exit until removal. Non-loading built-in icons and custom and consumer icons stay static. No value changed.
      - This is S3 Chromium visual evidence only. It is not reduced-motion verification (S4, P-22), P-22 real-browser or cross-browser verification, screen-reader checking (P-29) or Windows High Contrast verification (P-22).
  - **S4, reduced motion (done):** the `prefers-reduced-motion: reduce` block for enter, exit and the spinner. Manual checkpoint with emulated reduced motion in Chromium.
    - **CSS only:** one `@media (prefers-reduced-motion: reduce)` block, after every motion rule, so it wins at the same zero specificity. `:where(.ret-toast[data-phase='entering'], .ret-toast[data-phase='exiting'])` and `:where(.ret-toast__spinner)` each set `animation-name: none` and nothing else: no fade, no keyframes, no duration or token change. No `matchMedia`, React state, listener, store state or public API; the tokens stay at 28, and the forced-colours block is unchanged, so both preferences apply together.
    - **No residual state:** with no animation name there is no animation, so the exit's `animation-fill-mode: forwards` has nothing to hold; an exiting toast keeps its ordinary look until it is removed. The spinner keeps its geometry and stops.
    - **Lifecycle:** the computed name is `none`, so S1 finds no library animation and completes each enter and exit through the 0 ms `setTimeout`, with no `animationend` (§9 rule 3, AC-LC-2, AC-MO-3). Focus restoration and `inert` still come first as an exit starts. The visible duration is unchanged, since the timer runs only while `visible`. S1 and the store are unchanged.
    - **Tests:** `styles.test.ts` adds the reduced-motion contract: a single block after every motion rule with exactly the two rules, each only `animation-name: none`; all six positions in all three phases, normal and custom, with no library animation; entering and exiting resolve to `none`; the spinner resolves to `none` with everything else unchanged; no keyframes, fade, token or settled style of its own; the normal motion unchanged outside the block; no animation in forced colours and no `forced-color-adjust`. The S2 "no reduced-motion rule yet" guard became "no transition". `motion-lifecycle.test.tsx` stubs the computed style a browser resolves under reduced motion (name `none`, durations still resolved) and checks the enter and the exit on the 0 ms path without `animationend`, one 0 ms timer per transition, focus restored and `inert` set before removal, a spinner that neither holds up nor completes the toast, and a default toast end to end: 5000 ms of visible time, not 1 ms less, then `onAutoClose`, the exit and `onDismiss` with `timeout`, in that order.
    - **Mutations,** each detected and restored: the toast override removed (14 failures), the spinner override removed (2), `animation-name: none` replaced by `animation-duration: 0ms` (16), a reduced-motion fade (17), only enter disabled (8), only top positions disabled (8), `matchMedia` in production JavaScript (2), a motion token changed in the block (3) and an animation rule added to the forced-colours block (2).
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (31 files, 1,054 tests), `validate:package` and `build:demo` all pass. The S2 and S3 rules are unchanged.
    - **Manual checkpoint (done):**
      - The maintainer reviewed S4 in Chromium with `?production-css`, emulating `prefers-reduced-motion: reduce` through DevTools, and approved it as implemented. Under the emulation, toasts entered and exited with no visible slide, scale or fade; the loading spinner stayed visible and static; a finite toast still timed out; close and dismiss still removed toasts; and focus stayed usable. With the emulation off, the normal motion and the spinner returned. No value changed.
      - This is Chromium DevTools media-feature emulation only. It is not an operating-system reduced-motion setting, P-22 real-browser or cross-browser verification, screen-reader checking (P-29) or Windows High Contrast verification (P-22).
  - **S5, reconciliation (done):** the plan and defect status, the carry-forwards above, full validation and the final manual checkpoint.
    - **Decisions:** each of D0's nine decisions was traced to the final code and tests, and all hold. Native, target-, phase- and name-filtered completion and the computed fallback with its 100 ms margin and 0 ms path (`ToastItem.tsx`, `motion.ts`); the four tokens and 28 in all; `opacity`, `translate`, `scale` and `rotate`, never `transform`; the four edge keyframes; the built-in spinner only; consumer animations excluded; reduced motion in CSS only.
    - **Lifecycle:** traced end to end. An enter and an exit each complete on the toast root's own library `animationend` or on the fallback, whichever comes first; with no matching animation (no stylesheet, `0s`, reduced motion, jsdom) on the 0 ms path. Revival changes the animation name, so the enter restarts, and stale reports stay phase-guarded. Detach still finishes exits at once and depends on no animation. Timers, pauses, callbacks, slots, focus restoration and `inert` are unchanged.
    - **Acceptance:**
      - AC-LC-1 and AC-CSS-1 are met: automated, and nothing is left to a later phase.
      - AC-LC-2 is met for the component layer: completion without events in jsdom, with reduced motion and with `display: none` (the stubbed fallback). The real-browser lifecycle is checked by P-22 (§26).
      - AC-MO-1 has its structural evidence and the S2 and S3 Chromium checkpoints; real enter and exit in Chromium, WebKit and Firefox, and left positions settling, are P-22's.
      - AC-MO-3 has its structural and lifecycle evidence and the S4 Chromium emulation checkpoint; Playwright reduced-motion emulation is P-22's (§17.6).
      - P-18 changes no other criterion: AC-MO-2 is P-19's, the AC-TM, AC-KB and AC-A11Y tests pass unchanged, and the positive-exit focus tests extend AC-KB-1's evidence.
    - **Public surface:** compared with the P-17 merge (`95bf2bd`), the only public addition is the four motion tokens (28 in all). The JavaScript exports, the toast and Toaster APIs, the documented classes and `data-*` attributes, the entry points, `package.json`, the lockfile, the fixtures, the scripts and the demo are unchanged. The DOM's only change is the internal `ret-toast__spinner` class; it and the five keyframes are implementation details and documented nowhere as contract.
    - **Tests:** the S3 narrowing of two S2 guards kept their coverage: the enter and exit keyframes still must animate exactly `opacity`, `translate` and `scale`, and `ret-spin` has its own exact test; the name-rule separation still covers every toast-root rule, the reduced-motion one included. The "no reduced-motion rule yet" guard was replaced by the S4 contract. No `.only`, `.skip`, TODO, debug output or commented-out code was added. One comment is stale: the header of `styles.test.ts` still says "no motion before P-18"; it asserts nothing.
    - **Mutations:** S1 to S4 recorded 35 mutations, each detected. Together they cover the target and name filters, consumer animations, the margin, `requestAnimationFrame`, the edge mapping, `transform`, the fills, `visible` animation, custom toasts, the spinner's reach and lifecycle isolation, reduced motion missing, partial, faded or done in JavaScript, and token drift. The one case left to real browsers is a preference that changes during a running exit: the toast shows its ordinary style and is removed when the fallback computed at the exit's start fires.
    - **Validation (S4 commit `357da80`):** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (31 files, 1,054 tests), `validate:package` (exports, packed declarations and the consumer fixture render) and `build:demo` all pass.
    - **Final manual checkpoint (done):** limited to what the S2 to S4 checkpoints did not record. The maintainer reviewed it in Chromium with `?production-css` and approved:
      - **Custom toasts:** the root enters and exits like a normal toast, the content stays chrome-less, and the lifecycle completes.
      - **Rapid activity:** approved after an investigation. Closing a toast with the mouse could leave one finite toast on screen indefinitely. It was `visible` with its finite duration and its timer paused by `focus-within`: Chromium focuses a clicked close button, removal restoration (§18) then moves focus to the next toast's close button, or the previous toast, and focus inside a toast pauses it (§10). When focus leaves, the pause clears and the timer resumes with the time it had left. The behaviour is deterministic and identical at the P-17 merge (`95bf2bd`); P-18 changed no timer, pause or focus-restoration code, and restoration runs as the exit starts, before `inert` and before any animation completes. It is expected pause behaviour under the current §10 and §18 contract, not a stuck timer, a lifecycle failure or a P-18 regression. Whether a pointer close should restore focus the same way is a design question, recorded under P-22 (click without focus).
      - **RTL:** the vertical motion is unchanged, top toasts from above and bottom toasts from below, with no horizontal or logical-direction coupling.
      - **Keyboard during an enter:** Alt+T and keyboard focus stayed usable while toasts moved, and motion did not visibly break the P-16 focus behaviour. This is not an accessibility audit.
      - **Forced colours (Chromium DevTools emulation):** toast and spinner motion kept working, with no visible breakage. This is not Windows High Contrast, P-22 cross-browser or P-29 accessibility verification.

**P-19 Stack repositioning**

- **Prototype gate:** build both the measured-offset approach and the FLIP/WAAPI approach, choose one within the §22 constraints, and record the decision in the PR.
- Scope: the chosen technique, including its reduced-motion behaviour.
- Carried over from P-18. Enter and exit animate `opacity` and the individual `translate` and `scale` on the toast root, and the spinner the individual `rotate` on its icon, so `transform` is free for repositioning. Neighbouring toasts still jump when a toast enters, and when an exiting toast is removed at the end of its exit; smoothing that is P-19's.
- **Status: complete.** D0, D1, D2 and S1 to S5 are done, the final reconciliation and validation passed, and every checkpoint is recorded. Production uses candidate A, measured layout offsets with a flow-delta CSS transition. It adds no public surface: the token set stays at 28. What P-19 leaves open is listed in the S5 record and in the P-21, P-22, P-25, P-26 and P-29 entries.
- Defects: none. Appendix A assigns no defect to P-19.
- Acceptance: AC-MO-2 is P-19's. P-19 extends AC-MO-3 to reflow. AC-LC-1 to AC-LC-3, AC-POS-1, AC-KB-1, AC-KB-2, AC-Q-2, AC-CSS-1 and AC-CSS-3 must not regress. As with AC-MO-1 in P-18, AC-MO-2's real-browser proof ("reflow", §26) is P-22's.
- Decisions locked before implementation (D0). They do **not** choose between the two techniques. That is D2's decision.
  1. **Prototype gate:**
     - Both techniques the gate names are built and compared before any production implementation: A, measured offsets with CSS transitions, and B, FLIP with the Web Animations API.
     - Both are demo-only. They use the same harness and the same comparison scenarios, and they may drive the real rendered toast DOM. No prototype code reaches `src/`, the package output or the public contract.
     - D2 is the maintainer's review and sign-off, and it chooses the production technique. D2 records the winner and its reasons in this entry, and the phase PR records them too (§22).
  2. **Candidate boundaries:**
     - **A** measures the layout displacement. The existing P-17 flex column stays authoritative, with toasts in normal flow. The inverse vertical displacement is applied through `transform`, and a CSS transition carries it back to the real layout position. Internal custom properties may be used, and ResizeObserver may keep the geometry fresh. A starts from this flow-delta architecture. It does not move the stack to absolute or manual positioning unless the flow-delta prototype fails a hard criterion (decision 13), and that failure is reported before A is broadened.
     - **B** measures the displacement FLIP-style and animates it with `Element.animate()`, using explicit keyframes. The library owns its `Animation` references, and `Animation.cancel()` is allowed. It uses no `commitStyles()`, does not depend on `getAnimations()`, and does not need additive or `composite` animation.
     - **Both** may use layout-space `offset*` measurement, `getComputedStyle` and ResizeObserver. Each falls back to no reposition animation when an API it needs is missing. Neither may affect lifecycle correctness.
  3. **Trigger scope:**
     - **Mandatory triggers.** P-19 smooths the repositioning of surviving neighbours whenever a stack's membership changes:
       - an insertion;
       - a removal once its exit has completed;
       - an insertion and a removal in the same committed snapshot, including a promotion (§11);
       - the same membership changes caused by a relocation, which leaves one list and joins another (§14).
     - **Not a trigger:** a phase change on its own, including revival on the same node (§14).
     - Toasts may have any height. No fixed height is assumed.
     - **Size changes.** A mounted toast changing size, and a responsive or viewport reflow, must never leave stale cached geometry or a stale transform. They must never make the next membership move start from the wrong origin. D0 does not require them to animate. Whether they animate stays open until D2.
  4. **Geometry:**
     - Displacement comes from measured layout geometry. It is measured outside render (§23, §32), on the toast's `<li>` root whatever its content, built-in or custom, at any height.
     - It is measured in layout space, so neither the P-18 individual `translate` and `scale` nor P-19's own transform affects it.
     - It is correct for stacks anchored at the top and at the bottom.
     - Reads and writes are batched where practical.
     - The production metric stays open until D2. The lead candidate is `offsetTop` and `offsetHeight`, taken as the distance from the anchored edge.
  5. **Interruption:**
     - During rapid stack changes, a surviving toast never visibly snaps back to a stale animation origin or to its previous layout position, and never passes through a wrong intermediate position.
     - A new move continues from the toast's current position on screen and ends exactly at its true layout position.
     - D0 locks only this observable behaviour. The mechanism is specific to each candidate and stays open until D2.
  6. **Motion property:**
     - Repositioning displaces toasts visually through the `transform` property only, and only vertically.
     - P-19 never writes or animates the individual `translate`, `scale` or `rotate`. They stay P-18's, so the two compose (P-18 decision 6).
     - The toast `<li>` is the reposition root. The transform is never applied to the `.ret-toaster` section or to a `.ret-toaster__list` `<ol>` (§12).
     - No wrapper element is added (P-17 decision 3). DOM order stays visual order (§12).
     - P-18's enter and exit keyframes, its tokens and its completion semantics are unchanged.
     - Whether a production toast must compute to `transform: none` at rest is a strong preference that D1 and D2 evaluate. It is not a hard requirement.
  7. **Lifecycle, focus and state:**
     - P-19 changes visual repositioning only. Lifecycle phases, enter and exit completion, queue slots, promotion, timers, pause reasons, callbacks, focus-restoration semantics and the `inert` ordering are all unchanged (§9 to §18).
     - Reposition motion never gates or delays `entered()`, `exited()`, a removal or a promotion.
     - It adds no per-frame React state, no React render made only to animate, and no global event listener (§5, §32).
     - P-19 never moves focus.
  8. **Reduced motion:**
     - Under `prefers-reduced-motion: reduce`, repositioning is instant: no translation, no scale and no fade. §22 allows at most a short fade, and this matches P-18 decision 4.
     - The policy stays in CSS. JavaScript never calls `matchMedia`, contains no reduced-motion media query and never branches on `prefers-reduced-motion`.
     - JavaScript may read a resolved computed CSS value, as the P-18 fallback already does (P-18 decision 2).
     - For A, CSS turns the reposition transition off or sets its duration to zero.
     - For B, an internal duration owned by CSS may resolve to 0, and JavaScript then skips the WAAPI motion. Whether that coupling between CSS and JavaScript is desirable is D2 evidence.
  9. **Public contract:**
     - D0 adds no public P-19 surface: no JavaScript API, React prop, export, documented class, documented `data-*` attribute or public token.
     - The documented token count stays exactly 28 through D0, D1 and D2. Prototype timing is internal.
     - Internal `--ret-*` implementation properties are allowed where needed. They are undocumented and are not customisation tokens, and tests must tell them apart from the 28 documented tokens.
     - Internal, undocumented `ret-*` classes are allowed if needed, as P-18's `ret-toast__spinner` is. P-19 adds no new `data-*` hook.
     - D2 may reopen whether the production reposition duration and easing deserve public tokens, but only on prototype evidence.
  10. **Primitives:**
      - **Evidence** (MDN browser-compat-data 8.1.4): both candidates work at the floor implied by P-18 decision 6, which is Chrome and Edge 120, Safari 16.4 and Firefox 112.
        - Every primitive either candidate needs is supported below that floor: `transform`, CSS transitions, custom properties through CSSOM, `getComputedStyle`, `offset*`, ResizeObserver, `Element.animate()`, `Animation` and `Animation.cancel()`.
        - `commitStyles()` is unnecessary, because each move ends at the real layout position. Its endpoint behaviour also changed only recently (Chrome 144, Safari 26.2, Firefox 142).
        - Implicit WAAPI keyframes are marked partial and buggy in Safari, so keyframes are explicit.
        - `@property` and `CSS.registerProperty` (Firefox 128) and `transition-behavior` (Safari 17.4, Firefox 129) are above the floor and excluded. The stylesheet lint also forbids `@property`.
        - jsdom has neither ResizeObserver nor `Element.animate()`.
      - **Allowed where appropriate:** the CSS `transform` property, CSS transitions, custom properties through CSSOM, `getComputedStyle`, layout-space `offset*`, ResizeObserver, `Element.animate()`, library-owned `Animation` objects and `Animation.cancel()`.
      - **Avoided:**
        - implicit WAAPI keyframes;
        - `Animation.commitStyles()`;
        - reliance on `Element.getAnimations()`;
        - required additive or `composite` WAAPI;
        - `@property` and `CSS.registerProperty`;
        - `transition-behavior`;
        - `requestAnimationFrame`;
        - `matchMedia`.

        If a later slice needs one of these, it stops and justifies it before introducing it.

      - **Feature guards:** ResizeObserver and WAAPI are feature-guarded, so jsdom and compatible consumer environments never crash. No reposition capability may become necessary for lifecycle correctness.
  11. **Existing test guards:**
      - The P-18 guards keep their intent:
        - lifecycle completion stays independent of P-19, and its path stays free of P-19 layout reads;
        - the lifecycle does not depend on `requestAnimationFrame`;
        - there is no `matchMedia`;
        - enter and exit stay on the individual properties.
      - The broad guards ("no transition", "no settled transform" and "no layout read" across the whole toast lifecycle) are narrowed only when the production implementation requires it. Their underlying invariant is never weakened or deleted.
      - D1 changes no `src` test just to accommodate the demo prototypes.
  12. **P-21 composition:**
      - P-19 leaves P-21 swipe a viable way to compose with it. P-21 must not be forced into wrappers, DOM reordering or replacing the P-18 individual motion properties.
      - D1 compares what each candidate implies for P-21. D2 records the path for the chosen technique as a carry-forward in the P-21 entry.
      - P-19 implements no swipe.
  13. **Comparison gate.** D1 compares both candidates on the same harness. D2 is the maintainer's sign-off against this matrix.
      - **Hard gates:**
        - insertion;
        - removal after the exit;
        - an insertion and a removal in one committed snapshot;
        - all six positions, top and bottom stacks;
        - built-in and custom toasts of arbitrary height;
        - rapid changes with no visible snap-back;
        - P-18's enter and exit intact while neighbours move;
        - revival with no layout displacement;
        - instant reduced motion;
        - independence from RTL;
        - lifecycle not gated;
        - focus and `inert` unchanged;
        - DOM order unchanged and no wrappers;
        - degradation that is safe in jsdom by design;
        - no added React renders for animation;
        - no new global listeners;
        - primitives within the floor;
        - a viable P-21 composition path.
      - **Strong preferences:**
        - `transform: none` at rest;
        - minimal coupling of timing between CSS and JavaScript;
        - the existing flex layout kept;
        - the smallest set of primitives;
        - low implementation complexity;
        - layout reads batched before writes.
      - **Observational:**
        - perceived smoothness and how interruption feels;
        - sub-pixel behaviour;
        - the interaction with P-18's `scale: 0.98`;
        - whether size changes animate;
        - hover and pointer behaviour across transient gaps;
        - package-size implications.
  14. **Sequence and boundaries:**
      - The sequence is:
        1. **D0**, decisions (this entry);
        2. **D1**, both demo-only prototypes;
        3. **D2**, the maintainer's comparison and choice of technique;
        4. **S1 to Sn**, the production implementation, defined at D2 and not before;
        5. a final reconciliation and manual checkpoint;
        6. the PR, CI and a merge commit into `v2`.
      - Out of scope:
        - progress (P-20);
        - swipe (P-21);
        - Playwright and real-browser certification (P-22);
        - React 19 and `<Activity>` (P-23);
        - the final documentation (P-26);
        - the final accessibility audit (P-29);
        - the pointer-triggered close and focus-within question recorded under P-22, which stays P-22's and P-29's;
        - the collapsed "stacked deck" mode, which stays post-v2 (§37).
- **Open until D2:**
  - the production technique, and what happens to the losing prototype;
  - whether mounted size changes and viewport reflow animate;
  - the interruption mechanism;
  - the production geometry metric;
  - whether `transform: none` at rest is required;
  - whether B's reduced-motion coupling between CSS and JavaScript is acceptable, if B wins;
  - whether reposition timing gets public tokens;
  - the P-21 composition path to record;
  - the S1 to Sn slice plan.

  All of these are resolved at D2 below.

- **D1, prototypes (done):**
  - Commit `f92dd5f`, in `demo/p19/`, demo-only. A shared harness observes the real rendered toast DOM, and a selector switches between Off (the P-18 baseline), candidate A and candidate B. Both candidates use the same scenarios, the same geometry and the same 200 ms `cubic-bezier(0.2, 0, 0, 1)` timing. Nothing reached `src/` or the package.
  - Candidate A stayed flow-delta. A2 (an absolute stack) was not needed.
  - In headless Chromium both candidates passed every structural gate the harness could measure:
    - insertion, removal and promotion at top and bottom stacks;
    - no direction reversal across rapid removals;
    - no movement on revival;
    - fresh geometry after a rewrap;
    - `transform: none` and the exact layout position at rest;
    - instant moves under reduced motion;
    - the same Toaster commit count as the baseline;
    - focus restoration and `inert` unchanged;
    - P-18 enter and exit intact while neighbours move;
    - RTL independence;
    - jsdom without ResizeObserver or WAAPI.
  - One finding fed back into A: removing A's transition rule does not cancel a running transition, because the initial `transition-property` is `all`. Cancellation has to turn the transition off explicitly.
  - **Consumer root transform:** both candidates conflict with a consumer `transform` on the toast root. A interpolates it away and back during a move. B hides it for the length of the animation. The offset sampling would also misread a consumer `translateY` as a move in flight.
- **D2, technique decision (done):**
  - The maintainer compared both prototypes in Chromium and found no meaningful visible difference in the tested scenarios.
  - **Candidate A is the production technique:** measured layout offsets, flow-delta, and a CSS transition. The reasons:
    - it looks the same;
    - its architecture is simpler;
    - the P-17 flex layout stays authoritative;
    - there is no WAAPI animation ownership or lifecycle;
    - JavaScript holds no timing;
    - reduced motion is cleaner and owned by CSS, with no duration passed from CSS to JavaScript;
    - it needs the smaller set of primitives;
    - A2 was not needed.
  - **Candidate B is not rejected for failing.** It worked correctly, but its additional machinery gave no meaningful user-visible benefit.
  - These decisions are locked for S1 to S5. D0's decisions still hold where D2 does not narrow them.
  1. **Layout:** the P-17 layout is unchanged:
     - fixed `<ol>` lists, a flex column, `--ret-gap`;
     - toast roots in normal flow;
     - DOM order is visual order;
     - no wrapper, and no absolute or manual stack layout.
  2. **Technique:** on a membership change:
     - the cached previous layout-space geometry and the newly measured geometry give each surviving toast's vertical displacement;
     - the toast is seeded with the inverse displacement through `transform`;
     - a CSS transition on `transform` carries it to its true layout position.

     The flex layout stays the source of truth. Repositioning is visual only and never affects lifecycle completion.

  3. **Geometry:**
     - The metric is measured on the `<li>` root:
       - top stacks use `offsetTop`;
       - bottom stacks use the anchored-edge distance `list.clientHeight − offsetTop − offsetHeight`.

       Transforms do not affect either, and toasts may have any height.

     - The cache is a ref or a `WeakMap`, never React state.
     - A ResizeObserver on the toast roots keeps the cache fresh between membership changes. It is feature-guarded.
     - Nothing reads layout during render. Reads happen in an isomorphic layout effect, after the toast items' own layout effects (focus restoration, then `inert`) and before paint.
     - A membership change is a change in the list's sequence of toast IDs. A commit that keeps the sequence, such as a phase change, a revival or a replacement, only refreshes the cache.
  4. **Interruption.** Within a list, each commit runs in this order:
     1. read every toast's layout metric;
     2. for each toast that moved, read its current P-19 offset from the computed `transform`;
     3. write the seed for every moving toast: inline CSSOM `transition-property: none`, and `transform: translateY(correction + current offset)`;
     4. one forced read for the whole list, to fix the seeds as the start values. The implementation uses one `list.offsetHeight` read, a layout read that also flushes style (reconciled at the final review; the decision first said "style read");
     5. remove both inline declarations from every seeded toast, so the stylesheet transition carries each to its layout position.

     The seed uses inline CSSOM only: there is no seed class and no React `style` prop. There is no per-frame work. A commit that changes several lists runs this per list, which costs at most one extra layout per affected list, at most six. The observable rule stays D0 decision 5's: no visible snap-back.

  5. **Rest state:** P-19 leaves `transform: none` at rest. This was a D0 strong preference and is now a requirement. No positioning transform stays on a toast after its move. The stylesheet declares no `transform`; only the transition.
  6. **Size changes:**
     - In P-19 v2, a mounted toast changing size, and a viewport reflow, do not animate.
     - ResizeObserver refreshes the cache, so a size change leaves no stale transform, and the next membership move starts from the correct position.
     - Animated arbitrary reflow is not part of P-19. The D1 "Animate size changes" option never reaches production.
  7. **Reduced motion:**
     - Under `prefers-reduced-motion: reduce`, a stylesheet rule turns the reposition transition off (zero duration), so the layout change is instant: no fade and no translation.
     - Detection is CSS only. No `matchMedia` or other JavaScript detection, and no CSS-to-JavaScript duration bridge.
  8. **Public contract:**
     - P-19 adds no JavaScript API, React prop, export, public class, public `data-*` attribute or public token. The token count stays exactly 28 after P-19.
     - Timing is internal. The starting values are D1's 200 ms and `cubic-bezier(0.2, 0, 0, 1)`, written as stylesheet values rather than custom properties, so no internal property is needed. They may be tuned at the S2 checkpoint. Public reposition tokens are not part of P-19.
     - If an internal class or `--ret-*` property later proves necessary, it stays undocumented, and tests tell it apart from the 28 tokens.
  9. **Consumer root transform:**
     - While reposition motion is active, the library owns the toast root's `transform`. A consumer `transform` on the root (through `className`) is not supported.
     - A consumer who needs a transform applies it inside custom content.
     - There is no wrapper and no composition API. P-26 documents this.
     - Every other consumer class and style on the root keeps applying, with two caveats on transitions (corrected at the final review, which found "unaffected" too strong):
       - **Seed interruption.** While a moved toast is seeded, its root briefly carries inline `transition-property: none`. A consumer transition running on that same root at that moment, on any property, is cancelled and jumps to its end value.
       - **Cascade.** The library's transition rules are zero-specificity `:where(.ret-toast)`. A consumer rule that replaces `transition-property` on the root turns the reposition transition off for that toast, which leaves the toast correct, only unanimated. A consumer `transition-duration` (or `transition-timing-function`) that wins the cascade overrides the library's, including the reduced-motion `0s` (S4).
     - Consumers who need transforms or their own animated presentation should animate an inner element of custom content, not the library-owned root. This runtime behaviour is accepted for P-19. It is a documentation caveat for P-26, with no change of specificity, no `!important`, no JavaScript detection and no token.
  10. **P-21:**
      - A uses `transition: transform` for vertical repositioning.
      - P-21 composes horizontal swipe with it without wrappers, without DOM reordering, and without replacing P-18's individual properties.
      - The expected direction is one library-owned root `transform` built from internal components for the swipe offset and the reposition offset, with the transition turned off during a direct pointer drag. P-21 decides the exact contract. The carry-forward is in the P-21 entry.
  11. **Prototype disposition:**
      - The prototypes stay through S1 as they are.
      - **S2 removes candidates A and B and the mode selector**, in the commit that turns production repositioning on. Run on top of production, they would apply a second displacement, and Off would no longer be a baseline.
      - The scenario controls and the readout use only the public API and DOM reads. They stay as the manual-checkpoint harness, and S5 removes them with the rest of `demo/p19/`.
  12. **Evidence:**
      - **AC-MO-2** (existing toasts move smoothly when stack membership changes). P-19 provides:
        - geometry unit tests;
        - component tests in jsdom with stubbed geometry: seeding, release, triggers, interruption, cleanup;
        - the CSS contract;
        - mutations;
        - the S2 and S3 Chromium checkpoints.

        P-22 provides the automated real-browser reflow proof (§26).

      - **AC-MO-3, extended to repositioning.** P-19 provides:
        - the CSS contract;
        - a component test of the reduced-motion path;
        - mutations;
        - Chromium emulation (S4).

        P-22 provides the Playwright emulation, and P-29 checks the operating system's own setting.

      - **Non-regression:** the existing lifecycle, queue and promotion, position-order, focus-restoration, `inert`, render-count, package and public CSS contract tests pass unchanged, except for the guard narrowing named in S2 and S4 (D0 decision 11).
- **Production sequence:**
  - **S1, geometry foundation (done):**
    - **Responsibility:** a new internal module, `src/react/reposition.ts`, which is not on the package entry. It holds:
      - the edge of a list;
      - the anchored-edge distance;
      - the displacement sign;
      - the current offset parsed from a resolved `transform`;
      - a list measurement that reads every toast root's metric in one pass;
      - membership detection from two ID sequences;
      - a feature-guarded ResizeObserver helper that observes and releases toast roots.
    - Nothing is wired in, so nothing changes visibly.
    - **Tests:** `src/__tests__/reposition.test.ts` covers:
      - the sign at top and bottom stacks;
      - distances measured from the anchored edge, independent of the toast's own height;
      - `none`, `matrix()` and `matrix3d()` parsing;
      - membership detection for insertion, removal, both at once, and no change;
      - the observer releasing detached roots;
      - a missing ResizeObserver;
      - no `getBoundingClientRect`, `requestAnimationFrame` or `matchMedia`.
    - **Invariants:** no change to `src/styles.css`, rendering, the lifecycle or the public surface.
    - **Mutations:** inverted bottom sign, `getBoundingClientRect` instead of `offset*`, no release of detached roots, no feature guard.
    - **Validation:** the full set.
    - **Commit:** `feat: add stack repositioning geometry`.
    - **Module:** `src/react/reposition.ts`, internal, imported by no production module yet and absent from `dist`. Reads only: it writes no style, class or attribute, renders nothing and schedules no frame.
      - `edgeOf(position)` gives `top` or `bottom` from the `top-` prefix, as `libraryAnimationName` does.
      - `anchoredDistance(edge, offsetTop, offsetHeight, listHeight)` is pure: `offsetTop` at the top, `listHeight − offsetTop − offsetHeight` at the bottom. `displacement(edge, from, to)` is the correction back to the old place, positive down: `from − to` at the top, `to − from` at the bottom.
      - `membershipChanged(previous, next)` compares two ID sequences by position: insertion, removal and reorder are changes, the same sequence is not. It sees IDs only, so a phase change, revival or replaced content is never a change.
      - `translateYOf(transform)` reads `none` as 0, `matrix()` from its sixth value and `matrix3d()` from its fourteenth. Anything else (another function, a wrong value count, a non-numeric, `NaN` or `Infinity` value, a missing parenthesis) reads as 0, meaning no offset in flight, and never `NaN` or a throw. No `DOMMatrix`: computed styles always serialise to one of the two matrix forms. `currentOffsetOf(item)` applies it to the root's computed `transform` in its own realm.
      - `measureList(list, edge)` reads the list's `clientHeight` once (bottom only), then each of the list's own `<li>` children's `offsetParent`, `offsetTop` and `offsetHeight`, in DOM order, in one pass. A root whose offset parent is not the list (hidden, detached or repositioned by a consumer) gets an undefined distance. Nested list items inside custom content are ignored.
      - `GeometryCache` is a `WeakMap` from toast root to distance. `remember(cache, measured)` overwrites every measured root's distance and deletes any it could not measure, so no stale distance survives. Keyed by node: React keeps a toast's `<li>` across phase changes, revival and replacement, and a relocated toast gets a new node in its new list.
      - `watchResize(onResize)` returns `{ sync(items), disconnect() }`. Without `ResizeObserver` it is a shared no-op. Otherwise `sync` observes exactly the given roots, each once, and unobserves any no longer given, so a detached root is released at the next sync; `disconnect` releases everything. The callback takes no arguments and is meant only to re-measure and `remember`; it starts no motion.
    - **Tests:** `reposition.test.ts`, 86 tests: the edge of all six positions; top and bottom distances with mixed heights, zero, fractional values, and a bottom distance unchanged when only a farther toast grows; the displacement sign both ways at both edges; membership for the same sequence, insertion at either end, removal, both at once, an ID replaced, reorder, reversal, empty to populated, populated to empty, empty to empty, and phase-only, revival and content-only differences; `translateYOf` for `none`, zero, positive, negative, decimal, exponent and scaled `matrix()`, `matrix3d()`, and 18 malformed or unsupported values reading 0; `currentOffsetOf` with a stubbed computed style, jsdom's own and a window-less document; `measureList` at top and bottom, identity across measurements, empty lists, nested items, unlaid-out roots, the exact one-pass read order, transforms and individual properties ignored, no rect, computed-style or frame reads, and no DOM mutation; the cache's population, refresh, previous-distance retrieval, forgetting, weak keys and no React; `watchResize` without `ResizeObserver` (no throw, no callback), and with a local stub (no global polyfill): exact observation, release of departed roots, an emptied list, disconnect and reuse, and a resize that refreshes the cache with no DOM mutation. A source fence finds no `getBoundingClientRect`, `requestAnimationFrame`, media query, listener or style write, and the package entry does not mention the module.
    - **Mutations,** each detected by the full suite and restored: the bottom displacement sign inverted (1 failure), the bottom distance without the toast's height (6), membership ignoring order (2), the X component read instead of Y (10), a refresh that never overwrites (2), no `ResizeObserver` guard (1), `getBoundingClientRect` instead of `offsetTop` (11), no release of departed roots (2), and a stale distance kept for an unmeasurable root (1).
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (32 files, 1,140 tests), `validate:package` and `build:demo` all pass. `src/styles.css`, the 28 tokens, every React component, the DOM, the lifecycle and the public API are unchanged, and the D1 prototypes are untouched. Nothing is visible, so S1 has no manual checkpoint.
  - **S2, membership repositioning (done):**
    - **Responsibility:**
      - `PositionList` and `StackList` in `src/react/Toaster.tsx` keep the cache and the previous ID sequence in refs. An isomorphic layout effect measures after each commit and seeds and releases per decision 4. The ResizeObserver refreshes the cache.
      - `src/styles.css` gives `:where(.ret-toast)` `transition-property: transform` with the internal duration and easing, for normal and custom toasts. It declares no `transform`.
      - The demo loses candidates A and B and the mode selector (decision 11).
    - **Tests:** a new `src/__tests__/reposition-render.test.tsx`, plus `styles.test.ts`. They cover:
      - insertion, removal after the exit, and removal plus promotion in one snapshot;
      - all six positions, top and bottom;
      - DOM order and no wrappers;
      - seed then release, recorded through `style` attribute mutations;
      - no inline style left behind;
      - the CSS contract.

      The "adds no transition" guard narrows to exactly this transition. "No settled `transform`" stays as it is.

    - **Invariants:** decisions 1 to 5 and D0 decision 7. The P-18 lifecycle tests are unchanged.
    - **Mutations:**
      - a stylesheet `transform` at rest;
      - `translate` instead of `transform`;
      - the transform on the `<ol>`;
      - no seed (a jump);
      - no release (a stale transform);
      - the wrong sign at bottom stacks;
      - animation on a commit with no membership change;
      - layout read during render;
      - a seed class instead of inline CSSOM, if that changes behaviour.
    - **Manual checkpoint:** in Chromium, insertion, removal and promotion at all six positions, with mixed heights and custom toasts. The timing values are confirmed or tuned here.
    - **Commit:** `feat: add stack repositioning motion`.
    - **Ownership:** `StackList`, which owns the `<ol>`, calls `useStackReposition(ref, position, ids)` (`src/react/useStackReposition.ts`, internal). `PositionList` passes `ids`, its toasts' IDs in DOM order, memoised on its ordered views. The geometry cache (a `WeakMap`), the last committed ID sequence and the ResizeObserver watch live in refs. There is no React state, no global manager and no MutationObserver. `reposition.ts` stays read-only; the writes live in the hook.
    - **Commit order:** an isomorphic layout effect with no dependencies runs after every commit of the list. Child layout effects run first, so it follows each toast's focus restoration and `inert`. It measures the list once (`measureList`). Only if `membershipChanged` says the ID sequence changed does it reposition. Then it always refreshes the cache (`remember`), records the IDs and syncs the observer to the measured roots. `useIsomorphicLayoutEffect` now takes optional dependencies, like the hooks it wraps, for this per-commit effect.
    - **Reposition pass:**
      1. Read: for each measured root with a cached distance and a new one that differs, its displacement plus `currentOffsetOf` (its in-flight offset). A new toast has no cached distance, so it is never seeded, and an unmoved survivor is skipped.
      2. Seed: inline CSSOM `transition-property: none` and `transform: translateY(…px)` on every mover.
      3. Flush: one `list.offsetHeight` read. This is a layout read, the single extra layout per affected list that D2 decision 4 allows.
      4. Release: remove both declarations, and the then-empty `style` attribute.

      No `requestAnimationFrame`, timer, React `style` prop, class or WAAPI.

    - **ResizeObserver:** a second layout effect, keyed on the list's position, creates `watchResize` with a callback that only re-measures and `remember`s, and disconnects it on cleanup (unmount, and the StrictMode replay). Each commit's `sync` observes the current roots and releases removed ones. Without ResizeObserver it is a no-op, and geometry refreshes on every commit instead.
    - **CSS:** one rule, `:where(.ret-toast) { transition-property: transform; transition-duration: 200ms; transition-timing-function: cubic-bezier(0.2, 0, 0, 1); transition-delay: 0s; }`, after the spinner rules and before the reduced-motion block. These are longhands with fixed values, not tokens, for normal and custom toasts. There is no `transform` declaration and no reduced-motion rule yet (S4). The 28 tokens are unchanged.
    - **Demo:** candidates A and B, the mode selector, the D1 harness (`harness.ts`, `candidate*.ts`, `geometry.ts`), its MutationObserver, its internal `--ret-p19-*` timing and its prototype reduced-motion rule are removed. The scenario controls stay as the checkpoint harness. The readout now comes only from DOM reads and `transitionrun`/`transitionend`/`transitioncancel` on the demo's host: rendered, exiting and inert counts, moves running, a non-`none` transform at rest, toasts whose `offsetParent` is not their list, and Toaster commits. No demo redesign.
    - **Tests:** `reposition-render.test.tsx` (33 tests) uses a stand-in flex column computed from the live DOM and records every inline style write on a toast root. It covers:
      - no seed on mount, including toasts that appear with the Toaster;
      - the exact seed, flush and release log;
      - the sign at top and bottom stacks and at all six positions, with mixed heights;
      - the new toast never seeded;
      - every layout read and in-flight offset read before the first write;
      - an in-flight offset added to the seed;
      - DOM order with no wrappers;
      - no move while a toast exits (it stays in its slot and becomes `inert`), and the move at its removal: nearest, middle and furthest, top and bottom;
      - removal plus promotion as one batch with the correct delta, top and bottom;
      - lists independent of each other;
      - no move on entering to visible, visible to exiting, revival on the same node, or replaced content, which refreshes the cache for the next move;
      - with a local ResizeObserver stub: observation and release, a refresh that moves nothing but feeds the next move, and disconnect on unmount;
      - lifecycle completion and promotion not gated;
      - no transition listener, window or document listener, `requestAnimationFrame`, media query or `animate()`;
      - the same Toaster commit count with and without layout;
      - StrictMode;
      - every layout read coming from a layout-effect commit, never from render.

      `styles.test.ts` adds the P-19 contract: one root rule with the exact four longhands, applied to every type and phase at all six positions, no `transform` declared anywhere, nothing on the region, lists, parts or spinner, no shorthand and no `var()`.

    - **Guard narrowing:**
      - The P-18 "adds no transition" guard now admits exactly one transition-bearing rule, top-level `:where(.ret-toast)`.
      - The P-17 custom-toast guard's exact declared set gains the same four longhands.
      - "No settled `transform`" and every other guard are unchanged.
    - **Mutations,** each detected by the full suite and restored:

      | Mutation                                                         | Failures                                                |
      | ---------------------------------------------------------------- | ------------------------------------------------------- |
      | Reposition on every commit (phase-only)                          | 1                                                       |
      | The new toast seeded as a survivor                               | 23                                                      |
      | Bottom stacks with top semantics                                 | 6                                                       |
      | Release before the flush                                         | 2                                                       |
      | `transform` never released                                       | 15                                                      |
      | The cache refreshed before the comparison (wrong survivor delta) | 24                                                      |
      | Completion delayed by the transition                             | 92                                                      |
      | No seed                                                          | 24                                                      |
      | `translate` instead of `transform`                               | 25                                                      |
      | In-flight offset ignored                                         | 2                                                       |
      | A layout read during render                                      | 1, after adding the render-read test; it first survived |
      | A stylesheet `transform` at rest                                 | 4                                                       |
      | `transition-property: all`                                       | 8                                                       |
      | The transition on the lists                                      | 3                                                       |

    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (33 files, 1,184 tests), `validate:package` and `build:demo` all pass. The public exports and the 28 tokens are unchanged.
    - **Manual checkpoint (done, scripted):** headless Chrome 154 on Windows, driven over CDP against the Vite dev server with `?production-css` at 1440×1000, using the retained harness with all six positions at once. A frame-by-frame sampler in the checkpoint script (not the library) read every toast's on-screen top and computed `transform`.
      - Insertion (short, tall, custom tall, wrapping), middle and nearest removal, removal plus promotion, add while exiting and dismiss while entering:
        - every moving survivor started exactly where it was (first-frame share of the move 0);
        - no direction reversal within a single move;
        - `transform: none` and no inline `style` at rest;
        - P-18 enter and exit animations running in the same frames as moves.
      - Furthest removal and revival moved nothing. The exit phase alone started no reposition transition, and every exiting toast was `inert`.
      - A control run, with the transition forced off by a test-only override, measured a share of 1 (a snap), which confirms the measure.
      - `offsetParent` was the toast's own `<ol>` for every toast in every run. The chain is `LI.ret-toast` → `OL.ret-toaster__list` (`position: fixed`).
      - Activating a toast's close button restored focus to the next toast's close button.
      - No console errors. One 404 resource load in the first run did not recur once network logging was on; it is most likely the demo's missing favicon.
      - Rapid and two-step sequences reversed direction only when the target changed, with no frame step larger than the eased curve's first step, but interruption is S3's.
      - The timing stays at 200 ms and `cubic-bezier(0.2, 0, 0, 1)` pending the maintainer's own visual review. This is scripted Chromium evidence, not P-22's real-browser certification.
  - **S3, interruption and lifecycle hardening (done):**
    - **Responsibility:** fixes, where needed, for:
      - rapid retargeting;
      - several removals;
      - adding while a toast exits (the exiting toast moves and stays inert);
      - dismissing while entering;
      - revival and in-place replacement that move nothing;
      - size changes that refresh without moving;
      - arbitrary-height and custom toasts;
      - relocation between lists;
      - detach, takeover and unmount;
      - StrictMode replay;
      - observer cleanup.
    - **Tests:** `reposition-render.test.tsx`, plus additions to `render-count.test.tsx` (no render added), `focus-restoration.test.tsx` (restoration before `inert` while neighbours move) and `environment-pause.test.tsx` (no new window or document listener).
    - **Mutations:** a seed without the current offset (a snap), the stale cache not refreshed, no observer disconnect, revival treated as membership, a render added for animation.
    - **Manual checkpoint:** rapid activity, keyboard close, and Alt+T during moves.
    - **Commit:** `feat: harden stack repositioning`.
    - **Outcome:** the S2 algorithm needed no change. S3 adds tests and evidence only; production code is unchanged from S2.
    - **Interruption model:**
      - In screen coordinates (positive down), a toast is drawn at `V = L + T`: `L` is its layout position and `T` its current P-19 `transform` offset.
      - At a retarget the seed is `T' = (L_old − L_new) + T_cur`. `displacement()` turns the anchored distances into screen terms at either edge, and `T_cur` is the computed `transform` at that instant, part-way through a running transition included.
      - So `L_new + T' = L_old + T_cur = V`: the toast stays exactly where it is on screen, then eases to `T = 0`, its newest layout position.
      - The two preconditions hold:
        - the cache holds the layout as last measured, refreshed after every list commit and by the ResizeObserver, which runs after layout and before paint;
        - `T_cur` is read in the same task as the commit, on the same animation-timeline instant.
    - **Direction reversal:** a reversal is correct, category A, when the newest target lies on the other side of where the toast is now. An insertion followed by a removal is the usual case. A stale-origin reversal (category B) can only come from a break in continuity at the commit, so continuity at the commit instant is the test.
    - **Tests:** `reposition-render.test.tsx` grows to 70 tests. The S3 plan named additions to `render-count.test.tsx`, `focus-restoration.test.tsx` and `environment-pause.test.tsx`. Those checks were deliberately put in `reposition-render.test.tsx` instead, because they need its layout and transition stand-ins. This only consolidates where the tests live: the render-count, focus and `inert`, and global-listener evidence is all implemented, as listed below.
      - **In-flight model:** a stand-in for the browser's transitions holds each released seed as the toast's live offset. It reports that offset through the computed `transform` as a `matrix()`, and tests advance or settle it.
      - **`retarget()`:** asserts, for every toast that stays in its list, that its on-screen position is identical before and after each commit, to 1e-9, and classifies every reversal.
      - **Interruption cases:**
        - one worked example of the composition: `a` is 40px into an 80px move, `c` arrives, and the seed is −100;
        - at a top and a bottom stack: two removals and three removals from rest (no reversal), removals while the build-up is still moving (category A only, and at least one occurs), rapid insertion, insertion then removal (a required reversal, 40px from where it was), removal then insertion, a promotion followed by further membership changes;
        - interruption while a neighbour is entering, which still enters, and while one is exiting, which moves, stays inert and then leaves;
        - a toast in flight whose layout did not change keeps its exact offset and gets no new seed.
      - **Revival:** with new, taller content on the same node it moves nothing, leaves no inline style, and the next move is continuous.
      - **Replacement:** a resizing replacement moves nothing, and the next move starts from the new geometry. A commit at one list never animates another list's size change.
      - **Relocation:** top-right to bottom-left and top-right to top-left.
        - The old list keeps the exiting toast's slot (nothing moves), then moves its own survivors on removal.
        - The destination moves its survivors.
        - The arrival is a new node, never seeded. The old node is detached, and the DOM order is the destination's.
      - **Detach and unmount:**
        - a toast removed mid-move is released by its observer;
        - unmounting the Toaster mid-move disconnects every list observer;
        - a remount moves nothing on arrival and its first move starts from the remounted layout;
        - a takeover renders fresh lists that move nothing.
      - **StrictMode:** a mixed scenario at two lists produces a byte-identical seed, flush and release log with and without StrictMode. Observers balance: 2 created and none disconnected without StrictMode; 4 created, the 2 replayed ones disconnected, and none left after unmount with it. No React warning or error.
      - **Renders:** a ResizeObserver refresh adds no Profiler commit, and an interruption sequence commits exactly as often as the same changes with no layout or motion.
      - **Focus:**
        - a membership move calls no `focus()` and keeps focus where it was;
        - closing a focused toast's close button restores focus to the same place as without repositioning (the next toast's close), before `inert`;
        - Alt+T still focuses the first toast while neighbours move.
      - **Global resources:**
        - the active Toaster's window and document listeners stay exactly P-15's and P-16's `blur`, `focus`, `visibilitychange` and `keydown` (React DOM's own `selectionchange` aside), and moves add none;
        - no `requestAnimationFrame`;
        - no MutationObserver from P-19 code. The only ones are P-15's existing per-toast focus-within observers.
    - **Mutations,** each detected by the full suite and restored byte-for-byte:

      | Mutation                                                                                                     | Failures                                                 |
      | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
      | The in-flight offset ignored on retarget                                                                     | 23                                                       |
      | The ResizeObserver refresh doing nothing                                                                     | 1                                                        |
      | The cache refreshed only on membership changes                                                               | 3                                                        |
      | Revival (a phase change) counted as membership                                                               | 1                                                        |
      | Geometry keyed by toast ID across lists and mounts, so a relocated arrival and a remount reuse old distances | 15, including both relocation tests and the remount test |
      | No observer disconnect                                                                                       | 4                                                        |
      | A duplicate reposition pass per commit                                                                       | 48                                                       |
      | Membership bookkeeping done in render, which diverges under StrictMode's double render                       | 2                                                        |
      | A ResizeObserver refresh that re-renders                                                                     | 1                                                        |
      | `focus()` during repositioning                                                                               | 2                                                        |
      | An interrupted toast keeping its `transform`                                                                 | 21                                                       |
      | One membership sequence shared by every list and mount                                                       | 1                                                        |

      Stale geometry on a remount cannot arise from the node-keyed `WeakMap` itself. Two mutations stand in for that failure: the ID-keyed one, and the shared sequence one.

    - **Validation:** `format:check`, `lint`, `typecheck`, `typecheck:demo`, the full suite (33 files, 1,221 tests), `validate:package` and `build:demo` all pass. Public exports, the 28 tokens and `src/styles.css` are unchanged.
    - **Chromium checkpoint (machine-observed only, not a human visual judgement):**
      - **Setup:** headless Chrome 154 on Windows over CDP, with `?production-css` at 1440×1100, all six positions at once, through the retained harness. The checkpoint script also called the demo's own `toast` module for relocation and content changes.
      - **Scenarios:**
        - rapid interruption, dismiss several, burst add;
        - remove then insert and insert then remove (100 ms apart);
        - promotion then insertion, revival, add while exiting, dismiss while entering;
        - a growing replacement then an insertion, a rewrap then an insertion;
        - relocation top-right to bottom-left and top-left to top-center;
        - focus restoration and Alt+T.
      - **Continuity at the commit instant:** every survivor's on-screen top was read just before each membership change (in the same task) and again right after its commit (a microtask after seed and release), on the same `document.timeline` instant. Over about 7,000 such checks, the jump at each retarget equals P-18's scale composition (below) plus a residual of at most 0.06px.
      - **Control:** with the in-flight offset deliberately dropped (the first mutation) and served by the dev server, the residuals were up to 46.75px, each equal to the dropped offset, so the measure detects stale origins.
      - **Reversals:** a frame-sampled classifier counted 54 reversals, all category A, and 0 category B. It could not see the control's forward snaps, so continuity at the commit instant is the decisive evidence. Category-B reversals: none.
      - **Rest and relocation:**
        - at rest every toast computed `transform: none`, with no inline style;
        - `offsetParent` was the toast's own list throughout;
        - relocated arrivals were new nodes in the destination list with `transform: none`, and the old nodes were detached.
      - **Focus:** focus was restored to the next toast's close, the closed toast was `inert`, focus stayed put while neighbours moved, and Alt+T focused a toast root.
      - **Console:** no errors. The only failed request was the demo's missing `/favicon.ico` (404).
    - **Known observations, not stale origins:**
      - **P-18 `scale` composition (D0 decision 13, observational):**
        - CSS applies the individual `scale` before `transform`, so a seed on a toast that P-18 is entering or exiting, at `scale` < 1, is drawn scaled.
        - The toast jumps by `|T'| × (1 − scale)`, at most 2% of the move and 1.79px in the checkpoint, for a toast that is fading in or out.
        - Correcting it would mean reading P-18's `scale` in P-19, which S1 kept out of scope. It stays an observation for the maintainer and for P-22's real-browser reflow proof.
      - **No ResizeObserver:** where ResizeObserver is missing, a consumer's custom content that resizes itself without a list commit leaves the cache stale until the next commit. No browser at the support floor lacks it.
      - **Rounding:** `offset*` metrics are whole pixels, so fractional layouts can leave up to about 1px at a retarget. Every move still ends exactly at `transform: none`.
  - **S4, reduced motion and contract proof (done):**
    - **Responsibility:** the reduced-motion rule in the existing `@media (prefers-reduced-motion: reduce)` block. The rule sets only the reposition transition's duration to zero.
    - **Tests:**
      - `styles.test.ts`: the reduced-motion block now holds three rules, the P-18 two unchanged; 28 tokens; no new class or attribute; `transform` only.
      - A component test of the instant path.
      - A fence test that the P-18 completion path (`motion.ts` and the `ToastItem` fallback) reads no layout.
      - No `matchMedia` anywhere in production JavaScript.

      The P-18 reduced-motion guard narrows only to admit this rule.

    - **Mutations:** the rule removed, a fade added, `matchMedia` added, a public token added, P-18's reduced-motion rules changed.
    - **Manual checkpoint:** Chromium reduced-motion emulation.
    - **Commit:** `feat: add reduced-motion stack repositioning`.
    - **CSS:** a third rule in the existing `@media (prefers-reduced-motion: reduce)` block, `:where(.ret-toast) { transition-duration: 0s; }`, after P-18's two rules, which are unchanged. With no duration, no transition starts, so a released seed resolves at once to the real layout position: no translation, no fade, no scale. The normal rule (200 ms, `cubic-bezier(0.2, 0, 0, 1)`) is unchanged. No `transform`, no `transition: none` (a consumer's transitions on other properties keep their own durations unless they share the root's `transition-duration`; conversely, a consumer `transition-duration` on the root that wins the cascade overrides this `0s`, see D2 decision 9 and P-26), no token and no internal property.
    - **JavaScript:** unchanged. The same measure, seed, flush and release path runs under either preference, and the geometry cache is maintained as before. Nothing in JavaScript reads the preference.
    - **Tests:**
      - **`styles.test.ts`:** a new P-19 S4 block covers:
        - one declaration, `transition-duration: 0s`, on the toast root;
        - every type and phase at all six positions resolving to the full reposition transition with a zero duration;
        - the normal 200 ms and easing intact outside the block;
        - no transform, fade, scale, translation, animation or token in the rule, and none resolved under reduced motion;
        - the region, lists, parts and spinner untouched;
        - source order after the normal rule;
        - 28 tokens, none for repositioning, and still only the `data-phase`, `data-position` and `data-theme` hooks.
      - **`reposition-render.test.tsx` (75 tests):**
        - a byte-identical seed, flush and release log whether or not the page reports reduced motion, with `matchMedia` stubbed and never called;
        - the instant path: a zero-duration transition ends at release, and computed styles report `transition-duration: 0s`. Survivors are at their layout position right after each commit, the flush still happens, and nothing stays in flight or inline;
        - enter, exit, removal and promotion keep their timing;
        - P-18 completion reads no layout. Enters and exits were completed by `animationend` and by the fallback. Every layout read seen came from `useStackReposition`'s layout effect, none from `onAnimationEnd`, `lifecycleFallback` or `fallbackDelay`;
        - `motion.ts` and `ToastItem.tsx` import nothing from P-19.
    - **Guard narrowing:**
      - P-18's "one media block that only removes animation names" now lists three selectors and checks P-18's two rules still declare only `animation-name: none`.
      - P-18's "no fade, transition or settled style of its own" applies to P-18's two rules; the P-19 rule is tested on its own.
      - S2's "only transition-bearing rule" also admits the reduced-motion `:where(.ret-toast)`.
      - The spinner, enter and exit guarantees and `matchMedia` fences are unchanged.
    - **Mutations,** each detected by the full suite and restored byte-for-byte:

      | Mutation                                               | Failures |
      | ------------------------------------------------------ | -------- |
      | The reduced-motion duration left at 200 ms             | 7        |
      | The zero duration escaping the media block             | 13       |
      | A `transform` declared in the rule                     | 4        |
      | A fade transition added                                | 8        |
      | A JavaScript `matchMedia` branch                       | 5        |
      | A JavaScript skip when the computed duration is zero   | 60       |
      | A public reposition-duration token                     | 12       |
      | The spinner turning again                              | 2        |
      | P-18 reduced motion weakened, so the exit animates     | 8        |
      | The lifecycle waiting for a reposition `transitionend` | 111      |

    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (33 files, 1,238 tests), `validate:package` and `build:demo` all pass. Public exports and the 28 tokens are unchanged.
    - **Chromium checkpoint (emulation, machine-observed):**
      - **Setup:** headless Chrome 154 on Windows over CDP with `Emulation.setEmulatedMedia` (`prefers-reduced-motion: reduce`), `?production-css` at 1440×1100, all six positions through the retained harness.
      - **Scenarios:** insertion, middle removal, mixed heights, add while exiting, rapid interruption, queue and promotion, and loading toasts.
      - **Results:**
        - every toast computed `transition-duration: 0s`;
        - across more than 4,500 per-commit checks, every toast was already at `transform: none` with no inline style in the microtask after its commit;
        - 0 frames with a non-`none` transform and 0 reposition transitions;
        - 0 P-18 enter or exit animations, with `scale` and `translate` always `none`, so the S3 scale composition cannot occur;
        - the spinner was static (`animation-name: none`, no running animation);
        - promotion completed, with every toast `visible`;
        - `offsetParent` was the toast's own list;
        - no console errors besides the demo's missing favicon.
      - **Normal motion restored:** with `no-preference`, the duration read `0.2s` again and the moves animated as accepted.
      - This is browser emulation, not operating-system reduced-motion certification, which belongs to P-29. P-22 repeats it with Playwright emulation.
    - **Accepted observations and carry-forwards:**
      - **P-18 `scale` composition (maintainer decision at S4):**
        - It is accepted as a known v2 composition artifact: up to about 1.79px, machine-observed, during an overlap of P-18 enter or exit and a P-19 move.
        - P-19 does not compensate for it in v2. P-18 keeps the individual `translate` and `scale` and P-19 the root `transform`; `reposition.ts` parses no P-18 property, and the interruption formula is unchanged.
        - It does not occur under reduced motion, where P-18 runs no scale.
        - P-22 evaluates the overlap visually in real browsers. Only browser evidence of a material, human-visible problem there would reopen the architecture.
      - **No ResizeObserver:** self-resizing custom content can leave the cache stale until the next commit. This is accepted: every browser at the floor has ResizeObserver, and its absence degrades gracefully.
      - **Rounding:** `offset*` geometry can leave about 1px of sub-pixel rounding at a retarget, and every move still ends exactly at the layout position. This is accepted; the locked layout-space technique stays.
      - **P-22:** real-browser reflow proof (AC-MO-2), Playwright reduced-motion emulation, and visual evaluation of the scale overlap.
      - **P-29:** the operating system's reduced-motion setting.
  - **S5, reconciliation and closure:**
    - **Responsibility:**
      - remove the rest of `demo/p19/` and its hooks in `demo/index.tsx`, in a separate commit, `chore: remove P-19 D1 prototype harness`;
      - trace every D0 and D2 decision and AC-MO-2 and AC-MO-3 to their evidence;
      - record the P-21, P-22, P-26 and P-29 carry-forwards;
      - full validation;
      - a final manual checkpoint for any gaps;
      - close P-19.
    - **Commit:** `docs: close P-19 repositioning phase`.
    - **Done.** The harness removal is its own commit, `08483de` (`chore: remove P-19 D1 prototype harness`). It deletes `demo/p19/`, which held the scenario controls, the DOM-only readout, its instrumentation and styles. It also removes the demo hooks (the host element, the Profiler and the panel), and restores `demo/` exactly to its state before P-19 (no diff against `209988e`). No P-19 UI, query parameter, import or comment is left in the demo.
    - **Final architecture,** traced against the code and found unchanged since S2. Nothing was rewritten in S5.
      - **Production files:**
        - `src/react/reposition.ts` (S1): read-only geometry;
        - `src/react/useStackReposition.ts` (S2): the list hook, and the only writer;
        - `src/react/Toaster.tsx`: `StackList` calls the hook, and `PositionList` passes the ordered IDs;
        - `src/react/useIsomorphicLayoutEffect.ts`: optional dependencies;
        - `src/styles.css`: the root transition and the reduced-motion duration.

        Nothing else in `src/` changed, nor did `package.json`, the lockfile, the build configuration, the scripts or the fixtures.

      - **Geometry:**
        - layout space only: `offsetTop` at top stacks, `clientHeight − offsetTop − offsetHeight` at bottom stacks, any height, no `getBoundingClientRect`;
        - one pass per list;
        - a node-keyed `WeakMap` cache;
        - a feature-guarded, list-local ResizeObserver that only refreshes the cache.
      - **Trigger:** a change in the list's ID sequence only. Phase changes, revival, replacement and size changes refresh the cache and move nothing.
      - **Move:**
        - read every distance and each mover's current P-19 offset;
        - seed every mover with inline `transition-property: none` and `transform: translateY(…)`;
        - one `list.offsetHeight` layout read as the flush, within D2's one extra layout per affected list;
        - release.

        The flex layout stays authoritative, the root computes to `transform: none` at rest, and there is no wrapper and no DOM reorder.

      - **Motion:**
        - `:where(.ret-toast) { transition-property: transform; transition-duration: 200ms; transition-timing-function: cubic-bezier(0.2, 0, 0, 1); transition-delay: 0s; }`;
        - under reduced motion, `transition-duration: 0s`;
        - the same JavaScript path under either preference.
      - **Ownership:**
        - P-18 keeps the individual `translate`, `scale` and the spinner's `rotate`, and P-19 the root `transform`;
        - P-19 does not compensate for P-18's `scale`;
        - a consumer root `transform` is unsupported;
        - swipe composition is P-21's.
    - **Decision trace:**
      - **D0:** decisions 1 to 14 hold.
        - Both candidates were built and compared on one harness (1, 13), and the winner kept the flow-delta boundary (2).
        - The triggers are exactly membership changes (3).
        - The geometry is layout-space and anchored-edge (4).
        - The interruption is continuous (5).
        - The motion is root `transform` only, vertical, with no wrapper (6).
        - Lifecycle, focus and state are untouched (7).
        - Reduced motion is CSS only (8).
        - There is no public surface (9).
        - The primitives are within the floor and feature-guarded (10).
        - The guards were narrowed only where named (11).
        - P-21 is left a path (12).
        - The sequence and boundaries were followed (14).
      - **D2:** decisions 1 to 12 are implemented as recorded: layout, technique, geometry, interruption order, rest state, size changes, reduced motion, public contract, consumer root transform, the P-21 path, prototype disposition (S2 removed candidates A and B and the selector, and S5 removed the rest) and evidence.
    - **Accepted implementation notes:** accepted for v2, not defects.
      - **P-18 `scale` composition.**
        - During a normal-motion overlap of a P-18 enter or exit with a P-19 move, P-18's `scale` applies to P-19's seed. The toast jumps by `|seed| × (1 − scale)`, at most about 1.79px (S3, machine-observed).
        - P-19 deliberately does not compensate (maintainer decision at S4), so the ownership boundary stays as it is.
        - It does not occur under reduced motion. P-22 evaluates it visually.
      - **Rounding.** `offset*` geometry can leave about 1px of sub-pixel rounding at a retarget. Every move ends exactly at the layout position.
      - **No ResizeObserver.** Self-resizing custom content can leave the cache stale until the next list commit. The API is feature-guarded, and every browser at the floor has it.
    - **Acceptance:**
      - **AC-MO-2 (existing toasts move smoothly when the stack changes): met in jsdom and in Chromium.**
        - **Unit tests:** geometry, membership, parsing, cache and observer (`reposition.test.ts`, 86 tests).
        - **Component tests:** `reposition-render.test.tsx` (75 tests) covers insertion, removal after the exit, removal plus promotion, all six positions at top and bottom, arbitrary and custom heights, DOM order with no wrapper, the exact seed, flush and release, interruption with exact continuity, required reversals only, revival, replacement, relocation, detach, unmount, remount, takeover, StrictMode and render counts.
        - **Mutations:** 45, each detected (S1 9, S2 14, S3 12, S4 10).
        - **Chromium (S2, S3, S5):** normal-motion checkpoints at all six positions, with mixed and custom heights, queue and promotion, and relocation. Continuity was proven at the commit instant, with a residual of at most 0.06px beyond the accepted scale composition, and a control showed the measure detects stale origins.
        - **Left to P-22:** the automated real-browser reflow proof in Chromium, WebKit and Firefox (§26).
      - **AC-MO-3, extended to repositioning: met structurally and in Chromium emulation.** It has the CSS contract (`styles.test.ts`), the component proof of the instant path and of an identical JavaScript path under either preference (`reposition-render.test.tsx`), the S4 mutations, and the S4 and S5 Chromium emulation checkpoints. P-22 owns the Playwright reduced-motion emulation, and P-29 checks the operating system's own setting.
      - **Lifecycle (AC-LC-1 to AC-LC-3, AC-Q-2): no regression.** Repositioning never gates `entered()`, `exited()`, removal or promotion. Tests compare phase timing with and without motion and under reduced motion. A mutation that made completion wait for a reposition `transitionend` was detected (111 failures). P-18 completion reads no P-19 layout: it is behaviour-traced, and the modules are kept apart.
      - **CSS and public contract (AC-API-1, AC-CSS-1, AC-CSS-3): no change.**
        - The exports are exactly `Toaster` and `toast`, the declarations name no P-19 internal, and the packed package holds 7 entries (`LICENSE`, `README.md`, `package.json` and the four `dist` files).
        - There are 28 tokens, none for repositioning, and the only `data-*` hooks are still `data-theme`, `data-position` and `data-phase`.
        - There is no new public class, prop or API, and `dist/styles.css` matches `src/styles.css`.
      - **Accessibility (AC-POS-1, AC-KB-1, AC-KB-2): no regression.**
        - Focus restoration is unchanged while neighbours move.
        - `inert` is still set after restoration in the same commit.
        - Alt+T is unchanged.
        - Repositioning never calls `focus()`.
        - Reduced motion is supported structurally.

        Assistive-technology and operating-system evidence is P-29's, and is not claimed here.
    - **Defects:** Appendix A assigns none to P-19, and none was found or created. D-21 (reduced motion) stays closed by P-18; P-19 only extends AC-MO-3 to repositioning.
    - **Tests:**
      - **Reconciled:** none removed. No test depended on the D1 harness or on a D1 mechanism. The guards narrowed in S2 and S4 kept their underlying invariants, and only the render-test header was updated for S4.
      - **Retained:** `reposition.test.ts`, `reposition-render.test.tsx` and the P-19 blocks of `styles.test.ts`.
    - **Final Chromium checkpoint (machine-observed, not cross-browser or human visual certification):**
      - **Setup:** headless Chrome 154 on Windows over CDP, with the ordinary demo and `?production-css`, driven only through the public `toast` API by an uncommitted script.
      - **Normal motion:**
        - insertion with mixed and custom heights, middle removal, and removal plus promotion at all six positions;
        - toasts moved with a 0.2s duration, with a residual of 0 across 747 checks at the commit instant;
        - `transform: none` and no inline style at rest, with `offsetParent` the toast's own list;
        - promotion refilled every full stack, and dismissing all left nothing rendered.
      - **Reduced-motion emulation:**
        - the same scenarios ran with a `0s` duration;
        - 0 moving frames, 0 reposition transitions and 0 P-18 animations;
        - every toast was at rest immediately after every commit;
        - the spinner was static, and the lifecycle and promotion completed.
      - No P-19 UI is left in the demo, and there were no console errors besides the demo's missing favicon.
    - **Validation (closure commit):** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (33 files, 1,238 tests), `validate:package` and `build:demo` all pass.
    - **Carry-forwards:** P-21 (swipe composition), P-22 (real-browser reflow, reduced motion and the scale overlap), P-25 (the pre-release demo redesign), P-26 (root `transform` ownership and repositioning behaviour) and P-29 (the operating system's reduced-motion setting). Each is recorded in its own entry.
  - Then the PR into `v2`, CI, and a merge commit.
  - As in P-18, an intermediate slice may exist on the feature branch before reduced motion is in place (S2 to S3). P-19 merges only after S4.

**P-20 Progress indicator**

- Scope: progress off by default, CSS-driven, kept in sync with `remaining` and the pause state, RTL origin, still depleting under reduced motion.
- Defects: D-10, D-11.
- **Status: complete.** D0, D1 and S1 to S5 are done, the final reconciliation and validation passed, and every checkpoint is recorded. Progress ships as candidate B, synchronised by T1, with two public tokens (30 in all) and the `data-paused` hook. It was merged into `v2` through PR #14 (`6dd1bc9`). What P-20 leaves open is listed in the S5 record and in the P-22, P-26 and P-29 entries.
- **Already decided, not reopened here:**
  - `ToastOptions.progress` and `ToasterProps.progress`, off by default, resolved toast, then Toaster, then `false` (§6.3, §6.5, P-14);
  - custom toasts reject progress, in the types and at runtime (§6.4, P-12, AC-API-10);
  - the CSS technique (§22): a `ret-progress` keyframe animating `transform: scaleX(1 → 0)` over the duration, a negative `animation-delay` of `duration − remaining`, and `animation-play-state: paused` under `data-paused`;
  - no clock of its own (§10) and no per-frame React state (§5, §32, AC-PR-1);
  - anchored at inline-start and depleting toward it, with `transform-origin` switched under `:dir(rtl)` (§20, AC-RTL-1);
  - still depleting under reduced motion (§22, OQ-22).
- Acceptance: AC-PR-1 and AC-RTL-1 are P-20's. Their real-browser proof ("progress direction and pause sync", §26) is P-22's. AC-TM-1 to AC-TM-5, AC-LC-1 to AC-LC-3, AC-MO-1 to AC-MO-3, AC-KB-1, AC-KB-2, AC-A11Y-1 to AC-A11Y-7, AC-API-1, AC-API-10, AC-CSS-1 to AC-CSS-3 and the §32 render-count rules must not regress, except for the render-count change decision 1 makes deliberately.
- **Pre-D0 browser spike (done, temporary and removed).** The question was whether the literal §22 model, with no remount on pause and resume, stays in sync with the store. Call it T2. The alternative re-derives the delay from the store at every timer run boundary. Call it T1.
  - **Setup:** headful Chrome 154 on Windows, driven over CDP. A page imported the real, unmodified store and rendered a T2 bar and a T1 bar for the same toast. The pause triggers were wired as in P-15. Each animation frame, the bar's computed `scaleX` was compared with the store's `remaining`.
  - **Genuine hiding:** a real tab switch and a real window minimise both produced `document.hidden` and Chrome's own `visibilitychange` and `blur`.
  - **Results:**
    - T2 never reset.
    - In ordinary foreground pause and resume, T2 stayed within about two frames.
    - While the page was hidden, the store held correctly: the timer was paused, `remaining` was frozen and nothing expired. T2's play-state change was never applied before the page became visible again, so its bar kept depleting. It came back ahead by about the hidden time: about 5 s after 5 s hidden, and empty while about 5.9 s remained after 12 s or 30 s hidden.
    - The error persisted after resume and accumulated: −7.5 s after five 1.5 s tab switches.
    - Pauses shorter than a frame (40 pause-resume pairs inside one task) were lost entirely, at −333 ms.
    - T1 stayed within about one frame (−6 to +14 ms) in every case, including every hidden round trip, with no accumulation.
  - **Not tested:** intensive throttling (hidden for more than about 5 minutes), occlusion-only hiding, mobile backgrounding, WebKit and Firefox. This is Chromium evidence, not cross-browser evidence.
- **Decisions locked before implementation (D0).** They refine §10, §20, §21 and §22 and are implemented from S1 on. Decision 6 leaves the visual treatment to D1.
  1. **`data-paused`:**
     - A documented public hook on the toast root. Its meaning: the toast's finite auto-close countdown is currently held. It mirrors the store's combined pause state for that toast (§10).
     - It applies to finite normal toasts and to finite custom toasts, whether or not progress is shown. Persistent toasts (`Infinity` and loading) never carry it.
     - Every pause reason collapses into the one attribute, which does not say which reason applies. P-21's internal `swipe` reason takes part like any other.
     - With `data-phase`, it is the whole running state the stylesheet needs: a rendered finite toast's timer runs exactly while it is `visible` and has no `data-paused`.
     - It joins the stable public CSS contract (OQ-25, §21) beside `data-theme`, `data-position` and `data-phase`. `scripts/check-styles.js` adds it to its allowlist (P-17 S1).
     - **This deliberately changes P-15's render behaviour.** A pause boundary now re-renders the toasts whose held state changes, and only those. Nothing renders while time passes. There is still no per-frame render.
  2. **View plumbing:**
     - The store's timer (P-11) stays the only clock. Rendering learns what it needs through the existing snapshot and view subscription: no second per-toast subscription, and no other countdown.
     - A view gains the held state and, for a finite toast, its folded `remaining`. Their internal names are an implementation detail.
     - `remaining` is authoritative at timer segment boundaries. While the timer is running, CSS depletes the bar, not React or the store. Pausing and resuming therefore cause boundary renders; the passage of time causes none.
     - This is the addition P-11 left to P-20 ("P-14 and P-20 add what rendering and progress need"). S1 records how it affects render scope and P-19's per-commit layout measurement.
  3. **Synchronisation (T1):**
     - The bar uses the §22 technique: the `ret-progress` keyframe, `transform: scaleX(1)` to `scaleX(0)`, linear timing, a duration from the toast's timer duration, an `animation-delay` of `−(duration − remaining)`, and `animation-play-state` controlled by the lifecycle and pause state (decision 1).
     - In addition, at every timer run boundary that changes the authoritative folded `remaining` or the running state, the progress animation is recreated from that store-derived value. These boundaries are each start and stop, and each new definition.
     - The animation is never the source of truth: each boundary corrects it from the store. The mechanism (for example remounting the element) is an implementation detail, provided recreation is guaranteed at each such boundary.
     - The reason is the pre-D0 spike above: under genuine hiding, play state alone (T2) let the bar run ahead of the held timer, and the error accumulated. WebKit and Firefox behaviour is P-22's.
  4. **Outside `visible`:**
     - The bar shows the current timer snapshot in every rendered phase, and depletes only while the timer actually runs.
       - First enter: frozen full.
       - Re-queued, then entered again: frozen at the kept `remaining / duration` (§8.4, AC-NT-3).
       - `visible` and not paused: running.
       - `visible` and paused: frozen.
       - Exiting for a reason other than timeout: frozen at the folded `remaining`.
       - Exiting on timeout: empty (`remaining` 0).
       - Revival or replacement with a fresh timer: full, and frozen until it runs.
       - Loading to finite (promise settlement): eligible once the finite timer exists.
     - No timer semantics change.
  5. **Timing to CSS:**
     - The per-toast duration and the negative delay reach CSS as inline `animation-duration` and `animation-delay`, through React's `style` property (§34).
     - They are not tokens. They are also not token-like internal `--ret-*` properties.
     - The easing is `linear`, fixed in the stylesheet and not configurable.
  6. **Visual treatment (chosen at D1, not here):**
     - D0 locks only these constraints:
       - the progress element is a direct, non-focusable child of a normal toast's root;
       - no wrapper that breaks P-17 decision 3;
       - it never owns or transitions the root's `transform` or `transition` (P-18 decision 6, P-19 D2 decisions 5 and 9); it animates its own `transform: scaleX(…)`;
       - no new card-wide clipping that could unexpectedly clip consumer content;
       - a neutral colour, with no semantic type accent (OQ-24 keeps the accent in the icon slot);
       - exactly the two public tokens of decision 8;
       - `pointer-events: none` (decision 11);
       - perceivable in forced colours (decision 9);
       - logical positioning and insets, with the RTL origin under `:dir(rtl)`;
       - never rendered for custom toasts.
     - D1 compares only treatments that meet these constraints: an inset single bar, a full-width treatment with safe corner handling, and a track and fill if it is materially better. It selects the placement, the radius and clipping treatment, the defaults of both tokens and the light and dark appearance. It decides nothing about the timer.
  7. **Accessibility:**
     - The element is `aria-hidden="true"`, with no `role="progressbar"`, no `aria-valuenow`, `aria-valuemin` or `aria-valuemax`, and no `tabindex`.
     - It sits outside `.ret-toast__content`, so it never changes the announcement text (§17.1).
     - Timing stays adjustable through the §10 pauses, and a toast never expires while it holds focus.
     - Screen-reader and operating-system evidence is P-29's.
  8. **Public tokens:**
     - Exactly two: `--ret-progress-height` and `--ret-progress`, the neutral colour, not by type. They follow the P-17 token model (OQ-25).
     - The public set becomes **30**.
     - There is no duration or easing token.
     - D1 selects both defaults. If `--ret-progress` varies by theme, it joins the dark and system blocks, and the AC-A11Y-6 contrast pairs as meaningful non-text (3:1 against `--ret-surface`), since §22 treats progress as information.
  9. **Forced colours:**
     - The bar stays perceivable under `forced-colors: active` through a rule that uses system colours only, in the existing forced-colours block. `forced-color-adjust` stays unused.
     - P-20's evidence is structural style tests plus Chromium forced-colours emulation. Real Windows High Contrast is P-22's, as for P-17, and is not claimed here.
  10. **Guard narrowing:**
      - These existing guards must be narrowed on purpose, never deleted:
        - the closed keyframe list;
        - the transform restrictions on toast roots and parts. Their pattern also catches `transform-origin`. P-18's individual-property motion and P-19's root `transform` ownership stay guarded.
        - the ban on `animation-play-state`;
        - "never animates the toast parts";
        - the token count and the "no progress token" guard;
        - the documented `data-*` attribute set, in the style tests and in the `check-styles.js` allowlist;
        - the P-14/P-20 boundary test that renders no progress yet;
        - P-15's expectation that pause changes render nothing;
        - the expectation that a `<Toaster progress>` toggle re-renders no toast, where it applies.
      - Each narrowing keeps the original invariant and makes only the P-20 exception.
      - The regression tests carry their defect names: `D-10: …` and `D-11: …` (§26).
  11. **Pointer input:** the progress element is `pointer-events: none`. It is never an interactive descendant and never interferes with P-21's swipe hit testing.
  12. **Sequence and boundaries:**
      - **D0:** this decision record. Documentation only.
      - **D1, demo-only visual prototype:**
        - It compares only viable treatments and selects the placement, the radius and clipping treatment, the `--ret-progress-height` and `--ret-progress` defaults and the light and dark appearance.
        - It never reaches `src/`, the package or the public contract. It is a temporary P-20 decision harness, not the P-25 demo redesign.
        - Stop for the maintainer's visual approval.
      - **S1, timer and view plumbing:**
        - The view fields, the pause-boundary notifications, the exact render scope, no per-frame render, no second timer, and the interaction with P-19's per-commit layout measurement.
        - Stop for an architecture and render-count review.
      - **S2, DOM and `data-paused`:**
        - When the bar is present, its recreation at run boundaries, the inline timing, the lifecycle, accessibility, the Toaster default, the exclusion of custom toasts, the environment and focus pause wiring, and isolation from P-18's `animationend` completion.
        - Stop for review.
      - **S3, production CSS from the D1 winner:**
        - The keyframe, the placement, the tokens and their defaults, the pause and run selectors, the RTL origin, forced colours and the guard narrowing.
        - Manual Chromium checkpoint.
      - **S4, hardening:**
        - The reduced-motion proof that progress still depletes.
        - The genuine hidden-tab and minimised-window Chromium resynchronisation check, repeated against production code.
        - Repeated pause and resume, StrictMode, lifecycle edge cases, render counts and mutations.
        - It carries WebKit and Firefox hidden-document behaviour forward to P-22.
      - **S5, reconciliation:**
        - D-10, D-11, AC-PR-1 and AC-RTL-1.
        - The P-22, P-26 and P-29 carry-forwards.
        - Full validation, and removal of the prototype if it still exists.
      - The PR into `v2`, CI and a merge commit follow only after the S5 review.
      - **Out of scope:**
        - swipe (P-21);
        - cross-browser automation (P-22);
        - React 19 and `<Activity>` (P-23);
        - the demo redesign (P-25);
        - the final public documentation (P-26);
        - the final accessibility audit (P-29).
- **Open until D1 (all resolved by the D1 sign-off below):** the placement, the radius and clipping treatment, the two token defaults and the light and dark appearance. Nothing else is open.
- **D1, visual prototype (done):**
  - **Where:** `demo/p20/` (`prototype.tsx`, `prototype.css`), opened with `?p20`. The demo skips the P-17 D1 stylesheet there, so the cards are styled by the production stylesheet alone.
  - **What it shows:**
    - static cards in the production toast markup, held at 100, 65, 30 and 5%;
    - short, wrapped, action, close, and action-and-close content;
    - a loading card, labelled as a visual stress case only;
    - an RTL pair per candidate;
    - light and dark side by side.
  - **How each bar is placed:** a paused animation of a demo keyframe (`scaleX(1 → 0)`, linear), positioned by a negative `animation-delay`, as production will place a held bar. The origin is the inline start, switched under `:dir(rtl)`. No timer runs. An optional CSS-only animate toggle is labelled as not production timing.
  - **Controls:** height (2, 3 and 4px) and neutral colour (`--ret-text-muted`'s values; a softer #71717a / #8e8e98; `--ret-text`'s values) as demo-local stand-ins for the two tokens. Nothing reaches `src/`, and no candidate is pre-selected.
  - **Candidates:**
    - **A, inset:** one bar inside the bottom padding, inset 12px, clear of the corners. The element itself scales. Its ends are square: rounded ends were tried, and `scaleX` flattens them as the bar shortens, so at 5% they look square anyway.
    - **B, full-width safe corners:** a static, full-width strip on the card's bottom edge. Its `clip-path: inset(… round …)` follows the card's inner corner curve, with a negative top inset so the radii are not clamped by the bar's height. Only the fill inside the strip scales, so the curve never distorts. The strip is the direct child; it is not a wrapper under P-17 decision 3.
    - **C, track and fill:** B's strip with a visible `--ret-border` track.
    - **B′, rejected:** the same full-width clip on a single scaled element. The clip scales with the bar, so near empty its start corner narrows and paints over the card's corner. It is shown only on request, as the reason B needs its static strip.
  - **Constraints, checked in Chromium on all 72 cards:**
    - no card overflow, clip-path, transform or new transition;
    - the shadow is intact;
    - the progress element is a direct, `aria-hidden` child with no focusable descendant;
    - `pointer-events: none`;
    - all 90 controls hit-testable, with no bar ever the hit target;
    - no overlap with content or controls;
    - card heights identical in every state and with the bar removed.
  - **Limits:** Chromium evidence only (headless Chrome 154 over CDP, with screenshots and DOM checks). It is not cross-browser, Windows High Contrast or assistive-technology evidence, which stay with P-22 and P-29.
- **D1 sign-off (done).** The maintainer reviewed the prototype and approved this production visual direction. It resolves decisions 6 and 8 and is locked for S1 to S5:
  1. **Treatment, candidate B (full-width safe corners):**
     - A static progress strip sits at the toast's block-end edge, full width, and owns the safe corner treatment: it follows the card's inner corner curve.
     - The fill sits inside the strip. Only the fill runs the `scaleX(1 → 0)` animation of decision 3; the strip never scales, so its corner geometry never distorts.
     - **The toast root is not clipped:** no `overflow: hidden`, `overflow: clip`, `clip-path` or equivalent on the root. The root's `transform` and `transition` ownership is unchanged (P-18 decision 6, P-19 D2 decisions 5 and 9).
  2. **Structure is not a P-17 wrapper:**
     - The progress visual may contain a fill child.
     - That fill is the progress visual's own internal structure. It is not a wrapper inserted into the section → list → toast → content or control architecture that P-17 decision 3 protects.
     - The strip is the toast root's one added direct child (decision 6). It holds no text and takes no focus. Focus restoration reads only the registered library controls, announcements read only `.ret-toast__content`, and repositioning measures only the list's `<li>` roots, so all three ignore it.
     - Later reviews must not reject the strip and fill structure as a forbidden wrapper.
  3. **Moving edge:** a clean, straight depletion edge, never rounded. The card's radius is carried only by the static strip's card-side corners, so the edge stays stable as the fill nears zero.
  4. **Tokens (decision 8 resolved):**
     - `--ret-progress-height: 3px`: 2px was too close to a hairline and the card border, and 4px was too heavy.
     - `--ret-progress: #52525b` in light (the default) and `#a1a1aa` in dark. These match `--ret-text-muted` on purpose. They follow the P-17 theme architecture: the light value on the default block, the dark value in the dark block, and the same value in the system-dark block.
     - The public set becomes exactly **30** in S3. There is no track, radius, duration, easing or semantic progress token, and no type-coloured progress.
  5. **No track:** there is no visible track behind the fill. B already shows the remaining time clearly, a track adds weight, and in forced-colours emulation C's track was more prominent than its fill.
  6. **RTL:** the same markup in RTL. Only the fill's `transform-origin` changes, under the `:dir(rtl)` rule (§20), and positioning and insets stay logical.
  7. **Forced colours:** decision 9 stands. The fill takes a system-colour override, and no track exists to restyle. D1 is not Windows High Contrast evidence.
  8. **Accessibility and pointer input:** decisions 7 and 11 stand. The progress visual is `aria-hidden="true"`, not focusable and `pointer-events: none`, with no progressbar role and no `aria-value*`. The internal fill adds no accessibility or pointer semantics.
  9. **The other candidates:**
     - **A** was viable but not selected. Its inset bar avoids the corners, but it reads as a line inside the card rather than as part of the card's edge, and it would need square ends, because scaled rounded ends distort near empty.
     - **B′** is rejected. Scaling a single element scales its clip and corner geometry too, which gives wrong corners near empty. B avoids this by separating the static strip from the scaled fill.
     - **C** was viable but not selected, for the reasons in item 5.
  10. **Prototype status:** `demo/p20/` stays as a visual reference while S1 to S4 are implemented. S5 removes it at the latest (decision 12).
- **S1, timer and view plumbing (done; awaiting review):**
  - **Change:** `src/store/types.ts` and `src/store/store.ts` only. `ToastView` gains three internal fields, and they join `VIEW_KEYS`, so the existing equality and subscription alone decide who is notified. There is no new subscription, clock, timer, public API, DOM, CSS or token. The public set stays at 28 until S3.
  - **`duration`:** the effective duration, `Infinity` when persistent, which S2 needs for `animation-duration`. It changes only with a new definition.
  - **`remaining`:** the timer's stored, folded `remaining` (§7, P-11), `Infinity` when persistent. It is a boundary snapshot, never recomputed from the clock: a start leaves it as the value its segment runs from, and a stop folds the elapsed time into it.
  - **`held`:** true when the effective duration is finite, the toast is not `exiting`, and the store's combined pause state (§10) applies to it. This is the fact `data-paused` will render (decision 1).
    - A lifecycle phase alone never sets it. An entering, re-queued or promoted toast is held only by a reason, and an inactive or detached Toaster is a lifecycle state, not a pause.
    - Persistent and loading toasts are never held.
    - **Exiting toasts are excluded (an S1 interpretation, for review).** An exiting toast's countdown is over: it is stopped or expired, and a revival starts a new one. With it included, focus restoration away from a dismissed toast re-rendered that toast only to flip its held state.
  - **Notification semantics:**
    - **Time passing:** a running timer's record does not change, so it notifies nobody and renders nothing (49 steps of 100 ms; 4999 ms on mounted toasts).
    - **Expiry:** still notifies once, as a phase change, with `remaining` 0.
    - **Pause and resume:** each boundary notifies once, and re-renders exactly the toasts whose held state changes, each with its folded `remaining`. Resume exposes the value the next segment runs from, which T1 recreates from in S2.
    - **Overlapping reasons:** a reason added or removed while another still holds the toast changes no view and notifies nobody.
  - **Measured scope, in render counts:**
    - focus within a toast: that toast;
    - hover: the finite toasts of that stack whose state changes, and no other position's list;
    - a global reason: every finite toast whose state changes, and no persistent or loading toast;
    - the hotkey, Escape and focus restoration: only the toast that gains or loses focus, once.
  - **P-19:** a pause-only commit runs the list's existing per-commit measurement (layout reads), and nothing more: no seed, flush or release, and every toast stays at rest (`reposition-render.test.tsx`).
  - **Tests:**
    - A new `progress-view.test.ts` (22 tests) covers:
      - the view facts;
      - time passing;
      - expiry;
      - pause, resume and repeated cycles;
      - overlapping reasons;
      - focus, stack and global scope;
      - persistent and loading toasts;
      - entering;
      - timeout and non-timeout exits;
      - revival;
      - replacement, including finite to persistent;
      - promise settlement from loading to finite;
      - detach and re-queue;
      - promotion.

      Its store-side regression test is named `D-10 (store side)`.

    - These guards were narrowed deliberately (decision 10). Each keeps its invariant and adds only the P-20 exception:
      - P-15's "renders nothing for timer and pause changes" and "renders nothing for the DOM events that pause toasts" are now exact per-step scopes, with zero renders for time passing;
      - P-16's hotkey, Escape and focus-restoration render tests now expect only the toast whose focus changes;
      - `pause.test.ts` "notify nobody" became "notify only at held boundaries";
      - `defaults.test.ts` lists the three new view fields, and still excludes pause reasons, the clock and pending state.
    - The `<Toaster progress>` toggle test is unchanged: progress is not wired until S2.
  - **Mutations:** 12, of which 10 were detected:
    - held inverted;
    - persistent held;
    - exiting held;
    - held left out of equality;
    - `remaining` recomputed from the clock;
    - hover widened to any stack;
    - global reasons ignored;
    - held sticky, so resume never notifies;
    - held as "not running";
    - `remaining` reported as the duration.

    Two are equivalent by construction:
    - leaving `remaining` out of equality: every stop that folds it coincides with a held flip or a phase change, and detach removes the view;
    - leaving `duration` out: it changes only with a new revision.

    Both keys stay, as guards of the invariant.

  - **Validation:** all pass:
    - `format:check`;
    - `lint` with the stylesheet contract;
    - `typecheck`, `typecheck:demo`;
    - the full suite (34 files, 1,263 tests);
    - `validate:package`;
    - `build:demo`.
  - **Review (approved):** the maintainer approved S1 as implemented, including that an exiting toast is never held. `held` means a finite countdown that is paused and can continue. Once a toast exits, its countdown has ended: a non-timeout exit has folded its `remaining`, and a timeout has none left. Its bar is frozen by the lifecycle, not by a pause, and a revival gets a fresh timer. Lifecycle freeze and pause stay distinct.
  - **For S2:** derive the running state as `visible` and not held, which matches the stylesheet's `[data-phase='visible']:not([data-paused])`. Recreate the bar whenever `revision`, `remaining`, the phase's running state or `held` changes; under React batching, `remaining` alone still marks a boundary. The S4 hidden-tab Chromium check still applies.
- **S2, progress DOM and state (done; awaiting review):**
  - **Change:**
    - `src/react/ToastItem.tsx`: the strip, the fill and `data-paused`.
    - `src/react/Toaster.tsx`: the `progress` prop is wired.
    - `src/react/defaults.ts`: a comment only.
    - `scripts/check-styles.js`: `data-paused` joins the allowlist.

    The store, the S1 view facts, `styles.css`, the tokens (still 28), the public types and the exports are unchanged. There is no new effect, listener, timer or React state.

  - **DOM:**
    - A normal toast that shows progress gains a last direct child: `<div class="ret-toast__progress" aria-hidden="true">`, the D1 strip.
    - The strip holds one `<div class="ret-toast__progress-fill">` with inline `animation-duration` and `animation-delay`, and nothing else: no text, role, `aria-value*`, `tabindex` or other attribute.
    - `.ret-toast__progress` is the documented BEM hook (§21).
    - **The fill's class is internal**, like `ret-toast__spinner`: S3 styles it, but it is not documented contract, so the public CSS surface does not grow.
  - **Presence:** the strip renders only on a normal toast whose resolved progress is on and whose duration is finite.
    - Resolution keeps P-14's `resolveProgress`: the toast's own option, then the Toaster's prop, then off.
    - `PositionList` resolves it per item as `!persistent && resolveProgress(...)`, so persistent and loading toasts never receive it.
    - Custom toasts never render it, even from the Toaster or with the option smuggled past the types.
    - A loading toast that settles finite gains the strip, and a replacement that becomes persistent loses it.
  - **`data-paused`:** on the toast root exactly while the S1 view is `held`, normal and custom alike, as an empty attribute.
    - Never on a persistent, loading or exiting toast.
    - On an entering toast only for a real pause reason.
    - It carries no reason.
  - **Timing:** `animation-duration: {duration}ms` and `animation-delay: -{duration − remaining}ms`, from the S1 facts, rendered only for a finite duration.
    - A full bar's `-0` formats as `0ms`.
    - Zero and fractional durations format exactly. There is no `NaN` or `Infinity`, and no clamping.
  - **Running and frozen state:** no new hook. The stylesheet (S3) runs the fill only under `[data-phase='visible']:not([data-paused])`, which for a rendered finite toast is exactly when the store's timer runs.
  - **T1 identity:**
    - The fill's key is `revision | remaining | running`, with `running = phase === 'visible' && !held`, derived from existing state with no new store identity.
    - Every timer start or stop changes it:
      - **Entering to visible:** `running` flips while `remaining` and `held` stay.
      - **Pause and resume:** `held` flips and `remaining` folds.
      - **Exits:** `running` drops.
      - **Replacement, revival and settlement:** `revision` changes.
      - **Detach:** the item unmounts.
    - A pause and resume that reach React in one batched render change only `remaining`, which still recreates the fill.
    - Time passing, an overlapping reason and another toast's or stack's pause change none of them, and S1 renders nothing for them anyway.
    - Only the fill remounts. The strip, the root, the content and the controls keep their nodes.
  - **Behaviour (5000 ms):**
    - Entering shows a frozen full bar, and `entered()` creates a new fill: the running segment.
    - A toast held while entering creates no segment at `entered()`, and its last release does.
    - A pause at about 2000 ms recreates the fill at `-2000ms` and holds it. Resume recreates it at the same `-2000ms`.
    - Overlapping reasons recreate it only at the first hold and the final release.
    - A non-timeout exit freezes the folded value, without `data-paused`. A timeout freezes `-5000ms`, which is empty.
    - A revival or replacement starts again at `0ms` with the new duration.
    - A detached toast returns frozen at its kept `-2000ms`, then runs from it.
  - **Isolation:**
    - **P-18:** an `animationend` from the fill, named `ret-progress` or even a library name, completes nothing, because of the existing target filter, which is unchanged.
    - **Announcements:** the strip adds no text and replays nothing.
    - **Focus:** recreation keeps focus and the action and close nodes, and adds no focusable element.
    - **P-19:** the root stays the same node, the order is unchanged, and the root has no inline style.
    - **StrictMode:** one fill and one announcement, with recreation only at boundaries.
  - **Render scope:**
    - S1's zero-render time passing still holds.
    - A `<Toaster progress>` change re-renders exactly the finite normal toasts that leave the option out. Toasts with their own option, persistent, loading and custom toasts never re-render, and the root and content keep their nodes.
  - **Tests:**
    - A new `progress-render.test.tsx` (31 tests) covers resolution and presence, structure, `data-paused`, T1, lifecycle and isolation. Its defect-named test is `D-10: …`.
    - These guards were narrowed (decision 10):
      - `toast-item.test.tsx` "renders no progress indicator yet" now checks the strip;
      - `render-count.test.tsx` "a progress change re-renders no toast" is now an exact progress-toggle scope;
      - `styles.test.ts` accepts `data-paused` in the lint's passing sample.
  - **Mutations:** 14, all detected:
    - progress on custom toasts;
    - progress on persistent or loading toasts;
    - the toast's `false` losing to the Toaster's `true`;
    - `data-paused` on exiting toasts;
    - `data-paused` missing from custom toasts;
    - a revision-only key;
    - a key without `running`;
    - a key using `held` in place of `running`;
    - a key without `remaining`, killed by the batched pause-and-resume test;
    - a delay that ignores `remaining`;
    - a duration from `remaining`;
    - the key on the toast root;
    - the P-18 target filter removed;
    - the strip not `aria-hidden`.

    Recreation on an overlapping reason cannot be mutated into existence: S1 renders nothing for it.

  - **Validation:** all pass:
    - `format:check`;
    - `lint` with the stylesheet contract;
    - `typecheck`, `typecheck:demo`;
    - the full suite (35 files, 1,295 tests);
    - `validate:package`;
    - `build:demo`.
  - **Review (approved):** the maintainer approved S2 as implemented:
    - `revision | remaining | running` is the fill's correct animation identity, `running` covers the start at entering to visible, and `remaining` is needed when a pause and resume are batched;
    - only the fill remounts, and the store is the only clock;
    - `.ret-toast__progress` is the documented BEM hook, and **`.ret-toast__progress-fill` stays internal** and is never documented as stable surface;
    - an exiting toast is never held.
  - **For S3 and S4:**
    - **S3:** the D1-selected CSS: the `ret-progress` keyframe, the strip and fill placement and the corners, `pointer-events: none`, the two tokens (30), the run and hold selectors, the `:dir(rtl)` origin and forced colours, with its guard narrowing.
    - **S4:** the hidden-tab and minimised-window Chromium resynchronisation check against production code.
- **S3, production progress CSS (done; awaiting visual and CSS review):**
  - **Change:** `src/styles.css` and its contract test (`styles.test.ts`) only. No React, store, timer or T1 change.
  - **Tokens (30 in all):**
    - `--ret-progress-height: 3px` on `:where(.ret-toaster)` only, the same in every theme;
    - `--ret-progress: #52525b` there, and `#a1a1aa` in the dark block and the system-dark block, as with every colour token.

    `--ret-progress` joins the AC-A11Y-6 pairs as meaningful non-text, at 3:1 against the surface (7.73:1 light, 5.81:1 dark). There is no track, radius, duration, easing or semantic token.

  - **Card:** the normal card's rule gains `position: relative`, to anchor the strip, and nothing else: no overflow, clip-path, mask, transform, containment or transition. The custom root already had it, and custom toasts have no strip.
  - **Strip (`.ret-toast__progress`):**
    - `position: absolute; inset-block-end: 0; inset-inline: 0; block-size: var(--ret-progress-height); pointer-events: none;`
    - It sits inside the card's 1px border, out of flow, so it changes no layout.
    - The safe corners are its own `clip-path: inset(calc(-1 * var(--ret-radius)) 0 0 0 round 0 0 max(0px, var(--ret-radius) - 1px) max(0px, var(--ret-radius) - 1px))`. That is the card's inner curve (radius less border), on a clip box extended upward so the radii are not clamped by the bar's height. `max()` keeps a zero radius valid.
    - The strip never moves and has no background: there is no track.
  - **Fill (`.ret-toast__progress-fill`, internal):**
    - `display: block; block-size: 100%; background: var(--ret-progress); transform-origin: left;`
    - `animation-name: ret-progress; animation-timing-function: linear; animation-iteration-count: 1; animation-fill-mode: both; animation-play-state: paused;`
    - Its duration and delay are S2's inline values. It has no radius, so the moving edge is straight.
  - **Keyframe:** `@keyframes ret-progress { from { transform: scaleX(1) } to { transform: scaleX(0) } }`. It is the fill's own transform and never the root's.
  - **Run and hold:** `:where(.ret-toast[data-phase='visible']:not([data-paused]) > .ret-toast__progress > .ret-toast__progress-fill) { animation-play-state: running; }`. Entering, held and exiting fills hold, and S2's recreation places each new segment.
  - **Direction (D-11):**
    - `transform-origin: left`, and `right` under `:where(.ret-toast__progress-fill:dir(rtl))`.
    - The fill is anchored at the inline start and depletes toward it (§20).
    - In LTR its remaining part stays at the physical **left** edge, and the moving edge travels from right to left.
    - In RTL it stays at the physical **right**, and the edge travels from left to right.
    - The same markup is used in both, with logical insets.
  - **Reduced motion:** no rule in the block reaches the strip or the fill, so progress keeps depleting (§22, OQ-22). P-18's enter, exit and spinner rules and P-19's `transition-duration: 0s` are unchanged.
  - **Forced colours:** `:where(.ret-toast__progress-fill) { background-color: CanvasText; }` in the existing block. The strip has no rule there, and `forced-color-adjust` stays unused.
  - **Specificity:** every progress rule is a zero-specificity `:where()`, and the token overrides need no selector.
  - **Guards narrowed (decision 10).** Each keeps its invariant for every other rule:
    - the token lists and count, from 28 to 30;
    - "no progress token" became "exactly the two progress tokens, and no stack, spinner, swipe or track token";
    - the closed keyframe list gains `ret-progress`, and the enter and exit frame test skips it, since it has its own exact test;
    - "no play state" now allows only the fill's rules;
    - "no settled transform" allows only the fill's `transform-origin`;
    - the reduced-motion keyframe count went from 5 to 6;
    - the public-contract test now has 30 tokens and the four documented `data-*` hooks.
  - **New contract tests (12)** cover:
    - token defaults;
    - the exact keyframe, strip and fill declarations;
    - D-11 LTR and RTL origins;
    - run only while `visible` and not `data-paused`, across all three phases, held and not;
    - the card unclipped, with P-19's transition unchanged;
    - no other part animated;
    - no reduced-motion rule on the strip or fill;
    - the forced-colours system colour with no track;
    - zero specificity;
    - no progress rule matching a custom toast.
  - **Mutations:** 18 CSS mutations, all detected:
    - the keyframe reversed;
    - the keyframe removed;
    - the RTL origin not switched;
    - progress disabled under reduced motion;
    - the run selector ignoring `data-paused`;
    - entering and exiting running;
    - the colour token bypassed;
    - the height token bypassed;
    - the forced-colours rule removed;
    - card overflow clipping;
    - a root transform;
    - a rounded moving edge;
    - a track;
    - an extra token;
    - the strip hit-testable;
    - the corner clip removed;
    - a wrong dark colour;
    - a rule outside `:where()`.

    Whether the fill class is internal is a documentation contract, recorded here, and is not mutation-tested.

  - **Chromium checkpoint (production code, headless Chrome 154 over CDP, a temporary untracked harness with the real `Toaster` and stylesheet, since removed):**
    - **Tokens, computed:** light and system-light are `#52525b`, dark and system-dark are `#a1a1aa`, and the height is `3px` everywhere.
    - **Geometry, light and dark:**
      - fills at exactly 0, 0.05, 0.3, 0.65 and 1;
      - each fill's start aligned with the strip;
      - the strip 3px, inset 1px from both sides and the bottom (the border);
      - transparent, `pointer-events: none`, with no fill radius;
      - the card `overflow: visible`, `clip-path: none`, `transform: none`, shadow intact;
      - the card 54px with and without progress, so there is no layout shift.
    - **Corners (8× crops):** at 5% and 30% the start corner follows the card's curve. At 100% the end corner does too. At 0% nothing shows, and the empty end has no track. The moving edge is straight.
    - **Pause and resume (6000 ms):**
      - a real hover held the scale exactly (0.7751 over 1 s, with `data-paused`);
      - resume continued from 0.7751, with no reset, and fell by 0.1666 over 1 s, which is 1000/6000;
      - focus held it the same way (0.8322), then it fell by 0.133 over 800 ms;
      - with hover and focus together, releasing the hover kept it held, and only the final blur resumed it.
    - **RTL:** the fill is anchored at the strip's right edge (origin `358px`, the right), and the running bar still depletes. LTR is anchored at the left.
    - **375px:** no horizontal overflow, the strip spans the card less its border, and both controls are hit-testable.
    - **Forced-colours emulation:** a white fill on the black surface, a transparent strip, no track, `forced-color-adjust: auto`.
    - **Reduced-motion emulation:**
      - the root has no animation, a `0s` transition, and no `transform`, `translate` or `scale`;
      - the spinner is static;
      - the fill keeps running `ret-progress` and falls by 0.1667 per second;
      - a hover held it, and resume continued without a reset.
    - **Consumer override:** `.ret-toaster { --ret-progress-height: 6px; --ret-progress: #ff0000 }` gave a 6px red bar with no selector override.
    - **Capture note:** a screenshot that resizes the viewport briefly ended the hover, so the held toasts resumed and T1 correctly recreated each fill from the store, replacing a screenshot-only placement. The final captures used no resize, and each toast was confirmed held before and after.
  - **Limits:** Chromium only, with emulated colour schemes, forced colours and reduced motion. It is not WebKit, Firefox or Windows High Contrast evidence (P-22), nor operating-system or assistive-technology evidence (P-29).
  - **Validation:** all pass:
    - `format:check`;
    - `lint` with the stylesheet contract;
    - `typecheck`, `typecheck:demo`;
    - the full suite (35 files, 1,307 tests);
    - `validate:package`, with `dist/styles.css` identical to the source;
    - `build:demo`.
  - **Review (approved):** the maintainer approved S3 as implemented, with no correction, and resolved the direction wording; see the S4 record below.
  - **For S4:** the hidden-tab and minimised-window Chromium resynchronisation check against this production code, repeated pause and resume, StrictMode, lifecycle edge cases, render counts and mutations. Carry WebKit and Firefox hidden-document behaviour forward to P-22.
- **S4, hardening (done; awaiting review):**
  - **Change:** tests and this record only. **No production code changed**: no defect was found.
    - A new `progress-hardening.test.tsx` (12 tests);
    - a hidden round trip added to `render-count.test.tsx` and to `reposition-render.test.tsx`.
  - **Direction (normative, resolved at the S3 review; never to be reopened):**
    - The remaining fill is anchored at logical `inline-start`, with `scaleX(1 → 0)`.
    - **LTR:** `transform-origin: left`. The remaining fill stays at the physical left, the moving edge travels right to left, and the vacated space grows from the physical right (inline-end).
    - **RTL:** `transform-origin: right`. The fill stays at the physical right, the edge travels left to right, and the vacated space grows from the physical left (inline-end).
    - The same markup is used in both: a test compares the whole toast's markup in each direction.
    - The S3 request's phrase "depletion moves toward inline-end" was ambiguous. It does not override §20 or this browser-verified behaviour.
  - **Production Chromium evidence:**
    - **Setup:** headful Chrome 154 on Windows over CDP. A temporary, untracked harness bundled the real `Toaster`, `toast`, store and stylesheet, with the real P-15 wiring, and is now removed.
    - **Truth:** read from the bundled store's records.
    - **Measurement:** each animation frame, the fill's computed `scaleX` against `remaining − (frame − runningSince)`. The error is in ms; a positive error means the bar is behind the timer.
    - **Recreations:** fill recreations counted by a harness-only `MutationObserver`.
    - **Genuine tab switch:** a 20 000 ms toast, visible for 2000 ms, then hidden behind another tab for 12 s.
      - `document.hidden` was true, and the store held at 18 142.6 ms.
      - On return the first frame read +15.7 ms, a steady value of about one frame that did not grow.
      - The pre-D0 literal model read −5918 ms there (an empty bar).
      - The fill was recreated twice, once to hold and once to resume.
    - **Genuine minimise and restore:** the same toast and timing. The store held at 18 126.9 ms, and on return the error was +11.8 ms (pre-D0: −5920 ms).
    - **Five 1.5 s hidden cycles (30 000 ms):** per-cycle errors of +5.9, +4.9, +7.8, +8.5 and +10.2 ms, all within a frame. Each cycle derived a fresh fill from the store, with two recreations per cycle, so nothing could accumulate (pre-D0: −1.5 s per cycle, −7.5 s after five).
    - **Near expiry:** about 550 ms left, then hidden for 3 s.
      - The store held 540.4 ms. On return the toast was still visible at 0.1745 against an expected 0.174 (+1.6 ms), not empty.
      - It expired normally once its 540 ms had run.
    - **Reduced-motion emulation with a genuine tab switch (5 s):**
      - +9 ms on return;
      - the fill kept running `ret-progress`;
      - the root had no animation and a `0s` transition.
    - **Foreground repetition (30 000 ms toasts):**
      - 15 real hover cycles (30 boundaries) made exactly 30 recreations, ending at −9.2 ms;
      - 15 focus cycles made 30 recreations, ending at −1.9 ms, with the same close node throughout.
      - Neither drifted, reset or emptied early.
    - **Overlapping reasons:**
      - the first hover recreated the fill once, held at 0 ms error;
      - adding focus, then removing the hover, recreated nothing and stayed exact;
      - the final blur recreated it once, and it ran from the held value (+15.3 ms).
    - **StrictMode:**
      - one toast, strip and fill, one announcement and one record;
      - the same count of creations as without StrictMode (the entering fill, then the running one);
      - only boundary recreations through a hover and a hidden cycle, and none over 1.5 s of idling;
      - +13.1 ms afterwards.
    - **Consumer override:** `--ret-progress-height: 6px` and `--ret-progress: #ff0000` held while running, paused, in dark and in RTL (origin at the right).
    - **Forced-colours emulation:** unchanged since S3: a system-colour fill, a transparent strip and `forced-color-adjust: auto`.
  - **jsdom hardening (`progress-hardening.test.tsx`):**
    - **Timeout races:**
      - a pause 1 ms before expiry holds at `-4999ms`, and the timeout comes only after resume, with `onAutoClose` once;
      - a dismissal 1 ms before expiry exits once, with `programmatic`, and no timeout;
      - a pause just after expiry changes nothing (empty, exiting, unmarked);
      - a resume with 0.5 ms left runs out to `-5000ms`.
    - **Duration edges:**
      - zero gives `0ms` and `0ms`, never `NaN` or `-0`; its 0 ms expiry fires on the next fake tick;
      - 1 ms runs out to empty;
      - finite to persistent to finite removes the strip, then returns it full on a fresh fill.
    - **Lifecycle:** a promoted toast enters full and frozen and runs only once visible. An exit completes while the bar is frozen and the page hidden (P-18).
    - **The real P-15 `visibilitychange`:**
      - a hidden round trip holds and resumes at the same folded value, with two recreations;
      - focus and the close node are kept;
      - no announcement node is added;
      - the announcement text is unchanged.
    - **StrictMode:** exactly one window or document listener of each environment kind, one fill and one record through a hidden cycle.
    - **Markup:** identical in LTR and RTL.
  - **Render counts:** a real hidden round trip renders each finite toast exactly twice and a persistent toast never. S1's zero renders for time passing, S2's batched pause-and-resume test and the progress-toggle scope all still hold. CSS animation frames never reach React (no listener, effect or state).
  - **P-19:** a real hidden round trip recreates every fill on the same roots, in the same order, with no seed, flush or release, and every root at rest. Only the list's per-commit layout reads run.
  - **Mutations:** 14 across S1 to S3, all detected:
    - `remaining` dropped from the fill's identity, killed by S2's batched test;
    - `running` dropped from it;
    - a global or hidden pause never reaching the view;
    - elapsed time not folded at a stop;
    - no recreation at the final resume;
    - `remaining` computed from the clock in the view;
    - progress running while held;
    - entering and exiting running;
    - progress disabled under reduced motion;
    - a child `animationend` satisfying P-18;
    - the root remounting in place of the fill;
    - detach losing `remaining`;
    - revival keeping the old timer;
    - an exiting toast held.

    Recreation on an overlapping reason cannot be mutated into existence: S1 renders nothing for it.

  - **Limits:**
    - Chromium only (Chrome 154 on Windows), with colour scheme, forced colours and reduced motion emulated.
    - Not tested: intensive throttling (hidden for more than about 5 minutes), occlusion-only hiding, mobile backgrounding, WebKit and Firefox, Windows High Contrast, and assistive technology.
  - **Validation:** all pass:
    - `format:check`;
    - `lint` with the stylesheet contract;
    - `typecheck`, `typecheck:demo`;
    - the full suite (36 files, 1,321 tests);
    - `validate:package`;
    - `build:demo`.

    The public set stays at 30 tokens.

  - **Carry-forwards, recorded at S5:**
    - **P-22:** WebKit and Firefox progress direction and pause synchronisation (§26), including hidden-document resynchronisation, and Windows High Contrast for the fill.
    - **P-26:**
      - document `--ret-progress-height`, `--ret-progress`, `.ret-toast__progress` and `data-paused`, but not the fill's class;
      - that progress keeps depleting under reduced motion;
      - the inline-start anchoring;
      - that the normal card is now `position: relative`.
    - **P-29:** that the strip is never announced, and that progress behaves under the operating system's reduced-motion setting.
  - **Review (approved):** the maintainer approved S4 and its evidence as recorded, with no correction.
- **S5, reconciliation (done):**
  - **Implementation audit (read-only, before cleanup):** the final code matches every approved decision.
    - **Timer and view (S1):** the store is the only clock. The view carries only the boundary facts: `duration`, the folded `remaining`, and `held`, which is finite, not exiting and paused.
    - **`data-paused` (decision 1):** finite normal and custom toasts only, never persistent, loading or exiting, and it carries no reason.
    - **Resolution:** the toast's option, then the Toaster's, then off. Never for custom, persistent or loading toasts.
    - **DOM (S2):** `.ret-toast__progress` (`aria-hidden`), then `.ret-toast__progress-fill`.
    - **T1 key:** `revision | remaining | running`.
    - **CSS (S3):** candidate B, with a static clipped strip, a scaled fill, no track, a straight edge, and no clipping, transform or transition on the root.
    - **Tokens:** `3px`, `#52525b`, `#a1a1aa`; 30 in all.
    - **Origins:** `left`, and `right` under `:dir(rtl)`.
    - **Reduced motion:** no rule reaches progress.
    - **Forced colours:** `CanvasText` on the fill.
  - **D-10 is closed by P-20.** Its wording: "progress re-renders every frame and resets on resume. The `requestAnimationFrame` loop calls `setState` every frame. On resume, progress jumps back to 100%."
    - **No per-frame render:**
      - S1 time-passing tests show zero notifications and zero renders;
      - the S4 render counts show a hidden round trip renders each finite toast exactly twice;
      - there is no rAF, interval or React state in the progress path, and the stylesheet animates the fill.
    - **No reset on resume:**
      - `D-10 (store side)` in `progress-view.test.ts` and `D-10: …` in `progress-render.test.tsx` cover pause and resume from the same folded `remaining`;
      - S4's races, cycles and hidden round trips extend them;
      - in Chromium, resume continued from 0.7751 with no reset (S3), and a genuinely hidden tab resynchronised to within 15.7 ms (S4).
  - **D-11 is closed by P-20.** Its wording: "progress is wrong in RTL. The bar is fixed at `left: 0`. The per-toast `rtl` flag only swaps the icon margin."
    - There is no per-toast flag, and the strip is placed with logical insets.
    - The fill's origin follows the inherited direction: `left` in LTR, and `right` under `:dir(rtl)`.
    - The evidence:
      - the `D-11: …` style test;
      - same-markup LTR and RTL tests;
      - the S3 and S4 Chromium runs (anchored at the right in RTL, origin `358px`, still depleting).
    - The normative reading from S4 stands: the remaining fill is anchored at logical inline-start, and the vacated space grows from inline-end.
    - P-17 closed the layout half of D-11. Cross-browser confirmation is P-22's.
  - **AC-PR-1 is met for P-20's scope.** Its wording: "Progress is off by default. When on, it pauses and resumes with the timer, never resets on resume, and causes no React render per frame. (D-10)"
    - **Off by default:** automated, by the resolution table in `progress-render.test.tsx` and the P-14 `resolveProgress` tests.
    - **Pauses and resumes with the timer:**
      - automated, by S2 (T1 recreation at every boundary, run and hold state) and S4 (timeout races, hidden round trips);
      - structural, in S3 (runs only under `[data-phase='visible']:not([data-paused])`);
      - in Chromium, S3 and S4 (hover, focus, overlap, a genuine tab switch and minimise).
    - **Never resets on resume:** automated (the D-10 tests and S4) and in Chromium (S3 and S4).
    - **No React render per frame:** automated (S1 and S4 render counts). The browser animation is CSS only.
    - The real-browser proof in WebKit and Firefox is P-22's (§26).
  - **AC-RTL-1, the progress part, is met for P-20.** Its wording: "In RTL the layout mirrors, progress depletes toward inline-start, and positions stay physical. (D-11)"
    - P-20 owns "progress depletes toward inline-start". It is met structurally (the origin tests, the same markup) and in Chromium (S3 and S4).
    - The layout mirroring is P-17's (S3), and physical positions are P-14 and P-17's. P-20 changes neither.
    - The criterion is verified in real browsers by P-22 (§20: "Playwright verifies RTL"). Its Chromium, WebKit and Firefox confirmation is left there.
  - **Non-regression:**
    - **Lifecycle (P-14, P-18):** AC-LC-1 to AC-LC-3 tests pass unchanged. A fill's `animationend` completes nothing, and exits complete while it holds.
    - **Pausing (P-15):** AC-TM-1 to AC-TM-5 hold. Its render guards were narrowed deliberately (S1), not removed.
    - **Focus and announcements (P-16):** focus restoration, the hotkey and the live regions are unchanged. Recreation never moves focus or announces anything.
    - **CSS (P-17):** the AC-CSS-1 lint passes with `data-paused` documented, the themes are intact, and AC-A11Y-6 gains the progress pair.
    - **Motion (P-18):** enter, exit, the spinner and reduced motion are unchanged.
    - **Repositioning (P-19):** no seed is caused by progress, the roots stay stable, and the transition is untouched.
    - **API and package:** the exports are exactly `Toaster` and `toast`, with the same eleven types, and `validate:package` passes.
  - **Public surface (P-20's additions, for P-26):**
    - visual behaviour for the existing `progress` option and prop;
    - `data-paused`;
    - `.ret-toast__progress`;
    - `--ret-progress-height`;
    - `--ret-progress`.

    `.ret-toast__progress-fill` and the `ret-progress` keyframe are internal. No other class, attribute, token, export or type became public, and the count is exactly 30.

  - **Prototype cleanup:**
    - `demo/p20/` was removed, and `demo/index.tsx` is back to the `v2` file byte for byte: the `?p20` switch and the P-17 stylesheet bypass are gone.
    - A search for `p20`, the candidate names and `TODO` or `FIXME` finds only this historical record and one test title that cites "D1 candidate B" as provenance. Two `package-lock.json` hashes contain "P20" by coincidence.
    - The S4 and earlier browser harnesses were never in the tree, and are deleted.
  - **Tests:** reviewed and kept as they are. Each encodes an invariant:
    - zero renders as time passes;
    - boundary-only notifications;
    - T1 at entering to visible;
    - batched pause and resume;
    - hidden and global pauses;
    - overlapping reasons;
    - custom toasts excluded;
    - `data-paused`;
    - P-18 and P-19 isolation;
    - reduced motion;
    - RTL;
    - the token and guard contract.

    The overlap between the S2 and S4 tests is deliberate: they cover different paths, the store commands and the real P-15 events.

  - **Mutations:** S5 changed only the demo and this record. `src/`, the tests and the scripts are byte-identical to S4 (`022408a`), so the S1 to S4 mutation evidence stands: 12 at S1, 14 at S2, 18 at S3 and 14 at S4. The tests that killed them are all still in the tree.
  - **Validation (after cleanup):** all pass:
    - `format:check`;
    - `lint` with the stylesheet contract;
    - `typecheck`, `typecheck:demo`;
    - the full suite (36 files, 1,321 tests);
    - `build:demo`;
    - `validate:package` (attw, exactly `Toaster` and `toast`, with `dist/styles.css` identical to the source);
    - `git diff --check`.
  - **Browser evidence:** production is byte-identical to S4, so the S3 and S4 Chromium evidence applies unchanged, and no new campaign was run.
  - **Carry-forwards:** P-22 (WebKit and Firefox direction, pause synchronisation, hidden-document resynchronisation and corners; Windows High Contrast), P-26 (the public surface, behaviour and caveats listed in its entry) and P-29 (screen readers and the operating system's reduced-motion setting). Each is recorded in its own entry.
  - **Then:** a focused publication review, then the PR into `v2`, CI and a merge commit.

**P-21 Swipe to dismiss**

- Scope: §19 in full, with thresholds set by prototype. Touch and pen only, centre positions in either direction, custom toasts included.
- Carried over from P-18. The swipe exit continues from the dragged offset (§19), which the P-18 exit keyframes (`ret-exit-top` and `ret-exit-bottom`, from the settled state) do not: P-21 decides how a swipe exit composes with them, through `transform` or otherwise, and keeps lifecycle completion on the toast root's library `animationend` or the computed fallback (§9 rule 3).
- Carried over from P-19 (D2 decision 10):
  - Stack repositioning seeds an inverse vertical offset on the toast root through inline `transform` and carries it back with the stylesheet's `transition: transform`. At rest the root computes to `transform: none`.
  - Swipe composes with this without wrappers, without DOM reordering, and without replacing P-18's individual properties.
  - The expected direction is one library-owned root `transform` built from internal components for the horizontal swipe offset and the vertical reposition offset, with the transition turned off while a direct pointer drag is active. P-21 decides the exact contract, including what a drag does to a reposition already running.
- **Status: complete.** D0, D1 and D2 are done: the architecture (D0), the prototype with its machine evidence and the maintainer's required iPhone Safari and Android Chrome sign-off (D1), and the prototype-derived constants and composition contract (D2), all recorded below. The implementation slices S1 to S5 are complete and recorded under the sequence: the gesture helpers, drag and cancel, commit with the P-19 composition, hardening, and the final reconciliation with the prototype removed. The maintainer approved the production S3 dismissal on iPhone Safari and Android Chrome. After the publication review and its pre-publication correction, it was merged into `v2` through PR #15 with a merge commit (`1644671`).
- Defects: none. Appendix A assigns no defect to P-21.
- Acceptance: AC-SW-1 is P-21's. AC-LC-1 to AC-LC-3, AC-TM-2, AC-NT-3, AC-CB-2, AC-Q-3, AC-MO-1 to AC-MO-3, AC-PR-1, AC-RTL-1, AC-A11Y-4, AC-KB-1, AC-CSS-1 and the §32 render counts must not regress. As with AC-MO-1 and AC-MO-2, the real-browser proof of AC-SW-1 ("touch swipe (thresholds, cancel, scrolling, no mouse drag)", §26) is P-22's, including that vertical scrolling still works.
- **Already decided, not reopened here:**
  - §19 in full: Pointer Events, `pointerType` `touch` and `pen` only, no mouse drag; left positions toward the left edge, right positions toward the right edge, centre positions either way; distance **or** release velocity commits, with values set by prototype, stored as named constants and tested; a custom-property transform and an opacity fade during the drag; the internal `swipe` pause reason; spring back below the threshold and exit with reason `swipe` from the dragged offset above it; never from interactive descendants or while text is being selected; `touch-action: pan-y`; `pointercancel` and lost capture restore; no travel after release under reduced motion; custom toasts included;
  - positions and swipe direction are physical (§12, §20, OQ-21), and OQ-20;
  - `DismissReason` includes `"swipe"` (§6.6, §16), and the internal `PauseReason` includes `swipe`, set through `setToastPause(id, "swipe", on)` (§7, §8.1, §10, P-11);
  - detach clears every toast's `swipe` reason (§8.4, P-11);
  - `data-paused` collapses every pause reason, `swipe` included, and an exiting toast is never held (P-20 D0, decision 1, and S1);
  - progress is `pointer-events: none` and never a swipe target (P-20 D0, decision 11);
  - motion uses `opacity`, `translate` and `scale`, never `transform` (P-18 D0, decision 6), and lifecycle completion is the root's filtered library `animationend`, the computed fallback or the 0 ms path (P-18 D0, decisions 1 to 3 and 9);
  - the library owns the root `transform`, which is `none` at rest, with no wrapper (P-19 D2, decisions 5, 9 and 10).
- **Starting point (the D0 review, at `6dd1bc9`):**
  - The renderer has no gesture code: no pointer-down, move or capture handling, no `touch-action`, no swipe state. The store side is ready: `dismiss(id, "swipe")` and `setToastPause(id, "swipe", on)` need no change.
  - P-19's `reposition()` writes and then removes inline `transform` and `transition-property` on each moved root, deletes an empty `style` attribute, and reads only the vertical component of the computed matrix (`translateYOf`). Unchanged, it would erase a horizontal swipe offset.
  - Stack hover (P-15) does not filter `pointerType`, so a touch on a toast already pauses its whole stack until the pointer leaves.
  - The toast root has `tabindex="-1"`, so a tap or click on its body can focus it.
  - jsdom has `PointerEvent` but no `setPointerCapture`, `releasePointerCapture` or `hasPointerCapture`. Playwright is not installed: it arrives with P-22.
- **Decisions locked before implementation (D0).** They refine §19 and the P-18 and P-19 carry-forwards above. Every numeric or feel value is left to D1 and locked in D2.
  1. **Distance and velocity:**
     - The swipe displacement is the pointer's horizontal displacement on the physical axis, never a logical (inline-direction) one. Distances are evaluated in CSS pixels, the unit of pointer coordinates.
     - Velocity is the signed physical horizontal velocity at release. It can commit only when it points in a direction the toast's position allows.
     - The distance **or** the release velocity commits, as §19 requires.
     - D1 sets the distance threshold, the velocity threshold and the velocity sampling window and algorithm.
  2. **Direction:**
     - Left positions allow only the physical left, right positions only the physical right, and centre positions either physical horizontal direction. RTL does not change this (§20).
     - A displacement in a forbidden direction is clamped to zero, with no rubber-banding.
     - In an allowed direction the toast follows the pointer, with no artificial maximum drag distance.
  3. **Activation and axis ownership:**
     - `pointerdown` only creates a pending candidate. The gesture activates once the pointer has passed an activation slop with horizontal movement dominant. D1 sets both values.
     - Before activation there is no `swipe` pause reason, no swipe visual state and no pointer capture, and gesture tracking causes no React render and no store notification.
     - When the browser takes the pointer for scrolling and sends `pointercancel`, the candidate is dropped with no dismissal.
  4. **Pause timing:**
     - `swipe` is set when the gesture activates, never on `pointerdown`.
     - The gesture code touches only its own toast's `swipe` reason, never hover, focus-within or the global reasons. Overlapping reasons combine by the existing store semantics (§10).
     - A cancelled gesture clears `swipe` when the release or cancel is handled. The reason's ownership ends there: the timer is not held for the length of a cosmetic snap-back, and timer state never depends on a transition completing. Only a concrete correctness problem found in D1 reopens this.
     - A successful gesture calls `dismiss(id, "swipe")` **before** it clears `swipe`. The toast is then exiting, so it is never held and never carries `data-paused` (P-20).
     - Pointer movement never changes timer state.
  5. **Displacement:**
     - Gesture state is ephemeral and local to the toast's component.
     - Each move writes the visual offset through CSSOM into internal CSS custom properties on the existing toast root. A library-owned stylesheet rule turns them into the root's `transform`. The root stays the one motion, layout and swipe surface, and it still computes to `transform: none` at rest.
     - P-18 keeps the individual `opacity`, `translate` and `scale` for its lifecycle animation. P-19 and P-21 share the root `transform` through one explicitly composed, library-owned contract (decision 8).
     - Not used: the individual `translate` for the swipe, a nested swipe wrapper, a second toast root, a React `style` per move, or store state per move.
     - The internal custom properties are implementation details, not public tokens. They do not change the public token count.
  6. **State hook:**
     - `data-swiping` on the toast root is an **internal** state hook. Library CSS and tests may use it. It is not part of the stable public CSS contract (OQ-25, §21) and is not documented as a styling API.
     - The style guards must tell this internal hook apart from the public `data-theme`, `data-position`, `data-phase` and `data-paused`, without weakening attribute validation in general. `scripts/check-styles.js` has one list, of documented attributes, so separating the two is a targeted S2 guard-design task. It does not widen the public contract.
  7. **Swipe exit:**
     - A committed swipe exits from its current physical offset. With normal motion it keeps travelling in the committed physical direction through the library-owned root `transform` transition.
     - P-18 still owns the lifecycle exit: its existing root animation of the individual `opacity`, `translate` and `scale`.
     - The swipe adds no lifecycle completion. `transitionend` never calls `exited()`. Completion stays P-18's filtered library `animationend`, its computed fallback or the reduced-motion 0 ms path (§9 rule 3).
     - No swipe-specific lifecycle keyframe is added, unless later evidence shows this design to be impossible.
     - P-18's `scale: 0.98` also scales the root `transform`, so the offset shrinks slightly during the exit, by about 2% of it. This is accepted provisionally, and D1 inspects it.
     - D1 sets the fly-out target distance, duration and easing.
  8. **Composition with P-19:**
     - P-21 may make narrowly scoped changes to P-19's repositioning code (`reposition()`, `useStackReposition`) in the slice that needs them (S3). It may make them swipe-aware and read both the horizontal and vertical components of the current transform matrix.
     - There is one library-owned composition of the root `transform`, in which the horizontal swipe offset and the vertical reposition offset coexist. P-19 never erases or overwrites an active swipe offset, and P-21 never erases an active reposition offset.
     - Measurement stays layout-based and independent of transforms. Root identity and DOM order do not change.
     - A swipe that activates during a running reposition freezes the toast's **current visual** vertical position into the composed transform. It does not snap to the final layout position.
     - A membership change while a toast is being dragged, is springing back or is completing a fly-out keeps its horizontal swipe state while it applies or updates the vertical reposition.
     - D0 does not prove the seeding mechanics. D1 prototypes the composition in real reposition scenarios before production code is authorised. Repositioning of toasts that are not swiping must not regress.
  9. **Interactive descendants and selection:**
     - A swipe never starts from an interactive descendant. Detection walks from the pointer target toward the toast root, for example with `closest()`, and the root itself is never classed as interactive: its own `tabindex="-1"` does not count.
     - The protected set covers at least `button`, `a[href]`, `input`, `select`, `textarea`, `label`, `summary`, editable (`contenteditable`) content, elements with interactive widget roles, and descendants a consumer made explicitly focusable or tabbable. The helper and its exact selector list are an S1 implementation detail, covered by tests.
     - A non-collapsed text selection that intersects the toast prevents activation.
     - Ordinary taps on the body stay ordinary taps, and clicking or tapping the body never dismisses (§15, §16, D-17). The action and close controls behave as before.
     - D1 checks long-press and text selection, and interactive custom content, on real devices where practical.
  10. **Pointers and capture:**
      - Only `touch` and `pen` are eligible. A `mouse` pointer, which includes trackpads, is ignored completely: no movement, no pause, no capture.
      - The first eligible pointer owns the pending or active gesture until it ends. The gesture ignores every other pointer ID.
      - Lost capture cancels and restores an unfinished gesture. A `lostpointercapture` that follows the normal end of a gesture at `pointerup` never undoes a commit.
      - The capture APIs are feature-guarded, because jsdom lacks them, and cleanup tolerates them throwing during teardown.
  11. **A lifecycle change from elsewhere during a gesture.** When another operation takes the toast out of `visible` during an active gesture, for example a programmatic dismissal, a relocation or a detach (an active gesture's `swipe` reason holds the timer, so a timeout cannot expire the toast then; a timeout while the gesture is only pending just drops the candidate):
      - the gesture gives up ownership, clears its `swipe` reason and releases capture safely;
      - the toast is not first snapped back to zero: where possible, its current swipe offset is the starting visual state of the exit that is already under way;
      - the reason already chosen wins, swipe never replaces it, and no callback runs twice (§9 rule 4, §16);
      - relocation, detach and unmount still clean up completely.

      D1 and S3 validate the visual handoff.

  12. **Reduced motion.** Under `prefers-reduced-motion: reduce`:
      - the drag still follows the pointer directly, because the user moves it;
      - a successful swipe still dismisses, with no fly-out after release;
      - a cancelled swipe returns to rest with no snap-back travel;
      - P-18's instant lifecycle completion and P-19's untranslated, instant repositioning are unchanged;
      - CSS reduces the release motion. No `matchMedia` or other JavaScript branch is added for the gesture (P-18 D0, decision 4).
  13. **Eligibility:**
      - A swipe can start only while the toast is `visible`. It never starts while the toast is `queued`, `entering` or `exiting`. `entering` is brief, and capturing during P-18's enter motion would add motion composition and races for almost no benefit. `visible` alone gives one clear timer and lifecycle boundary.
      - Finite, persistent, loading and custom toasts are all eligible, whether or not progress is shown.
      - Decision 11 governs a toast that leaves `visible` mid-gesture.
  14. **Capture timing.** Pointer capture is taken only when the gesture activates. A pending tap never captures, so ordinary click targeting, including on non-interactive custom content, never moves to the toast root.
  15. **Opacity:**
      - The opacity fades as the displacement grows (§19).
      - Each move writes the opacity through CSSOM to an internal CSS custom property, never through a React `style` and never through the store.
      - With normal motion, opacity may join the cosmetic release transition alongside `transform`. P-18 stays authoritative for the lifecycle opacity animation.
      - D1 sets the fade curve, the minimum opacity and the release timing, and checks that P-18's exit opacity composes acceptably from a partly faded toast.
  16. **`touch-action`:**
      - The value stays `touch-action: pan-y`, as §19 requires. P-21 does not change it to `pan-y pinch-zoom`.
      - One consequence is recorded for P-22 and P-26: a pinch-zoom that starts on a toast is not handled by the browser.
      - No `touchmove` listener and no `preventDefault()`-based scroll ownership are planned.
  17. **Focus restoration:**
      - P-16's restoration semantics (§18) are unchanged for swipe. A successful swipe starts the exit through the same lifecycle machinery as every other dismissal reason, so a toast that holds focus restores it before it becomes inert, exactly as a close-button dismissal does.
      - P-21 does not special-case pointer-triggered restoration. The action and close controls never start a gesture.
      - The open question on pointer-triggered close, under P-22, now explicitly includes swipe. It stays owned by P-22 and P-29. P-21 changes no focus behaviour without a separately recorded plan decision.
- **Performance and state ownership (whole phase):**
  - High-frequency pointer movement causes no React render, no store notification, no timer change and no new toast view.
  - Per-move state is ephemeral. High-frequency work is limited to local gesture bookkeeping and direct DOM and CSSOM visual writes.
  - The store hears only boundaries: `swipe` set at activation, `swipe` cleared when the gesture ends, and one `dismiss(id, "swipe")` on a successful commit.
  - The gesture listeners are native and element-scoped on the toast root, so containment follows the DOM, not the React tree (P-15). They add no window or document listener, so §32's fixed count of global listeners is unchanged. StrictMode replay leaves no duplicate.
  - `requestAnimationFrame` is not added by default. D1 may justify coalescing with it only from real-device evidence of a concrete need.
- **Public API and CSS:**
  - No new public TypeScript API is expected. `DismissReason` already includes `"swipe"`, and the internal `PauseReason` includes `swipe`.
  - No new public CSS token is expected. The public set stays at 30. The internal swipe custom properties are not tokens.
  - `data-swiping` is internal (decision 6).
  - Custom toasts stay free of wrappers (§6.4, §21).
- **Readings recorded at D0.** These are not changes to the plan:
  - **Reduced motion.** §17.5 and §22 remove translation from enter, exit and reflow motion. A drag that follows the pointer is direct manipulation, not motion the library animates, and §19 restricts only the travel after release. Decision 12 keeps the drag and removes the release travel.
  - **`data-swiping`.** §21 lists it among the indicative state attributes. The stable public contract is OQ-25's documented hooks plus `data-paused` (P-20 D0, decision 1), and anything undocumented is an implementation detail (§21), so an internal `data-swiping` follows §21.
  - **Internal custom properties.** P-20 D0, decision 5, ruled out token-like internal properties for progress timing only. P-19 D2, decision 8, allows an undocumented internal `--ret-*` property where needed, kept apart from the tokens by tests. The swipe properties follow P-19's rule, and their names, which must pass the `ret-` namespace check (AC-CSS-1), are an S2 detail.
- **D1 mandate (required before any production code).** D1 is a disposable demo-only prototype on the real rendered toast DOM. Nothing from it reaches `src/`, the package output or the public contract. It validates both the feel and the composition:
  1. a slow drag in an allowed direction;
  2. a fast flick;
  3. a cancel below the threshold, and the snap-back;
  4. a successful fly-out;
  5. a drag in a forbidden direction;
  6. both directions at a centre position;
  7. vertical page scrolling that starts on a toast;
  8. diagonal gestures and scroll arbitration;
  9. taps on the action and close;
  10. a custom toast with interactive content;
  11. text selection and long-press, where practical;
  12. a drag that starts during a P-19 reposition;
  13. a membership change while another toast is being dragged;
  14. a neighbour's removal and the reposition during a drag;
  15. a reposition during a snap-back;
  16. a reposition during a fly-out;
  17. P-18's exit composing from a partial swipe offset and opacity, including the `scale` effect (decision 7);
  18. a cancel under reduced motion;
  19. a successful swipe under reduced motion;
  20. RTL leaving the physical directions unchanged.

  D1 proves the composed root-transform design locked above. It does not reopen wrappers or the individual `translate`, unless the locked design proves technically impossible.

  - **Real-device checkpoint, required:** iPhone Safari and Android Chrome.
  - **Desktop Chromium:** a mouse drag must do nothing. Touch emulation is supplementary evidence only.
  - **D1 decides, and D2 locks, before production implementation:** the distance threshold; the velocity threshold; the velocity sampling window and algorithm; the activation slop and horizontal dominance; the opacity curve and minimum; the fly-out distance, duration and easing; the snap-back timing; whether `requestAnimationFrame` coalescing is needed; and the composition's seeding mechanics (decision 8).

- **Sequence.** Each implementation slice stops for review:
  - **D0, decision record:** this entry. Documentation only.
  - **D1, prototype:** demo-only, under `demo/p21/`, with the real-device checkpoint above. No `src/`, stylesheet, script, test or package change.
  - **D2, lock:** records the D1 evidence, the constants and the composition mechanics in this entry. Documentation only.
  - **S1, gesture decisions (done):** pure, internal helpers with their unit tests: direction, clamping, activation, distance and velocity commit, interactive descendants and selection. No DOM wiring, stylesheet or store change.
    - **Module:** `src/react/swipe.ts`, internal and not on the package entry (the built entry contains none of it).
      - It encodes D2 decisions 1 to 4 as the named constants `SWIPE_ACTIVATION_SLOP_PX`, `SWIPE_DOMINANCE_RATIO`, `SWIPE_DISTANCE_WIDTH_FRACTION`, `SWIPE_DISTANCE_MAX_PX`, `SWIPE_VELOCITY_WINDOW_MS`, `SWIPE_VELOCITY_THRESHOLD`, `SWIPE_FADE_WIDTH_FRACTION` and `SWIPE_MIN_OPACITY`.
      - Directions are a physical sign (`SwipeDirection`, −1 left and 1 right). No function takes a document direction, and the arithmetic reads no global.
      - Functions:
        - `allowedDirections`, `isDirectionAllowed`, `directionOf` and `isSwipePointer` (touch and pen);
        - `activationOf`: `pending`, `activate` with a direction, `forbidden`, or `drop` (below);
        - `allowedOffset` (forbidden or non-finite gives 0);
        - `distanceThreshold` and `distanceCommits`;
        - `releaseVelocity`: the first and last finite samples in [release − 100 ms, release], both inclusive, in event order, with no smoothing, and 0 without two samples or positive elapsed time;
        - `velocityCommits`;
        - `releaseDecision`: commit, which rule passed, direction, offset, threshold and velocity;
        - `swipeOpacity`.
      - Two small DOM reads cover D0 decision 9:
        - `protectedTarget` walks from the target to the root, never classing the root, with native controls, editable content, ARIA widget roles and any `[tabindex]` descendant;
        - `selectionIntersects` uses `Range.intersectsNode`, not `Selection.containsNode`. Under the specification's partial containment, `containsNode` reports a selection wholly inside the toast as not intersecting, and jsdom follows it. The D1 prototype's `containsNode` worked only because of Chromium's behaviour.
    - **Unusable input:**
      - a width that is not positive gives the 100 px threshold, never 0, and no fade;
      - a non-finite offset gives 0 offset and opacity 1;
      - non-finite activation input stays pending.
    - **Activation, as encoded:**
      - `activate` needs |dx| ≥ 10 and |dx| ≥ 1.5 × |dy| (both inclusive) in an allowed direction;
      - the same in a forbidden direction is `forbidden` and never activates. Whether the candidate then keeps waiting or is dropped is left to S2 (review item);
      - `drop` is total travel ≥ 10 px without dominance, so a vertical move lets the browser scroll.
    - **Tests:** `swipe.test.ts`, 111 tests, table-driven, with no fake timers or pointer stubs. They cover all six positions, the pointer types, every activation, clamp, distance, window, velocity-sign and opacity boundary, the release decision, protected targets in normal and custom-like content, the root exclusion, and selection inside, across and outside the toast.
    - **Mutations:** 24, each detected and restored:
      - mouse accepted; pen rejected;
      - left and right swapped; centre one-way; an RTL-style sign inversion;
      - slop `>` instead of `>=`; dominance `>` instead of `>=`; dominance weakened to 1.2;
      - no clamp; `max` instead of `min`; distance `>`;
      - velocity threshold ignored; velocity sign ignored; sign agreement ignored;
      - window ignored; a stale sample included; a division by zero elapsed time;
      - OR made AND; no opacity clamp; a 0 threshold for an unusable width;
      - the root classed as interactive; `containsNode` used;
      - `drop` never returned; a forbidden direction activating.
    - **Validation:** `format:check`, `lint`, `typecheck`, `typecheck:demo`, the full suite (37 files, 1,432 tests) and `validate:package` all pass. Nothing else in `src/`, no stylesheet, script, package file or the prototype changed. S2 is next.
  - **S2, drag and cancel (done):** the toast's native listeners, activation, capture, the `swipe` reason, the CSSOM writes, `data-swiping`, the stylesheet's swipe rule and `touch-action`, and the targeted guard narrowing (decision 6). No dismissal yet, and no P-19 change. Render-count, StrictMode, pause-overlap and cancel tests. Manual checkpoint.
    - **Review decisions on S1, locked for S2:**
      - **A, forbidden direction:** `forbidden` keeps the candidate pending, measured from the original `pointerdown` origin and never re-based, so reversing into the allowed direction can still activate. Until then there is no capture, pause, `data-swiping`, movement or opacity. `drop` (vertical arbitration won) abandons the pointer for good.
      - **B, slop:** activation needs a horizontal |dx| ≥ 10 px, with |dx| ≥ 1.5 × |dy|; only dropping uses total travel ≥ 10 px. So dx 9, dy 5 stays pending. S1 is unchanged.
    - **Architecture:**
      - `src/react/useSwipe.ts` (internal): a per-root controller in a closure, created by `useSwipe(ref, id, position, phase)` in `ToastItem`. It runs after the toast's focus-restoration and `inert` layout effect.
      - Native `pointerdown`, `pointermove`, `pointerup`, `pointercancel` and `lostpointercapture` listeners on the root only, with no window or document listener. They are added once per root and toast, and removed on dispose.
      - A layout effect reports phase changes. The decisions are `swipe.ts`'s, which gains one pure helper, `translationOf` (the X and Y of a resolved transform), with tests.
    - **Gesture:**
      - A `pointerdown` makes a pending candidate only when the committed `data-phase` is `visible`, the pointer is touch or pen, no gesture is owned, the target is not protected and no selection intersects. Nothing else changes.
      - Activation re-checks the phase and the selection, then:
        1. reads the root's current visual X and Y from its computed transform, so activating mid-snap-back or mid-reposition causes no jump;
        2. takes pointer capture on the root;
        3. sets `swipe` once;
        4. writes the internal properties;
        5. sets `data-swiping="drag"`.
      - A move re-bases on the activation point, clamps with `allowedOffset`, keeps samples from the last 100 ms for S3, and writes `--ret-swipe-x` and `--ret-swipe-opacity` through CSSOM. No React state, store call, timer or `requestAnimationFrame` is involved.
      - Release, `pointercancel` and the root's own loss of capture all spring back in S2. Ownership ends first, then `swipe` clears, then capture is released.
      - A second pointer can neither move, end, unpause nor take the gesture.
      - A descendant's bubbled `lostpointercapture`, another pointer's loss, and the loss after a handled release are all ignored.
    - **Stylesheet:**
      - `:where(.ret-toast) { touch-action: pan-y }`.
      - `:where(.ret-toast[data-swiping='drag'])` sets `transform: translate(var(--ret-swipe-x, 0px), var(--ret-swipe-y, 0px))`, `opacity: var(--ret-swipe-opacity, 1)` and `transition-property: none`.
      - `:where(.ret-toast[data-swiping='settle'])` sets `transition-property: transform, opacity` on P-19's 200 ms reposition timing (D2 decision 5).
      - The rules sit after the reposition transition and before the reduced-motion block, whose existing `transition-duration: 0s` makes the snap-back instant by order alone.
      - At rest neither rule applies, so the root has no transform. The swipe properties are only read, with fallbacks, never declared: they are not tokens, and the set stays at 30.
      - `scripts/check-styles.js` gains a separate internal-attribute list, `data-swiping`, allowed only in a `.ret-toast` compound. The documented list is unchanged, so the public contract does not grow.
    - **Snap-back:** cosmetic. It is cleared on the root's own `transform` `transitionend`, or after the resolved transition time plus 50 ms, or at once when nothing transitions (reduced motion, jsdom). The pause never waits for it.
    - **A lifecycle change from elsewhere (D0 decision 11):**
      - a pending candidate is dropped;
      - an active drag gives up ownership, its pause and capture. On an exit it keeps `drag` with its offset, so the exit starts from there with no snap-back, and its own reason and a single `onDismiss` stand;
      - any later non-exiting phase, revival included, clears the kept offset.
      - S3 moves that kept state to the release state with no direction.
      - Unmount and StrictMode disposal clear capture, pause, listeners, attribute and properties, and leave a resting root untouched. The last point was caught by P-19's StrictMode seed log.
    - **Tests:**
      - `swipe-interaction.test.tsx`, 51 tests: pending, mouse, pen, slop, forbidden-then-allowed, permanent drop, entering-time and selection-time `pointerdown`, capture and one pause, the visual offset at activation, CSSOM writes and opacity, clamp and crossing zero, centre;
      - zero React commits, store notifications and record changes over 100 moves; no progress fill remount or re-time; no notification at all for a persistent toast;
      - release never dismissing, pause cleared before the snap-back ends, snap-back cleanup, reduced-motion immediacy, other pause reasons kept, `pointercancel`, a new gesture;
      - the four lost-capture cases, a second pointer, protected targets in normal and custom content, the root swipeable, close, action and body click unchanged;
      - foreign exit and revival, unmount, throwing and missing capture APIs, StrictMode.
      - `styles.test.ts` adds 9 swipe tests and one stylesheet-check case (the internal hook off the root fails), and narrows five guards to the two swipe rules. `swipe.test.ts` adds 6 `translationOf` tests.
    - **Mutations:** 28, each detected and restored:
      - the descendant-loss filter, the lost-capture pointer ID;
      - mouse accepted, forbidden dropping, drop not permanent;
      - pause at `pointerdown`, pause kept after release, no capture;
      - no phase or selection check at `pointerdown`, no protected-target check;
      - a second pointer stealing, moves ignoring the pointer ID;
      - no clamp, no re-base, the computed offset ignored;
      - a foreign exit snapping back, revival keeping the offset, dispose keeping the pause;
      - the settle never cleaned, a descendant's `transitionend` ending it, release committing;
      - in CSS: the drag transition kept, no `touch-action`, settle without opacity, a reduced-motion override losing, a transform at rest.
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (38 files, 1,499 tests), `validate:package` and `build:demo` all pass.
    - **Manual checkpoint** (headless Chrome 154, the demo with `?production-css`, trusted CDP touch and mouse input, 412 px mobile metrics):
      - a touch drag follows (x 110 px, opacity 0.73) with real capture held past the descendant's loss;
      - release springs back over about 200 ms and is at rest with no inline style at about 250 ms;
      - a mouse drag does nothing; a 300 px drag still springs back; a vertical drag never starts one; a tap on close dismisses;
      - with emulated reduced motion the drag still tracks and a cancel is at rest on the next frame.
      - This is Chromium evidence only: no real device was used for S2.
    - **Left to S3:** commit and fly-out, the release state, the P-19 composition (a reposition during a drag still uses P-19's vertical-only seed), and moving the kept foreign-exit offset to the release state.
  - **S3, commit, exit and P-19 composition (done):** the commit, the fly-out, revival clearing the offset, decision 11, and the authorised P-19 changes (decision 8), with P-18 completion untouched and P-19's suites still passing. Manual checkpoint.
    - **Commit.** On an active `pointerup`, the lift point is the gesture's last move; then S1's `releaseDecision` (distance **or** valid velocity, D2 decisions 2 and 3) decides. No commit keeps S2's snap-back. A commit, in this order: ownership ends; `dismiss(id, "swipe")`, while `swipe` still holds the timer; only `swipe` clears (the toast is already exiting, so it is never held and the clear notifies nobody); capture is released; the release state starts. There is no snap-back, no `transitionend` wait and no timer. If another dismissal won first, the store keeps its reason, so `onDismiss` runs once. `pointercancel` and a lost capture never commit.
    - **Release state.** `data-swiping` is `drag` (direct manipulation), `settle` (a cancel returning to rest) or `release` (exiting from the swipe offset), all internal. A release sets `--ret-swipe-x` to the current offset and `--ret-swipe-y` to 0, keeps the swipe opacity, and, for a commit only, sets the new internal `--ret-swipe-travel` to `direction × 0.6 × width` (`releaseTravel`, `SWIPE_RELEASE_WIDTH_FRACTION`, width measured at activation). A foreign exit during a drag (D0 decision 11) enters the same state with no travel and its own reason: no snap-back, no `dismiss(id, "swipe")`. Revival or unmount clears it; nothing else does.
    - **Stylesheet.** `:where(.ret-toast[data-swiping='release'])` sets `transform: translate(calc(x + travel), y)`, `opacity: var(--ret-swipe-opacity, 1)` and `transition-property: transform` on `var(--ret-exit-duration)` and `var(--ret-exit-easing)` (120 ms and `cubic-bezier(0.4, 0, 1, 1)` today, no second value). Opacity is never transitioned on a release, so P-18's exit fades from the partly faded swipe value (D2 decision 9). The reduced-motion block gains one rule, ordered after it, that drops the travel (`translate(x, y)`); the block's existing `transition-duration: 0s` makes it instant. No `!important`, no new token (30), `data-swiping` still internal and root-only, and `check-styles.js` is unchanged.
    - **Lifecycle.** P-18 is untouched: the exit keyframes, the filtered root `animationend`, the computed fallback and the reduced-motion 0 ms path complete the toast. The release adds no listener; a `transitionend` removes and clears nothing.
    - **P-19 composition (D2 decision 12).** `reposition.ts` replaces `translateYOf` and `currentOffsetOf` with `currentTranslationOf`, which reads X and Y through `swipe.ts`'s `translationOf` (`matrix()` 4 and 5, `matrix3d()` 12 and 13, anything else (0, 0)); the module still writes no style. `useStackReposition` reads everything first: for each moved root, `draggedYOf` (a style read of the internal swipe Y, defined only under `drag`) or else the computed X and Y. Then it writes: a dragged root gets no seed, only its swipe Y plus the displacement (Freeze Y); every other moved root is seeded with `transition-property: none` and `translateY(Y + d)` when X is 0, exactly as before, or `translate(X, Y + d)` otherwise. The one list flush follows only when something was seeded, then both inline declarations go and the stylesheet target resumes (`none` at rest and while settling, the fly-out while releasing).
    - **Activation** is S2's: it reads the computed matrix part-way through any transition, so a swipe that starts mid-reposition freezes the current visual Y.
    - **Tests:**
      - `swipe-interaction.test.tsx`, 74 (+23): pointer events now carry explicit `timeStamp`s. Distance at, above and below the threshold at 200, 250-capped, 300 and 400 px widths; velocity at exactly 0.4 px/ms, below it and outside the window; a forbidden or disagreeing velocity; centre both ways; edge-only commits; one `dismiss(id, "swipe")` and one `onDismiss("swipe")`; dismissal observed while `swipe` still holds, with hover kept and no `data-paused`; capture released and the loss after it ignored; boundary-only notifications over 100 moves; release from the lift point at the current offset and opacity with 0.6 × width travel; no settle on a commit; Y reset; `transitionend` ignored; completion by `animationend` and by the fallback; the reduced-motion 0 ms path never settling; revival clearing a release; custom toasts; a foreign exit releasing with its own reason (programmatic, close, action, dismiss-all). S2's "every release springs back" test became the below-threshold cancel.
      - `swipe-composition.test.tsx`, 13, new: a layout stand-in plus a model of the composed computed `transform`, checking each moved root is exactly where it was on screen at the switch. Activation at rest and mid-reposition (D1 B); insertion at top and bottom stacks and a neighbour's removal during a drag (C, F, G); several changes accumulating, with an ordinary neighbour seeded exactly as before and one flush; a cancel after a frozen drag; a reposition during a snap-back (D) and during a fly-out (E) keeping X; a foreign exit with a reposition during it; X never written as 0 at four positions; the same writes under StrictMode.
      - `styles.test.ts`, 214 (+4): the release rule, its token timing, no opacity transition with P-18's exit still running, and the reduced-motion no-travel rule and its order. Five guards are narrowed to name the release rules.
      - `swipe.test.ts`, 126 (+9): `releaseTravel`, the locked 0.6, `draggedYOf`. `reposition.test.ts`, 88 (+2): the former vertical-only matrix cases, all kept, now read X and Y.
      - P-18 (`motion-lifecycle`, `motion`), P-19 (`reposition-render`, unchanged, byte-identical seeds) and P-20 suites pass unchanged.
    - **Mutations:** 29, each detected and restored: distance OR made AND; dismiss after the pause clear; travel sign flipped; travel omitted; travel ignoring width; P-19 X discarded at the read and at the seed; a dragged root seeded; Freeze Y made follow-layout; an extra flush for drag-only moves; `draggedYOf` ignoring the state; a foreign exit snapping back, travelling, or dismissing as swipe; `transitionend` completing the lifecycle; capture kept; `swipe` never cleared; Y not reset; the release starting at 0, reported as `settle`, or snapping back; the lift point untracked; the decision ignored; revival keeping a release; travel not cleared; and in CSS an opacity transition on release, the reduced-motion travel kept, a hard-coded duration, and the travel omitted.
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (39 files, 1,550 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
    - **Manual checkpoint** (headless Chrome 154 on Windows, the production demo with `?production-css`, trusted CDP touch and mouse, 412 × 915 mobile metrics, a 360 px toast, every frame sampled):
      - a slow 50 px release springs back in about 200 ms and is at rest with no inline style; a mouse drag and a forbidden-direction drag do nothing;
      - a distance commit at 130 px dismisses with `swipe`: X continues outward 130 → 333 px while P-18's opacity falls 0.68 → 0.03, removed at about 134 ms; flicks of about 40 px at 0.55 px/ms commit, and one at about 0.42 px/ms by the listener's estimate did not (the controller's own window starts at activation; near-threshold, as D1 recorded for CDP cadence); centre commits both ways;
      - reduced motion: the drag tracks, a commit shows no travel and is removed on the next frame, a cancel is at rest at once;
      - composition: an ordinary P-19 insertion moves at most 19.6 px per frame, and no swipe scenario exceeds that. Activation 60 ms into a reposition froze Y at 78.4 px (layout target 80) with a 0 px step; insertion and neighbour removal during a drag kept X 50 px and Y with a 0 px step; a reposition during the snap-back continued X from about 40 px; a reposition during the fly-out kept X moving outward, never backward (no 142 px jump); a foreign dismissal mid-drag, with a reposition during the exit, kept X within 50–52.5 px (P-18's scale) and reported `programmatic` once.
      - **D2 timing checkpoint passed:** the 0.6-width travel over the 120 ms exit, in real-speed screencast frames and a ×10 slow strip (the public `--ret-exit-duration` set to 1200 ms, which times both), reads as a continuous outward fling that is mostly faded before it covers the far half. No value was tuned.
      - Chromium evidence only. No real device was used for S3.
    - **Limitations:**
      - A reposition during a fly-out restarts its transition from the seed with the full exit duration and easing, so X holds for about one frame before accelerating again, and the toast is removed before reaching the target. Cosmetic, inside the D2 algorithm, and continuous.
      - A foreign release, like a commit, takes Y to 0 over the exit duration, so a toast frozen by a drag glides to its layout place while it fades (D2 decision 11's reconciliation).
      - The composition tests model the browser's computed transform; the real interpolation evidence is the Chromium checkpoint above, and P-22 owns cross-engine proof.
  - **S4, hardening (done):** reduced motion, RTL, custom toasts and the race matrix, with mutations. Manual checkpoint.
    - **S3 real-device checkpoint.** Before S4, the maintainer checked the production S3 swipe dismissal on iPhone Safari and on Android Chrome: the successful dismissal and the 120 ms, P-18-bound fly-out looked and felt good on both, and no tuning was requested. This is an overall visual and interaction sign-off, not per-scenario browser proof; the P-22 carry-forwards stand.
    - **Reconciliation.** Every D0 decision (1 to 17, the performance and public-surface rules) and every D2 decision (1 to 19) maps to production code and to tests; none is contradicted, and none was reopened. The gaps were integration coverage only (RTL, the six positions, the race matrices, focus restoration, composition edges), plus one defect:
      - **Fixed:** a toast revived while its cosmetic snap-back was still running kept `data-swiping="settle"`, its timer and its `transitionend` listener for up to about 250 ms (D2-20 item 23). A non-exiting phase change now clears an unfinished settle as it already cleared a release (`useSwipe.ts`, one condition). A settle that an exit interrupts still carries on home, so nothing jumps.
      - **Checked, not changed:** a dismissal during the snap-back, whose rule still transitions opacity. In Chromium the exit fades exactly as a plain dismissal (opacity 1, 0.966, … 0.043 over the same frames), so P-18's fade is not overridden there; other engines are P-22's.
    - **Hardened and tested** (`swipe-hardening.test.tsx`, 111, new; `swipe-composition.test.tsx`, 29, +16):
      - **RTL and positions:** all six positions × both directions × `ltr` and `rtl` (document and ancestor): only the physical edge directions commit, with physical travel; forbidden directions never activate.
      - **Custom toasts:** root, text and non-interactive descendants swipe and dismiss with `swipe`, with no wrapper; nested button, link, input, editable content, an ARIA widget and an explicitly focusable descendant never start one; a persistent custom toast swipes.
      - **Eligibility and phases:** finite (with progress), persistent and loading toasts swipe; queued (not rendered) and just-exiting toasts never start; a phase change between `pointerdown` and activation aborts; a candidate dropped by an exit never returns when the toast is revived under the same pointer.
      - **Selection:** a selection crossing into the toast blocks; a collapsed one does not; one that appears between `pointerdown` and activation drops the candidate; one made after activation adds no cancellation rule.
      - **Protected targets:** a control removed or reparented (outside the toast or onto the root) mid-sequence never becomes swipeable, and close still works.
      - **Capture and cancel:** late losses, cancels, pointerups and another pointer's events after a commit change nothing; `pointercancel` while pending, active or at the activating move never dismisses; a cancel after a foreign exit or another pointer is harmless; an unmount or a root that lost capture with its node cleans up once.
      - **The `swipe` reason:** through a module pass-through spy, set once and cleared once per gesture across cancel, `pointercancel`, lost capture, commit, foreign exit and unmount with every late event; never touched by a pending candidate, a mouse or an idle unmount.
      - **Multiple pointers and toasts:** touch and pen in all four orders; a second pointer cannot activate, add velocity samples, unpause, release capture or commit, and a new pointer starts normally afterwards. Two toasts can be swiped at once by two pointers, with state, pause and capture local to each; a neighbour then swipes normally.
      - **Lifecycle matrix:** pending, drag, settle and release × close, action, programmatic, dismiss-all, timeout and relocation (24 cases), plus in-place updates in each state: the reason already chosen wins, `swipe` only when it committed first, `onDismiss` once, no snap-back from a drag, and no stale pause, capture, state or properties at the end. A relocation of an exiting toast becomes `relocate`, a swipe's exit included: existing §14 store semantics.
      - **Countdown:** it runs while pending and a timeout drops the candidate; an active drag holds it past its old deadline; a cancel resumes the folded remainder to the millisecond; another reason keeps it held; a last-moment commit keeps `swipe`.
      - **P-20:** `data-paused` only while active, never while pending or exiting; the fill restarts only at the run boundary.
      - **P-16:** a swipe of a toast holding focus restores focus to the same place as a programmatic dismissal, and the toast is `inert`. The hotkey, Escape and focus suites pass unchanged.
      - **P-18:** a child, a foreign name and the wrong names never complete a release; its own exit does. **Reduced motion:** cancel, commit and foreign exit end at once with the normal reasons, never through a settle.
      - **Revival:** after a foreign exit, a cut-short settle, an interrupted capture and a release, the revived root starts clean, no stale listener or timer acts later, and it swipes again.
      - **P-19 composition:** top and bottom stacks × first, middle and last toast × insertion and removal (12 cases); settle, release and foreign release at both stacks; two simultaneous drags; a promotion (removal and insertion at once). X kept, Y frozen under a drag, at most one flush, ordinary neighbours seeded exactly `translateY`, same roots.
    - **D2-20 accounting:** 1–5 S2 and S4 (capture, cancel and multi-pointer tables); 6–7 S2 (100 moves) and S3; 8 S2 and S4 (call counts); 9 S2; 10 S3 (style) and S4 (Chromium settle check), other engines to P-22; 11–12 S3 and S4; 13–16 S3 and S4 (composition, Chromium); 17 the unchanged P-19 suite and S4's seed check; 18 S3 and S4; 19 S1 and S4 (integration, Chromium); 20 S2 and S4; 21–22 S2 and S4; 23 S2, S3 and S4 (the fix); 24 S2 and S4. None is left to manual evidence alone.
    - **Mutations:** 25, each detected and restored: RTL inverting the directions or the travel sign; the visible-only check removed at `pointerdown` or at activation; the selection check removed at either; the protected-target check bypassed; a descendant's loss or another pointer's loss treated as the root's; a stale pointer moving or ending the gesture, or taking a pending one; the pause guard removed (a duplicate clear); a foreign reason replaced by swipe; no pause during a drag; a stale settle or release surviving revival; dispose or a foreign exit keeping capture, or keeping the pause; a pending candidate kept through a phase change; the reduced-motion travel restored; an opacity transition on release; P-19's X preservation removed; Freeze Y removed. Two first survived (the duplicate clear, hidden by the store's idempotence, and the kept candidate, hidden by activation's re-check) and were killed by the call-count and revival tests above.
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (40 files, 1,677 tests), `validate:package`, `build:demo` and `git diff --check` all pass. Public tokens stay at 30; no API, attribute or `check-styles.js` change.
    - **Chromium checkpoint** (headless Chrome 154, the production demo, trusted CDP touch, 412 × 915): with the demo's RTL switch (toast `direction: rtl`), top-left and bottom-left commit left only, top-right and bottom-right right only, centre both, each with physical travel (±216 px); a custom toast's nested button never starts a swipe and its body does; a selection inside the toast blocks until cleared; with three toasts, a swipe leaves the others untouched and the next swipes normally; five rapid cancels then a commit; a foreign dismissal mid-drag releases (X 45–47.6 px, P-18's scale) with `programmatic`; a toast revived 20 ms into its snap-back is at once free of swipe state, and swipes again; under emulated reduced motion a cancel is at rest at once, a commit shows no travel and goes on the next frame, and a foreign exit goes before the next frame. Chromium only; no phone check for S4, which changes no gesture feel or motion.
    - **Accepted limitations (unchanged from S3):** a reposition during a fly-out restarts its transition, holding X for about a frame; a release glides a frozen Y to the layout during the exit (D2 decision 11).
    - **Carry-forwards:** P-22's P-21 list (below) gains the composition motion and the dismissal during a snap-back in three engines; P-26 and P-29 are unchanged.
  - **S5, reconciliation (done):** the plan, the carry-forwards, full validation, the final manual checkpoint, and removal of `demo/p21/`.
    - **Final reconciliation.** Every D0 decision (1 to 17, performance and public surface) and D2 decision (1 to 19) maps to production code and tests, and all 24 D2-20 regression requirements stay accounted for as in S4. Each is satisfied, or explicitly carried to P-22 (cross-engine proof, scroll arbitration, pen, `inert` with capture, pinch-zoom, composition motion, the dismissal during a snap-back), P-26 (documentation) or P-29 (assistive technology and the operating system's reduced-motion setting), or is an accepted limitation. No unresolved defect, no contradiction, nothing reopened. S4's revival fix is confirmed by its tests: a revival mid-settle starts clean with no stale pause, capture, timer or listener, swipes again, and an exit that interrupts a settle still carries it home. Relocation of an exiting toast stays the §14 store rule, which P-21 does not override.
    - **Prototype removed.** `demo/p21/` (the prototype, its stylesheet and `evidence.mjs`) is deleted, and `demo/index.tsx` is back to its `v2` content: no `?p21` switch, so the whole `demo/` directory equals `v2`. A search for `p21`, the prototype's classes, custom properties, switches and evidence script finds nothing executable; the D1 record above stays as history. The demo build has no prototype chunk (only P-17's stylesheet, which predates P-21), and `?p21` now shows the ordinary demo.
    - **Leakage.** No `console`, `debugger`, TODO, flag, test-only branch, `requestAnimationFrame`, `matchMedia`, window or document access or `!important` in the P-21 production files, and no test imports demo code. The slice tags left in comments (S2, S3, S4) are provenance, as elsewhere in the code.
    - **Public surface.** `src/index.ts`, `src/types.ts`, `src/toast.ts`, the store and `package.json` are unchanged from `v2`; `"swipe"` was already a `DismissReason` and the internal `ToastPauseReason`. Tokens stay at 30. `data-swiping` and `--ret-swipe-x`, `-y`, `-opacity` and `-travel` stay internal, and `check-styles.js` admits `data-swiping` only on `.ret-toast`. No element was added: region, list, toast root and content as before, with no wrapper.
    - **CSS.** Four rules: `drag` (internal X and Y, no transition), `settle` (P-19's 200 ms, `transform` and `opacity`), `release` (exit tokens, `transform` only) and one reduced-motion `release` without travel, ordered after the rules it overrides at zero specificity. Nothing at rest.
    - **Ownership audits** (no runtime change in S5): pending touches nothing; a drag owns only the root's swipe state through native root listeners and CSSOM; cleanup is idempotent and leaves P-19's state alone at rest; P-18 alone completes the lifecycle (its filtered `animationend`, fallback and 0 ms path) and nothing of the swipe's settle or release can; P-19 still reads before it writes, freezes a dragged Y, keeps every other X, flushes at most once and seeds non-swiping roots exactly `translateY`; `swipe` is set at activation, cleared once, after `dismiss(id, "swipe")` on a commit, and never shows an exiting toast as held; P-16's suites pass unchanged. The 100-move test still shows no React commit, store notification, pause or timer change and no progress re-timing.
    - **Spot mutations:** 10, all detected and restored: P-19 discarding X, a foreign exit becoming `swipe`, the dismiss and pause order reversed, an opacity transition on release, a descendant's capture loss cancelling, a stale settle surviving revival, RTL flipping the directions or the travel, the reduced-motion travel restored, and `pointermove` notifying the store.
    - **Production demo smoke** (headless Chrome 154, trusted CDP touch, the default demo and `?production-css`): a cancel is back at rest; a distance commit and a 36 px flick dismiss with `swipe`; centre both ways; a forbidden direction and a mouse drag do nothing; a tap on close and on the action dismiss with their reasons, and a drag from the action does nothing; a custom toast's nested button never swipes and its body does; with the demo's RTL switch (toast `direction: rtl`) top-left still commits left only; under emulated reduced motion a cancel is at rest at once and a commit shows no travel.
    - **Real devices.** S4 and S5 change no gesture feel or motion (S4's runtime fix only clears stale state on revival), so the S3 sign-off on iPhone Safari and Android Chrome stands; exhaustive browser evidence stays P-22's.
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (40 files, 1,677 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
    - **Accepted limitations:** a reposition during a fly-out holds X for about a frame; a release glides a frozen Y to its layout place during the exit.
  - **Pre-publication correction (IMPORTANT-1 of the final review).**
    - **Defect, reproduced before the fix.** A pending candidate holds no capture (D0 decision 14), and a pen has no implicit capture (D1 finding 1), so when a pen's contact ended off the root the root never heard its `pointerup` and the candidate stayed. That pen's hover moves (`buttons` 0) could then activate it: capture, the `swipe` reason, a drag following the hover, and a countdown held indefinitely (a 5 s toast still held after 60 s in jsdom). Six new tests failed against the unfixed code for exactly these reasons.
    - **Rule.** A `pointermove` from the pointer that owns the gesture with `buttons === 0` proves its contact has ended. It never activates, continues or commits a swipe: a pending candidate is dropped (no capture, pause, visual state, dismissal or settle), and an active gesture ends exactly as on `pointercancel` (ownership, then only `swipe`, then capture; the settle or the reduced-motion instant restore; no `releaseDecision`, no dismissal). It is one early check in `onPointerMove`, after the owner check, so another pointer's moves still change nothing. Touch and pen only, as before; D0 and D2 are unchanged.
    - **No new-pointer replacement rule.** A different pointer still cannot take a pending or active gesture. A stale candidate whose pointer never returns over the root stays until the toast leaves `visible`; it holds no pause and can no longer activate, so the only effect is that the toast cannot be swiped meanwhile. Whether pens reuse their pointer ID, and so clear it by hovering back, is engine evidence for P-22.
    - **Tests.** The swipe test helpers now model a contact as browsers report it: `buttons` 1 on `pointerdown` and `pointermove`, 0 on `pointerup` and `pointercancel` (verified unchanged: 214 tests passed with the helpers alone). Seven new tests in `swipe-hardening.test.tsx` (118): a pen hovering after a lift off the root, then a fresh contact swiping; a finite toast timing out normally, with the reason never set; a pending candidate dropped for touch and pen; an active drag past the distance cancelled under normal and reduced motion, with hover kept, capture released once, the reason set and cleared once, and the losses, lifts and moves that follow harmless; a move with no buttons from another pointer ignored while pending and active, and no second pointer taking ownership; stale moves after the cancel ignored and a new pointer starting normally. The 100-move test still passes.
    - **Mutations:** 6, each detected and restored: the check removed; a pending candidate kept; an active gesture ignoring it, dropping it without cleanup, or committing on it; another pointer's move ending the gesture.
    - **Chromium** (headless Chrome 154, the production demo, CDP touch and CDP-synthesised pen): touch and pen contact report `buttons` 1 on `pointerdown` and `pointermove` and 0 on `pointerup`, and both still commit normally; a synthesised pen lifted just below the root reached it with `pointerdown` only, then hover moves with `buttons` 0 activated nothing; an active pen drag at 140 px cancelled on a move with no buttons and settled with no dismissal; with focus emulated, both toasts timed out normally once the pen's press-focus left the root. That press focusing the root (P-15's focus-within reason) is the existing pointer-focus behaviour carried to P-22. Real pen hardware was not tested.
    - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, the full suite (40 files, 1,684 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
    - **Real devices.** After the correction, the maintainer's smoke test of the production demo passed on iOS and Android, swipe-to-dismiss included, with no tuning or change requested.
    - **MINOR-1, carried forward:** `protectedTarget` walks from `event.target`, so an interactive element inside a shadow root in custom content is retargeted to its host and not detected. Not fixed here; recorded for P-22 and P-26.
  - **Then:** a focused publication review, then the PR into `v2`, CI and a merge commit.
- **D1 record: prototype, machine evidence and real-device sign-off.**
  - **Prototype:**
    - `demo/p21/`, reached only through `?p21` in `demo/index.tsx`, which then mounts the prototype instead of the demo and skips the P-17 prototype stylesheet.
    - It imports nothing from `src/` and uses `p21-` classes, never `ret-`. S5 removes it.
    - It is a self-contained fixed stack that models the three layers on one root:
      - P-18-like keyframes on the individual `opacity`, `translate` and `scale`, with the token defaults (180 ms in, 120 ms out), completing on the root's filtered `animationend` or a computed fallback (+100 ms), or at once when no animation runs;
      - P-19-like membership repositioning with switchable seeding: `production`, a copy of the shipped vertical-only inline `translateY` seed, and `composed`, the candidate below;
      - the D0 swipe: native root listeners; gesture state in a closure; per-move CSSOM writes to internal `--p21-swipe-x`, `--p21-swipe-y` and `--p21-swipe-opacity`; the internal `data-swiping` (`drag`, `settle`, `release`) consumed by stylesheet rules into the root `transform`; and `touch-action: pan-y`.
    - Reduced motion is CSS only: the media query, plus an identical local switch for devices that cannot emulate it.
    - There is a ×5 slow-motion switch, a simplified timer with hover and swipe pause reasons, and scheduled actions (insert, neighbour removal, programmatic dismissal and unmount of the swiped toast, bursts) so membership can change under a held finger.
    - A heads-up display and a log show the pointer, gesture phase, X, Y, velocity, the threshold results, the decision and every reposition seed.
    - `demo/p21/evidence.mjs` drives the prototype over the DevTools protocol with trusted touch, pen and mouse input, and samples every frame. No `requestAnimationFrame` drives the gesture; the evidence sampler alone uses it.
  - **Candidate constants, as prototyped. D2 (below) locks them; it bounds the fly-out by P-18's exit duration instead of this 200 ms.** All can be edited live, and they persist in the URL:

    | Constant             | Candidate                                                                                                                                                                    |
    | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Activation slop      | 10 CSS px from `pointerdown`                                                                                                                                                 |
    | Horizontal dominance | \|dx\| ≥ 1.5 × \|dy\| at the slop; otherwise the candidate is dropped                                                                                                        |
    | Distance threshold   | `capped`: min(0.4 × toast width, 100 px). `fixed` (80 px) and `fraction` (0.4 × width) stay selectable for comparison.                                                       |
    | Velocity             | Signed physical px/ms over the samples in the last 100 ms before release; it commits at ≥ 0.4 px/ms (400 px/s), in an allowed direction and the same direction as the offset |
    | Opacity              | Linear from 1 to a 0.3 minimum, reached at 0.8 × width                                                                                                                       |
    | Snap-back            | 200 ms, `cubic-bezier(0.2, 0, 0, 1)` (P-19's reposition timing)                                                                                                              |
    | Fly-out              | A further 60% of the toast's width, 200 ms, `cubic-bezier(0.4, 0, 1, 1)` (P-18's exit easing)                                                                                |
    | Tracking origin      | The activation point, re-based on the current visual X, so activation causes no horizontal jump                                                                              |

  - **Machine evidence** (headless Chrome 154 on Windows, 412 × 915 mobile metrics, touch emulation, CDP-dispatched trusted input; Chromium only, not a device):
    - **Activation and tracking.** A body drag activates past the slop, takes capture, sets `data-swiping="drag"` and the `swipe` reason (alongside `hover`, which touch already sets on the stack, P-15), and follows the pointer: `--p21-swipe-x` 45 px and opacity 0.889 at a 50 px move. Before activation there is no swipe state, capture or reason.
    - **Cancel.** Below the threshold: `settle`, and the `swipe` reason clears at release, not after the transition. The root returns to `transform: none` and opacity 1, with no inline transform left.
    - **Commit.** A distance commit at x = 135 px gives `exiting (swipe)`, the reason clears after `dismiss`, removal comes on `animationend`, and `onDismiss(swipe)` fires exactly once. A 45 px flick at about 488 px/s commits by velocity at x = 30 px.
    - **Direction.** A forbidden direction clamps X to 0 and never commits. Centre positions commit both ways.
    - **Scrolling.** A vertical drag on a toast drops the candidate (dx 0, dy −18) and the page scrolls (scrollY 0 → 272). At 45° the candidate drops and the page scrolls (78 px). At 30° and 20° from horizontal the gesture activates and the page does not scroll.
    - **Interactive descendants.** No candidate from the action button, a link, an input, a label's control, `role="button"` or a descendant with `tabindex="-1"` in custom content. Text in custom content swipes normally. A tap on close dismisses with `close-button`. A body click logs no dismissal.
    - **Selection.** An existing selection inside the toast prevents the candidate.
    - **Pointers.** A mouse drag changes nothing: no X, no swipe state, no capture, only the P-15 hover reason. Pen activates and commits. A second touch on the owned toast is ignored and its lift leaves the gesture running. `pointercancel` restores. Moving far outside the toast keeps driving X under capture. Releasing capture mid-gesture cancels and restores. The `lostpointercapture` that follows every normal `pointerup` is ignored.
    - **Timer.** With a 600 ms auto-close, a toast held by `swipe` (and `hover`) for 1200 ms does not expire. After release it times out normally.
    - **A lifecycle change from elsewhere (D0-11).** A programmatic dismissal mid-drag aborts the gesture, clears `swipe` and keeps the offset (mx 52.5 → 58.3 into the exit, with at most 0.11 px horizontal change per frame). The exit runs with reason `programmatic`, and `onDismiss` fires once.
    - **Root identity.** Every scenario keeps the same root, and no wrapper is used.
  - **P-19 composition** (×5 slow motion: reposition 1000 ms, exit 600 ms; "step" is the largest frame-to-frame change):

    | Scenario                                  | Composed, freeze under drag (candidate)                                                                                   | Composed, follow layout under drag               | Production seeding (vertical only)                                   |
    | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
    | A: activate at rest                       | no jump (Δtop 0)                                                                                                          | same                                             | same                                                                 |
    | B: activate mid-reposition                | current visual Y frozen (−19.94 px, identical before and after activation); top step 1.7 px, the ordinary transition rate | same                                             | same (activation is P-21's)                                          |
    | C: insertion while dragging               | X kept at 50 px; Y frozen (−74 px correction), top step 0; on release both carried home (top 4.9, left 3.3 px per frame)  | X kept; **74 px vertical jump** under the finger | X kept (the drag rule wins once the seed is removed); **74 px jump** |
    | D: insertion during snap-back             | X continuous (seed (19.6, −74), mx step 3.9 px)                                                                           | same                                             | **X erased: 19.6 px jump** (seed (0, −74))                           |
    | E: insertion during fly-out               | X continuous (mx step 3.4 px), removed once                                                                               | same                                             | **X erased: 142 px jump**                                            |
    | F: bottom stack, insertion while dragging | Y frozen (+74 px), top step 0, X kept                                                                                     | —                                                | —                                                                    |
    | G: neighbour removal while dragging       | Y frozen (+74 px), top step 0, X kept, same root                                                                          | **74 px jump**                                   | **74 px jump**                                                       |

    The composed design meets every D0-8 requirement. Shipped P-19 seeding unchanged would erase a settling or flying swipe, as the D0 review found. Freezing Y under the finger is the only policy without a vertical jump; it is the candidate, and the maintainer judges its feel on devices.

  - **Candidate seeding and composition algorithm, for S3.** P-19's reads-then-writes order is kept:
    1. **Reads.** As today: each root's anchored distance, and for each moved root its displacement `d` (P-19 D2, decision 3). For each moved root, also read `data-swiping` and either:
       - for `drag`, its inline internal swipe-Y value (a style read, no layout); or
       - otherwise, both components of its computed matrix: X and Y from `matrix()` indices 4 and 5, or `matrix3d()` indices 12 and 13. This replaces `translateYOf` with an X-and-Y reader; anything else reads as (0, 0).
    2. **Writes:**
       - a `drag` root is **not seeded**. Its internal swipe-Y becomes Y + `d`, so it stays under the finger and reaches its layout place through the release transition;
       - every other moved root is seeded with inline `transition-property: none` and `transform: translate(X px, (Y + d) px)`. For a root that is not swiping, X is 0 and the matrix equals today's `translateY(Y + d)`, so non-swiping repositioning is unchanged.
    3. **One forced layout** for the list, as today.
    4. **Remove both inline declarations.** The stylesheet target then resumes, and the transition carries both components: `none` at rest and in `settle`, or the fly-out target in `release`.
    - **P-21's side:**
      - **Activation** reads the computed matrix (current visual X and Y, part-way through any transition), writes both into the internal properties, and then sets `drag`, whose rule turns the transition off. The computed transform is unchanged, so nothing jumps.
      - **Cancel** sets `settle`: no transform rule, so `none`, with the snap-back transition on `transform` and `opacity`.
      - **Commit** sets swipe-Y to 0, the fly direction and `release`, so the fly-out also completes any interrupted reposition.
      - **A foreign exit** sets `release` with a zero direction, which keeps X.
  - **P-18 composition** (×1):
    - At release, X is 127.5 px and opacity 0.687, the swipe value.
    - The exit animation's opacity starts from it: 0.645, 0.508, 0.297, 0.030 over about 150 ms. It is not reset to 1.
    - Opacity must **not** be transitioned on `release`: a running transition outranks an animation in the cascade and would override P-18's exit fade. It is transitioned only on `settle`, where no lifecycle animation runs.
    - `scale: 0.98` scales the transform's offset. At mx 224.5 px the measured left edge is 263.65 px, against 264.5 px unscaled, with the scaled offset about 4.5 px short. That is 2% of the offset, against the fly-out direction, while the toast is under 0.3 opacity, and the edge still moves outward every frame. **Provisionally acceptable**; the devices confirm.
    - The visible fly-out is bounded by P-18's exit: the toast is removed when the 120 ms exit ends (about 150 ms with event timing), so about 90 px of the 213 px travel is seen. D2 should size the fly-out to the exit token rather than lengthen the exit.
  - **Reduced motion** (emulated `prefers-reduced-motion: reduce`):
    - The drag still tracks (X 127.5 px).
    - A cancel is at rest on the next frame (X 0, opacity 1).
    - A commit shows no travel (mx 135 unchanged) and is removed on the next frame through the 0 ms path.
    - Repositioning is instant.
    - No JavaScript reads the preference: the display's "rm" field is diagnostics only.
  - **RTL** (`dir="rtl"`): top-left commits left only, top-right right only, and top-centre both ways. Only the mirrored content layout changes, so the controls move to the left; the directions do not.
  - **Findings for production:**
    1. **`lostpointercapture` bubbles from the touched descendant.** Touch is implicitly captured by the element first touched. When the root takes explicit capture at activation, that descendant fires `lostpointercapture`, which bubbles to the root. Without a `target === root` check, every touch gesture was cancelled about 20 ms after activation. S2 must handle only the root's own loss and test it. Pen through CDP had no implicit capture, which is why it passed first.
    2. **Specificity.** The prototype's first reduced-motion rule lost to the more specific name rules, so the exit still animated under emulated reduced motion. The library's zero-specificity `:where()` rules decide by order, so S2 and S4 must keep the swipe and reduced-motion rules ordered after the rules they override, and test the computed result.
    3. **Opacity transition on release** (P-18 composition, above).
    4. **The fly-out is bounded by the exit duration** (above).
    5. **A 45° dead zone:** at 45° Chromium scrolled while the candidate dropped. Steep diagonals scroll and shallow ones swipe. The devices judge the 1.5 dominance ratio.
    6. **Touch already sets stack hover (P-15):** during a touch swipe, `swipe` is in practice an overlapping reason. This is as D0 expected and changes nothing.
  - **Limitations:**
    - This is machine evidence from one engine with emulated touch. CDP input cadence (about 25–30 ms per move) understates real flick velocities, so **no threshold has a feel judgement yet**.
    - Not observed: pinch-zoom, long-press selection, the iOS and Android scroll handoff, real pen, and a real operating-system reduced-motion setting.
    - The prototype's timer models only hover and swipe, and has no ResizeObserver.
    - The prototype's custom properties use `p21-`; S2 names the production ones under `--ret-`.
    - `requestAnimationFrame` coalescing is not needed in this evidence: per-move CSSOM writes kept up. Devices may say otherwise.
  - **Real-device sign-off (done).** The maintainer tested the prototype on iPhone Safari and on Android Chrome, with the candidate values above, and approved it on both: the overall interaction looked and felt good. The maintainer reported no issue with activation, scrolling, the thresholds, the velocity flick, the wrong-direction behaviour, the snap-back, the opacity or the swipe as a whole, and asked for no adjustment of any candidate value. This is approval of the overall interaction and feel on both required platforms. It is not a scenario-by-scenario browser verification: no per-scenario measurements or browser-specific observations were reported. The P-22 carry-forwards stand unchanged.
- **Decisions locked after the prototype (D2).** They promote the D1 candidates the maintainer approved on both devices, and turn the D1 findings into requirements. They refine D0 and reopen none of it: D1 found no D0 decision invalid. Every constant is a named internal implementation constant (or stylesheet value), not public API, and none is configurable.
  1. **Activation:**
     - Slop: **10 CSS px** of pointer travel from `pointerdown`.
     - Horizontal dominance at the slop: **|dx| ≥ 1.5 × |dy|**. Otherwise the candidate is dropped and the browser keeps the pointer.
     - Every D0 eligibility rule still applies at activation: `touch` or `pen`, `visible`, not from an interactive descendant, and no intersecting selection (D0 decisions 3, 9, 10 and 13).
  2. **Distance threshold:**
     - **`min(0.4 × toastWidth, 100 CSS px)`**, where `toastWidth` is the root's layout width (`offsetWidth`).
     - For example, 200 px → 80 px, 250 px → 100 px, 350 px → 100 px.
     - A distance commit happens when `|offsetX| ≥ threshold`, where `offsetX` is the allowed-direction physical horizontal offset after D0's clamp (decision 2).
  3. **Velocity:**
     - Signed physical horizontal velocity of the pointer, in CSS px/ms, over the pointer samples within the **100 ms** before release: `(x_last − x_first) / (t_last − t_first)` over those samples, using the events' `timeStamp`. With fewer than two samples, or no elapsed time, it is 0.
     - It commits at **≥ 0.4 px/ms (400 px/s)**, only when its sign is a direction the position allows **and** matches the sign of the current allowed offset.
     - The distance **or** a valid velocity commits (§19).
  4. **Opacity:** `progress = min(|offsetX| / (0.8 × toastWidth), 1)` and `opacity = 1 − 0.7 × progress`. That is 1 at rest, falling linearly to **0.3** at 0.8 of the width, and clamped there. It is an internal rule, written per move through CSSOM to an internal custom property (D0 decision 15), with no token and no option.
  5. **Snap-back:**
     - **200 ms** with P-19's reposition easing, `cubic-bezier(0.2, 0, 0, 1)`, both internal stylesheet values (P-19 D2, decision 8). Snap-back transitions `transform` and `opacity`.
     - It is cosmetic. The `swipe` reason has already cleared when the release or cancel was handled (D0 decision 4), and nothing waits for the transition: no `transitionend` dependency.
     - Under reduced motion it takes 0 ms through CSS (decision 17).
  6. **Fly-out duration and the lifecycle bound:**
     - The fly-out fits inside P-18's exit. Its transition duration **is the exit duration**: the stylesheet reads `var(--ret-exit-duration)` rather than repeating a number. The production value, verified at D2 in `src/styles.css`, is **120 ms**, P-18's public token. A consumer override of the token therefore changes the exit and the fly-out together.
     - P-18's lifecycle completion does not wait for the swipe. `transitionend` is never a completion source, and there is no swipe-specific lifecycle timer (D0 decision 7). The D1 prototype's independent 200 ms is not adopted.
  7. **Fly-out distance:**
     - The fly-out continues in the committed physical direction, to a target **0.6 × toastWidth beyond the release offset**, travelled within the exit duration of decision 6.
     - This keeps D1's visual intent with travel that fits the real lifecycle. With the 120 ms exit, the whole 0.6-width travel is now seen, where D1 showed about 90 px of 213 px. S3 and the browser hardening must check that the compressed travel does not look unnaturally fast. If the 0.6-width target proves visually wrong at the real duration, implementation stops and reports before this value changes.
  8. **Fly-out easing:** the exit easing, through `var(--ret-exit-easing)` (`cubic-bezier(0.4, 0, 1, 1)` today). No new motion token. The transform travel and P-18's lifecycle exit share one timing character, as separate mechanisms.
  9. **Opacity at commit:**
     - During direct manipulation, opacity follows the displacement (decision 4).
     - On a successful commit, the swipe opacity is **not** transitioned toward any value. P-18's exit animation becomes authoritative for the exit opacity, starting from the currently resolved, partly faded swipe opacity. Only the transform fly-out transitions.
     - The reason: a running transition outranks an animation in the cascade, so an opacity transition would override P-18's exit fade (D1).
     - This refines D0 decision 15's "may join the cosmetic release transition": opacity joins the snap-back transition only.
     - S3 and S4 need a regression test.
  10. **P-18's scale on the swipe offset.** P-18's `scale: 0.98` also scales the composed transform, which drew the offset about 2% short in D1. This is **accepted** for P-21 unless later browser or manual evidence shows that it materially harms the interaction. P-18 is not redesigned for it. S3 and S4 keep a visual checkpoint.
  11. **Freeze Y under a drag (P-19).** An actively dragged toast stays visually frozen at its current Y while the stack's layout changes around it, and its X stays under the pointer. It never takes its new layout position mid-drag ("follow layout"). On release, cancel or commit, the composed transform reconciles to the latest layout target without a discontinuity. D1 evidence:
      - a swipe that starts mid-reposition keeps the current visual Y;
      - with Freeze Y, an insertion or removal during a drag keeps X and Y;
      - follow layout, and production-style seeding, jumped about 74 px;
      - composed seeding kept X through a snap-back and a fly-out, where production Y-only seeding erased it with visible jumps (about 20 px and 142 px).
  12. **The P-19 composition algorithm: the S3 implementation target.** P-19's reads-before-writes order is kept.
      - **Read phase**, for each root the membership change moved:
        - determine whether it is in an active drag (`data-swiping` in its drag state);
        - for a dragged root, read its internal swipe-Y value, a style read with no layout;
        - for any other root, read both X and Y of its computed matrix (`matrix()` indices 4 and 5, `matrix3d()` indices 12 and 13; anything else reads as (0, 0)), replacing the vertical-only `translateYOf`.
      - **Write phase:**
        - **dragged root:** no inline seed and no write to its `transform`. Its internal swipe-Y gains the displacement, so the toast stays where it is. Its gesture-owned X is untouched;
        - **every other moved root:** inline `transition-property: none` and `transform: translate(X px, (Y + displacement) px)`. For an ordinary root that is not swiping, X is 0 and the matrix equals today's `translateY(Y + displacement)`, so its behaviour is unchanged.
      - **Then:** the existing single forced layout read for the list, and removal of both inline declarations. The stylesheet-owned target resumes (`none` at rest and while settling, the fly-out target while releasing), and the transition carries both axes.
      - **P-21's side:**
        - **activation** reads the current computed matrix, writes its X and Y into the internal swipe properties, and only then enters the drag state, whose rule turns the transition off. It produces no visible jump;
        - **cancel** enters the settling state;
        - **commit** sets the internal swipe-Y to 0, so the vertical component finishes toward the layout during the fly-out, and continues X through the release state;
        - **a foreign lifecycle exit** (D0 decision 11) enters the release state with no travel direction. It keeps the current visual offset, with no snap-back before the authoritative exit.

      This may be adjusted only where the production implementation shows a concrete difference from the prototype. Any material architectural change needs a new recorded decision.

  13. **`lostpointercapture`:**
      - The root's handler treats an event as loss of capture only when **`event.target === root`** and its `pointerId` is the active gesture's.
      - A `lostpointercapture` that bubbles from a descendant never cancels the gesture. Touch is implicitly captured by the touched descendant, which loses capture when the root takes explicit capture at activation. Without the guard, D1 cancelled every touch gesture about 20 ms after activation.
      - S2 has an explicit regression test.
  14. **Cancel and completed gestures:**
      - `pointercancel`, and a genuine loss of the root's capture, cancel and restore an unfinished gesture.
      - The `lostpointercapture` that follows a handled `pointerup` is ignored: the gesture is finished before capture is released.
      - A completed commit is never reverted by a later capture or cancel event.
      - Mutations cover all three.
  15. **Diagonals and scroll arbitration:**
      - The dominance ratio stays at 1.5.
      - In D1's headless evidence, 45° dropped the candidate and the page scrolled, and 30° and 20° activated the swipe. The maintainer's device approval asked for no change.
      - D1 does not prove scroll arbitration in every browser: that stays P-22's.
  16. **`requestAnimationFrame`:**
      - The initial implementation has no `requestAnimationFrame` coalescing. Per-move work stays local gesture bookkeeping plus direct CSSOM writes to internal custom properties.
      - If S2 or S3 device evidence shows measurable jank, implementation stops and reports before adding it.
  17. **Reduced-motion ordering:**
      - The reduced-motion rules for the swipe release (snap-back and fly-out durations, and the fly-out without travel) win by deliberate stylesheet order at the library's zero `:where()` specificity, after the rules they override. There is no `!important`.
      - Style tests prove that a cancel and a commit release take zero time under reduced motion, and that the fly-out has no travel.
      - Direct pointer tracking is unaffected (D0 decision 12).
  18. **Public surface:**
      - no new public TypeScript API;
      - no new public CSS token: the set stays at 30;
      - `data-swiping` and the internal swipe custom properties are implementation details;
      - no wrapper;
      - custom toasts are swipeable;
      - the physical directions do not depend on RTL.
        The fly-out reads the existing public `--ret-exit-duration` and `--ret-exit-easing` (decisions 6 and 8); it adds none.
  19. **The prototype stays** under `demo/p21/`, behind the demo-only `?p21` switch, for comparison through S1 to S4. It is disposable, never package surface, and S5 removes it before publication (done in S5).
  20. **Regression requirements from D1** (in the slice that implements each behaviour):
      1. a descendant's bubbled `lostpointercapture` is ignored;
      2. a genuine loss of the root's capture cancels;
      3. capture loss after `pointerup` cannot undo a commit;
      4. `pointercancel` cancels;
      5. a second pointer cannot take ownership;
      6. zero React renders per `pointermove`;
      7. zero store notifications per `pointermove`;
      8. the `swipe` pause is set only at activation;
      9. the pause clears independently of the cosmetic settle transition;
      10. no opacity transition overrides P-18's exit opacity;
      11. the lifecycle ignores `transitionend`;
      12. P-18's `animationend` and fallback stay authoritative;
      13. activation mid-reposition causes no jump;
      14. insertion or removal during a drag keeps X (and Freeze Y);
      15. a reposition during a snap-back keeps X;
      16. a reposition during a fly-out keeps X;
      17. ordinary non-swiping P-19 repositioning is unchanged in behaviour and seed;
      18. the reduced-motion release takes zero time;
      19. RTL does not change the physical swipe mapping;
      20. a mouse produces no gesture state;
      21. interactive descendants in custom toasts block the gesture;
      22. a selection blocks activation;
      23. revival clears any stale swipe visual state;
      24. detach and unmount clear capture, listeners, the `swipe` reason and the inline and internal visual state.
- **Carry-forwards:** P-22 (automated swipe in three engines, real scroll arbitration, pen, `inert` with capture, pointer-triggered restoration, `touch-action` and pinch-zoom), P-26 (swipe semantics and caveats) and P-29 (assistive technology and the operating system's reduced-motion setting). Each is recorded in its own entry. The maintainer's device approval removes none of them.

### Track E: Verification

**P-22 Browser test suite**

- Scope: Playwright on Chromium, WebKit and Firefox covering §26. Wired into the blocking `browser` job.
- **Status: in progress, the current phase.** D0 (the decision record) and D1 (the capability spike, recorded below) are done, on `feat/p22-browser-qa` from `v2` at `1644671`. D1 raised one D0-16 report; the maintainer approved its fix as hardening slice H1, which is done (recorded below). D1b, the evidence completion before D2, is done (recorded below). D2, the final evidence matrix and implementation plan, is done (recorded below). S1, the infrastructure and the harness, is done (recorded below). S2, lifecycle, motion and reflow, is done (recorded below). S3, layout, RTL, progress and forced colours, is done (recorded below). S4 is in progress: S4.1 raised a D0-16 report before its tests were written; the maintainer approved its fix as hardening slice S4-H2, which is done (recorded below). S4.1, focus restoration and `inert`, is done (recorded below). S4.2, focus-within, `aria-keyshortcuts` and the focus rings, is done (recorded below). S4.3, the focus and environment evidence, is done (recorded below). S4.4, the S4 reconciliation, is done (recorded below): The maintainer accepted and closed S4. S5, swipe, is in progress: S5.1, the harness and cross-engine swipe logic, is done (recorded below). S5.2, trusted Chromium touch, scroll arbitration, capture and motion continuity, is done (recorded below). S5.3, the swipe browser evidence, is done (recorded below). S5.4, the S5 reconciliation, is done (recorded below): The maintainer accepted and closed S5. AC-SW-1's layers A and B are blocking; layer C waits for S6's device checkpoints. S6's preflight found a WebKit failure in a CF-35 test; the maintainer accepted its test-only correction (`6599f24`, the S6 preflight record, below). The maintainer accepted S6.1, the manual QA page (`a73bff8`), after opening it in Windows Chrome, and S6.1a, its 10-minute progress preset (`51290fb`). MC-5 was first recorded in part (the MC-5 record, below); with every case reported, the maintainer accepted it: **MC-5 passed** on the maintainer's visual evidence, with its limitations recorded (the MC-5 final record, below). MC-5 does not complete AC-PR-1's manual layer. MC-6 passed, accepted on the maintainer's real-browser observations under Windows High Contrast (the MC-6 record, below). MC-1, MC-2, MC-3, MC-4, MC-7 and MC-8 stay open; no other manual checkpoint has been run. The maintainer approved the MC-8 checklist; S6.1b, the page's additions for it, is done (recorded below) and awaits the maintainer's review. MC-8 has not been run, and S6.2 (the soak) and S6.3 (the reconciliation) have not started.
- Defects: none. Appendix A assigns no defect to P-22.
- Acceptance: P-22 provides the real-browser proof (§26) of AC-MO-1, AC-MO-2, AC-MO-3, AC-LC-2, AC-PR-1, AC-RTL-1 and AC-SW-1, and adds the blocking `browser` gate to AC-CI-1 (§28). Every other criterion must not regress. D0 weakens no criterion: where D1 shows that part of one cannot be verified by Playwright in an engine, D2 records the gap and the manual checkpoint that covers it. The criterion's wording, and the three-engine requirement of §26, change only by a separate decision recorded in this plan.
- **Starting point (the D0 review, at `1644671`):**
  - No Playwright, browser binaries, browser harness or `browser` job exist. CI has four blocking jobs on Node 24 (P-06).
  - The repository tests with React 18.2. P-23 owns React 19.
  - The demo is the P-17 review harness: without `?production-css` its prototype stylesheet masks the production stylesheet, and P-25 replaces it.
  - ESLint uses `projectService`, so every linted TypeScript file must belong to a tsconfig project, and `typecheck` checks the library, test and tooling projects separately.
  - `protectedTarget` (P-21) walks from the retargeted `event.target` with `contains` and `parentElement`, neither of which crosses a shadow boundary. The swipe tests have no shadow-root case.
  - The P-15 to P-21 checks that jsdom cannot make are listed below, per phase, and indexed as CF-1 to CF-43 at the end of this entry.
- **Decisions locked before implementation (D0).** They govern how P-22 gathers and classifies evidence. They reopen no P-16 to P-21 decision: where they mention earlier behaviour, they describe evidence to gather, not a change.
  1. **D0-1, evidence classes.** P-22 uses four:
     1. **Blocking automated:** a normative product or browser contract that Playwright can verify reliably. A failure blocks the `browser` gate.
     2. **Automated evidence:** browser behaviour that can be collected automatically but is not frozen into a normative CI assertion.
     3. **Manual recorded checkpoint:** behaviour that needs real browsers, devices, operating-system features or hardware that the automated matrix cannot faithfully reproduce.
     4. **Evidence-only observation:** browser behaviour gathered to inform a later decision, without declaring the observed browser quirk to be the product contract.

     A browser quirk never becomes a normative assertion merely because it is observable. Each CF item gets its final class at D2, once D1 has established what Playwright can actually do. The index below records only the constraints D0 already places on some items.

  2. **D0-2, pointer-triggered focus restoration.** P-22 gathers browser evidence for a pointer-triggered close and for a swipe dismissal of a toast that holds focus (CF-8, CF-33). It does not change the §10 and §18 contract on browser evidence alone: the final contract decision waits for P-29's assistive-technology evidence. Unexpected browser behaviour is recorded, not fixed opportunistically.
  3. **D0-3, Shadow DOM and `composedPath()`** (CF-38, P-21 MINOR-1):
     - P-22 first reproduces and characterises P-21's protected-target behaviour for interactive elements inside shadow roots in custom content, in real browsers.
     - `protectedTarget()` is not changed to `composedPath()` pre-emptively.
     - If the evidence shows a material defect, P-22 stops and reports it under D0-16 before any production change. Only a separate maintainer decision may then authorise a narrowly scoped hardening fix.
     - Without an approved production change, P-22 supplies the evidence for the Shadow DOM boundary P-26 documents.
  4. **D0-4, pen pointer-ID reuse and the stale pending candidate** (CF-37):
     - Whether a same-ID `pointerdown` re-bases a stale pending candidate is not decided yet. The decision waits for real pen hardware evidence.
     - P-22 records: implicit pointer capture; `buttons` during contact and hover; barrel-button behaviour where available; pointer-ID reuse across contacts; and the stale pending candidate's behaviour.
     - D0 authorises no production change.
  5. **D0-5, Playwright touch and pen capability.** Nothing is assumed about what Playwright provides in Chromium, WebKit or Firefox. D1 establishes empirically, per engine:
     - trusted touch input;
     - touch dragging;
     - real scroll arbitration;
     - `pointercancel`;
     - pointer capture;
     - pen input;
     - mouse input;
     - the relevant limitations of synthetic events.

     The automated and manual split for CF-29 to CF-37 is finalised only at D2, after D1. D0 does not silently weaken the three-engine coverage that §26 and AC-SW-1 require.

  6. **D0-6, blur, visibility and hidden documents.** D1 determines empirically which engines can provide genuine, or sufficiently representative, window `blur` and `focus`, document visibility changes, hidden-document behaviour, and the return and resynchronisation after it (CF-1, CF-5, CF-25, CF-26). Faked browser state is never described as genuine browser lifecycle evidence. Reliable capabilities may become blocking automation; unsupported cases become manual checkpoints or evidence.
  7. **D0-7, WebKit versus real Safari:**
     - The blocking automated matrix is Playwright's Chromium, Firefox and WebKit.
     - Playwright WebKit is not treated as equivalent to complete Safari validation, and its results are never reported as Safari results.
     - Real Safari is a separate manual checkpoint wherever P-22 needs Safari-specific evidence, for example click without focus (CF-7). Real iOS Safari is a separate real-device checkpoint where relevant.
     - No macOS CI is added solely to present Playwright WebKit coverage as Safari coverage.
  8. **D0-8, forced colours and Windows High Contrast:**
     - Automated coverage uses Chromium's `forced-colors` emulation where applicable (§26).
     - Real Windows High Contrast is a manual recorded P-22 checkpoint. It covers the carry-forwards assigned to it (CF-14, CF-28): the card edge, the action border, the focus rings, the region ring, the recognisability of each type by its icon, and the progress fill with no track.
     - P-26's support documentation must later distinguish emulated forced-colours evidence from real Windows High Contrast evidence.
  9. **D0-9, React version:**
     - P-22 uses the repository's current React 18.2 baseline. React 19 is not introduced solely for browser testing.
     - **Reconciliation with §26,** which says the browser suite runs on the latest React. Throughout P-22 the suite runs on React 18.2. This is a recorded, temporary reading of §26, not a silent change, and §26 itself is unchanged.
     - P-23 owns the React 18/19 compatibility work and the React 19 upgrade and matrix. When P-23 changes the supported React test matrix, it may update the P-22 browser harness.
  10. **D0-10, browser test target:**
      - P-22 uses a dedicated, deterministic browser-test harness that exercises the real production implementation and the production stylesheet.
      - The demo is not the primary target. It carries P-17 review infrastructure, its prototype stylesheet can mask the production one, and P-25 owns its redesign.
      - The packed npm tarball is not the primary target either. Package consumption stays §27's (P-07, P-23).
      - When S1 implements the harness, it is deliberately covered by the repository's lint and typecheck structure, not left as an untyped or unlinted test island.
      - D1 may use disposable spike infrastructure before the permanent S1 harness exists.
  11. **D0-11, timing:**
      - P-22 uses real browser timing.
      - Actual lifecycle events, observable state conditions and bounded tolerances are preferred to arbitrary fixed sleeps.
      - The harness may override the public motion tokens to slow an animation or transition on purpose, for deterministic observation.
      - `requestAnimationFrame` may be used inside the page as an observer and frame sampler. It is never mocked to make timing tests pass (§26).
      - Implementation timing quirks are not frozen into assertions unless they are normative.
  12. **D0-12, CI shape:**
      - One blocking `browser` job with three Playwright projects: Chromium, Firefox and WebKit.
      - The existing hygiene is kept (§28): least-privilege permissions, actions pinned to full commit SHAs, the npm cache, and no permanent debug steps.
      - Failure artifacts and traces are allowed, produced only where they help with failures.
      - The blocking gate uses zero retries. Before merge, separate repeat-run (soak) validation looks for flakiness, rather than masking it with CI retries.
      - D1 and D2 may refine the installation and caching mechanics from measured runtime and Playwright's requirements, but never the three-engine blocking intent.
  13. **D0-13, visual evidence:**
      - P-22 adds no visual-regression suite (§26).
      - Screenshots may be diagnostic artifacts or evidence for manual review. They never become golden-image or pixel-diff assertions.
      - Items that need human visual judgement (for example CF-23, CF-35, and the appearance in CF-13 and CF-27) stay explicit manual checkpoints or evidence.
  14. **D0-14, pinch-zoom and `touch-action`** (CF-34, CF-42):
      - P-21's `touch-action: pan-y` (P-21 D0, decision 16) is kept while evidence is gathered.
      - P-22 records real-browser and real-device pinch-zoom behaviour.
      - The value is not changed to `pan-y pinch-zoom`, or to anything else, merely because engines differ.
      - If evidence shows a material accessibility or UX defect, P-22 stops and raises a separate recorded decision before changing the contract or the production CSS.
      - P-26 later documents the verified boundary.
  15. **D0-15, stale status text.** D0 corrects only clearly stale, factual phase-status metadata in this plan: P-20 and P-21 are merged, and P-22 is the current phase. Historical decisions, closure evidence and completed-phase architecture are not rewritten. Corrected at D0: the P-20 and P-21 status lines.
  16. **D0-16, production defects found by P-22.** P-22 is evidence-first. When browser testing exposes a real production defect, P-22 stops before changing `src/` or the production stylesheet. It reports:
      - the affected browser, engine or device;
      - an exact reproduction;
      - the violated contract or acceptance criterion;
      - the observed and the expected behaviour;
      - the evidence;
      - the likely subsystem or root cause, if known;
      - the smallest plausible fix scope;
      - the regression risk.

      The maintainer's approval is required first. A production fix is then an explicit, separately authorised P-22 hardening slice, with focused regression tests. No opportunistic production fix is allowed.

  17. **D0-17, Node version:**
      - P-22 stays on the repository's current Node 24 baseline.
      - The planned Node 24 → 26 transition (P-06) is not combined with P-22. It stays separate, on its own schedule.
      - If the calendar reaches that transition while P-22 is still active, P-22 stops and asks for a maintainer decision rather than changing Node itself.
- **Sequence.** Each step stops for review:
  - **D0, decision record (done):** this entry. Documentation only.
  - **D1, capability and evidence spike (done, recorded below):** not implementation.
    - It establishes the capability matrix of D0-5 and D0-6 per engine. It also covers what the other decisions depend on:
      - WebKit's click-to-focus;
      - forced-colours and reduced-motion emulation per engine;
      - in-page frame sampling;
      - the first characterisation of shadow-root targets (D0-3);
      - installation, caching and runtime measurements for D0-12.
    - It uses disposable spike infrastructure (D0-10). Nothing from it reaches `src/`, the tests, CI or the package output, and S1 does not inherit it unreviewed.
    - Any production defect it exposes follows D0-16.
  - **D2, lock (documentation only, before S1; done, recorded below):**
    - the final capability matrix;
    - the final evidence class of every CF item (D0-1);
    - the harness design;
    - the timing approach;
    - the CI mechanics;
    - the list of manual checkpoints, with their browsers, devices and hardware;
    - the S slices.
  - **S1 to Sn:** the implementation, defined at D2 and not before (D2 locked S1 to S6, recorded below). Indicatively:
    - infrastructure and the `browser` job;
    - lifecycle, motion and reflow;
    - layout, RTL, progress and forced colours;
    - focus, `inert` and the environment;
    - swipe;
    - the manual checkpoints and the final reconciliation.
  - **Then:** a focused publication review, the PR into `v2`, CI and a merge commit.
- **Boundaries:**
  - **P-23:** React 19, the React 18/19 matrix and the Next.js fixture's Playwright check (§27). P-23 may move the browser harness to the matrix it sets (D0-9).
  - **P-25:** the demo.
  - **P-26:** the documentation of every boundary P-22 verifies: Shadow DOM (D0-3), `touch-action` and pinch-zoom (D0-14), and forced colours, distinguishing emulation from real Windows High Contrast (D0-8).
  - **P-29:** assistive technology; the operating system's own reduced-motion setting; the assistive-technology evidence and the final decision on pointer-triggered restoration (D0-2).
- **D1 record: capability and evidence spike.** Capability discovery, not product validation. Nothing here closes a CF item; D2 locks the classification.
  - **Infrastructure (disposable, removed before this record was committed):**
    - A spike directory in the session's scratch space, outside the repository, with its own `package.json` and `@playwright/test` 1.63.0. Browsers were downloaded into the spike directory.
    - The harness page was bundled with the repository's own esbuild from the real `src/` (React 18.2), and loaded a byte-identical copy of `src/styles.css`. It had an event log, an in-page `requestAnimationFrame` sampler and a capture probe.
    - The root `package.json`, the lockfile, `src/`, the tests, CI, the demo, fixtures and scripts were untouched. No production code was changed to make an experiment succeed.
  - **Environment:** Windows WSL2, Ubuntu 26.04.1, Node 24.21.0, WSLg for headed runs.
    - Engines: Chromium 153.0.8010.12, Firefox 155.0 and WebKit 26.6, all from Playwright 1.63.0.
    - Playwright did not validate this distribution. Without root, the missing system libraries (Chromium needed NSS; WebKit needed GTK 4, GStreamer and ICU) were extracted from the distribution's packages into the spike directory.
    - WebKit's bundled launcher overwrites `LD_LIBRARY_PATH`, so it ran through a spike-local wrapper (`executablePath`). The browser files were not modified.
    - These workarounds are local. CI on `ubuntu-latest` would install dependencies normally; D2 decides how.
  - **Input kinds.** Every result below names the kind of input used:
    - **Trusted Playwright input:** `page.mouse`, `page.keyboard` and `page.touchscreen.tap`.
    - **Trusted protocol input:** Chromium only, through `newCDPSession`: `Input.dispatchTouchEvent` and `Input.dispatchMouseEvent` with `pointerType: 'pen'`.
    - **Synthetic:** script-dispatched `PointerEvent`s, with `isTrusted` false.
  - **Capability matrix.**

    | Capability                                     | Chromium                                                                                                                                                                                                                                                                      | Firefox                                                            | WebKit                                                                                                  | Input kind            | Implication for P-22                                                                                                                                        |
    | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Mouse pointer and drag                         | Yes; trusted `mouse`, `buttons` 1 while pressed, capture works                                                                                                                                                                                                                | Same                                                               | Same                                                                                                    | Playwright, trusted   | "A mouse drag never dismisses" is automatable in all three. The library ignored a 200 px mouse drag in every engine.                                        |
    | Touch tap                                      | `touchscreen.tap()`: trusted `touch`, implicit capture, new `pointerId` per tap                                                                                                                                                                                               | Trusted `touch`, but `pointerId` 0 on every tap (as for the mouse) | Trusted `touch`, the same `pointerId` on every tap; the following `click` reports `mouse`               | Playwright, trusted   | Taps are automatable everywhere. Pointer-ID values and reuse are engine-specific: never assert them.                                                        |
    | Touch drag                                     | Yes, via CDP touch events: trusted pointer and touch events with real capture                                                                                                                                                                                                 | **No.** Playwright's `touchscreen` has `tap()` only                | **No**                                                                                                  | Protocol / none       | Trusted touch swipes are automatable only in Chromium.                                                                                                      |
    | Synthetic `PointerEvent` drag                  | Drives the library's swipe: commits past distance, springs back below it, clamps a forbidden direction. `setPointerCapture` throws `NotFoundError`                                                                                                                            | Same; `setPointerCapture` throws                                   | Same; `setPointerCapture` throws                                                                        | Synthetic             | Gesture **logic** is automatable in all three. It never exercises capture, `touch-action`, scrolling or `pointercancel`, and must be labelled synthetic.    |
    | Vertical scroll from a `pan-y` element         | Yes: trusted `pointercancel`, then real page scroll (0 → 235 px; 325 px from a toast, with no dismissal)                                                                                                                                                                      | Not reproducible                                                   | Not reproducible                                                                                        | Protocol / none       | Scroll arbitration is automatable in Chromium; Firefox and WebKit need real devices.                                                                        |
    | Diagonals                                      | 20° and 30° from horizontal: no scroll, the gesture continues; 45° and 60°: `pointercancel` and scroll (matches P-21 D1)                                                                                                                                                      | Not reproducible                                                   | Not reproducible                                                                                        | Protocol              | The 45° dead zone is observable in Chromium only.                                                                                                           |
    | Pointer capture / `lostpointercapture`         | Real: implicit capture on the touched descendant, then explicit capture on the root; both losses observed                                                                                                                                                                     | Real for mouse and tap; never for synthetic events                 | Real for mouse and tap; never for synthetic events                                                      | Trusted               | Capture behaviour mid-gesture (CF-32) is automatable only in Chromium.                                                                                      |
    | Pen                                            | CDP `pointerType: 'pen'`: trusted `pen` events, swipe commits; hover `buttons` 0; the same `pointerId` on every contact; `buttons` 2 when sent                                                                                                                                | No pen input                                                       | No pen input                                                                                            | Protocol (Chromium)   | Protocol pen is **not** real pen evidence: CDP decides the ID and the buttons. Real pen hardware stays manual (D0-4).                                       |
    | Pinch-zoom                                     | `Input.synthesizePinchGesture` with mobile emulation zoomed nothing, on a toast or on the page                                                                                                                                                                                | No API                                                             | No API                                                                                                  | Protocol / none       | Not reproducible. Real devices only (D0-14).                                                                                                                |
    | Window focus and blur                          | Playwright emulates focus: `hasFocus()` stays true and switching pages or contexts fires nothing. With CDP focus emulation off, minimising the window through CDP gives a **genuine** trusted `blur` and `focus`, headless too, and the library sets and clears `data-paused` | Emulated; switching pages fires nothing                            | Emulated; switching pages fires nothing                                                                 | Playwright / protocol | Genuine blur is automatable in Chromium only.                                                                                                               |
    | Document visibility and hidden documents       | Never `hidden`: not by minimising, a background tab in the same window, or a new page, headless or headed                                                                                                                                                                     | Never `hidden`                                                     | Never `hidden`                                                                                          | —                     | Genuine hidden-document behaviour and T1 resynchronisation are not automatable here. Manual (D0-6). Dispatching `visibilitychange` would be faked evidence. |
    | Mouse click focus                              | A clicked button takes focus (plain and close)                                                                                                                                                                                                                                | Same                                                               | **Same. Unlike what P-16 records for Safari**                                                           | Playwright, trusted   | Playwright WebKit cannot show Safari's click-without-focus. Real Safari stays manual (D0-7).                                                                |
    | `:focus-visible` after the Alt+T hotkey        | `false` on the focused toast root                                                                                                                                                                                                                                             | `true`                                                             | `false`                                                                                                 | Playwright, trusted   | Engines differ. It also seems to differ from P-17 S5's manual Chromium review, which saw the rings; see the D2 decisions.                                   |
    | `:focus-visible` after mouse-close restoration | `false`                                                                                                                                                                                                                                                                       | `false`                                                            | `false`                                                                                                 | Playwright, trusted   | Evidence for the pointer-triggered close question (CF-8). It is not a contract (D0-2).                                                                      |
    | `prefers-reduced-motion` emulation             | Works: no enter motion, a static spinner, instant reflow                                                                                                                                                                                                                      | Works, the same                                                    | Works, the same                                                                                         | Playwright            | Blocking automation in all three.                                                                                                                           |
    | `forced-colors` emulation                      | Works: `(forced-colors: active)` matches and system colours resolve (border `rgb(0, 0, 0)`)                                                                                                                                                                                   | **Works**                                                          | **Works**                                                                                               | Playwright            | Wider than §26's "(Chromium)". Real Windows High Contrast stays manual (D0-8).                                                                              |
    | `prefers-color-scheme` emulation               | Works                                                                                                                                                                                                                                                                         | Works                                                              | Works                                                                                                   | Playwright            | Theme coverage is automatable.                                                                                                                              |
    | RTL                                            | `:dir(rtl)` matches, the progress fill's origin is at the right (358 px), the close button sits at the left                                                                                                                                                                   | Same                                                               | Same                                                                                                    | DOM                   | AC-RTL-1 is automatable in all three.                                                                                                                       |
    | CSS animation and `animationend`               | Trusted `animationstart` and `animationend` on the root with the expected `ret-enter-*` and `ret-exit-*` names                                                                                                                                                                | Same                                                               | Same                                                                                                    | Real                  | AC-MO-1 and AC-LC-1 are automatable in all three.                                                                                                           |
    | Individual properties per frame                | `translate`, `scale`, `opacity` and the spinner's `rotate` interpolate (about 110 distinct values over a slowed 1.8 s enter)                                                                                                                                                  | Same                                                               | Same                                                                                                    | Real                  | Continuity and settled-state assertions are feasible. Left positions settle at `none`, and the exit holds its last frame until removal.                     |
    | Transition and `transform` interpolation       | Reflow `transitionrun`, `transitionstart` and `transitionend`; the matrix interpolates (largest step about 20 px per frame) to `none`; `offsetParent` is the list                                                                                                             | Same                                                               | Same, **when the trigger and the sampler start in one page task**                                       | Real                  | AC-MO-2 is automatable in all three, under the sampling rule below.                                                                                         |
    | In-page `requestAnimationFrame` sampling       | Works, not mocked                                                                                                                                                                                                                                                             | Works                                                              | Works                                                                                                   | Real                  | D0-11's observer approach is viable.                                                                                                                        |
    | Token slowing                                  | Overriding `--ret-enter-duration` and `--ret-exit-duration` on `.ret-toaster` slows the motion, and the lifecycle follows it                                                                                                                                                  | Same                                                               | Same                                                                                                    | Harness CSS           | Deterministic observation without fixed sleeps is feasible (D0-11).                                                                                         |
    | Browser identity                               | Chromium 153                                                                                                                                                                                                                                                                  | Firefox 155                                                        | WebKit 26.6, the Linux WPE (headless) and GTK (headed) ports, with a **macOS Safari user-agent string** | —                     | See the identity boundary below.                                                                                                                            |

  - **Browser identity boundary (D0-7).**
    - **What Playwright WebKit proves:** the behaviour of the WebKit engine as Playwright builds it for Linux: layout, CSS animations, transitions, individual transform properties, `:dir()`, media emulation, events and DOM focus.
    - **What it does not prove about real Safari on macOS or iOS:** Safari's UI-level focus policy (it focused clicked buttons, which P-16 records Safari may not do); iOS touch, scrolling, pinch-zoom and `touch-action`; the platform's compositing and graphics paths; the system's real reduced-motion and contrast settings; Safari's tab and window lifecycle.
    - Its user-agent string claims macOS Safari, so a user-agent check never identifies Safari in this suite.
  - **Harness rules learnt in D1:**
    - **Sampling race.** Starting a frame sampler in one `page.evaluate` call and triggering the change in another missed WebKit's whole 200 ms reflow transition: it looked like no transition at all. Reduced to a pure-DOM FLIP page and re-instrumented on the library, WebKit ran `transitionrun`, `transitionstart` and `transitionend` with full interpolation in three trials, headless and headed. The trigger and its sampler must start in the same page task.
    - **Not observable from the harness:** CDP-dispatched flicks have coarse timing. A 45 px flick over three moves did not commit by velocity, as P-21 D1 recorded for CDP cadence. Velocity tests need explicit event timing with a margin.
    - **Headed focus:** in headed mode the window manager (here WSLg) decides real focus, so headed results depend on the host.
  - **Product evidence gathered on the way.** These are classified provisionally below. None is a verdict.
    - **MINOR-1 reproduced (D0-3, CF-38).** In a custom toast, a trusted Chromium touch drag that starts on a button inside an open shadow root commits a swipe with reason `swipe`, and the button gets no `click`. The same drag from a light-DOM button never starts one. Synthetic composed events show the same retargeting in Firefox and WebKit. Whether this is material is a D2 decision; no production change was made.
    - **A dismissal during the snap-back (CF-36, CF-40), synthetic, exit slowed to 900 ms.** P-18's exit animation runs in all three engines and fades to low opacity. In Firefox and WebKit the opacity briefly rises at the start (about 0.92 → 0.97, and 0.93 → 0.94) before falling, while the `settle` transition is still listed. In Chromium it falls from 1. This is evidence for D2, not a finding of an override.
    - **`inert` with capture (CF-32), Chromium, trusted.** A programmatic dismissal mid-drag: the root loses capture, becomes `inert`, and the next `pointerup` goes to the list.
  - **D0-16 report: removal restoration scrolls the page.** Disposition: the maintainer approved a fix as P-22 H1, recorded below. The report stands as written at D1.
    - **Engines:** Chromium 153, Firefox 155, WebKit 26.6 (Playwright, headless).
    - **Reproduction:**
      - a page with 4000 px of content, then the `<Toaster />` (`top-right`);
      - one persistent toast; the page scrolled to the top;
      - activate its close button, by mouse click or by Alt+T, Tab and Enter.

      The same happens when a toast holding focus is dismissed programmatically.

    - **Observed:** focus goes to the region (§18 step 3), and the page scrolls to the region's position in the document flow: `scrollY` 0 → 3400 in all three engines.
    - **Expected:** restoration keeps focus in the region (§17.4, §18). Nothing in the plan expects the page to scroll, and a keyboard user loses their place in the page.
    - **Contract:** §18 and §17.4 do not state that the page must not move; arguably it is implied by "never left on `<body>`". It is related to AC-KB-1, which does not cover it. Whether it violates the contract is the maintainer's call.
    - **Likely cause:** `restoreFocusFrom` calls `focus()` without `preventScroll` (`src/react/focus.ts`, `tryFocus`) on the region `<section>`, which is `position: static` with zero height. Isolated: a plain `focus()` on the section scrolls in Chromium and Firefox (0 → 3400); `focus({ preventScroll: true })` does not, in any engine. WebKit did not scroll for the isolated plain call, though it did through restoration: an engine detail still to characterise. The neighbouring toasts are `position: fixed`, so focusing them does not scroll.
    - **Smallest plausible fix:** `preventScroll` on restoration's focus calls, and possibly the hotkey's and Escape's (`useHotkey.ts`). It needs its own regression tests and a check that real browsers still scroll nothing else.
    - **Regression risk:** low; focus targets are unchanged. Any fix waits for the maintainer and a separately authorised hardening slice (D0-16).
  - **H1, focus restoration without scrolling (done).** This is the hardening slice authorised by the maintainer after the D1 review, for the D0-16 report above only. It is not D2 and not S1.
    - **Invariant:** focus restoration caused by a toast's removal or dismissal (§18) never scrolls the surrounding document. This is not a general rule for every programmatic focus in the library.
    - **Root cause:** `restoreFocusFrom` focused each candidate through `tryFocus`, a plain `focus()`. On the region, a static `<section>` with zero height that sits wherever `<Toaster />` is placed, browsers scroll the page to it.
    - **Implementation:** one change in `src/react/focus.ts`. `tryFocus` now calls `focus({ preventScroll: true })`. `tryFocus` is module-private, and its only callers are the three steps of `restoreFocusFrom` (the next toast's equivalent control or the next toast, then the previous toast, then the region), which `ToastItem` calls only as a toast starts to exit. So every restoration step is covered, and no other path changes.
    - **Scope:** restoration only. The hotkey (`useHotkey.ts`, focus entry into the region) and Escape (the return to the recorded element) call `focus()` themselves, not through `tryFocus`. They keep their plain `focus()`. The neighbouring toasts are `position: fixed`, so the change matters in practice for the region; it applies to every step because the invariant concerns restoration as a whole.
    - **Unchanged:** the §18 target order and its verification, `inert` (still set after restoration in the same layout effect), the lifecycle, the pause reasons (§10), swipe, motion, the public API, and the 30 tokens. CF-12, CF-36 and CF-38 were not touched.
    - **Regression tests:** `focus-restoration.test.tsx` gains five tests (46 in the file), under `no scrolling (P-22 H1)`. They record each `focus()` call with its element and options:
      - the region is focused with `{ preventScroll: true }`;
      - so is the next toast's equivalent control;
      - with the next and previous toasts refusing focus, the calls are exactly next, previous, region, in that order and each with `preventScroll`;
      - a clicked close button restores the same way;
      - Alt+T and Escape still call `focus()` with no options.

      jsdom has no layout or scrolling, so the tests check the request, not a scroll. D1's runs in Chromium, Firefox and WebKit are the browser-level reproduction and the evidence that `preventScroll` stops the scroll. P-22's browser suite reruns that check in S1 or later, as D2 decides.

    - **Mutations:** 2, each detected and restored. With the fix reverted, the four restoration tests fail. With `preventScroll` added to the hotkey, the hotkey test fails. The 41 earlier restoration tests pass unchanged.
    - **Validation:**
      - the focused focus and accessibility suites pass (8 files, 426 tests);
      - the full suite passes (40 files, 1,689 tests);
      - `format:check`, `lint` with the stylesheet contract, `typecheck`, `typecheck:demo`, `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Provisional classification of CF-1 to CF-43 (D0-1).** Classes: **1** blocking automated, **2** automated evidence, **3** manual checkpoint, **4** evidence-only observation. "Synthetic" marks logic-only automation that is never reported as trusted input. **D2 locks this; it is not final.**

    | ID    | Provisional class                                                                                                                                       |
    | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | CF-1  | 2 for the blur part in Chromium (CDP minimise); 3 for Firefox, WebKit and genuine page or app switching                                                 |
    | CF-2  | 1 for the library contract (the focus-within reason follows the DOM); 2 for each engine's focus outcome                                                 |
    | CF-3  | 2                                                                                                                                                       |
    | CF-4  | 2 (trusted mouse in all three)                                                                                                                          |
    | CF-5  | 1 or 2 for blur in Chromium (D2 decides); 3 for blur in Firefox and WebKit, and for visibility in every engine                                          |
    | CF-6  | 1 for restoration before `inert`, and pointer and click on an inert toast (trusted mouse, all three); 2 for each engine's own focus fix-up              |
    | CF-7  | 4 in Playwright engines (all three focus on click); 3 in real macOS and iOS Safari                                                                      |
    | CF-8  | 4, with assistive technology at P-29 (D0-2)                                                                                                             |
    | CF-9  | 2                                                                                                                                                       |
    | CF-10 | 2                                                                                                                                                       |
    | CF-11 | 1 for the DOM attribute; 2 for the accessibility tree (not probed in D1); assistive technology at P-29                                                  |
    | CF-12 | 1 for the ring styles while `:focus-visible` matches; 4 for when each engine matches it; 3 for appearance                                               |
    | CF-13 | 1 for no pointer input and stacking (hit-testing); 3 for appearance                                                                                     |
    | CF-14 | 1 for emulated forced colours (all three engines can); 3 for Windows High Contrast                                                                      |
    | CF-15 | 1 for positions, narrow viewport and RTL; safe-area insets not probed in D1, likely 3 on devices                                                        |
    | CF-16 | 1                                                                                                                                                       |
    | CF-17 | 1, probably; not probed in D1                                                                                                                           |
    | CF-18 | 1                                                                                                                                                       |
    | CF-19 | 1                                                                                                                                                       |
    | CF-20 | 1                                                                                                                                                       |
    | CF-21 | 1 (with the sampling rule)                                                                                                                              |
    | CF-22 | 1                                                                                                                                                       |
    | CF-23 | 3, with 2 for screenshots (D0-13)                                                                                                                       |
    | CF-24 | 1                                                                                                                                                       |
    | CF-25 | 1 for hover and focus in all three; blur 1 or 2 in Chromium; 3 for blur in Firefox and WebKit                                                           |
    | CF-26 | 3 in every engine                                                                                                                                       |
    | CF-27 | 2 for the computed `clip-path`; 3 for appearance                                                                                                        |
    | CF-28 | 3                                                                                                                                                       |
    | CF-29 | 1 in Chromium (trusted); 1 (synthetic) for the logic in Firefox and WebKit; 1 for the mouse in all three; 3 for trusted touch on iOS Safari and Android |
    | CF-30 | 1 in Chromium; 3 for Firefox and WebKit on real devices                                                                                                 |
    | CF-31 | 2 in Chromium (protocol pen); 3 for real pen and `touch-action` with a pen                                                                              |
    | CF-32 | 2 in Chromium; 3 elsewhere                                                                                                                              |
    | CF-33 | 4, with assistive technology at P-29 (D0-2)                                                                                                             |
    | CF-34 | 3                                                                                                                                                       |
    | CF-35 | 1 for continuity in Chromium (trusted) and, synthetic, in Firefox and WebKit; 3 or 4 for the cosmetic one-frame hold                                    |
    | CF-36 | 2 (observable in all three; D2 judges the Firefox and WebKit bump)                                                                                      |
    | CF-37 | 3 (real pen hardware); Chromium's protocol pen is not evidence for it                                                                                   |
    | CF-38 | 2 (reproduced); the next step is D2's materiality decision (D0-3)                                                                                       |
    | CF-39 | 2 (a mouse press on the body focuses the root in all three)                                                                                             |
    | CF-40 | 2, with CF-36                                                                                                                                           |
    | CF-41 | as CF-30                                                                                                                                                |
    | CF-42 | 4, for P-26                                                                                                                                             |
    | CF-43 | Not a check: it governs the classification                                                                                                              |

    **Automation gaps, recorded and not weakened:**
    - AC-SW-1 in Firefox and WebKit: trusted touch, capture, scrolling and `pointercancel`.
    - CF-5 and CF-26: visibility and hidden documents in every engine.
    - CF-1, CF-5 and CF-25: blur in Firefox and WebKit.
    - Real Safari (CF-7), Windows High Contrast (CF-14, CF-28), real pen (CF-31, CF-37) and pinch-zoom (CF-34).

    Each needs its manual checkpoint, named at D2. Whether three-engine coverage of AC-SW-1 can rest on trusted Chromium plus synthetic Firefox and WebKit plus real devices is for D2 to decide, not D1.

  - **D2 decisions required:**
    1. The D0-16 report above: whether it is a defect, and whether to authorise a hardening slice. Resolved before D2: approved and fixed by H1.
    2. MINOR-1's materiality (D0-3).
    3. What counts as three-engine coverage for AC-SW-1, and for the scroll-arbitration part of CF-29 and CF-30, given the touch-drag gap.
    4. Whether Chromium's CDP-minimise blur is blocking or evidence (CF-5, CF-25), and that visibility and hidden documents are manual.
    5. Forced-colours emulation in all three engines or only Chromium, since §26 names Chromium but all three support it.
    6. The CF-12 discrepancy: the Alt+T root does not match `:focus-visible` in Playwright Chromium and WebKit, against P-17 S5's manual Chromium review. Investigate before classifying.
    7. CF-36: whether Firefox's and WebKit's opacity bump matters.
    8. CI mechanics (D0-12):
       - dependencies on `ubuntu-latest` (`playwright install --with-deps`);
       - browser caching: the downloads were 393 MB Chromium, 261 MB headless shell, 306 MB Firefox and 269 MB WebKit;
       - headless only;
       - time: a three-engine motion run took about 46 s here.
    9. The S1 harness, applying the sampling rule.
    10. Who supplies each manual checkpoint's browser, device or hardware.
    11. The probes D1 did not make: the accessibility tree for `aria-keyshortcuts` (CF-11), safe-area insets (CF-15), and fallbacks under `display: none` and overridden tokens (CF-17).
- **D1b record: evidence completion before D2.** It closes D1's open probes (D2 decision 11), characterises CF-36, and checks H1 in real browsers. Evidence only: no production, test, package or CI change, no D2 classification, and the D1 matrix above is unchanged.
  - **Infrastructure:** as in D1, and removed before this record was committed.
    - A disposable spike outside the repository: its own `@playwright/test` 1.63.0, the same engines as D1 (Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6), locally extracted system libraries, and the WebKit launcher wrapper.
    - The harness was bundled from the current `src/` (including H1) with a byte-identical copy of `src/styles.css`.
    - All runs were headless. Where a probe overrode something, it did so in harness CSS only, through the public motion tokens or consumer-style rules, never in production code.
  - **H1, real-browser check (passed in every engine).** D1's reproduction, re-run against the fixed code: 4000 px of content before `<Toaster />`, the page at the top.

    | Case                                        | Chromium | Firefox | WebKit | Focus afterwards (all three)        |
    | ------------------------------------------- | -------- | ------- | ------ | ----------------------------------- |
    | Mouse click on the close button, one toast  | 0 → 0    | 0 → 0   | 0 → 0  | the region (§18 step 3)             |
    | Alt+T, Tab, Enter on the close button       | 0 → 0    | 0 → 0   | 0 → 0  | the region                          |
    | Body click, then a programmatic dismissal   | 0 → 0    | 0 → 0   | 0 → 0  | the region                          |
    | Close of the first of two toasts            | 0 → 0    | 0 → 0   | 0 → 0  | the next toast's close (§18 step 1) |
    | Programmatic dismissal with nothing focused | 0 → 0    | 0 → 0   | 0 → 0  | `<body>`; not restoration (control) |

    The figures are `scrollY` before and after. Before H1 the region cases went 0 → 3400 (D1). H1 holds in real browsers and the §18 targets are unchanged.

  - **CF-11, `aria-keyshortcuts`:**
    - **A, the DOM attribute:** reliable in all three engines.
      - The default gives `Alt+T`.
      - `hotkey={["ctrlKey", "shiftKey", "KeyK"]}` gives `Control+Shift+K`, and `["F6"]` gives `F6`.
      - A punctuation hotkey (`["altKey", "Comma"]`) and `hotkey={false}` give no attribute, as P-16 specifies.
    - **B, the browser accessibility tree:**
      - **Chromium only,** through CDP `Accessibility.getFullAXTree`: the region node (role `region`, name "Notifications") carries `keyshortcuts` with the same value in every case, and none when the attribute is absent.
      - **Firefox and WebKit:** Playwright gives no access to their accessibility trees. `page.accessibility` no longer exists in 1.63.
      - Playwright's `ariaSnapshot()` is computed by Playwright from the DOM, not read from the browser's tree, and it does not include key shortcuts. It is not B evidence.
    - **C, assistive technology:** not observable through browser automation, and not claimed. P-29.
    - **Recommended class:** 1 for A in all three; 2 for B in Chromium; B in Firefox and WebKit not automatable here; C at P-29.
  - **CF-15, safe-area insets:**
    - **Production rule:** each list's anchored edge is `--ret-offset` plus `env(safe-area-inset-<edge>, 0px)`, and its width is at most `100%` minus both offsets and both horizontal insets.
    - **Normal contexts:** every `env(safe-area-inset-*)` resolved to `0px`, not to the fallback, in all three engines. That covers desktop, `hasTouch` at 412 px, Playwright's iPhone 15 Pro descriptor (Chromium and WebKit) and the Pixel 7 descriptor (Chromium), with or without `viewport-fit=cover`. The gutters were exactly `--ret-offset` (16 px).
    - **Non-zero values:** only Chromium's CDP `Emulation.setSafeAreaInsetsOverride` produced them. With 47/20/34/20 px the production rule computed exactly: top 63 px, bottom 50 px, left and right 36 px, width 412 − 32 − 40 = 340 px.
      - These are values injected through the browser's own `env()` mechanism, not ones provided by a device.
      - They applied even without `viewport-fit=cover`, which real devices require, so the override does not model that gating. It is a synthetic approximation.
    - **Firefox and WebKit:** no way to produce non-zero insets.
    - **Still useful:** the zero-inset layout assertions (gutters, narrow-viewport width, the six positions, RTL), and Chromium's override as evidence of the `calc()` arithmetic.
    - **Recommended class:** 1 for the zero-inset layout in all three; 2 for Chromium's override arithmetic; **3** for genuine notched-device safe areas (iOS Safari, Android Chrome, with `viewport-fit=cover`).
  - **CF-17, lifecycle fallback.** Real production lifecycle and CSS, at about 60 frames per second. Times are from dismissal to `onDismiss` (removal from the store), except the "hidden only after" row, which is to the root's removal from the DOM.

    | Scenario                                                                   | Chromium | Firefox | WebKit                         |
    | -------------------------------------------------------------------------- | -------- | ------- | ------------------------------ |
    | Control: normal motion, trusted `animationend` (120 ms)                    | 132 ms   | 131 ms  | 127 ms                         |
    | Paused by consumer CSS (`animation-play-state: paused`), no `animationend` | 222 ms   | 222 ms  | 222 ms                         |
    | Paused, exit token 600 ms                                                  | 702 ms   | 704 ms  | 702 ms                         |
    | `display: none` on the region (hidden before the toast was created)        | 221 ms   | 221 ms  | **about 1 ms**                 |
    | `display: none`, exit token 1000 ms (enter token 600 ms)                   | 1102 ms  | 1102 ms | **about 1 ms** (enter: 718 ms) |
    | Region hidden only after the toast was visible                             | 228 ms   | 228 ms  | 226 ms                         |
    | Normal motion, exit token 600 ms                                           | 615 ms   | 596 ms  | 614 ms                         |
    - **The fallback works and follows the computed timing:** duration plus the documented 100 ms margin (`LIFECYCLE_FALLBACK_MARGIN_MS`), within a frame. That holds for paused animations in all three engines, and for `display: none` in Chromium and Firefox. An overridden token moves it. Enter fallbacks under `display: none` follow the tokens in all three (about 293 ms; 718 ms with a 600 ms enter token).
    - **Unrelated events never completed a toast** (paused, 600 ms token: completion still at about 702 ms in every engine):
      - a trusted `animationend` from a descendant's own animation (three iterations, bubbling);
      - a synthetic `animationend` with a wrong name on the root;
      - a synthetic one with the library's name on a descendant.
    - **WebKit difference, not reduced:**
      - **Symptom:** when the region is already `display: none` before the toast is created, the exit's fallback read the root's computed style at `exiting` and got the stale `entering` value (`ret-enter-top`, 0.18 s; Chromium and Firefox read `ret-exit-top`, 0.12 s). So it found no exit animation, took the immediate path (§9 rule 3), and the toast was removed about 1 ms after dismissal. `onDismiss` still fired once.
      - **Conditions:** reproduced twice. It does not happen when the region is hidden after the toast was visible.
      - **Not reduced:** five pure-DOM reductions stayed correct in WebKit: parser- and script-created elements, production CSS on static markup, `inert`, and either way of reading the property. So whether it is a WebKit engine quirk or an interaction with the library's flow is **undetermined**.
      - **Impact:** nothing is visible, since the toast is not displayed, and the lifecycle completes (AC-LC-2 holds). The exit's slot frees about 220 ms early. In this one case "the fallback follows an overridden token" (CF-17) does not hold in WebKit.
      - **Disposition:** D0-16 was not invoked, because no user-visible effect or acceptance criterion is violated. It is flagged for D2: the maintainer decides whether it is accepted, needs more investigation, or is a defect.
    - **Recommended class:** 1 for completion with no `animationend` (paused) and for token-following, in all three; 1 for completion under `display: none` in all three (AC-LC-2), with its timing 1 in Chromium and Firefox and 2 or 4 in WebKit pending D2; 1 for filtering unrelated events, trusted and synthetic.

  - **CF-36 and CF-40, a dismissal during the snap-back:**
    - **Method:** a synthetic below-threshold drag (released at opacity 0.898), then a programmatic dismissal 0, 16, 50, 100, 150 or 250 ms after release. Sampling started in the same task as the dismissal (D1's sampling rule). Production timing: a 200 ms settle and a 120 ms exit, so about 8 or 9 frames. `getAnimations()` showed the `opacity` and `transform` transitions and `ret-exit-top` running together.
    - **Firefox at production timing:** the exit fades from the current value. Its one rise is +0.011 for one frame (dismissal at 16 ms). Otherwise it is monotone.
    - **WebKit at production timing:** it starts within about 0.01 of the current value (+0.010 for one frame at 16 ms; otherwise slightly below) and is monotone after.
    - **Chromium at production timing:** the exit starts from **1** on its first frame, whatever the snap-back value. That is a step of up to +0.10 for a dismissal right after release, shrinking as the settle completes: +0.04 at 50 ms, +0.02 at 100 ms, none from about 150 ms. The curve then equals a plain dismissal's exactly (1, 0.966, 0.881, … 0.044). This is what D1 recorded as "falls from 1".
    - **With the exit slowed to 900 ms (diagnostic only):** Firefox rises +0.071 and WebKit +0.048, over about 200 ms, before fading. That is D1's "bump", and it is about as long as the settle. Chromium steps to 1, then fades.
    - **Materiality:** at production timing the Firefox and WebKit deviations are at most about 1% opacity for one frame of a roughly 130 ms fade, unlikely to be human-visible. Chromium's step to 1 on the first frame of a dismissal that lands within about 100 ms of a cancelled swipe is a larger change, but brief, and it turns into an ordinary exit fade. The case needs a cancelled swipe followed, within the 200 ms settle, by a dismissal from elsewhere (a timeout cannot occur while the reason held the timer, so it is programmatic, another control, or dismiss-all).
    - **Recommendation for the maintainer's decision: B,** an accepted cosmetic interpolation difference between engines, not a material defect. Optionally confirm Chromium's first-frame step with a human visual checkpoint on a device (C), since frame metrics cannot judge perceptibility. Not A: no production change is recommended.
    - **Recommended class:** 2 (automated evidence in all three; never a blocking assertion of an engine's interpolation).
  - **Remaining evidence gaps after D1b:**
    - Firefox and WebKit accessibility trees (CF-11 B);
    - genuine device safe areas (CF-15);
    - the unreduced WebKit stale-style case (CF-17);
    - the perceptibility of Chromium's CF-36 step (optional C);
    - and every gap D1 recorded, which D1b did not address.
- **D2 record: the final evidence matrix and implementation plan (locked).** Documentation only. D2 sits on top of the D0, D1, H1 and D1b records, which stay as written: where D2 differs from a provisional class or a recommendation above, D2 governs, and the earlier text remains the evidence it rests on. D2 changes no product contract, acceptance criterion, public API, token, or P-16 to P-21 decision.
  - **Governing rule.** Automation limits decide the evidence method, never the requirement. Where Playwright cannot faithfully produce a behaviour in an engine, the requirement stays and a named manual checkpoint carries it. A criterion or CF item is met only when every layer recorded for it below has passed or been recorded.
  - **Vocabulary** used below and in the S slices:
    - **Normative contract:** what the plan requires of the product (§9 to §22, §36). D2 changes none.
    - **Automated proof:** Class 1. A blocking assertion in the `browser` job.
    - **Automated evidence:** Class 2. A committed, runnable evidence spec, tagged `@evidence`, that records its observations as attachments or annotations, asserts only that its scenario ran, and runs outside the blocking job (see the harness rules). Its results are recorded in this plan by the slice that adds it.
    - **Manual proof:** Class 3. A recorded manual checkpoint (MC-1 to MC-8, below) on a named browser, device, operating-system feature or piece of hardware.
    - **Known observation:** Class 4, or a Class 2 record, of browser behaviour that is not the product contract and is never asserted as one.
    - **Deferred:** assistive-technology evidence (P-29) and documentation of a verified boundary (P-26).
    - **Engines:** C, F and W are Playwright's Chromium, Firefox and WebKit. W is never reported as Safari (D0-7).
    - **Input labels:** **trusted** is Playwright input, or Chromium CDP touch and mouse input, with `isTrusted` true; **protocol** is Chromium CDP input whose properties the protocol decides (pen IDs and buttons); **synthetic** is script-dispatched, with `isTrusted` false. A synthetic result is never reported as trusted, touch or device evidence.
  - **Maintainer decisions D2-1 to D2-15** (approved by the maintainer after the D1b review):
    1. **D2-1, H1 closed.** Removal restoration focuses through the restoration-only `tryFocus` with `focus({ preventScroll: true })`. The §18 target order, Alt+T and Escape are unchanged. Evidence: the H1 unit regression tests, full repository validation, and D1b's real-browser check (`scrollY` stayed 0 in Chromium, Firefox and WebKit for every reproduced restoration path). P-22 does not reopen H1 unless the permanent suite exposes a regression; S4 makes the D1b check a blocking regression test (H1-R).
    2. **D2-2, CF-38 Shadow DOM: a confirmed, documented limitation.** A swipe that begins on an interactive element inside a shadow root in custom content is retargeted to the host, so `protectedTarget()` does not recognise the interactive descendant and the swipe can start. It is not fixed in P-22. `composedPath()` is not introduced at D2 or S1 for it. P-22 supplies the evidence (Class 2); P-26 documents the verified boundary; it is a candidate for post-v2 hardening (§37).
    3. **D2-3, AC-SW-1 and three-engine swipe coverage.** The three-engine requirement of §26 and AC-SW-1 is not weakened. The suite distinguishes three layers:
       - **A, swipe logic:** blocking automation in C, F and W. In F and W it uses synthetic pointer events and is labelled so.
       - **B, trusted touch integration:** blocking automation in C only (CDP touch). C additionally provides real `pan-y` scroll arbitration, `pointercancel`, pointer capture and trusted diagonal and dead-zone evidence.
       - **C, real device and browser integration:** manual checkpoints on real devices (MC-2, MC-3, MC-4) for what Playwright cannot produce in F and W, and for real-device Chromium.

       Synthetic events in F and W verify library logic only and are never described as trusted touch integration. AC-SW-1 is met only when A, B and C have all passed.

    4. **D2-4, blur and hidden documents.** Chromium's CDP minimise gives genuine window `blur` and `focus`: Class 2 evidence, not the sole blocking proof of a universal browser contract. Genuine blur in Firefox and Safari is manual. Genuinely hidden documents and the return and resynchronisation after them are Class 3 in every engine. A dispatched `visibilitychange` never substitutes for hidden-document evidence.
    5. **D2-5, forced colours.** Emulated `forced-colors: active` works in all three engines (D1), so the testable normative CSS contract (§17.5) is blocking automation in C, F and W. This extends §26's "(Chromium)" and D0-8's Chromium-only expectation on measured capability; it weakens nothing. Real Windows High Contrast stays a Class 3 checkpoint (MC-6). P-26 distinguishes emulated evidence from real Windows High Contrast evidence.
    6. **D2-6, the CF-12 focus-visible discrepancy.** Whether an engine matches `:focus-visible` after script focus (Alt+T, restoration) differs between engines (D1) and from P-17 S5's manual Chromium review. It is Class 2 automated evidence plus manual evidence. P-22 does not change production focus-ring behaviour to make engines agree, and no engine's heuristic becomes the product contract.
    7. **D2-7, CF-36 and CF-40 opacity.** The snap-back → dismissal opacity behaviour is an accepted cosmetic interpolation difference: Class 2. At production timing the Firefox and WebKit deviations are about frame-level and negligible; Chromium can step toward opacity 1 on the first frame of a dismissal right after release; D1's larger bump came from deliberately slowed diagnostic timing. P-18 and P-21 motion code is not changed for it. An optional visual observation on a device may be recorded (MC-8); it is not a release-blocking defect on current evidence.
    8. **D2-8, CF-11 `aria-keyshortcuts`.** The DOM attribute is Class 1 in C, F and W. Chromium's accessibility-tree exposure (CDP) is Class 2. Firefox's and WebKit's accessibility trees are not reachable with the established Playwright tooling: a recorded gap, not a pass. Screen-reader and assistive-technology discoverability is P-29's. DOM or Chromium-tree evidence never claims assistive-technology support.
    9. **D2-9, CF-15 safe areas.** The zero-inset layout is Class 1. Chromium's CDP safe-area override arithmetic is Class 2, an approximation that is never described as notched-device evidence. Real non-zero safe areas on notched devices are Class 3 (MC-2, MC-3).
    10. **D2-10, CF-17 lifecycle fallback.** The normal fallback contract is Class 1 in C, F and W: the lifecycle completes when the expected `animationend` is absent; the fallback follows the computed animation timing; an overridden public motion token moves it; unrelated animation events never complete a toast. D1b measured about 222 ms by default and about 702 ms with a 600 ms exit token: the computed duration plus the 100 ms margin.
        - **WebKit `display: none` observation.** With the region already `display: none` before the toast is created, WebKit read a stale computed animation style and completed the exit fallback in about 1 ms. The lifecycle still completes and nothing is visible. Pure-DOM reductions did not reproduce it; the root cause is undetermined.
        - **Disposition:** not a confirmed P-22 production defect; no production change; recorded as Class 2 evidence and a known WebKit observation; exact fallback timing in that hidden-before-creation case is never a blocking assertion. If the permanent suite shows a user-visible or lifecycle-correctness defect, D0-16 applies before any production change.
    11. **D2-11, CI shape.** One blocking `browser` job with Playwright projects for Chromium, Firefox and WebKit; zero retries; least-privilege permissions, SHA-pinned actions, the npm cache and no permanent debug steps; traces and artifacts on failure only. D1's cost (about 1.2 GB of browser downloads; about 46 s for a representative three-engine motion run) is accepted. A separate repeat (soak) validation before merge looks for flakiness instead of hiding it with retries.
    12. **D2-12, the sampling rule.** When the harness observes an animation or reflow from its first frame, the trigger and the frame sampler start in the same page task, never in separate round-trips. `requestAnimationFrame` is an observer only and is never mocked.
    13. **D2-13, real browser and device boundaries.** The final evidence record separates Playwright automation from real-device and manual evidence. Manual categories include, where applicable: real macOS Safari; real iOS Safari; real Android Chrome; real non-zero safe areas on notched devices; real Windows High Contrast; real pen hardware; genuine hidden-document and background behaviour; Firefox and WebKit touch and scroll integration that Playwright cannot produce; and pinch-zoom. Playwright WebKit is never labelled Safari evidence.
    14. **D2-14, React.** The permanent browser suite runs on the repository's React 18.2 baseline. P-23 owns React 18/19 compatibility, React 19 and the matrix, and may move the harness to it. React 19 is not added to P-22 to satisfy §26's "latest React" wording: as D0-9 records, this is a temporary P-22 reading of §26, and §26 is unchanged.
    15. **D2-15, Node.** P-22 stays on Node 24 and is not combined with the Node 26 transition. P-06 records Node 26 becoming Active LTS on 2026-10-28, with the move after that date. If P-22 is still active on or after 2026-10-28, the next slice does not start until the maintainer decides (D0-17).
  - **D1's "D2 decisions required", resolved:**
    1. The D0-16 report: fixed by H1 (D2-1).
    2. MINOR-1: a documented limitation, not fixed in P-22 (D2-2).
    3. Three-engine swipe coverage: the A, B and C layers (D2-3).
    4. Blur: Class 2 in Chromium; manual in Firefox and Safari; hidden documents manual everywhere (D2-4).
    5. Forced colours: all three engines (D2-5).
    6. CF-12: evidence, no product change (D2-6).
    7. CF-36: accepted cosmetic difference (D2-7).
    8. CI mechanics: D2-11 and the CI mechanics below.
    9. The S1 harness: the harness design below, applying D2-12.
    10. Manual checkpoint supply: the maintainer (manual checkpoints, below).
    11. D1's unmade probes: completed by D1b and classified by D2-8, D2-9 and D2-10.
  - **Manual checkpoints.** The maintainer supplies every browser, device, operating-system feature and piece of hardware below, and records: the device or machine, the operating-system and browser versions, the date, the case-by-case result, and any observation. S6 serves the harness to the device (S1's `browser:serve`). A checkpoint is fresh P-22 evidence: P-21's device approvals never satisfy one (CF-43), and neither does a Playwright run. If a device or browser is not available, the case is recorded as an **unverified gap** and reported to the maintainer before the PR; it is never passed silently.

    | ID   | Environment                                                                                                                                                          | Covers                                                                                                                                                                                                                                   |
    | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | MC-1 | Real macOS Safari, current stable                                                                                                                                    | CF-7 click without focus, reported apart from the keyboard path; CF-8's Safari path; CF-12 rings after Tab, Alt+T and restoration; CF-1, CF-5 and CF-25 genuine blur by window and app switching; CF-26 hidden documents                 |
    | MC-2 | Real iOS Safari on a notched iPhone                                                                                                                                  | CF-29, CF-30 and CF-41 touch swipe, vertical scroll, diagonals and `pointercancel`; CF-32 where observable; CF-34 pinch-zoom; CF-15 safe areas with `viewport-fit=cover`; CF-7 tap without focus; CF-26 backgrounding; CF-39 touch press |
    | MC-3 | Real Android Chrome on a device with a display cutout                                                                                                                | CF-29, CF-30 and CF-41; CF-34; CF-15 safe areas with `viewport-fit=cover`; CF-26 backgrounding; CF-39 touch press                                                                                                                        |
    | MC-4 | Real Firefox for Android (Gecko) on a touch device                                                                                                                   | CF-29, CF-30 and CF-41, the Gecko touch-integration layer of AC-SW-1; CF-32 where observable; CF-34                                                                                                                                      |
    | MC-5 | Real desktop Chrome and desktop Firefox in a normal operating-system session                                                                                         | CF-1, CF-5 and CF-25 genuine blur by window and app switching; CF-26 hidden tab, minimised window, hidden for more than about 5 minutes (intensive throttling) and occlusion-only hiding, where the platform produces them               |
    | MC-6 | Real Windows High Contrast (a Windows contrast theme) in Edge or Chrome, and in Firefox                                                                              | CF-14 card edge, action border, `Highlight` rings, region ring, each type recognisable by its icon; CF-28 `CanvasText` fill with no track; CF-12 and CF-13 rings under it                                                                |
    | MC-7 | Real pen hardware, in each engine the maintainer's hardware allows (for example a Windows pen device for Chromium and Firefox, and an iPad with a stylus for Safari) | CF-31 pen swipe and `touch-action` with a pen; CF-37 implicit capture, `buttons` on hover and with the barrel button, pointer-ID reuse, the stale pending candidate; CF-39 pen press. An engine without hardware is an unverified gap    |
    | MC-8 | Human visual review in each engine, aided by screenshots and frame captures (D0-13); a Playwright build counts for its engine only, never for Safari                 | CF-12 and CF-13 ring appearance; CF-23 the `scale` × `transform` overlap; CF-27 the strip's corner and straight edge; CF-35 the one-frame fly-out hold; optional: CF-36 Chromium's first-frame step                                      |

  - **Final classification of CF-1 to CF-43.** Classes as D0-1. Where a CF item has layers of different evidence quality, each layer has its own class. "H1-R" is the H1 browser regression, which is not a CF item. Every CF item stays traceable even where it shares evidence with another.

    | ID    | Final classes, by layer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Slice  | Manual                 | Destination and overlap                                                                         |
    | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------- | ----------------------------------------------------------------------------------------------- |
    | CF-1  | **2** (C, CDP minimise): genuine window blur and return while a toast holds focus; `window-blur` sets and clears `data-paused` and the focus-within reason survives. **3:** genuine window and app switching in Firefox, Safari and desktop Chrome                                                                                                                                                                                                                                                                                                                                                                           | S4     | MC-1, MC-5             | Overlaps CF-5, CF-25                                                                            |
    | CF-2  | **1** (C F W): when the focused node inside a toast is removed or re-keyed, the `focus-within` reason follows the DOM (P-15 reconciliation) and the toast does not stay paused. **2** (C F W): each engine's events and focus outcome when a focused control becomes disabled, hidden or `inert`                                                                                                                                                                                                                                                                                                                             | S4     | —                      | A toast left paused after focus has genuinely left is a D0-16 report. Overlaps CF-3, CF-6       |
    | CF-3  | **2** (C F W): where each engine puts focus when a focused node is removed outside restoration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | S4     | —                      | The library's own restoration is CF-6 and H1-R                                                  |
    | CF-4  | **2** (C F W, trusted mouse): whether and when `hover` sets when a stack appears under a stationary pointer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | S4     | —                      | Not a contract; never asserted                                                                  |
    | CF-5  | Blur: **2** (C, CDP minimise); **3** in Firefox and Safari. Visibility and hidden documents: **3** in every engine; a dispatched `visibilitychange` is never evidence (D2-4)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | S4, S6 | MC-1, MC-2, MC-3, MC-5 | Overlaps CF-1, CF-25, CF-26                                                                     |
    | CF-6  | **1** (C F W, trusted mouse and keyboard): restoration moves focus to the §18 target before the exiting toast is `inert`; focus stays there once `inert` applies (no browser fix-up contradicts it); a pointer press or click on an inert exiting toast dismisses and focuses nothing. **2** (C F W): each engine's handling when a focused element becomes `inert` without restoration                                                                                                                                                                                                                                      | S4     | —                      | With H1-R                                                                                       |
    | CF-7  | **4** (C F W): all three Playwright engines focus a clicked button, so they cannot show click without focus; recorded, never asserted. **3:** real macOS Safari and iOS Safari, reported apart from the keyboard path                                                                                                                                                                                                                                                                                                                                                                                                        | S4, S6 | MC-1, MC-2             | Feeds CF-8 and P-29                                                                             |
    | CF-8  | **4** (C F W): the restoration target and `:focus-visible` after a mouse close. The contract decision waits for P-29 (D0-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | S4     | MC-1 (via CF-7)        | P-29. Overlaps CF-33                                                                            |
    | CF-9  | **2** (C F W): whether a toast revived in the commit in which it was exiting briefly refuses focus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | S4     | —                      | A user-visible refusal is a D0-16 report                                                        |
    | CF-10 | **2** (C F W): the order of restoration, focus events, `inert` and the focus-within handover                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | S4     | —                      | Its outcome is asserted only through CF-6                                                       |
    | CF-11 | **1** (C F W): the DOM attribute (default `Alt+T`; `Control+Shift+K`; `F6`; none for a punctuation hotkey or `hotkey={false}`). **2** (C): `keyshortcuts` in Chromium's accessibility tree. F and W trees: an unverified gap with the established tooling (D2-8)                                                                                                                                                                                                                                                                                                                                                             | S4     | —                      | Assistive technology: P-29                                                                      |
    | CF-12 | **1** (C F W): the §17.4 ring styles apply while `:focus-visible` matches, reached by trusted keyboard Tab. **2** (C F W): whether each engine matches `:focus-visible` after Alt+T and after restoration (D2-6). **3:** ring appearance, real Safari and Windows High Contrast                                                                                                                                                                                                                                                                                                                                              | S4     | MC-1, MC-6, MC-8       | No production focus-ring change in P-22                                                         |
    | CF-13 | **1** (C F W): while the region has focus, its ring takes no pointer input and stacks above the lists (hit-testing). **3:** appearance, and under Windows High Contrast                                                                                                                                                                                                                                                                                                                                                                                                                                                      | S4     | MC-6, MC-8             | Its emulated forced-colours styling is CF-14                                                    |
    | CF-14 | **1** (C F W): under emulated `forced-colors: active`, the testable §17.5 rules: the card edge, the action border, the `Highlight` focus rings, the region ring, the type icons present, and the progress fill with no track (CF-28's emulated layer). **3:** real Windows High Contrast (D2-5)                                                                                                                                                                                                                                                                                                                              | S3     | MC-6                   | P-26 separates emulation from real Windows High Contrast                                        |
    | CF-15 | **1** (C F W): the six positions, `--ret-offset` gutters with zero insets, narrow-viewport width without horizontal overflow, RTL mirroring with physical positions. **2** (C): CDP safe-area override arithmetic, an approximation. **3:** real notched-device safe areas with `viewport-fit=cover` (D2-9)                                                                                                                                                                                                                                                                                                                  | S3     | MC-2, MC-3             | AC-RTL-1, with CF-24                                                                            |
    | CF-16 | **1** (C F W): AC-MO-1. Real `ret-enter-*` and `ret-exit-*` playback at all six positions; completion on the root's own trusted `animationend`; the exit holding its last frame until removal; left positions settling with no offset (D-14)                                                                                                                                                                                                                                                                                                                                                                                 | S2     | —                      | AC-MO-1                                                                                         |
    | CF-17 | **1** (C F W): completion with no `animationend` (paused animation); fallback at the computed duration plus the 100 ms margin; an overridden exit token moves it; unrelated events (a descendant's trusted `animationend`, a wrong name on the root, the library's name on a descendant) never complete; completion under `display: none`, hidden before creation or after visibility; the timing when hidden after visibility. **2** (C F W): the timing when hidden before creation, with the known WebKit observation (D2-10)                                                                                             | S2     | —                      | AC-LC-2                                                                                         |
    | CF-18 | **1** (C F W): under emulated `prefers-reduced-motion: reduce`, no translation, scale or fade, a static spinner, and a completed lifecycle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | S2     | —                      | AC-MO-3. The operating system's own setting: P-29                                               |
    | CF-19 | **1** (C F W): the spinner rotates about its own centre, and its animation events never complete the toast                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | S2     | —                      | —                                                                                               |
    | CF-20 | **1** (C F W): individual `translate`, `scale` and `rotate` interpolate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | S2     | —                      | Shares samples with CF-16, CF-19                                                                |
    | CF-21 | **1** (C F W, under D2-12): AC-MO-2. Insertion, removal after the exit, and removal plus promotion at the six positions with mixed and custom heights; interruption continuing from the current position; `transform: none` at rest; the root's `offsetParent` is its list                                                                                                                                                                                                                                                                                                                                                   | S2     | —                      | AC-MO-2                                                                                         |
    | CF-22 | **1** (C F W): reduced-motion reflow is instant, with no reposition transition, fade or scale, and the lifecycle completes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | S2     | —                      | AC-MO-3. The operating system's own setting: P-29                                               |
    | CF-23 | **2** (C F W): frame metrics and screenshots of the overlapping `scale` × `transform` composition. **3:** human visual evaluation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | S2, S6 | MC-8                   | Only a material, human-visible problem reopens the P-18 and P-19 boundary                       |
    | CF-24 | **1** (C F W): the fill is anchored at the inline start (left in LTR, right in RTL), depletes toward it, and the vacated space opens at the inline end                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | S3     | —                      | AC-RTL-1, D-11                                                                                  |
    | CF-25 | **1** (C F W): AC-PR-1. The bar runs only while the toast is `visible` and not `data-paused`; hover and focus freeze it; resume continues from the held fraction without a reset. **2** (C): genuine blur by CDP minimise freezes and resumes it. **3:** genuine blur in Firefox and Safari                                                                                                                                                                                                                                                                                                                                  | S3     | MC-1, MC-5             | AC-PR-1. Overlaps CF-1, CF-5                                                                    |
    | CF-26 | **3** in every engine: after a genuinely hidden tab or minimised window, the bar shows the store's held value without run-ahead (T1). No automated layer: a dispatched `visibilitychange` is not evidence (D2-4)                                                                                                                                                                                                                                                                                                                                                                                                             | S6     | MC-1, MC-2, MC-3, MC-5 | Overlaps CF-5                                                                                   |
    | CF-27 | **2** (C F W): the computed `clip-path` at each fraction. **3:** the corner following the card's inner curve and the straight moving edge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | S3, S6 | MC-8                   | —                                                                                               |
    | CF-28 | Emulated: **1** (C F W), within CF-14. **3:** Windows High Contrast, the `CanvasText` fill with no track                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | S3, S6 | MC-6                   | With CF-14                                                                                      |
    | CF-29 | **1** (C F W, synthetic; layer A): commit past the distance threshold; commit by velocity, with explicit event timing and a margin; spring-back below; both directions at centre positions; the forbidden direction clamped; reason `swipe`; no start from a light-DOM interactive descendant. **1** (C, trusted CDP touch; layer B): distance commit, spring-back, centre directions, forbidden clamp, interactive descendants. **2** (C): a trusted velocity commit, since CDP cadence is coarse (D1). **1** (C F W, trusted mouse): a mouse drag never moves or dismisses. **3** (layer C): trusted touch on real devices | S5, S6 | MC-2, MC-3, MC-4       | AC-SW-1 (D2-3). Shadow roots: CF-38                                                             |
    | CF-30 | **1** (C, trusted CDP touch): vertical page scrolling that starts on a toast works under `pan-y` with no dismissal; `pointercancel` restores the toast with no dismissal. **2** (C): the angles at which Chromium hands a diagonal to scrolling (D1: 20° and 30° continue, 45° and 60° cancel), the browser's arbitration, not the product contract. **3:** scroll, diagonals and `pointercancel` on real devices                                                                                                                                                                                                            | S5, S6 | MC-2, MC-3, MC-4       | AC-SW-1 ("vertical scrolling still works"). Shares evidence with CF-41                          |
    | CF-31 | **2** (C, protocol pen): pen swipe and pen `touch-action`, never reported as pen evidence. **3:** real pen hardware                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | S5, S6 | MC-7                   | —                                                                                               |
    | CF-32 | **1** (C, trusted CDP touch): a programmatic dismissal mid-drag ends in exactly one dismissal, with the programmatic reason, and the toast `inert`; a genuine loss of capture mid-drag (`releasePointerCapture` from script) restores the toast with no dismissal (§19). **2** (C): the capture mechanics (`lostpointercapture`, where the next `pointerup` goes). **3:** on real touch devices where observable                                                                                                                                                                                                             | S5, S6 | MC-2, MC-4             | —                                                                                               |
    | CF-33 | **4** (C trusted; F and W synthetic): the restoration target and `:focus-visible` after a swipe dismissal of a focused toast. The contract decision waits for P-29 (D0-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                    | S5     | —                      | P-29. With CF-8                                                                                 |
    | CF-34 | **3:** pinch-zoom starting on a toast and on the page, on real devices; not reproducible by automation (D1). `pan-y` is kept (D0-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | S6     | MC-2, MC-3, MC-4       | P-26, with CF-42                                                                                |
    | CF-35 | **1** (C trusted; F and W synthetic): activation mid-reposition, Freeze Y, and repositions during a snap-back and a fly-out keep X with no jump. **2** (C F W): frame metrics of the one-frame fly-out hold. **3:** human judgement that the hold stays cosmetic                                                                                                                                                                                                                                                                                                                                                             | S5, S6 | MC-8                   | —                                                                                               |
    | CF-36 | **2** (C F W): opacity of a dismissal during the snap-back at production timing, an accepted cosmetic difference (D2-7). **1** (C F W, synthetic): the toast still completes its exit and is removed. Optional **3:** Chromium's first-frame step, observed on a device (non-blocking)                                                                                                                                                                                                                                                                                                                                       | S5     | MC-8 (optional)        | With CF-40. No P-18 or P-21 motion change                                                       |
    | CF-37 | **3:** real pen hardware: implicit capture, `buttons` on hover and with the barrel button, pointer-ID reuse across contacts, and the stale pending candidate. Chromium's protocol pen is not evidence for it                                                                                                                                                                                                                                                                                                                                                                                                                 | S6     | MC-7                   | D0-4: the re-base decision follows the evidence; no production change without D0-16             |
    | CF-38 | **2** (C trusted touch; F and W synthetic composed events): a swipe from an interactive element inside an open shadow root starts and commits, while the light-DOM equivalent never does. Evidence of a confirmed limitation, never asserted as the contract (D2-2)                                                                                                                                                                                                                                                                                                                                                          | S5     | —                      | P-26 documents the boundary; post-v2 candidate (§37). The light-DOM rule is Class 1 under CF-29 |
    | CF-39 | **2** (C F W, trusted mouse; C, trusted touch): a press on the toast body focuses the root (`tabindex="-1"`) and sets the focus-within reason. **3:** touch and pen presses on real devices                                                                                                                                                                                                                                                                                                                                                                                                                                  | S5, S6 | MC-2, MC-3, MC-7       | Existing pointer-focus behaviour, not a contract                                                |
    | CF-40 | **2** (C F W): with CF-36, that no running opacity transition overrides P-18's exit fade (D2-7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | S5     | —                      | Same specs as CF-36, tracked separately                                                         |
    | CF-41 | As CF-30: **1** (C, trusted); **2** (C, diagonal angles); **3** on real devices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | S5, S6 | MC-2, MC-3, MC-4       | Shares evidence with CF-30, tracked separately                                                  |
    | CF-42 | **4:** the evidence on retaining `touch-action: pan-y`, assembled from CF-30, CF-34 and CF-41. No CSS change (D0-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | S6     | MC-2, MC-3, MC-4       | P-26                                                                                            |
    | CF-43 | Not a check. A rule: P-21's iPhone Safari and Android Chrome feel approvals satisfy no CF item; every manual layer above is fresh, recorded P-22 evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | S6     | —                      | —                                                                                               |
    | H1-R  | **1** (C F W): D1b's five H1 cases, with 4000 px before `<Toaster />`: `scrollY` unchanged, and focus on the §18 target (the control case stays on `<body>`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | S4     | —                      | AC-KB-1 must not regress                                                                        |

    **Where D2 differs from D1's provisional table:**
    - CF-12: the timing of `:focus-visible` is Class 2, not 4 (D2-6).
    - CF-17: the timing when the region is hidden before creation is Class 2 in every engine, not 1 in Chromium and Firefox, so no blocking assertion depends on an engine's handling of that case (D2-10). The fallback-timing contract is proven by the paused-animation cases.
    - CF-29: a trusted velocity commit in Chromium is Class 2; velocity is blocking in layer A.
    - CF-30 and CF-41: the diagonal hand-over angles are Class 2, the browser's arbitration.
    - CF-32: the library outcomes are Class 1 in Chromium, and the capture mechanics stay Class 2.
    - CF-35: the one-frame hold is Class 2 evidence plus a Class 3 human judgement, instead of "3 or 4".
    - CF-36: lifecycle completion after the dismissal is Class 1.
    - CF-39: D1's evidence was a mouse press; the item asks about touch and pen, so the touch and pen layers are added.

  - **Acceptance criteria covered by P-22.** Each is met only when every listed layer has passed. Wording unchanged.

    | Criterion | Blocking automation (C F W unless stated)                                | Evidence and manual layers                                            |
    | --------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
    | AC-MO-1   | CF-16, CF-20                                                             | —                                                                     |
    | AC-MO-2   | CF-21                                                                    | CF-23 (MC-8)                                                          |
    | AC-MO-3   | CF-18, CF-22                                                             | The operating-system setting: P-29                                    |
    | AC-LC-2   | CF-17                                                                    | CF-17's Class 2 timing                                                |
    | AC-PR-1   | CF-25                                                                    | CF-25 blur (Class 2 in C; MC-1, MC-5); CF-26 (MC-1, MC-2, MC-3, MC-5) |
    | AC-RTL-1  | CF-15, CF-24                                                             | —                                                                     |
    | AC-SW-1   | CF-29 layer A (C F W) and mouse (C F W); CF-29 layer B, CF-30, CF-41 (C) | CF-29, CF-30, CF-41 layer C (MC-2, MC-3, MC-4); CF-38 boundary (P-26) |
    | AC-CI-1   | The blocking `browser` job (S1)                                          | —                                                                     |
    | AC-KB-1   | Must not regress: H1-R, CF-6                                             | —                                                                     |

  - **Harness design (locked for S1).**
    - **Target:** a dedicated page under `browser/harness/` that mounts the real public entry, `src/index.ts`, with React 18.2, built in production mode, and loads `src/styles.css` byte for byte, served as a static file and never processed by a CSS pipeline. Not the demo, not its prototype stylesheet, and not the packed tarball (D0-10).
    - **Build and serving:** Vite, already a direct dev dependency, through a dedicated config for the harness, started by Playwright's `webServer`. The only new dependency is `@playwright/test`.
    - **No test hooks in `src/`.** The harness drives the library only through its public API, consumer-style CSS and the DOM.
    - **Harness API (`window`):** mount `<Toaster />` with given props; create, replace and dismiss toasts; set `dir`; apply token overrides on `.ret-toaster` through harness CSS; a long-page fixture for H1-R; an event log (animation, transition, pointer, focus and `onDismiss` with its reason and time); and a helper that starts a trigger and its `requestAnimationFrame` sampler in the same task (D2-12). Scenarios are selected through the URL so each test starts from a fresh page.
    - **Location and tooling:** `playwright.config.ts` at the root; specs in `browser/tests/`; a `tsconfig.browser.json` added to `typecheck` and the root references, so ESLint's `projectService` covers every file (D0-10); Prettier as for the rest of the repository. Vitest's include is `src/**/*.test.{ts,tsx}`, so the specs are already outside it; S1 confirms that and adds an exclusion only if needed.
    - **Scripts:** `test:browser` (the blocking suite, `--grep-invert @evidence`), `test:browser:evidence` (the `@evidence` specs) and `browser:serve` (the harness for manual checkpoints, reachable from a device on the local network only when asked).
    - **Evidence specs:** Class 2 and Class 4 specs carry the `@evidence` tag, never run in the blocking job, and assert only that their scenario ran. They are run by each slice that adds them and again at S6, and their observations are recorded in this plan.
    - **Engine gating:** a test that needs one engine (Chromium CDP touch, pen, minimise, the accessibility tree, safe-area overrides) skips elsewhere with a reason naming the manual checkpoint or gap that covers it, so the report shows the gap.
  - **Timing approach (locked):**
    - Real browser timing (D0-11). Waits are on events, observable state or `expect.poll` with bounded timeouts, never fixed sleeps. A deliberate delay is allowed only where the scenario needs one (a dismissal some milliseconds after release), as a named constant.
    - Token slowing through harness CSS is allowed for observation. Production timing is used wherever the contract is about production timing (CF-36, CF-40).
    - Fallback timing (CF-17) is checked against the computed duration plus the 100 ms margin, with a strict lower bound (never earlier, less one frame) and a generous, named upper bound for CI noise, set in S2 from measurement and confirmed by the soak. Early completion is the defect; lateness is noise.
    - Motion is asserted through settled states, event names, per-frame continuity with bounded steps, and monotonicity where the contract implies it. An engine's interpolation curve is never asserted.
  - **CI mechanics (locked for S1):**
    - A `browser` job in `ci.yml` on `ubuntu-latest`, with the existing triggers, `permissions: contents: read`, Node 24 (`NODE_VERSION`) and a timeout of 20 minutes.
    - Steps: checkout and `setup-node` at the same pinned SHAs as the other jobs, with `persist-credentials: false` and the npm cache; `npm ci --ignore-scripts --no-audit --no-fund`; `npx playwright install --with-deps chromium firefox webkit`; `npm run test:browser`; on failure only, `actions/upload-artifact` pinned to a full commit SHA, uploading the report and traces with a short retention.
    - Playwright: `retries: 0`, `forbidOnly` in CI, headless, one worker in CI to begin with (raised only if the soak shows timing stays deterministic), traces and screenshots retained on failure only.
    - Browser binaries are not cached in S1. The cost is accepted (D2-11); caching is revisited only with measurement and a recorded decision.
    - `@playwright/test` is pinned exactly. S1 records its version and the three engine versions. Dependabot updates pass through the blocking job like any other.
  - **Rules for every S slice:**
    - One slice at a time, each stopping for the maintainer's review, as D0 to D2 did.
    - No change to `src/`, the production stylesheet, the public API, the 30 tokens, or a P-16 to P-21 contract. A Class 1 failure that exposes a production defect stops the slice under D0-16.
    - A Class 1 item that proves unreliable in an engine is not retried, skipped, loosened or downgraded quietly. The slice stops and reports; a class changes only by a decision recorded in this plan.
    - No disposable spike infrastructure; everything committed is the permanent suite.
    - Each slice records in this plan what it added, the CF items and layers it covered, its `@evidence` observations, and its validation.
    - Validation: `format:check`, `lint`, `typecheck`, `npm test`, `npm run test:browser` in all three engines, and `git diff --check`; with `validate:package`, `typecheck:demo` and `build:demo` whenever configuration or dependencies change.
    - Nothing is pushed until the maintainer asks.
  - **Implementation sequence (locked):**
    1. **S1, infrastructure and the harness.**
       - Entry: D2 committed and reviewed; a clean tree on `feat/p22-browser-qa`; P-22 not past 2026-10-28 without a maintainer decision (D2-15).
       - Scope: `@playwright/test` pinned exactly; `playwright.config.ts` with the three projects and the settings above; the harness, its API and its tsconfig; lint and typecheck coverage; the scripts; `.gitignore` for the report, results and harness output; confirmation of the Vitest exclusion; the `browser` job; smoke specs (Class 1, C F W): the harness loads, the served stylesheet is byte-identical to `src/styles.css`, and a toast renders and closes by its close button with one `onDismiss`.
       - Exit: the smoke specs pass in all three engines locally; full validation passes; the job is reviewed against the CI mechanics. Its first real CI run comes when the branch is pushed for the PR.
       - Not in scope: any CF spec; retries; browser caching; React 19; Node 26; demo changes; production changes.
    2. **S2, lifecycle, motion and reflow.**
       - Entry: S1 reviewed.
       - Scope: CF-16 to CF-22 at their Class 1 layers; CF-17's Class 2 timing (including the WebKit observation) and CF-23's frame metrics as `@evidence`; the fallback tolerance constants from measurement.
       - Exit: AC-MO-1, AC-MO-2, AC-MO-3 and AC-LC-2 have their blocking automation in all three engines.
       - Not in scope: a fix for the WebKit `display: none` observation; motion-code changes; swipe.
    3. **S3, layout, RTL, progress and forced colours.**
       - Entry: S2 reviewed.
       - Scope: CF-14, CF-15, CF-24 and CF-25 at their Class 1 layers; CF-28's emulated layer; CF-15's CDP override, CF-25's CDP blur and CF-27's `clip-path` as `@evidence`. Forced-colours assertions compare against system colours resolved in the same page, not hard-coded values.
       - Exit: AC-PR-1 and AC-RTL-1 have their blocking automation in all three engines; forced colours are blocking in all three.
       - Not in scope: hidden documents; Windows High Contrast; CSS changes.
    4. **S4, focus, `inert` and the environment.**
       - Entry: S3 reviewed.
       - Scope: H1-R; CF-2, CF-6, CF-11, CF-12 and CF-13 at their Class 1 layers; CF-1, CF-3, CF-4, CF-5 (blur), CF-9, CF-10, CF-11 (Chromium tree) and CF-12 (script focus) as `@evidence`; CF-7 and CF-8 as Class 4 `@evidence`. If trusted Tab does not produce `:focus-visible` in an engine, S4 stops and reports instead of forcing it.
       - Exit: H1-R blocking in all three engines; the focus layers recorded.
       - Not in scope: a change to restoration, the hotkey, Escape or the focus rings; a pointer-close contract change (D0-2); a dispatched `visibilitychange`.
    5. **S5, swipe.**
       - Entry: S4 reviewed.
       - Scope: CF-29 layers A and B and the mouse; CF-30, CF-32 and CF-41 at their Chromium Class 1 layers; CF-35 continuity; CF-36's completion; CF-29's trusted velocity, CF-30's and CF-41's diagonals, CF-31, CF-32's capture mechanics, CF-35's hold, CF-36, CF-38, CF-39 and CF-40 as `@evidence`; CF-33 as Class 4 `@evidence`. Velocity uses explicit event timing with a margin.
       - Exit: AC-SW-1's automated layers (A in all three engines; B in Chromium) are blocking.
       - Not in scope: `composedPath()` or any Shadow DOM fix; a pen re-base change; a `touch-action` change; motion-code changes.
    6. **S6, manual evidence, soak, reconciliation and release gate.**
       - Entry: S5 reviewed.
       - Scope:
         - MC-1 to MC-8 recorded, or each missing environment recorded as an unverified gap and reported (CF-26, CF-34, CF-37, CF-42 and every Class 3 layer above);
         - the `@evidence` specs run again and recorded;
         - the soak: the blocking suite with `--repeat-each=20` locally in all three engines with no failure, and, once the branch is pushed for the PR, at least three further `browser` runs on it with no failure; a flake is fixed at its cause or reported, never retried;
         - reconciliation of every CF item, H1-R and acceptance criterion against this record;
         - carry-forwards written into the P-26 entry (the Shadow DOM boundary, `touch-action` and pinch-zoom, emulated versus real forced colours, and the browser-support evidence) and the P-29 entry (CF-7, CF-8, CF-11, CF-33 and the operating-system settings), and CF-38 into §37;
         - the status lines; full validation.
       - Exit: every CF item and AC layer is traced to its evidence or to a reported gap; validation passes; then the publication review and the PR into `v2` (merge commit), when the maintainer asks.
       - Not in scope: a production change without D0-16; closing a CF item with P-21's approvals (CF-43).
  - **Contradictions reconciled at D2.** None needs a change to an approved decision.
    - **§19 and AC-SW-1 against CF-38.** §19 says a swipe never starts on interactive descendants, including inside custom content, and AC-SW-1 says it never starts on interactive elements. Shadow-root controls are the confirmed exception. D0-3 anticipated this outcome, and D2-2 accepts it as a documented boundary: the wording is unchanged, the light-DOM rule is blocking (CF-29), and P-26 documents the boundary. How AC-SW-1's sign-off treats it is P-29's judgement.
    - **§26 "forced colours (Chromium)" and D0-8:** extended to all three engines on measured capability (D2-5).
    - **§26 "the latest React":** read as React 18.2 during P-22 (D0-9, D2-14).
    - **CF-12:** D1's Playwright evidence differs from P-17 S5's manual Chromium review. It is recorded as evidence, not reconciled by changing either (D2-6).
    - **CF-17:** D1b recommended blocking timing under `display: none` in Chromium and Firefox; D2-10 keeps that hidden-before-creation timing out of the blocking gate in every engine.
    - **P-20's carry-forward** names WebKit and Firefox for pause synchronisation; D2 makes it blocking in all three.
  - **Open items that do not block S1:**
    - The maintainer's access to the MC-1 to MC-7 environments, in particular Firefox for Android, pen hardware per engine, a Windows contrast theme and macOS Safari. Needed by S6.
    - The Node 26 date (2026-10-28, D2-15).
    - CF-37's re-base decision, after MC-7.
    - The pointer-triggered restoration contract (CF-8, CF-33), after P-29.
- **S1 record: infrastructure and the harness (done).** It follows the D2 harness design, timing approach and CI mechanics. No CF item is covered or classified: the smoke specs prove the infrastructure only. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged.
  - **Dependency:** `@playwright/test` **1.63.0**, pinned exactly in `devDependencies`. It is the current release and the version D1 and D1b used, so the engines are the same: Chromium 153.0.8010.12 (with its headless shell), Firefox 155.0 and WebKit 26.6. The lockfile adds three packages, `@playwright/test`, `playwright` and `playwright-core`, all 1.63.0 and Apache-2.0, with no install scripts and no other dependencies. Nothing else was added.
  - **React:** the harness runs the repository's React, the `^18.2.0` range the lockfile resolves to **18.3.1**, which is what "React 18.2" means throughout P-22 (D2-14). A smoke spec checks that the page runs exactly the installed version. Node stays 24.
  - **Layout:**
    - `playwright.config.ts`: the three projects and the run settings.
    - `browser/vite.config.ts`: builds and serves the harness.
    - `browser/harness/index.html`, `main.tsx` and `api.ts`: the harness page, its entry and the type of its control surface.
    - `browser/tests/harness.ts` (shared helpers, `openHarness`) and `browser/tests/smoke.spec.ts`.
    - `tsconfig.browser.json`: the TypeScript project for all of the above.
    - Generated and ignored: `browser-dist/` (the built harness) and `browser-results/` (results, traces, screenshots and the CI report).
  - **Projects:** `chromium`, `firefox` and `webkit`, each set by `browserName` with a 1280 × 720 viewport. No device descriptor is used, so no project name or descriptor says Safari. WebKit's own default user-agent string still claims Safari (D1), which is why a user-agent string never identifies Safari in this suite.
  - **Run settings:** headless; `retries: 0`; `forbidOnly` and one worker under `CI`; traces retained on failure and screenshots only on failure; the `list` reporter, plus an HTML report under `CI` that is uploaded only on failure. No project has an exemption or a skip.
  - **Harness:**
    - **Build:** Vite (already a direct dev dependency) with `@vitejs/plugin-react` builds `browser/harness` in production mode from the real public entry, `src/index.ts`: React's production build, no test hooks in `src/`. Playwright's `webServer` runs `npm run browser:serve`, which builds and starts `vite preview` on `127.0.0.1:4180` (`strictPort`; an existing server is never reused, so every run tests a fresh build).
    - **Production stylesheet:** never imported through Vite's CSS pipeline. A small Vite plugin in `browser/vite.config.ts` reads `src/styles.css` at build time, emits it unchanged as `/styles.css` and links it from the page after Vite has processed the HTML. The guard is a smoke spec, not discipline: the served bytes must equal `src/styles.css`, and it must be the page's only stylesheet. A mutation that appended one byte made that spec fail. The demo, its prototype stylesheet and the packed tarball are not used.
    - **Control surface (`window.__retHarness`, typed in `api.ts`):** `reactVersion`; the public `toast` facade, unchanged; `mount(props)`, which renders `<Toaster {...props} />` and commits synchronously (`flushSync`); `unmount()`; and an event log (`events`, `log(type, detail)`, timed with `performance.now()`). The page sets it only after the stylesheet has loaded and the default `<Toaster />` is mounted, and `openHarness` waits for it. Each test opens a fresh page. Scenarios drive the library through this surface and the DOM, never through demo UI. Nothing in `browser/` is part of the package (`files` is `dist` only, and `npm pack --dry-run` lists no harness file).
    - **Sampling rule (D2-12):** a spec that observes from the first frame runs its trigger and its `requestAnimationFrame` sampler inside one `page.evaluate` callback, which is one page task. Because the harness exposes the public facade in the page, the trigger can be any library call made there. S2 adds the sampler helper to the harness surface when its first motion spec needs it. `requestAnimationFrame` is never mocked.
  - **Tooling separation:**
    - `tsconfig.browser.json` (DOM and Node types) covers `browser/` and `playwright.config.ts`. It is referenced from the root `tsconfig.json`, so ESLint's `projectService` resolves every browser file, and `npm run typecheck` checks it as its fourth project.
    - ESLint lints `browser/` and `playwright.config.ts` with type information. The harness gets the same React, hooks and `jsx-a11y` rules as `src/`. Only the generated `browser-dist/` and `browser-results/` are ignored, by ESLint, Prettier and Git.
    - Vitest's include stays `src/**/*.test.{ts,tsx}`: it lists the same 40 files, all under `src/`, so no exclusion was needed. Playwright's `testDir` is `browser/tests` with `testMatch` `**/*.spec.ts`: it lists 9 tests (3 specs × 3 projects) in one file and nothing from `src/`.
  - **Scripts:**
    - `npm run test:browser`: the blocking suite (`playwright test --grep-invert @evidence`). One engine: `npm run test:browser -- --project=webkit`.
    - `npm run browser:serve`: builds and serves the harness on `127.0.0.1:4180`; `npm run browser:serve -- --host` exposes it on the local network for a manual checkpoint.
    - `npm run typecheck` now includes the browser project; there is no separate command.
    - `test:browser:evidence`, which D2 lists, is deferred to S2, the first slice with an `@evidence` spec, rather than added with nothing to run.
    - First local run: `npx playwright install chromium firefox webkit` (with `--with-deps` where the host allows `apt`).
  - **CI:** a `browser` job in `ci.yml`, blocking like every job, on the existing triggers and the workflow's `permissions: contents: read`:
    - checkout (`persist-credentials: false`) and `setup-node` at the same pinned SHAs as the other jobs, with Node 24 and the npm cache;
    - `npm ci --ignore-scripts --no-audit --no-fund`;
    - `npx playwright install --with-deps chromium firefox webkit`, Playwright's documented install for Ubuntu runners;
    - `npm run test:browser`;
    - on failure only, `actions/upload-artifact` v7.0.1 pinned to `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, uploading `browser-results/` with a 7-day retention.

    A timeout of 20 minutes. No browser cache (D2-11), no macOS runner, no debug step. Its first real run comes when the branch is pushed for the PR.

  - **Smoke coverage (Class 1 in C, F and W; the same three specs in every engine):**
    - the harness loads the real library on the installed React, and the region (`Notifications`) is in the page;
    - `/styles.css` is byte-identical to `src/styles.css` and is the only stylesheet;
    - a success toast renders with its class and text, reaches `data-phase="visible"`, sits in a `position: fixed` list at `top-right` with `--ret-offset` resolving to `16px` (values only the production stylesheet sets), and its close button removes it with exactly one `onDismiss`, reason `close-button`.

    It does not exercise motion, reflow, progress, focus, swipe or forced colours.

  - **Security and supply chain:**
    - **Dependency:** exactly the three Playwright packages, with exact versions and registry integrity hashes in the lockfile. None has an install script, and CI still runs `npm ci --ignore-scripts`.
    - **Browser installation:** the browsers are downloaded only by the explicit `playwright install` step, from Playwright's CDN, at the builds pinned by 1.63.0. `--with-deps` installs Ubuntu packages with `sudo apt-get` on the runner.
    - **Workflow:** the job adds no permission (`contents: read` for the workflow). Checkout keeps no credentials. Every action is pinned to a full commit SHA with its version comment. The only new action is GitHub's own `actions/upload-artifact`: it is needed to return failure diagnostics, and it needs no token permission.
    - **Artifacts:** only on failure, only `browser-results/` (hidden files excluded by default), kept 7 days. They hold the HTML report, traces (DOM snapshots, screenshots, console output and the network log of the harness on loopback) and screenshots. The harness renders only test text from the specs, and the job has no secrets, so no sensitive data can reach them. In a public repository they can be downloaded by other GitHub users.
  - **Local environment (not permanent tooling).** This Windows WSL2 host has no root, so the local runs used Playwright's own browsers with their missing system packages extracted into the session's scratch space. They were found with `playwright install-deps --dry-run`, fetched with `apt-get download` and unpacked with `dpkg -x`. The runs set `PLAYWRIGHT_BROWSERS_PATH` (a scratch tree linking the browsers, with the WebKit MiniBrowser's `sys/lib` pointing at the extracted libraries), `LD_LIBRARY_PATH` and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS`. None of it is in the repository, the config or CI. CI installs dependencies normally.
  - **Validation:**
    - Focused: `tsc -p tsconfig.browser.json` and ESLint on the new files pass. The smoke specs pass in Chromium (3), Firefox (3) and WebKit (3).
    - Full blocking suite under `CI=1` (one worker): 9 passed in about 8.5 s, including the harness build. Locally (three workers): about 8.8 s. A repeat run (`--repeat-each=5`, one worker): 45 passed in about 40 s. The real soak stays in S6.
    - Browser downloads: Chromium 393 MB, the headless shell 261 MB, Firefox 306 MB, WebKit 269 MB and ffmpeg 5 MB; about 25 s to download here.
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,689 tests), `validate:package`, `build:demo` and `git diff --check` all pass. The workflow parses, with jobs `quality`, `test`, `build-package`, `browser` and `demo`.
  - **Carried forward to S2:**
    - the `requestAnimationFrame` sampler helper on the harness surface (D2-12);
    - `test:browser:evidence` with the first `@evidence` spec;
    - the fallback tolerance constants (the D2 timing approach);
    - harness additions as their slices need them: `dir` (S3), token overrides through harness CSS (S2), and the long-page fixture for H1-R (S4).
- **S2 record: lifecycle, motion and reflow (done).** CF-16 to CF-22 at their Class 1 layers are blocking in Chromium, Firefox and WebKit, and CF-17's and CF-23's Class 2 layers are recorded as evidence. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, and no CF item was reclassified.
  - **React baseline (clarified at S2).** P-22 uses the repository's existing React 18 baseline: the unchanged `^18.2.0` range, currently resolved by the lockfile to **React 18.3.1**. Where D0-9, D2-14 and the S1 record say "React 18.2", they mean this baseline. React is not pinned or downgraded to 18.2.0. P-23 owns React-version compatibility and React 19. This is a clarification, not a dependency change.
  - **Specs added** (`browser/tests/`; 31 blocking tests per engine, 93 in all with the S1 smoke, and 2 evidence tests per engine):
    - `motion.spec.ts` (12 per engine):
      - enter and exit at all six positions with the public motion tokens slowed (enter 600 ms, exit 400 ms, diagnostic). Each checks the edge's trusted `ret-enter-*`/`ret-exit-*` playback, the off-edge start and the frame-by-frame interpolation of `translate`, `scale` and `opacity`, `transform` untouched, completion on the root's own `animationend`, the exit's last frame held at it, removal, and a clean rest at the stack's gutters (left positions at the gutter, D-14);
      - the same at production timing (180 ms and 120 ms) at `top-right` and `bottom-left`, without frame-count or interpolation checks;
      - the spinner turning about its own centre, its `rotate` interpolating and its events never completing the toast (the enter held and slowed to 1.5 s, diagnostic);
      - reduced motion at `top-right` and `bottom-left`: no translation, scale or fade in any frame, no root animation, the lifecycle completing with one `onDismiss`; and a still spinner.
    - `lifecycle.spec.ts` (6 per engine), with the root's animation held by consumer CSS (`animation-play-state: paused`) or the region hidden:
      - the enter and the exit completing at the computed fallback;
      - an overridden `--ret-exit-duration` (600 ms) moving it;
      - a descendant's trusted `animationend`, a wrong name on the root and the library's name on a descendant (both synthetic) never completing the exit;
      - completion and timing with the region hidden after the toast is shown;
      - completion, without timing, with the region hidden before creation (D2-10).
    - `reflow.spec.ts` (10 per engine):
      - at all six positions, with mixed heights (a described toast, a 96 px custom toast and a plain one) and `maxVisible: 2`: an insertion, a removal with promotion (the queued toast promoted in the removal's commit), and a removal after the exit, ending at the gutter;
      - an interrupted move at `top-right` and `bottom-right`;
      - reduced-motion repositioning at `top-right` and `bottom-left`.
    - `motion.evidence.spec.ts` (`@evidence`, 2 per engine): CF-17's fallback timings and CF-23's composition offset.
  - **CF and AC mapping:**
    - **CF-16, AC-MO-1:** `motion.spec.ts`, enter and exit, at all six positions.
    - **CF-17, AC-LC-2:** `lifecycle.spec.ts` (Class 1); the hidden-before-creation timing in `motion.evidence.spec.ts` (Class 2).
    - **CF-18, AC-MO-3:** the reduced-motion tests in `motion.spec.ts`.
    - **CF-19:** the spinner tests.
    - **CF-20:** the `translate`, `scale`, `opacity` and `rotate` interpolation checks.
    - **CF-21, AC-MO-2:** `reflow.spec.ts`, stack repositioning and the interrupted move.
    - **CF-22, AC-MO-3:** `reflow.spec.ts`, reduced-motion repositioning.
    - **CF-23:** `motion.evidence.spec.ts` (Class 2). Its human visual evaluation stays MC-8, in S6.
  - **Harness extensions** (`browser/harness/`; observation only: it never completes, times or moves a toast):
    - **`sampleFrames(read, options)`:** reads `read()` synchronously as frame 0, then in each `requestAnimationFrame` callback, which is never mocked.
      - `onFrame(n)` runs in frame n's callback after its read, so a second trigger acts in that frame's task.
      - `until` stops the sampling.
      - `atToastMutations` also reads in a MutationObserver callback whenever toast roots are added or removed: after the renderer's commit and layout effects and before the next frame. That read is the seeded position itself.
    - **The event recorder:** from page load, animation and transition events inside toasts (captured on the document before the library sees them), each toast root's `phase` change, and roots `added` and `removed`, including roots that leave inside their list. Each entry has a label, `root`, the animation or property name and `isTrusted`. Specs label a toast with the class `h-<label>`.
    - **`toastState(label)`:** the bounding rectangle, the layout box, the computed `transform` (and its Y), the individual `translate` and `scale` (and their Y parts), opacity, `animation-name`, `data-phase`, and whether the offset parent is the list.
    - **`toastRoot(label)`** and **`setStyle(css)`:** consumer-style CSS in one harness `<style>` after the production stylesheet, for token slowing and test markup only. The production stylesheet is untouched. The S1 smoke still checks that a fresh page has no other stylesheet.
    - **Shared spec helpers (`browser/tests/harness.ts`):** `openReducedMotionHarness` (Playwright's `prefers-reduced-motion: reduce` emulation, with the media query checked as a precondition only); `expectInterpolatedMove`, which requires a move with no reversal and at least one value strictly between its ends; `timeToken`, `showToast` and `timeDismissal`.
  - **Sampling (D2-12).** Every first-frame observation starts its sampler and its trigger in one `page.evaluate`. Frame 0 is the pre-trigger state, and for repositioning the commit-time read is the seeded state; later frames are the interpolation, and the last is the rest.
  - **Timing and tolerances:**
    - **Fallback timing:** checked against the computed token plus the documented 100 ms margin. The margin is written in the spec, not imported, so a change to the implementation's constant fails. The lower bound is the fallback less one frame (16.7 ms), because early completion is the defect. The upper bound is the fallback plus `LATE_TOLERANCE_MS` (150 ms), because lateness is scheduling noise. Measured lateness was 1 to 3 ms in every engine, once 33 ms (Firefox). Both constants are in `browser/tests/harness.ts` and are not product constants.
    - **Completion on the animation event:** within 50 ms of the root's `animationend` (the fallback would come 100 ms after the nominal end). The completion is logged in the same task as the event, so load does not widen that gap.
    - **Positions:** half a pixel. Scale and opacity have their own tolerances (0.001 and 0.005).
    - **Frame-by-frame interpolation** is checked with slowed tokens, because a 120 ms exit can fall between two frames of a loaded machine. Production timing is used where the contract is about it: completion, the held frame, the fallback and every reflow. No test asserts a frame count or an engine's curve.
  - **Harness lessons (not product observations):**
    - **WebKit advances running motion with the clock inside a task.** Chromium and Firefox hold a frame's animation time for the whole task. Measured: two reads 20 ms apart in one task differed by 6 to 8 px of motion in WebKit and by 0 elsewhere. So a read after a commit and a read before it differ by the motion in between: 1.1 px over React's commit, and up to 6.8 px when the next frame read came well after a commit made between frames. The reflow checks therefore read the seed at the commit (`atToastMutations`). The interrupted move compares reads just before and just after the commit, allowing only the motion the elapsed time explains at the sampled speed. Neither loosens the contract: a seed that ignored the toast's current position jumped 30 to 42 px.
    - **CPU headroom.** Eight parallel workers on the 7 GB WSL host starved a page for longer than the 100 ms margin, and Chromium then completed an exit on its fallback, as designed, before `animationend` arrived. Local runs are capped at three workers; CI uses one.
  - **Mutation checks**, each a temporary edit reverted at once (`git status` clean):
    - margin 0: 5 of 6 lifecycle tests fail;
    - completing on any `animationend`: the unrelated-events test fails;
    - ignoring the root's own `animationend`: 6 motion tests fail;
    - a seed that ignores the toast's current translation: both interrupted-move tests fail in every engine;
    - no seeding: every non-reduced reflow test fails (24), and the reduced-motion ones, which need no seed, pass.
  - **Class 2 evidence** (`npm run test:browser:evidence`; elapsed from the dismissal to `onDismiss`, against the computed fallback):

    | Scenario                                                                   | Expected | Chromium | Firefox    | WebKit     |
    | -------------------------------------------------------------------------- | -------- | -------- | ---------- | ---------- |
    | Held animation, default exit                                               | 220 ms   | 222 ms   | 223 ms     | 222 ms     |
    | Held animation, exit token 600 ms                                          | 700 ms   | 702 ms   | 703 ms     | 703 ms     |
    | Hidden after shown                                                         | 220 ms   | 221 ms   | 222 ms     | 222 ms     |
    | Hidden before creation, dismissed once visible                             | 220 ms   | 221 ms   | 221–222 ms | 221–222 ms |
    | Hidden before creation, dismissed once visible, exit token 600 ms          | 700 ms   | 701 ms   | 702–733 ms | 701–702 ms |
    | Hidden before creation, dismissed while entering (a frame after rendering) | 220 ms   | 221 ms   | 222 ms     | **1–2 ms** |
    | The same, exit token 600 ms                                                | 700 ms   | 701 ms   | 701–702 ms | **1 ms**   |
    - **The WebKit observation (D2-10), narrowed.** It reproduces only when a toast in a region hidden before creation is dismissed **while still entering**. Once the toast has completed its enter (on its fallback, since nothing renders), WebKit follows the computed timing like the other engines. That fits D1b's stale `entering` style: the change from `entering` to `exiting` happens with nothing rendered. Nothing is visible, and the lifecycle completes with one `onDismiss`. It stays a known WebKit observation (Class 2): no blocking timing assertion and no production change. D0-16 was not invoked.
    - **CF-23, the `scale` × `transform` composition** (production timing; a toast entering or exiting while a later insertion moves it): the rendered top departs from layout plus `translate`, `transform` and the scale's own centring by at most **0.62 px** in Chromium, **0.92 px** in Firefox and **0.45 px** while entering, and about **0.2 px** while exiting in every engine. That is within the 1.79 px P-19 accepted. No new evidence reopens the boundary. The human visual evaluation stays MC-8 (S6).

  - **Commands:**
    - `npm run test:browser`: the blocking suite (93 tests);
    - `npm run test:browser -- --project=<engine>`: one engine;
    - `npm run test:browser:evidence`: the `@evidence` specs only. Added now that evidence specs exist. Its tests assert only that their scenarios ran and never join the blocking gate (`test:browser` excludes `@evidence`).
  - **Validation:**
    - Focused: `npm run test:browser -- --project=<engine>` passes 31 of 31 in Chromium (about 16 s), Firefox (about 21 s) and WebKit (about 18 s).
    - Full blocking suite under `CI=1` (one worker): 93 of 93 in about 1.6 minutes, including the harness build. The `@evidence` run: 6 of 6.
    - **Soak:** the blocking suite with `--repeat-each=10` under `CI=1` (one worker, zero retries): **930 of 930** passed in 16 minutes. Before that, `--repeat-each=5` with the local three workers: 465 of 465.
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,689 tests, still only `src/`), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Carried forward:**
    - **S3:** `dir` on the harness when the RTL specs need it; the evidence specs' pattern for CF-15's and CF-25's Chromium layers and CF-27.
    - **S6:** CF-23's human visual evaluation (MC-8); rerunning the `@evidence` specs; the soak of the final suite.
- **S3 record: layout, RTL, progress and forced colours (done).** CF-14, CF-15, CF-24 and CF-25 at their Class 1 layers, and CF-28's emulated layer, are blocking in Chromium, Firefox and WebKit. CF-15's CDP override, CF-25's CDP blur and CF-27's clip are recorded as evidence. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, and no CF item was reclassified.
  - **Specs added** (`browser/tests/`; 13 blocking tests per engine, so the blocking suite is now 44 per engine and 132 in all; 3 evidence tests):
    - `layout.spec.ts` (7 per engine):
      - at each of the six positions, one described toast, read three ways: in LTR at 1280 × 720, in RTL (`dir="rtl"` on the document), and in a 320 × 640 viewport;
      - the zero-inset test.
    - `progress.spec.ts` (4 per engine): off by default; the depletion, hover pause and timeout; the focus pause; the direction in LTR and RTL.
    - `forced-colors.spec.ts` (2 per engine): the card edge, the action border, the fill, the strip and the icons; and the `Highlight` rings.
    - `layout.evidence.spec.ts` (`@evidence`): CF-15 and CF-25 in Chromium only (skipped elsewhere with a reason naming MC-2 and MC-3, or MC-5 and MC-1), and CF-27 in all three.
  - **Layout and RTL strategy (CF-15's zero-inset layer; AC-RTL-1 with CF-24).** Expected geometry comes from the public tokens read in the page (`--ret-offset` 16 px, `--ret-width` 360 px), compared within about a pixel. Bounding rectangles and the document's `scrollWidth` are checked; no CSS declaration is inspected for placement.
    - **Every position:** the stack is `min(--ret-width, viewport − 2 × --ret-offset)` wide and sits `--ret-offset` from its physical edges (centre stacks centred). The toast fills the stack, nothing crosses a gutter, and nothing overflows horizontally.
    - **RTL:** every stack keeps the left edge it has in LTR, so positions stay physical. Inside the card, the icon moves to the right and the close to the left, with their insets mirrored exactly.
    - **Narrow (320 px):** the stack is 288 px wide at the same position.
    - **Zero insets:** with `viewport-fit=cover`, each `env(safe-area-inset-*)` resolves to `0px` (not the fallback), and the gutters stay at `--ret-offset`.
  - **Progress strategy (AC-PR-1, CF-25; AC-RTL-1, CF-24).** The fill is the production CSS animation. The spec never drives it, and never computes anything from production code.
    - **What is read:** the harness's `progressState(label)`, which is the fill's horizontal scale from its computed `transform`, its play state, and the fill and strip rectangles. Each is read with the page time of the same frame. The toast's `visible` time comes from the harness recorder.
    - **The expectation, from the contract:** the fill shows the share of the duration still to run, `1 − running time / duration`, within 0.05 of the duration (200 ms of a 4 s toast).
    - **Off by default:** a default toast has no strip. A finite normal toast with `progress: true` has one, and so does one inheriting the Toaster's `progress`. A persistent toast, a loading toast and a custom toast have none.
    - **Hover:** a trusted pointer over the stack sets `data-paused`. The fill's play state is `paused`, and it holds within 0.002 for 600 ms. When the pointer leaves, the fill resumes from the held fraction (never above it, within 0.05) and depletes again. The timeout then comes when the remaining time has run: at the visible time plus the duration plus the pause, not a full duration after the resume (D-08). `onDismiss` reports `timeout`.
    - **Focus:** DOM focus on the close button (`locator.focus()`, the narrowest mechanism) pauses it by focus-within, with the same hold and resume. How focus arrives is S4's.
    - **Direction:** the fill's visible width is its scale times the strip's width. In LTR its left edge stays on the strip's left and its right edge comes in; in RTL its right edge stays on the strip's right and its left edge comes in.
    - **Pause through blur** is Chromium-only Class 2 evidence (below), and genuine blur in Firefox and Safari stays MC-5 and MC-1.
  - **Forced-colours strategy (CF-14, with CF-28's emulated layer).** Playwright's `forced-colors: active` emulation, with the media query checked as a precondition. System colours (`CanvasText`, `Canvas`, `Highlight`, `ButtonText`) are resolved by a probe in the same page, never hard-coded, since each engine resolves them differently (for example, `Highlight` is `rgba(5, 0, 73, 0.8)` in Chromium, `rgb(51, 153, 255)` in Firefox and `rgb(52, 132, 228)` in WebKit).
    - **Asserted:** the card's 1 px solid `CanvasText` edge on every side; the action's 1 px solid `ButtonText` border; the fill in `CanvasText`, with a visible box; a transparent strip, so no track; and the type icon present.
    - **The rings:** `Highlight` outlines on the action, the close and the toast root, and the region's `::after` ring (`Highlight` border, `Canvas` outline), each while `:focus-visible` matches. Those states are reached only by trusted keyboard paths: Tab to the action and the close; then Alt+T for the root; then Tab, Tab and Enter, which closes the only toast and leaves focus on the region by restoration (§18). S3 asserts only the styles; focus behaviour is S4's.
    - This is emulation, not Windows High Contrast, which stays MC-6 (S6).
  - **Observations (not product contracts):**
    - **Emulation differs between engines.** The library's own forced-colours rules apply in all three. The engines differ in what their emulation forces beyond them:
      - Chromium forces outline colours to `Highlight` and border colours to `CanvasText` by itself, and Firefox forces border colours;
      - WebKit's emulation matches the media query but forces no author colour at all: the text keeps `rgb(24, 24, 27)` and the success icon stays green.

      So the library's `border-color: CanvasText` rule is proven only by WebKit, and its `Highlight` ring rule only by Firefox and WebKit (see the mutation checks). The blocking suite needs all three engines for exactly that reason. P-26 should distinguish emulated from real forced colours with this in mind (D2-5).

    - **`:focus-visible` after script focus, for S4 (CF-12).** Starting from a keyboard-focused control, Alt+T focused the root and the region took focus by restoration, and both matched `:focus-visible` in all three engines. D1 measured Alt+T with no earlier keyboard focus, and only Firefox matched. This is a new data point for S4's Class 2 record, not a reclassification.
  - **Class 2 evidence** (`npm run test:browser:evidence`):
    - **CF-15, Chromium's safe-area override (an approximation, not notched-device evidence).** At 412 × 915 with insets 47/20/34/20 px, the production rule measured top 63 px, left 36 px, bottom 50 px, right 36 px and width 340 px, exactly the expected `--ret-offset` plus inset arithmetic. The override is injected through the browser's own `env()` values, without the device's `viewport-fit` gating. Real notched devices stay MC-2 and MC-3 (S6).
    - **CF-25, genuine blur in Chromium (CDP minimise).**
      - **Method:** Playwright emulates focus and re-applies that on navigation, so the spec turns focus emulation off after loading and brings the page to the front. The first attempt, which turned it off before navigation, produced no blur.
      - **Result:** minimising fired a trusted `blur`, `document.hasFocus()` became false and the toast got `data-paused`. The fill held at 0.897 for 0.5 s. Restoring fired a trusted `focus` and cleared `data-paused`, and the fill resumed from 0.897 with no reset, at 0.832 half a second later.
    - **CF-27, the strip.** In all three engines the strip's computed clip is `inset(-10px 0px 0px round 0px 0px 9px 9px)`: the card radius (10 px) less its 1 px border, with the negative top inset P-20 uses to keep the radii unclamped. It is the same at fractions 0.9, 0.5 and 0.1, because the strip never moves. The fill is a `matrix(s, 0, 0, 1, 0, 0)` box anchored at the strip's left, so its moving edge is straight. Its appearance stays MC-8 (S6).
  - **Harness changes:** `progressState(label)`, a read of the fill's computed scale and play state and of the fill and strip rectangles, with its `Box` and `ProgressState` types. No other addition: RTL sets `dir` on the document from the spec, so no harness `dir` API was needed.
  - **Mutation checks**, each a temporary edit to the production stylesheet or renderer, reverted at once (`git status` clean):
    - **Physical `left` made logical (`inset-inline-start`), so left stacks mirror in RTL:** 6 layout failures.
    - **Progress restarting on resume** (the fill's delay forced to `0ms`): 6 progress failures, the hover and focus tests in every engine.
    - **The `:dir(rtl)` fill-origin rule removed:** the direction test fails in all three.
    - **The forced-colours fill rule removed:** fails in all three.
    - **The forced-colours card-edge rule removed:** fails in WebKit only, since Chromium's and Firefox's emulation force border colours themselves.
    - **The forced-colours `Highlight` ring rule removed:** fails in Firefox and WebKit; Chromium forces it itself.
    - **The top safe-area inset ignored:** the blocking suite passes, as it must with zero insets. Chromium's override evidence shows it, with top 16 px against the expected 63 px: the D2-9 split at work.
  - **Commands:** unchanged. `npm run test:browser` (132 tests); `npm run test:browser:evidence` (5 per engine, 4 of them skipped outside Chromium, 15 in all).
  - **Validation:**
    - **Focused:** the 13 S3 tests pass in Chromium (about 15 s), Firefox (about 17 s) and WebKit (about 15 s).
    - **Full blocking suite** under `CI=1` (one worker): 132 of 132 in about 2.6 minutes. The `@evidence` run: 11 passed, 4 skipped (the Chromium-only tests in Firefox and WebKit).
    - **S3 soak:** the 13 new blocking tests, `--repeat-each=10` under `CI=1` (one worker, zero retries): **390 of 390** passed in 10.3 minutes. S2's suite was not soaked again: nothing it covers changed, and its 930-run soak stands.
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects, the browser one included), `typecheck:demo`, the full Vitest suite (40 files, 1,689 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Carried forward:**
    - **S4:** the `:focus-visible` observation above, for CF-12's Class 2 record.
    - **S6:**
      - real notched-device safe areas (MC-2, MC-3);
      - real Windows High Contrast for CF-14 and CF-28 (MC-6);
      - genuine blur in Firefox and Safari for CF-25 (MC-5, MC-1);
      - CF-26's hidden documents (MC-1, MC-2, MC-3, MC-5);
      - CF-27's appearance (MC-8);
      - rerunning the evidence specs.
    - **P-26:** the emulation differences above, when documenting forced colours.
- **S4.1 D0-16 report: a press on an exiting toast moves focus to the region.** Raised while S4.1 probed CF-6 Class 1, before any S4.1 test was written. The report stands as written.
  - **Engines:** Playwright Chromium 153, Firefox 155 and WebKit 26.6, headless; React 18.3.1. The same in all three.
  - **Reproduction (trusted mouse, production timing):** two persistent toasts, `b` then `a`, at `top-right`; a double-click on `a`'s close button. The first click focuses `a`'s close and dismisses `a`; restoration moves focus to `b`'s close (§18 step 1); `inert` is set on `a` with focus already there. The second press passes through the inert `a` to the `<ol>`, and the browser focuses the nearest focusable ancestor, the region (`tabindex="-1"`): focus goes from `b`'s close to the region, and `b` loses its focus-within pause. `onDismiss` fires once; `scrollY` stays 0; `:focus-visible` stays false.
  - **Not specific to `inert`:** a press on the 10 px gap between two visible toasts, with an outside button focused, also lands on the `<ol>` and moves focus to the region in all three engines. A press with nothing focused does the same.
  - **Held:** the press dismisses nothing; nothing in the inert toast takes focus or the click; focus never reaches `<body>`.
  - **Contract:** CF-6 Class 1 (D2): "a pointer press or click on an inert exiting toast dismisses and focuses nothing".
  - **Cause:** the browser's click focus on a non-focusable target focuses its nearest focusable ancestor, which the region's `tabindex="-1"` (needed for §18 step 3) makes it. Restoration, `inert` and the hotkey are not involved.
- **S4-H2, inert pointer focus hardening (done).** The hardening slice the maintainer authorised for the report above, and for it only. CF-6 is not narrowed: a pointer press on an inert exiting toast must not undo the focus restoration §18 established. It is not S4.1.
  - **Invariant:** a press whose target is a position's `<ol>` itself (a gap between toasts, or the list beneath an exiting toast, which is inert and so never the target) never moves focus.
  - **Event analysis (before any production change):**
    - **Targets:** the press on an inert toast and on a gap both target the `<ol>` (`elementFromPoint` and the `pointerdown`, `mousedown` and `click` targets, in all three engines). The section has no box of its own, so it is not pressed in practice. A press on a toast, its content or its controls targets that element, never the list.
    - **Phase and event:** focus is the default action of `mousedown`; preventing it keeps focus where it was and still dispatches `click`. `pointerdown` was not used: preventing it suppresses the compatibility mouse events instead, and P-21's swipe listens to pointer events on the toast root. A touch tap and a pen press focus through the same compatibility `mousedown`, so they are covered too.
    - **Narrowest condition:** `event.target === list`, on the list's own listener: never a toast, its content, its controls or a list inside custom content. No `stopPropagation()`.
    - **Validated in real browsers before the change,** with a page-level stand-in (the same condition, from a harness listener): the double-click kept `b`'s close; a gap press kept the outside button; a press on the body still focused the root (CF-39); a drag inside a toast's text still selected it; hover over the gap still set `data-paused` on the stack.
    - **Trade-offs:** a text selection can no longer start on the bare list (a gap of `--ret-gap`): before the change, the double-click also selected a word in Chromium and WebKit. A non-primary press there loses its default action too, for example autoscroll where a platform offers it (not tested). Toast content is unaffected.
    - **Touch (Playwright `touchscreen.tap`, with the stand-in):** in Chromium and WebKit a tap on a gap is adjusted to the nearest toast and focuses its root, with and without the stand-in (existing behaviour, CF-39). In Firefox it targets the list: the region took focus without the stand-in, and the outside button kept it with it. Protocol pen in Chromium (CDP `pointerType: 'pen'`) behaved like the mouse. Real touch and pen devices stay with S6's checkpoints.
  - **Implementation:** one change in `src/react/Toaster.tsx`. `StackList`'s effect, which already holds the list's `pointerenter` and `pointerleave` listeners, adds a native `mousedown` listener that calls `preventDefault()` when the target is the list itself, and removes it in the same cleanup. The region keeps `tabindex="-1"`.
  - **Unchanged:** the §18 restoration algorithm and H1's `preventScroll`, the hotkey, Escape, `inert`, the focus-within and hover pause reasons, swipe (P-21), the lifecycle, motion, progress, the public API, and the 30 tokens.
  - **Regression tests:** `focus-restoration.test.tsx` gains six (52 in the file), under `a press on the list (P-22 H2)`. jsdom neither focuses on a press nor skips inert targets, so they check the request and that nothing else changes; the browser runs below are the evidence:
    - a press on the list is prevented, and focus stays on an outside button;
    - with `b` exiting and inert after restoration, a press on the list is prevented and `a`'s close keeps focus and its focus-within pause;
    - presses on a toast, its title, its action and its close are not prevented, and the close still dismisses;
    - a list inside custom content, and its item, are not prevented;
    - the press and the click that follows still reach the document (no stopped propagation), and the click dismisses nothing;
    - the region still takes focus from script and from restoration.
  - **Mutations,** each a temporary edit reverted at once: a no-op handler fails 3 of the new tests; preventing every press on the list fails 2 (toast and custom-content presses); adding `stopPropagation()` fails 1.
  - **Browser verification** (a temporary spec on the S4.1 harness, not committed; trusted Playwright input unless stated):
    - **A:** a double-click on `a`'s close with `b` present: `a` dismissed once (`close-button`); focus on `b`'s close; no `focusin` on the region; with the pointer away from the stack, `b` keeps `data-paused` (focus-within). The same with the exit slowed to 3 s, for a press and a click on the exiting `a`'s close and body.
    - **B:** a gap click with the outside button focused: focus stays on it; nothing dismissed.
    - **C:** the action and close still work (reasons `action` and `close-button`); a body click focuses the root; a drag across a two-line title selects all of it.
    - **D:** the region takes focus from script and, after a keyboard close of the last toast, from restoration, with `scrollY` 0; Alt+T and Escape work as before.
    - **E:** hover over the gap pauses both toasts; a press there keeps the pause; leaving clears it.
    - **F:** a trusted mouse drag never moves or dismisses; a trusted CDP touch swipe commits with `swipe` (Chromium); a synthetic touch drag commits with `swipe` in all three (logic only, not trusted-input evidence).
    - **Results:** all pass in Chromium, Firefox and WebKit. With the fix reverted, A, the slowed A and B fail in every engine (focus on the region). Repeat run under `CI=1`, `--repeat-each=5`: 120 passed, 10 skipped (the Chromium-only touch swipe elsewhere), no failure.
  - **Validation:** `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` pass. The blocking browser suite passes (132 of 132 under `CI=1`), and the `@evidence` run gives 11 passed, 4 skipped.
  - **Carried forward to S4.1:** CF-6 Class 1's press and click on an inert exiting toast, as permanent blocking tests in all three engines, asserting that focus does not move, alongside H1-R and the rest of CF-6.
- **S4.1 record: focus restoration and `inert` (done).** H1-R, CF-6 at its Class 1 layer, and S4-H2's regression are blocking in Chromium, Firefox and WebKit, with trusted Playwright input only. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, and no CF item was reclassified. S4.1 is the first of S4's four reviewed parts (S4.1 to S4.4, from the S4 orientation); CF-2, CF-11, CF-12 and CF-13 are S4.2's, and S4's evidence specs S4.3's.
  - **Maintainer decisions for S4 (at the S4 orientation review):**
    - **CF-12:** Class 1 ring assertions may use a keyboard-established path beginning with trusted Tab; script focus with no earlier keyboard input stays Class 2. No engine's `:focus-visible` heuristic is the product contract.
    - **H1-R:** D1b's body-click case is kept as written, with its focus precondition asserted.
    - **CF-13:** S4.2 may add a separate diagnostic stacking probe that overrides `pointer-events: auto` through consumer CSS. It never replaces the production-CSS hit-testing assertions, and it is reported as diagnostic.
    - **CF-2 and CF-6:** both have blocking and evidence layers, as D2 classifies them; only CF-6 Class 1 is S4.1's.
  - **Specs added** (`browser/tests/`; 11 blocking tests per engine, so the blocking suite is now 55 per engine and 165 in all; 4 evidence tests per engine):
    - `focus.spec.ts`:
      - **H1-R** (5 per engine), on the long page. Its preconditions: the page is at the top, can scroll more than 3000 px, and the region lies more than 3000 px below the viewport. Each case checks `scrollY` (0) and the §18 target:
        - a mouse close of the only toast: the region;
        - Tab to the outside button, Alt+T, Tab and Enter: the region, never the element focused before the hotkey;
        - a click on the toast's body, then a programmatic dismissal: the region;
        - a mouse close of the first of two toasts: the next toast's close;
        - control: a programmatic dismissal with nothing focused leaves focus on `<body>`. The only focus entry is the `inert` one, with `<body>` active.
      - **CF-6, restoration before `inert`** (3 per engine), one per §18 step, each reached by trusted Tab and closed with Enter: the next toast's close (step 1), the previous toast (step 2) and the region (step 3).
      - **H2's regression** (3 per engine):
        - with the public exit token slowed to 3 s (D0-11), a trusted press, then a click on the inert exiting toast's close, then a click on its body: focus stays on the next toast's close, no focus event follows the restoration, nothing else is dismissed, and, with the pointer away from the stack, the remaining toast keeps `data-paused` (its focus-within reason);
        - a double-click on a close button at production timing: exactly two `focusin`s, the clicked close and then the next toast's close, one `close-button` dismissal, and the remaining toast's focus-within pause kept;
        - a click on the gap between two toasts with the outside button focused: focus stays on it, no focus event, nothing dismissed, no scroll.
    - `focus.evidence.spec.ts` (`@evidence`): the mouse-button follow-up below.
  - **Preconditions, asserted and never assumed:** that a clicked close button takes focus (its trusted `focusin` comes first in the log); that a click on the body focuses the root (CF-39); each Tab and the Alt+T step; that nothing is focused in the control case; for H2, that the pressed points lie on the exiting toast only, never on its neighbour, and that a gap separates the two toasts. A precondition that fails in an engine fails the test.
  - **How the CF-6 ordering is observed.** From records made as it happens, never inferred from a later snapshot:
    - the `focusout` leaving the exiting toast and the `focusin` at the target are logged synchronously, as they are dispatched, with whether their target was inside an `inert` subtree at that moment. Both must report `targetInert: false`, and the `focusout`'s `relatedTarget` must be the target;
    - the `inert` entry comes later in the log, and its observer callback read the target as the active element;
    - no focus event follows it, so no browser fix-up and no second restoration moved focus;
    - a frame sampler, started and confirmed running before Enter is pressed, reads the active element, the phase and `inert` in every frame until 5 frames after removal. Frame 0 shows the pre-press state. From the first frame after the press to the end, focus is on the target, including every frame in which the toast is `inert` and after it is removed.
  - **Harness extensions** (`browser/harness/`; observation only):
    - **`?scenario=long-page`:** a focusable `outside` button at the top, then 4000 px of content, then the Toaster's container, so a focused region would scroll the page (H1). `openHarness(page, 'long-page')` opens it.
    - **Focus recorder:** `focusin` and `focusout`, captured on the document, and the window's own `focus` and `blur` (`focus:window`, `blur:window`). Each records the target and `relatedTarget` named for the specs (`body`, `region`, `toast:<label>`, `close:<label>`, `action:<label>`, `content:<label>`, `outside`), `isTrusted`, and `targetInert`. The detail has no `label` and no type starts with `window-`, so S2's per-toast entries and S3's window-event filter are unaffected.
    - **A separate `inert` observer:** an `inert` entry when a toast root gains or loses the attribute, with the active element read in the observer's callback. S2's phase recorder is unchanged.
    - **`focusState()`:** the active element, whether it matches `:focus-visible`, `scrollY`, `document.hasFocus()` and `visibilityState`.
  - **Browser differences:** none in the blocking outcomes. In all three engines a trusted mouse click focuses the clicked close button, and a click on the body focuses the root. The event order is the same in each: the `focusout` from the exiting toast, the `focusin` at the target, then `inert`.
  - **Mutation checks**, each a temporary edit reverted at once (`git status` clean for `src/`):
    - **H1's `preventScroll` removed from restoration:** the three H1-R cases that restore to the region fail in every engine (9). The next-toast case passes, as it must: toasts are `position: fixed`, so focusing one scrolls nothing.
    - **`inert` applied before restoration** (the two lines of `ToastItem`'s layout effect swapped): the three CF-6 tests fail in every engine (9), on `targetInert: true` for the `focusout` leaving the exiting toast. The H1-R outcomes still pass: no engine blurs synchronously when `inert` is set, so the ordering assertion is what detects it.
    - **H2's guard removed:** the three H2 tests fail in every engine (9), with focus on the region.
  - **Mouse-button evidence (`@evidence`; the S4-H2 follow-up, no production change).** Two toasts with an outside button focused, then a press on the gap between them. A pure-DOM control in the same engine, without the library: a `tabindex="-1"` section around a fixed `<ol>` with a box.
    - **With H2's guard, all three engines:** the primary, middle and secondary buttons each have their `mousedown` prevented on the list, and the outside button keeps focus. `click`, `auxclick` and `contextmenu` still follow, and `contextmenu` is not prevented, so the context menu still opens.
    - **The pure-DOM control, all three engines:** the primary, **middle and secondary** presses each focus the section.
    - **Touch (Playwright `touchscreen.tap`):** the compatibility `mousedown` has `button` 0. In Chromium and WebKit the tap is adjusted to the nearest toast and focuses its root (CF-39, outside H2). In Firefox it targets the list, is prevented, and the outside button keeps focus.
    - **Pen (Chromium protocol pen, not pen evidence):** the tip (`button` 0) and the barrel (`button` 2) are both prevented, and focus is kept; the barrel still gets `contextmenu`. Real pens stay with MC-7. Firefox and WebKit skip, naming it.
    - **Conclusion:** restricting the guard to `event.button === 0` would bring H2's defect back for middle and secondary presses, including a pen's barrel button, in every engine. A narrowing follow-up is not justified. What the guard costs a non-primary press on a bare gap is that press's own default, such as autoscroll where a platform offers it; that is not observable headless and stays untested.
  - **Commands:** unchanged. `npm run test:browser` (165 tests); `npm run test:browser:evidence` (9 per engine; 27 in all, 6 of them skipped: 4 S3 tests and the protocol pen outside Chromium).
  - **Validation:**
    - **Focused:** `focus.spec.ts` passes 33 of 33 (11 per engine).
    - **Repeat run:** `focus.spec.ts` with `--repeat-each=5` under `CI=1` (one worker, zero retries): **165 of 165**. S1 to S3 were not soaked again: nothing they cover changed.
    - **Full blocking suite** under `CI=1`: 165 of 165 in about 3.2 minutes. The `@evidence` run: 21 passed, 6 skipped.
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects, the browser one included), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Carried forward:**
    - **S4.2:**
      - CF-2 Class 1: removal and re-keying of the focused node;
      - CF-11 A: the `aria-keyshortcuts` attribute;
      - CF-12 Class 1: the ring styles, on the Tab-established path;
      - CF-13 Class 1: hit-testing, with the separate diagnostic stacking probe;
      - S3's `:focus-visible` observation, for CF-12's Class 2 record (S4.3).
    - **S4.3 (evidence):** CF-1, CF-2 and CF-6 Class 2, CF-3, CF-4, CF-5 (blur), CF-9, CF-10, CF-11 B and CF-12 (script focus); CF-7 and CF-8 as Class 4. The focus recorder and the `inert` observer are their instruments.
    - **S6:** rerun the evidence specs, this one included; real pens for the barrel-button case (MC-7).
- **S4.2 record: focus-within, `aria-keyshortcuts` and the focus rings (done).** CF-2, CF-11, CF-12 and CF-13 at their Class 1 layers are blocking in Chromium, Firefox and WebKit, with trusted Playwright input wherever focus or the pointer matters. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, and no CF item was reclassified. No D0-16 report was raised.
  - **Specs added** (`browser/tests/`; 11 blocking tests per engine, so the blocking suite is now 66 per engine and 198 in all; no evidence test):
    - `focus-within.spec.ts` (CF-2, 3 per engine);
    - `focus-ring.spec.ts`: CF-11 A (1 per engine), CF-12 (4) and CF-13 (3).
  - **CF-2 (Class 1), the focus-within reason follows the DOM.**
    - **Method:** a custom toast whose content is the harness fixture: a button whose activation changes the content's own React state, either unmounting it (`remove`) or replacing it under a new key (`rekey`).
    - **Sequence:** the toast runs 400 ms; trusted Tab focuses the button, which sets `data-paused`; the toast is held for a full duration (1.5 s), a deliberate span, because outliving its duration while paused is the property; trusted Enter activates the button.
    - **Preconditions, asserted:** Tab focuses the fixture button; the focused node has left the DOM (`isConnected` false) and, when re-keyed, its replacement is a new, unfocused element; nothing inside the toast holds focus.
    - **Asserted:**
      - `data-paused` clears for the removed and the re-keyed button;
      - the toast's held state changes exactly twice, held then released, recorded as it happens by a `data-paused` observer;
      - the timeout comes when the time left at the pause has run after the release: never earlier, less two frames of recorder latency, and no later than `LATE_TOLERANCE_MS` (150 ms). The remaining time is computed from the recorder's visible, held and released times, and it differs from the full duration by the 400 ms run;
      - the reason is `timeout`.
    - **Another reason is kept:** with the pointer on the toast (hover, §10), removing the focused button leaves the toast held through a further full duration. Only moving the pointer away releases it, and the timeout then follows the remaining time.
    - **Not in this layer:** a focused control that becomes disabled, hidden or `inert` (attribute changes). It is CF-2's Class 2 layer, S4.3.
    - **Browser difference** (observed with a temporary probe on the same fixture; not asserted): when the focused node is removed or re-keyed, Chromium dispatches a trusted `focusout` with a null `relatedTarget`; Firefox and WebKit dispatch no focus event at all. In all three, `document.activeElement` is then `<body>`. So in Firefox and WebKit, P-15's `MutationObserver` reconciliation is the only thing that releases the toast (see the mutation checks).
  - **CF-11 A, the DOM attribute.** On one page, re-rendering the Toaster through the harness's `mount(props)`, the region's `aria-keyshortcuts` is:
    - `Alt+T` by default;
    - `Control+Shift+K` for `["ctrlKey", "shiftKey", "KeyK"]`, and also for `["shiftKey", "ctrlKey", "KeyK"]`, since ARIA's modifier order is written whatever order is given (§17.2);
    - `F6` for `["F6"]`;
    - absent for `["altKey", "Comma"]` (punctuation, not advertised) and for `hotkey={false}`;
    - `Alt+T` again once the props are back to the default.

    Only the DOM attribute: the accessibility tree is CF-11 B (Class 2, S4.3), and assistive technology is P-29's.

  - **CF-12 (Class 1), the rings.** Every state is reached by trusted keyboard input, and keyboard modality is established by Tab first.
    - **Colours:** `--ret-focus` and `--ret-surface` are read on the focused element itself and resolved to colours in the page. Nothing is hard-coded, so the check holds in any theme.
    - **Each ring:** `:focus-visible` must match, then the computed outline is checked.
      - **Action and close,** by Tab: a 2px solid `--ret-focus` outline at an offset of 2px.
      - **Toast root,** by Tab to the action, then Alt+T: 2px solid `--ret-focus`, offset −1px (inside the card's edge).
      - **Custom toast:** its close, by Tab, has a 2px solid ring at 2px in `currentColor`. A consumer class gives the toast the colour `rgb(170, 20, 90)`, and the ring must equal it, not `--ret-focus`. Its root, by Alt+T, has the `--ret-focus` ring at +2px (outside the toast).
      - **Region,** after Tab to the only toast's close and Enter, so restoration focuses the region (§18 step 3): the section's own outline is `none`. Its `::after` is fixed at an inset of 4px, with a 3px solid `--ret-focus` border on every side, a 12px radius, and a 2px solid `--ret-surface` outline.
    - **Focus-visible preconditions:** for the root and the region, which take focus from script only, the match after earlier Tab input is asserted as a precondition, as the S4 CF-12 decision allows. It matched in all three engines, as S3 also saw. The path with no earlier keyboard input stays Class 2 (S4.3); no engine's heuristic is the contract.
  - **CF-13 (Class 1), the region ring.** The region is focused by keyboard close and restoration; two finite toasts are then shown. The preconditions, asserted: the toasts took no focus, the region still matches `:focus-visible`, and its `::after` is drawn.
    - **Production proof (the production stylesheet only):**
      - the ring's computed `pointer-events` is `none`;
      - `elementFromPoint` at each toast's centre hits that toast, and at a point away from the stacks, or on the ring's own band, never hits the region;
      - a trusted pointer over a toast sets the stack's hover pause on both toasts, and moving away clears it;
      - a trusted click on a toast's close dismisses it (`close-button`);
      - on the long page, a trusted click on the outside button, which lies inside the ring's box, gives the button its trusted `click` and focus;
      - stacking, read from computed styles: the ring is `position: fixed` at `--ret-z-index` (9999), and every list is a fixed child of the region at the same z-index. So the ring, the region's `::after`, comes after the lists in tree order and paints above them.
    - **Diagnostic (consumer CSS, not production):** a separate test adds `.ret-toaster:focus-visible::after { pointer-events: auto; }` through the harness style, which makes the ring hit-testable. Hit-testing follows the painting order, and it then finds the region at both toasts' centres and away from them, so the ring's box lies above the lists. Removing the override restores the production result: `pointer-events: none`, and the toasts are hit again. This observes stacking only and is never the proof that the ring takes no pointer input. The stacking result needs the override: hit-testing cannot see a non-hit-testable box. It is blocking because CF-13's stacking layer is Class 1, and it is named as diagnostic in the report.
  - **Harness extension:** `focusFixture(mode)`, the CF-2 fixture component (`FocusFixtureMode`: `remove` or `rekey`). Nothing else: the S4.1 recorders and `focusState()` are reused, and the `data-paused` observer is spec-local.
  - **Mutation checks**, each a temporary edit reverted at once (`git status` clean for `src/`):
    - **CF-2:**
      - the reconciliation `MutationObserver` never connected: the three CF-2 tests fail in Firefox and WebKit (6) and pass in Chromium, whose own `focusout` releases the toast. This is the browser difference above;
      - the reason never cleared (`setToastPause` called only on entry): all 9 fail;
      - resuming with the full duration instead of the remaining time: all 9 fail, on "when the remaining time has run".
    - **CF-11:**
      - ARIA's modifier order broken: the CF-11 test fails in every engine (`Shift+Control+K`);
      - the raw `code` advertised for an unnameable key: fails in every engine (`Comma`).
    - **CF-12** (stylesheet), each failing in every engine only the tests that cover that rule:
      - the root ring's −1px offset removed: the root test (3);
      - the custom close's `currentColor` rule removed: the custom-toast test (3);
      - the region ring's border in `--ret-surface`: the region test (3);
      - the action and close ring at 1px: the action-and-close and custom-toast tests (6).
    - **CF-13:**
      - the ring's `pointer-events: none` removed: all three CF-13 tests fail in every engine (9). The production hit-test finds the region, the outside click lands on the region, and the diagnostic's restored-production check reads `auto`;
      - the ring's `z-index` removed: the production stacking assertion fails (`auto` against `9999`), and the diagnostic hit-test finds the toast above the ring, in every engine (6). The outside-click test passes, as it should.
  - **Commands:** unchanged. `npm run test:browser` (198 tests); `npm run test:browser:evidence` (unchanged: 21 passed, 6 skipped).
  - **Validation:**
    - **Focused:** `focus-within.spec.ts` 9 of 9 and `focus-ring.spec.ts` 24 of 24, across the three engines.
    - **Repeat run:** both with `--repeat-each=5` under `CI=1` (one worker, zero retries): **165 of 165** in 5.1 minutes. Earlier slices were not soaked again: nothing they cover changed.
    - **Full blocking suite** under `CI=1`: 198 of 198 in about 4.4 minutes. The `@evidence` run: 21 passed, 6 skipped.
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Carried forward:**
    - **S4.3 (evidence):**
      - CF-2's Class 2 layer (a focused control disabled, hidden or `inert`), including whether any engine leaves the toast paused after focus has genuinely left, which would be a D0-16 report;
      - CF-3, where focus goes on removal outside restoration, starting from the event difference above;
      - CF-11 B, Chromium's accessibility tree;
      - CF-12, `:focus-visible` after script focus with no earlier keyboard input, and S3's data point;
      - with CF-1, CF-4, CF-5 (blur), CF-6 Class 2, CF-9 and CF-10, and CF-7 and CF-8 as Class 4.
    - **S6:**
      - MC-1 for CF-12's rings in real Safari, including its Tab-to-buttons setting;
      - MC-6 for CF-12's and CF-13's rings under Windows High Contrast;
      - MC-8 for their appearance.
    - **P-29:** CF-11's assistive-technology discoverability; the Firefox and WebKit accessibility trees stay an unverified gap.
- **S4.3 record: focus and environment evidence (done).** Every S4 evidence layer is recorded. CF-1, CF-2 Class 2, CF-3, CF-4, CF-5 (blur), CF-6 Class 2, CF-9, CF-10, CF-11 B and CF-12 Class 2 are Class 2 `@evidence`; CF-7 and CF-8 are Class 4 `@evidence`. Each is recorded, never asserted as the product contract, and no class changed. No blocking test was added or changed. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged. No D0-16 report was raised.
  - **Specs added** (`browser/tests/`, all `@evidence`, run by `npm run test:browser:evidence` only):
    - `focus-dom.evidence.spec.ts` (7 per engine): CF-2 Class 2, CF-3, CF-6 Class 2, CF-9, CF-10, CF-12 Class 2, and CF-7 with CF-8;
    - `environment.evidence.spec.ts` (4 per engine): CF-1 and CF-5 (Chromium), CF-4 (all three), CF-11 B (Chromium).

    The tests assert that their scenario genuinely ran, never the observed values themselves. A Chromium-only test skips in Firefox and WebKit with a reason naming the manual checkpoint or gap, so the report shows the gap instead of a pass. What each enforces, as corrected at S4.4 (the strengthening there is recorded in the S4.4 record):
    - **CF-2 Class 2 and CF-3 (removal and re-keying):** before the change, the fixture button holds focus and the toast is held.
    - **CF-3 (Toaster unmount):** a toast's close holds focus before the unmount.
    - **CF-6 Class 2 (container inert):** a toast's close holds focus and the toast is held before the container becomes inert.
    - **CF-9:** the toast is exiting and `inert` before each revival is attempted.
    - **CF-10:** `a`'s close holds focus before each close, and `a` is removed.
    - **CF-12 Class 2:** in each of the 10 scenarios, focus reached the intended element: the root, the close, the action, the next toast's close or the region. Whether `:focus-visible` matched is recorded only.
    - **CF-7 and CF-8:**
      - **Mouse path:** a trusted `pointerdown` and `click` on `a`'s close, and that close taking focus after the press.
      - **Keyboard path:** Tab reaching `a`'s close, and no pointer press on any close.
      - **Both:** a later restoration `focusin` on `b`'s close, `a` dismissed once with `close-button`, and focus on `b`'s close with the pointer away from every stack when the observation is made. `:focus-visible`, `b`'s pause and its progress are recorded only (Class 4).
    - **CF-1 and CF-5 (Chromium):**
      - a trusted window `blur` followed by a trusted window `focus`;
      - each observation made in the state it describes: while minimised, `document.hasFocus()` false and the toast held; after restoring, `hasFocus()` true, with CF-1's close still focused and CF-5's toast running again; and, for CF-1, the toast running again once Escape has moved focus out of it.

      Visibility is recorded only.

    - **CF-4:** the pointer lies over the new toast; every `pointermove` from the placement to the 1 px move is at the placed point, so the pointer did not move; the list received a `pointerenter` with `isTrusted` true; and the stack is held. The delay is recorded only.
    - **CF-11 B (Chromium):** the region node was found in the accessibility tree for every configuration.

    Until S4.4, the CF-12 and CF-7/CF-8 tests asserted only that their results existed; CF-1 and CF-5 counted the window `blur` without checking `isTrusted`; and CF-4 checked neither the pointer's placement nor its stillness, and its record dropped `isTrusted`. The observations recorded below were correct in every run, but those tests did not enforce them.

  - **Harness change:** the CF-2 fixture (`focusFixture`) gains `disable`, `hide` and `inert` modes, which keep the focused element and only change an attribute through the content's own React state: `disabled`, `hidden`, or `inert` on a wrapper, set in a layout effect because React 18 has no `inert` prop. The button now sits in that wrapper in every mode. The S4.2 `remove` and `rekey` tests pass unchanged. The `held` (`data-paused`) and activation recorders are spec-local, and every other record comes from the S4.1 focus recorder and `inert` observer.
  - **Two evidence runs** (`CI=1`) agree on every outcome below, and so do the two at S4.4 (one before and one after the strengthening). Timings that varied between runs are given as ranges.
  - **CF-2 Class 2, a focused control disabled, hidden or made inert (the D0-16 trigger): no defect.** A finite custom toast. Trusted Tab focuses the fixture button, which holds focus and pauses the toast (both asserted), and trusted Enter applies the change.
    - **The same outcome in all three engines, for each of `disabled`, `hidden` and `inert`:**
      - the engine dispatches a trusted `focusout` from the button, with a null `relatedTarget`;
      - `document.activeElement` becomes `<body>`;
      - the toast is released within 0 to 2 ms of that `focusout`, through P-15's `focusout` reconciliation, and then times out normally (`timeout`).

      Focus never left while the toast stayed held.

    - **Focus move against an unusable `activeElement`:** the fix-up is either synchronous with the state change or deferred to the next rendering update, 5 to 15 ms later. Until then the disabled, hidden or inert button is still `document.activeElement` and still matches `:focus`, and the toast correctly stays held: focus has not left yet. Which modes were deferred varied between runs:
      - WebKit deferred all three in the first run;
      - Chromium deferred `inert` in one run and `disabled` in the other;
      - Firefox deferred `hidden` in one run and `inert` in the other.
    - **`targetInert`:** for `inert`, the `focusout` reports its target already inert, since the attribute came first; for `disabled` and `hidden` it does not.
  - **CF-3, focus after a focused node is removed outside restoration:**
    - **Content removed or re-keyed (S4.2's fixture):** Chromium dispatches a trusted `focusout` with a null `relatedTarget`; Firefox and WebKit dispatch no focus event. In all three, focus lands on `<body>`, and the toast is released within 2 ms of the activation.
    - **The Toaster unmounted while a toast's close holds focus** (§18: an unmount restores nothing): `<body>` in all three. Chromium again dispatches a `focusout`; Firefox and WebKit dispatch nothing.
  - **CF-6 Class 2, `inert` without restoration.** Covered by two scenarios:
    - **The fixture's `inert` wrapper,** as in CF-2 above;
    - **The page makes the Toaster's container (`#root`) inert** while a toast's close holds focus, the modal-dialog pattern. Every engine dispatches a trusted `focusout`, focus goes to `<body>`, and the toast is released 1 to 2 ms later. Chromium and Firefox do this at once; WebKit still reported the close as active, with the toast held, immediately after the attribute was set, and fixed it up within the next frames.
  - **CF-9, revival of an exiting toast** (exit slowed to 2 s; `focus()` attempted on the root at each step, then released):
    - while exiting, and in the same task as the reviving `toast()` call, before React commits: `inert` is set, the phase is `exiting`, and focus is refused;
    - after a microtask (React's commit), and in the next task and the next frame: `inert` is gone, the phase is `entering`, and focus succeeds.

    The same in all three engines. Alt+T right after a later revival focuses the toast, which is not inert. So `inert` refuses focus only until the revival commits; there is no window in which the committed, eligible toast refuses focus.

  - **CF-10, the order of restoration, focus events, `inert` and the pause handover.** Two finite toasts. Focus is on `a`'s close by Tab, then `a` is closed by Enter, by a mouse click or programmatically. The same order in all three engines and on every path, within 0 to 12 ms of the trigger:
    1. `focusout` from `a`'s close, with `relatedTarget` `b`'s close;
    2. `focusin` on `b`'s close;
    3. then, in one observer delivery, `a`'s `data-phase` `exiting`, `inert` on `a` (with `b`'s close already active), `a` released and `b` held.

    Focus events are logged synchronously as they are dispatched. Phase, `inert` and held entries are observer callbacks, delivered after the commit, so their position after the focus events is not their DOM-write order: the commit writes `data-phase` before the layout effect restores focus. The restoration-before-`inert` order is what S4.1 proves (`targetInert: false`). On the mouse path, `b` was already held by hover before the click.

  - **CF-11 B, Chromium's accessibility tree** (CDP `Accessibility.getFullAXTree`): the region node (role `region`, name "Notifications") carries `keyshortcuts` exactly equal to the DOM attribute in all five configurations: `Alt+T`, `Control+Shift+K`, `F6`, none for `["altKey", "Comma"]`, and none for `hotkey={false}`.
    - **Firefox and WebKit:** their accessibility trees are not reachable with Playwright. This is an **unverified gap**, reported as a skip, never a pass.
    - **Not used:** Playwright's `ariaSnapshot()`, which is computed from the DOM.
    - **No screen-reader or assistive-technology claim:** that is P-29's.
  - **CF-12 Class 2, `:focus-visible` after script focus.** Each case on a fresh page, without earlier input unless stated; the same in all three engines:

    | Case                                                                                                     | Matches |
    | -------------------------------------------------------------------------------------------------------- | ------- |
    | Programmatic `focus()` on the root, or on the close, with no earlier input                               | yes     |
    | Alt+T with no earlier input                                                                              | yes     |
    | Tab to the action; Alt+T after it                                                                        | yes     |
    | A mouse click on the toast's body (CF-39)                                                                | no      |
    | Alt+T after that body click                                                                              | **no**  |
    | Restoration to the next toast's close, or to the region, after a keyboard close                          | yes     |
    | Restoration to the region after a programmatic focus and a programmatic dismissal, with no earlier input | yes     |
    | Restoration to the next toast's close after a mouse close (CF-8, below)                                  | no      |
    - **The heuristic follows the last input modality.** With no pointer input, script focus matches. After a pointer interaction it does not, and the Alt+T chord does not switch the modality back to keyboard.
    - **This differs from D1,** which recorded Alt+T "with no earlier keyboard focus" as matching in Firefox only. D1's disposable harness is gone, so its input history cannot be re-checked. The table suggests that earlier pointer input there would explain D1's result, and the difference from P-17 S5's manual Chromium review. This is a reading of the evidence, not a reclassification.
    - **For the maintainer and P-29:** a user who has used the pointer and then presses Alt+T gets the toast focused with **no visible ring, in every engine**. The §17.4 ring styles exist and apply whenever `:focus-visible` matches (S4.2), and D2-6 keeps engines' heuristics out of the contract, so this is not a D0-16 report. It is an accessibility observation for P-29, beside CF-8's pointer-close question. Any change, for example to how the hotkey shows focus, needs its own decision.

  - **CF-7 and CF-8, a pointer close against a keyboard close (Class 4).** Two finite toasts with progress. The pointer leaves the stack after the close.
    - **Mouse:** in all three engines `pointerdown`, then `mousedown`, then a `focusin` on the pressed close, then `click`, then restoration's `focusin` on `b`'s close.
      - Playwright WebKit focuses a clicked button like the others. It cannot show Safari's click without focus, and this is never a Safari result (D0-7).
      - Afterwards focus is on `b`'s close and does not match `:focus-visible`. `b` stays held by focus-within, its progress frozen (unchanged over 30 frames): it "looks stuck", with no ring, as P-18 S5 anticipated.
    - **Keyboard:** the same target and the same held `b`, but `:focus-visible` matches, so the ring shows.
    - **No contract change (D0-2).** The pointer-close question goes to P-29 with this evidence, and real Safari's click-without-focus stays MC-1 (and MC-2 for an iOS tap).
  - **CF-1 and CF-5, genuine window blur (Chromium CDP minimise, D2-4).** Focus emulation is turned off after navigation, as in S3; the window is minimised and restored through CDP.
    - **CF-1, a toast holding focus:**
      - Minimising dispatches a trusted `focusout` from the focused close (null `relatedTarget`) and then the window's trusted `blur`. `document.hasFocus()` becomes false, `document.activeElement` stays the close, and the toast stays held: its focus-within reason reconciles to the still-active close, and `window-blur` joins it.
      - The progress fill held at 0.967 for 0.5 s while minimised.
      - Restoring dispatches the window's `focus` and a `focusin` on the same close. The toast stays held by focus-within alone, with the fill unchanged over another 0.5 s.
      - After Escape releases focus (§18), the toast resumes from 0.966 with no reset, at 0.916 half a second later.
    - **CF-5, nothing focused:** minimising holds the toast (`window-blur`) with the fill at 0.969; restoring releases it and the fill continues (0.967, then 0.916).
    - **Visibility, in both:** `document.visibilityState` stayed `visible` and `document.hidden` false while minimised, and the browser dispatched no `visibilitychange`. The spec never dispatches one. Chromium's CDP minimise is genuine blur evidence for Chromium only. It is not hidden-document evidence and says nothing of Firefox, WebKit or Safari.
  - **CF-4, a stack appearing under a stationary pointer.** The pointer is placed where the toast will appear, and the toast is created. With no pointer movement, every engine dispatches a trusted `pointerenter` to the list, at the pointer's own coordinates, and the stack's hover pause is set: after 7 to 21 ms in Chromium and Firefox, and 45 to 209 ms in WebKit, over four runs. (`isTrusted` was asserted, and kept in the record, only from S4.4.) A later 1 px move dispatches no second `pointerenter`. No synthetic boundary event is used, and nothing is asserted across engines.
  - **Unverified gaps and their destinations:**
    - genuine blur in Firefox and Safari: MC-5 and MC-1;
    - genuinely hidden documents, backgrounding and resynchronisation in every engine (CF-5, CF-26): MC-1, MC-2, MC-3 and MC-5. A dispatched `visibilitychange` is never evidence (D2-4);
    - the Firefox and WebKit accessibility trees (CF-11 B): no tooling here. Assistive technology is P-29's;
    - real Safari's click without focus and its rings (CF-7, CF-12): MC-1, and MC-2 for iOS;
    - CF-12 ring appearance: MC-8; and under Windows High Contrast: MC-6.
  - **Commands:** unchanged. `npm run test:browser` (198 tests, unchanged); `npm run test:browser:evidence` (20 per engine, 60 in all: 48 passed and 12 skipped, the Chromium-only CDP tests in Firefox and WebKit).
  - **Validation:**
    - the new evidence specs pass (or skip, naming the gap) in all three engines, in two evidence runs;
    - the full `@evidence` run: 48 passed, 12 skipped;
    - the full blocking suite under `CI=1`: 198 of 198, the S4.2 tests included after the fixture change;
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Carried forward:**
    - **S4.4:** S4's reconciliation of every S4 CF item, H1-R and S4-H2 against these records.
    - **S6:** the manual checkpoints above; rerunning the evidence specs.
    - **P-29:**
      - CF-7, and CF-8 with CF-33: the pointer-close contract question, now with this evidence;
      - CF-12: no visible ring after Alt+T following pointer use;
      - CF-11's assistive-technology discoverability;
      - the operating systems' own settings.
- **S4.4 record: S4 reconciliation (done; S4 awaits the maintainer's acceptance).** A reconciliation of S4 (S4-H2, S4.1, S4.2, S4.3) against the D2 matrix. It is not an acceptance: S4 is ready for the maintainer to accept, and is not accepted by this record. No CF item was reclassified. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged since S4-H2's approved fix (`58148bf`).
  - **Evidence-integrity stop and correction.** The reconciliation found that the S4.3 record claimed more than four evidence tests enforced: CF-12 Class 2, CF-7 and CF-8, CF-1 and CF-5, and CF-4. It stopped before committing and reported. The maintainer approved strengthening the assertions as well as correcting the wording. Both are done in `3a17f9f`, which the S4.3 record now describes test by test. Each strengthened test still asserts only that its scenario genuinely ran, never an observed value:
    - **CF-12:** focus reached the intended element in all 10 scenarios.
    - **CF-7 and CF-8:**
      - **Mouse path:** a trusted press and click on `a`'s close, which took focus first.
      - **Keyboard path:** Tab reached `a`'s close, and no pointer pressed a close.
      - **Both:** restoration reached `b`'s close; `a` was dismissed once with `close-button`; and the observation was made with focus on `b`'s close and the pointer away from every stack.
    - **CF-1 and CF-5:** a trusted window `blur`, then a trusted `focus`; `hasFocus()` and the held state in each observed phase.
    - **CF-4:** the pointer lies over the new toast and never moved; a `pointerenter` on the list with `isTrusted` true; the stack held.

    The strengthened tests passed in every applicable engine, and no earlier observation changed. The S4.1 count-only evidence tests (mouse buttons, tap, pen) are unchanged: the S4.1 record claims no more than they assert.

  - **Totals:**
    - **Blocking:** 198 tests, 66 per engine, the same 66 in Chromium, Firefox and WebKit. S4 contributes 22 per engine: `focus.spec.ts` 11, `focus-ring.spec.ts` 8 and `focus-within.spec.ts` 3.
    - **Evidence:** 60 tests, 20 per engine. S4 contributes 15 per engine: `focus.evidence.spec.ts` 4, `focus-dom.evidence.spec.ts` 7 and `environment.evidence.spec.ts` 4. A full run gives 48 passed and 12 skipped; every skip is a Chromium-only CDP test in Firefox or WebKit, and its reason names the manual checkpoint or gap.
  - **Blocking gate integrity:**
    - CI's `browser` job runs `npm run test:browser`, which is `playwright test --grep-invert @evidence`. Its listing has 198 tests in the 10 blocking spec files and none from an `*.evidence.spec.ts`; the evidence listing has the 60 in the 5 evidence files.
    - `retries: 0`, with `forbidOnly` under `CI`.
    - No `test.skip`, `.only`, `.fixme` or `.fail` in a blocking spec. No S4 blocking test branches on the engine or returns early.
  - **Coverage matrix.** "Pass" is the blocking result in C (Chromium), F (Firefox) and W (WebKit); "recorded" is Class 2 or 4 evidence, never a contract.

    | Item  | Class (D2)              | Spec and tests                                                                                                                             | C              | F                | W                | Remaining limitation                                                                                           | Destination                    |
    | ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------ |
    | H1-R  | 1                       | `focus.spec.ts`, "H1-R: removal restoration never scrolls the page" (5)                                                                    | pass           | pass             | pass             | —                                                                                                              | AC-KB-1 (no regression)        |
    | S4-H2 | 1                       | `focus.spec.ts`, "CF-6 and H2: presses on an exiting toast and the list keep focus" (3); unit tests in `focus-restoration.test.tsx` (6)    | pass           | pass             | pass             | a non-primary press on a bare gap loses its own default (untested)                                             | —                              |
    | CF-1  | 2; 3                    | `environment.evidence.spec.ts`, "CF-1: a genuine window blur while a toast holds focus"                                                    | recorded       | skip (gap)       | skip (gap)       | genuine blur in Firefox and Safari; real window and app switching                                              | MC-1, MC-5                     |
    | CF-2  | 1; 2                    | `focus-within.spec.ts`, "CF-2: the focus-within reason follows the DOM" (3); `focus-dom.evidence.spec.ts`, "CF-2 Class 2 and CF-6 Class 2" | pass; recorded | pass; recorded   | pass; recorded   | none: no engine left a toast held after focus left                                                             | —                              |
    | CF-3  | 2                       | `focus-dom.evidence.spec.ts`, "CF-3: where focus goes …"                                                                                   | recorded       | recorded         | recorded         | —                                                                                                              | —                              |
    | CF-4  | 2                       | `environment.evidence.spec.ts`, "CF-4: a stack appearing under a stationary pointer"                                                       | recorded       | recorded         | recorded         | never asserted across engines                                                                                  | —                              |
    | CF-5  | blur 2 (C); 3; hidden 3 | `environment.evidence.spec.ts`, "CF-5: a genuine window blur with nothing focused, and visibility"                                         | recorded       | skip (gap)       | skip (gap)       | hidden documents in every engine: CDP minimise never hides a document, and no `visibilitychange` is dispatched | MC-1, MC-2, MC-3, MC-5         |
    | CF-6  | 1; 2                    | `focus.spec.ts`, "CF-6: restoration before inert …" (3) and the H2 tests; `focus-dom.evidence.spec.ts`, "CF-6 Class 2 …" and the CF-2 test | pass; recorded | pass; recorded   | pass; recorded   | —                                                                                                              | —                              |
    | CF-7  | 4; 3                    | `focus-dom.evidence.spec.ts`, "CF-7 and CF-8 (Class 4) …"                                                                                  | recorded       | recorded         | recorded         | Playwright WebKit focuses a clicked button: Safari's click without focus is not observable here                | MC-1, MC-2, P-29               |
    | CF-8  | 4                       | the same test                                                                                                                              | recorded       | recorded         | recorded         | the pointer-close contract                                                                                     | P-29 (with CF-33)              |
    | CF-9  | 2                       | `focus-dom.evidence.spec.ts`, "CF-9: reviving an exiting toast …"                                                                          | recorded       | recorded         | recorded         | —                                                                                                              | —                              |
    | CF-10 | 2                       | `focus-dom.evidence.spec.ts`, "CF-10: the order of restoration …"                                                                          | recorded       | recorded         | recorded         | observer entries give delivery order, not DOM-write order; S4.1 proves restoration before `inert`              | —                              |
    | CF-11 | A 1; B 2                | `focus-ring.spec.ts`, "CF-11 A: aria-keyshortcuts …"; `environment.evidence.spec.ts`, "CF-11 B …"                                          | pass; recorded | pass; skip (gap) | pass; skip (gap) | the Firefox and WebKit accessibility trees: an unverified gap                                                  | P-29 (assistive technology, C) |
    | CF-12 | 1; 2; 3                 | `focus-ring.spec.ts`, "CF-12: focus rings while :focus-visible matches" (4); `focus-dom.evidence.spec.ts`, "CF-12 Class 2 …"               | pass; recorded | pass; recorded   | pass; recorded   | appearance; real Safari; Windows High Contrast; no ring after Alt+T following pointer use                      | MC-1, MC-6, MC-8, P-29         |
    | CF-13 | 1; 3                    | `focus-ring.spec.ts`, "CF-13: the region ring takes no pointer input and stacks above the lists" (3, one of them the labelled diagnostic)  | pass           | pass             | pass             | appearance; Windows High Contrast                                                                              | MC-6, MC-8                     |

  - **Evidence review.** Each point the reconciliation was asked to check holds in the specs and the records:
    - Chromium's CDP minimise is genuine blur evidence for Chromium only, and is never presented as hidden-document evidence;
    - the Firefox and WebKit accessibility-tree gaps are explicit skips, never passes;
    - Playwright WebKit is never called Safari, and no user-agent string is used to identify one;
    - CF-7 and CF-8 stay Class 4 observations;
    - `:focus-visible` is recorded per engine, never assumed identical; the engines happened to agree;
    - CF-10 separates observer delivery from DOM-write order.
  - **Manual checkpoints, all pending for S6.** None has been run, none is passed, and P-21's device approvals satisfy none (CF-43). What S4 leaves to each:
    - **MC-1, macOS Safari:**
      - CF-7, click without focus, reported apart from the keyboard path;
      - CF-8's Safari path;
      - CF-12's rings after Tab, Alt+T and restoration, including Safari's Tab-to-buttons setting;
      - CF-1 and CF-5 genuine blur;
      - CF-26.
    - **MC-2, iOS Safari:** CF-7's tap without focus; CF-5 and CF-26 backgrounding (with S5's swipe items).
    - **MC-3, Android Chrome:** CF-5 and CF-26 backgrounding (with S5's swipe items).
    - **MC-4, Firefox for Android:** nothing from S4; S5's Gecko touch layer.
    - **MC-5, desktop Chrome and Firefox:** CF-1, CF-5 and CF-25 genuine blur by window and app switching; CF-26 hidden documents. What S4 has here is Chromium's CDP blur only.
    - **MC-6, Windows High Contrast:** CF-12's and CF-13's rings, with S3's CF-14 and CF-28.
    - **MC-7, real pen:** S4.1's barrel-button press on a gap; S5's pen items.
    - **MC-8, human visual review:** CF-12's and CF-13's appearance, with the earlier slices' items.
  - **P-29 carry-forwards from S4.** S6 writes these into the P-29 entry; P-29 decides them, and S4 implements none of them:
    - **CF-7:** Safari's click without focus, from MC-1 and MC-2, reported apart from the keyboard path.
    - **CF-8 with CF-33:** the pointer-close restoration contract (D0-2).
      - The evidence: after a mouse close, focus is restored to the next toast's close with no `:focus-visible`, and that toast stays held by focus-within with its progress frozen, in all three engines.
      - The keyboard close restores to the same target with the ring showing.
    - **CF-11 C:** the hotkey's discoverability through assistive technology. The DOM attribute (Class 1) and Chromium's tree (Class 2) match, and the Firefox and WebKit trees are an unverified gap.
    - **CF-12 (a deliberate UX and accessibility decision is needed):** after pointer use, Alt+T can focus a toast with no visible ring. In all three engines the hotkey after a body click did not match `:focus-visible`, so the ring styles, which S4.2 proves, never applied. It is not a D0-16 report: D2-6 keeps engines' heuristics out of the contract. Any change, for example to how the hotkey shows focus, needs its own decision. No focus-visible CSS, hotkey or restoration behaviour was changed in S4.
    - **The operating systems' own settings,** as already recorded.
  - **Validation (at `3a17f9f`, the documentation of this record aside):**
    - **Browser suites:** the blocking suite under `CI=1`, 198 of 198; the `@evidence` suite, 48 passed and 12 skipped.
    - **Repository gates:** `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects, the browser one included), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
    - **Soak:** no full-suite soak, since no instability appeared. Each S4 slice's own targeted repeat stands: S4.1 165 of 165, S4.2 165 of 165, and the H2 reproduction 120 of 120.
  - **Next:** the maintainer's acceptance of S4; then S5 (swipe), not started.
- **S5 decisions (the maintainer, at the S5 orientation review):**
  1. Layer A also carries existing §19 and P-21 contracts where synthetic input can verify the logic, as Class 1: the `swipe` pause's start and end, an intersecting selection preventing a swipe, custom toasts swiping, RTL's physical directions, and the reduced-motion dismissal without travel after release. These are existing contracts, not new requirements or thresholds.
  2. D2's engine gating applies to S5.2's Chromium-only Class 1 tests: they skip in Firefox and WebKit with a reason naming their manual checkpoint. The Playwright projects are not changed to avoid those skips.
  3. S5.2's layer B starts with a Chromium context with `hasTouch: true` at 1280 × 720. Mobile metrics need evidence of a set-up problem and a recorded decision.
  4. CF-36's completion stays synthetic in Chromium, Firefox and WebKit; trusted touch is extra evidence.
  5. P-22 stays on Node 24 (Issue #24 tracks Node 26). If P-22 is still active on or after 2026-10-28, it stops for a maintainer decision (D2-15).
- **S5.1 record: harness and cross-engine swipe logic (done).** CF-29 layer A and the approved §19 contracts, with synthetic pointer events, CF-29's mouse case, with trusted mouse input, and CF-36's completion are blocking in Chromium, Firefox and WebKit. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, and no CF item was reclassified. No D0-16 report was raised.
  - **Spec added:** `browser/tests/swipe.spec.ts`, 18 blocking tests per engine, so the blocking suite is now 84 per engine and 252 in all. No evidence test.
  - **Synthetic input, and what it cannot show.**
    - **How layer A drives a gesture:** it dispatches `PointerEvent`s from script, inside the page, on the element where the contact starts:
      - `pointerType: 'touch'`, one `pointerId`, `isPrimary`;
      - `buttons` 1 on `pointerdown` and each `pointermove`, and 0 on `pointerup` or `pointercancel`, as browsers report a contact (the P-21 pen correction drops a move with `buttons` 0);
      - each event's own `timeStamp` is recorded.
    - **Not trusted:** the events have `isTrusted` false, and `setPointerCapture` throws for them, which the library tolerates. So layer A proves the library's gesture logic only.
    - **What it never shows:** native pointer capture, `touch-action`, the browser's scroll arbitration, or real touch or pen input. Those are layer B (S5.2, Chromium) and the device checkpoints (MC-2, MC-3, MC-4, MC-7).
    - **Reading state:** each step's toast state is read after the next frame and a task, because the renderer commits a pause change after the event's own task.
  - **D2 values in the spec.** The slop (10 px), the distance (`min(0.4 × width, 100 px)`) and the velocity (0.4 px/ms over 100 ms) are written in the spec, not imported, so a change to the implementation's constants fails. Each test's preconditions check where its gesture lies against them.
    - **Slow drags:** 8 px every 50 ms, released 50 ms after the last move. Their release velocity, recomputed from the events' timestamps as D2 defines it, must be at most half the threshold. It measured 0 in every run, so only the distance can decide.
    - **The flick:** activation, then two moves 8 ms apart, with no state read in between. Its velocity must be at least twice the threshold. It measured 3.6 to 4.7 px/ms over ten runs per engine, and its offset is below the distance.
  - **CF-29 layer A (Class 1, synthetic):**
    - **Distance commit,** with a slow drag past the distance:
      - at `top-left` (left), `top-right` (right), and `top-center` in both directions;
      - the toast followed the drag (its transform X equals the offset);
      - the dismissal reason is `swipe`;
      - §19's exit continues from the dragged offset: from the release frame on, X never moves back toward rest and travels on past the offset until the toast is removed.
    - **Below the distance,** slow: the toast springs back to rest (transform X 0, no swiping state), with no dismissal.
    - **Velocity:** the flick under the distance commits with `swipe`.
    - **Forbidden direction,** at `top-left` and `top-right`:
      - a start in the forbidden direction never activates (no swipe state, no offset, no pause);
      - an active drag carried back past its origin is clamped at 0;
      - neither dismisses.
    - **Activation:**
      - 9 px does nothing and 10 px activates;
      - a move past the slop without horizontal dominance (9, 9) drops the candidate for good;
      - exactly dominant (15, 10) activates.
    - **Interactive descendants:** a drag from the action, the close or a button in custom content never activates.
  - **§19 and P-21 contracts (Class 1, synthetic, decision 1):**
    - **The `swipe` pause:**
      - no pause after `pointerdown` or short of the slop;
      - paused once activated;
      - a commit leaves the toast exiting and never held;
      - after a snap-back and after a `pointercancel`, the pause has gone while the cosmetic settle still runs.
    - **Selection:** a selection of the toast's text prevents activation; with it removed, the same drag commits.
    - **Custom toasts:** a custom toast swipes and is dismissed with `swipe`.
    - **RTL:** with `dir="rtl"` on the document (`:dir(rtl)` checked), `top-left` still swipes only left and `top-right` only right.
    - **Reduced motion:** under Playwright's emulation, the drag still follows the pointer, a commit dismisses with `swipe`, and no frame after release shows travel past the release offset.
  - **CF-29's mouse case (Class 1, trusted Playwright mouse):** a 200 px drag in 20 px steps across a `top-center` toast. At every step there is no swipe state and `transform: none`, and nothing is dismissed. The hover pause it sets is P-15's, not asserted here.
  - **CF-36's completion (Class 1, synthetic):** a release below the distance, then a programmatic dismissal 0 ms or 50 ms into the snap-back.
    - **Preconditions:** below the distance, and springing back in the release frame.
    - **Asserted:**
      - from the next frame on, the toast is never held;
      - it is removed, with exactly one `onDismiss`, reason `programmatic`;
      - a new toast with the same ID then has no swipe state and swipes normally.

    The opacity during that exit is CF-36's and CF-40's Class 2 evidence (S5.3).

  - **Harness change:** `toastState()` gains `transformX` (the computed transform's horizontal translation) and `swiping` (the root's internal `data-swiping`), as observations only. The synthetic gesture helper lives in the spec.
  - **Browser differences:** none in any outcome.
  - **A test-design correction during S5.1:**
    - **What happened:** in one mutation run, the flick failed once in one engine, and the failure could not be reproduced (216 of 216 in four repeats under the same parallel load, 45 of 45 in isolation).
    - **Likely cause:** the flick then read the toast's state after every move, so a stalled frame could slow it towards the precondition (WebKit measured 0.99 px/ms at the time, against the 0.8 required).
    - **The correction:** its moves are now dispatched 8 ms apart with no reads in between. The precondition and its margin are unchanged.
  - **Mutation checks**, each a temporary edit reverted at once (`git status` clean for `src/`):
    - **A mouse treated as touch:** the mouse test fails in every engine (3).
    - **The distance cap raised to 150 px:** every distance commit fails (33). Lowered to 70 px: the below-distance and CF-36 tests fail (9).
    - **The velocity threshold raised to 10 px/ms, or velocity commits disabled:** the flick fails in every engine (3 each). A lowered threshold is not detected, since the slow releases measure 0; the distance tests carry the low side.
    - **`protectedTarget` bypassed:** the interactive-descendant test fails in every engine (3).
    - **The `swipe` pause not cleared on a snap-back or cancel:** the pause test and the 50 ms CF-36 test fail in every engine (6).
    - **The selection check removed:** the selection test fails in every engine (3).
    - **The reduced-motion release rule disabled:** the reduced-motion test fails in every engine (3).
  - **Commands:** unchanged. `npm run test:browser` (252 tests); `npm run test:browser:evidence` (unchanged: 48 passed, 12 skipped).
  - **Validation:**
    - **Focused:** `swipe.spec.ts` 54 of 54.
    - **Repeat run:** `--repeat-each=5` under `CI=1` (one worker, zero retries): **270 of 270**. Earlier slices were not soaked again: nothing they cover changed.
    - **Full blocking suite** under `CI=1`: 252 of 252. The `@evidence` run: 48 passed, 12 skipped.
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Carried forward to S5.2:**
    - **Layer B (Chromium, trusted CDP touch, `hasTouch` at 1280 × 720, decision 3):** distance commit, spring-back, centre directions, the forbidden clamp, interactive descendants.
    - **CF-30 and CF-41:** vertical scrolling from a toast, and `pointercancel`.
    - **CF-32:** a programmatic dismissal mid-drag, and a genuine capture loss.
    - **CF-35:** continuity (Chromium trusted; Firefox and WebKit synthetic).
    - **Gating:** each Chromium-only test skips elsewhere naming MC-2, MC-3 or MC-4 (decision 2).
- **S5.2 record: trusted Chromium touch, scroll arbitration, capture and motion continuity (done).** CF-29 layer B, CF-30, CF-32 and CF-41 at their Chromium Class 1 layers, and CF-35's continuity (Chromium trusted; Firefox and WebKit synthetic), are blocking. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, and no CF item was reclassified. No D0-16 report was raised.
  - **Specs added:**
    - `swipe-touch.spec.ts`: 10 Chromium tests (CF-29 layer B, CF-30 and CF-41, CF-32), each skipped in Firefox and WebKit with the reason naming MC-4 (Firefox for Android), MC-2 (iOS Safari) and MC-3 (Android Chrome) (S5 decision 2);
    - `swipe-motion.spec.ts`: 4 tests per engine (CF-35).

    The blocking suite now lists 294 tests: Chromium runs 98, and Firefox and WebKit run 88 each, with the 10 named skips. These are the first engine-gated skips in the blocking job, as D2's engine-gating rule provides; no project was changed.

  - **Trusted touch, and what it is.**
    - **The input:** CDP `Input.dispatchTouchEvent` in a context with `hasTouch` at 1280 × 720 (S5 decision 3); no mobile metrics were needed. The browser turns it into trusted `touch` pointer events, with real implicit and explicit capture and real `touch-action`.
    - **What is recorded:** the browser's own events, as the page receives them: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `gotpointercapture`, `lostpointercapture` and `click`, each with `isTrusted`, `pointerType`, `pointerId`, target and `timeStamp`. This is kept apart from the test's input, and each test asserts that every recorded input event is trusted `touch`.
    - **Delivery:** Chromium dispatches touch moves with the next frame, after CDP has returned. So each step waits until the page has received the last move at its `clientX` (or a `pointercancel`) before anything is observed.
    - **No release velocity in the no-commit and distance cases:** the finger rests 150 ms before lifting, and the trusted timestamps prove there was no move within the 100 ms velocity window, so only the distance decides. A trusted velocity commit stays Class 2 (S5.3).
  - **CF-29 layer B (Class 1, Chromium trusted):**
    - **Distance commit:** a 140 px drag at `top-right` (right) and at `top-center` in both directions. The toast follows the finger past the distance; the root takes real capture (`gotpointercapture` on the root); the dismissal reason is `swipe`.
    - **Spring-back:** a 60 px drag returns to rest, unheld and not dismissed.
    - **Forbidden direction:** a drag left at `top-right` never activates.
    - **Interactive descendants:** a drag that starts on the action or the close never activates, and dismisses nothing. The start target is asserted, and the close's SVG content counts as the close. No `click` dismissed either control after the drag.
  - **CF-30 and CF-41 (Class 1, Chromium trusted).**
    - **Control:** on the long page at `scrollY` 1000, a 250 px downward drag on page content scrolls the page, so this context scrolls by touch.
    - **The same drag starting on a toast's title:**
      - the page scrolls;
      - the browser sends a trusted `pointercancel` and no `pointerup`;
      - the toast stays at rest, with no swipe state and no offset, unheld, and is not dismissed.
    - **In the capability probe before the spec** (not committed): 1000 → 573 px from the toast, and 0 → 451 px for the control.
  - **CF-32 (Class 1, Chromium trusted):**
    - **A programmatic dismissal during an active 60 px drag:**
      - at once the toast is `exiting`, `inert`, unheld, and the root no longer holds the pointer (`hasPointerCapture` false);
      - the root's `lostpointercapture` is recorded;
      - the finger then moves on past the distance and lifts, and the only dismissal is the `programmatic` one, once.
    - **A genuine loss of capture:**
      - with the root holding real capture (`hasPointerCapture` true), the page calls `releasePointerCapture`. This is not a dispatched event: the browser itself sends a trusted `lostpointercapture` to the root;
      - as the Pointer Events specification has it, that event comes with the pointer's next event, so the test moves once more and waits for it;
      - the drag ends at once;
      - moving on past the distance and lifting dismisses nothing, and the toast returns to rest, unheld.
  - **CF-35 (Class 1; Chromium trusted, Firefox and WebKit synthetic):** one test body with two drivers: CDP touch, or `PointerEvent`s dispatched on the toast's title (labelled synthetic; logic only). `b` is the dragged toast in a `top-right` stack.
    - **Activation during a reposition:**
      - with the finger already down, an insertion starts moving `b` down;
      - the move that activates is read in its own task: `b`'s rendered top just before the library handles it (a capture-phase listener) and just after (a bubble-phase listener);
      - the precondition: `b` is mid-reposition;
      - the change is at most the motion the measured speed explains over that interval, plus half a pixel;
      - then, held for 300 ms (past the reposition), `b`'s rendered top does not move (Freeze Y).
    - **Insertion and removal during a drag:**
      - while `b` is dragged 40 px, two toasts are inserted above it and one above it is removed;
      - at every frame and every toast mutation, `b`'s rendered top and its transform X stay where they were;
      - on release, it reaches its new layout place (one slot lower) and X 0 along an interpolated path, with no reversal.
    - **A reposition during the snap-back:**
      - the release comes after a 150 ms rest below the distance, and an insertion follows during the snap-back;
      - X is read in one task just before and just after the insertion's commit: the harness's `mount()` re-renders the same Toaster under `flushSync`, so the repositioning seed runs inside that task;
      - X may change only by the snap-back's own fastest speed times that interval (Chromium and Firefox hold animation time within a task; WebKit advances it);
      - X then returns to 0 along an interpolated path.
    - **A reposition during the fly-out:**
      - the public exit token is slowed to 600 ms (D0-11), and the distance commits after a 150 ms rest;
      - an insertion 100 ms into the fly-out is measured the same way;
      - X never moves back toward rest (the accepted one-frame hold allowed), travels on after the insertion, and the reason is `swipe`.
  - **Test-design corrections during S5.2:** a repeat under parallel load showed flakes that were the tests', not the product's (8 of 88 at first). Each was fixed at its cause, not by loosening an assertion, and the final repeats show none:
    - Chromium's frame-aligned touch moves were observed before delivery: the waits on the delivered `clientX` above;
    - `lostpointercapture` was read before the next pointer event delivered it: the test now waits for it;
    - a snap-back released without a rest occasionally committed by velocity, which is correct behaviour: the rest above;
    - a frame-sampled speed underestimated WebKit's in-task motion around an insertion: the one-task measurement above.

    No assertion was weakened, and no product behaviour was involved.

  - **Mutation checks**, each a temporary edit reverted at once (`git status` clean for `src/`):
    - **The capture-loss guard** (`event.target === root`) removed: 8 Chromium tests fail, every trusted drag that must reach release, as P-21 D1 predicted. The synthetic engines pass, because only trusted touch has a descendant's implicit capture to lose.
    - **`touch-action: none`:** only the Chromium scroll test fails.
    - **Freeze Y** (a dragged toast's swipe Y not absorbing the displacement): the insertion-and-removal test fails in all three engines.
    - **Y-only seeding** (X erased by a reposition): the snap-back and fly-out tests fail in all three engines (6).
    - **An external dismissal not ending the gesture:** the Chromium CF-32 dismissal test fails.
    - **Activation from the layout Y instead of the visual Y:** the activation test fails in all three engines.
  - **Commands:** unchanged. `npm run test:browser` (294 listed: 274 run and pass, 20 named skips); `npm run test:browser:evidence` (unchanged: 48 passed, 12 skipped).
  - **Validation:**
    - **Repeats:**
      - `swipe-touch.spec.ts` and `swipe-motion.spec.ts` with `--repeat-each=8` under the local three workers: 176 of 176, with 160 named skips;
      - with `--repeat-each=5` under `CI=1` (one worker, zero retries): **110 of 110**, with 100 named skips.
    - **Full blocking suite** under `CI=1`: 274 passed, 20 skipped. The `@evidence` run: 48 passed, 12 skipped.
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Limits, unchanged:**
    - trusted touch is Chromium's, in Playwright: never Safari, iOS, Android or Firefox for Android;
    - Firefox and WebKit swipe coverage is synthetic logic (layer A and CF-35), and their touch, capture, `touch-action` and scrolling stay with MC-2, MC-3 and MC-4;
    - pinch-zoom (CF-34) and real pens (CF-31, CF-37) stay manual.
  - **Carried forward to S5.3 (evidence):**
    - CF-29's trusted velocity commit;
    - CF-30's and CF-41's diagonal hand-over angles;
    - CF-31's protocol pen;
    - CF-32's capture mechanics (where the next `pointerup` goes);
    - CF-35's one-frame hold;
    - CF-36's and CF-40's opacity;
    - CF-38's shadow root;
    - CF-39's press focus;
    - CF-33 (Class 4).
- **S5.3 record: swipe browser evidence (done).** Every S5 evidence layer is recorded in `swipe.evidence.spec.ts`: CF-29's trusted velocity, CF-30's and CF-41's diagonals, CF-31, CF-32's capture mechanics, CF-35's one-frame hold, CF-36 and CF-40, CF-38, CF-39, and CF-33 as Class 4. Each is recorded, never asserted as the product contract, and no class changed. No blocking test was added or changed. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged. No D0-16 report was raised.
  - **Spec added:** `browser/tests/swipe.evidence.spec.ts` (`@evidence`), 9 tests per engine; 4 are Chromium-only and skip in Firefox and WebKit naming MC-2, MC-3, MC-4 or MC-7.
  - **Input provenance, named in every record:**
    - `trusted`: Chromium CDP touch (`hasTouch`, 1280 × 720), which the browser turns into trusted `touch` pointer events;
    - `protocol`: Chromium CDP pen (`pointerType: 'pen'`). The events are trusted, but CDP decides their properties, so they are never physical-stylus evidence (MC-7);
    - `synthetic`: script-dispatched `PointerEvent`s, logic only.

    A recorder logs the page's own pointer and capture events: `isTrusted`, `pointerType`, `pointerId`, the target, the innermost target through open shadow roots (`composedPath()[0]`), position and `timeStamp`.

  - **Integrity (the S4.4 rule; corrected at S5.4, recorded in the S5.4 record).** Each test asserts that its scenario genuinely occurred, never its observed values.
    - **Provenance, asserted from the recorded events in every test except CF-39's mouse case** (checked as below) **and CF-36's** (its synthetic contact is dispatched by the spec itself):
      - the scenario's own pointer is the `pointerId` of its `pointerdown` on the intended target;
      - each of that pointer's `pointerdown`, `pointermove`, `pointerup` and `pointercancel` must be trusted `touch` (Chromium CDP touch), trusted `pen` (Chromium protocol pen), or `isTrusted` false with `touch` (synthetic, Firefox and WebKit). The label is checked against the events, never taken from the engine's name;
      - another pointer's events are listed in the record, never asserted. None appeared in the S5.4 runs.
    - **Capture events,** where present: those of the scenario's pointer must be trusted, with its `pointerType` (CF-29, CF-30 and CF-41, CF-31 and CF-32).
    - **Scenario preconditions:**
      - **CF-29:** the release offset under the distance, and the D2 release velocity, recomputed from the trusted timestamps, at least twice the threshold;
      - **CF-30 and CF-41:** a `pointerdown` on the intended toast, and at least one delivered move;
      - **CF-31:** a `pointerdown` on the intended toast, or on page content;
      - **CF-32:** the root's `gotpointercapture` before the dismissal, and its `lostpointercapture` after it;
      - **CF-35:** the contact on `b`'s title, a fly-out under way, and the insertion landing during it;
      - **CF-36 and CF-40:** a release below opacity 1, the snap-back or release state in the release frame, the exit reached, and the removal;
      - **CF-38:** the contact's innermost target (`composedPath()[0]`) being the intended button;
      - **CF-39:** a trusted `pointerdown` of the intended type (mouse, touch or pen);
      - **CF-33:** the contact on `a`'s title, the swiped toast holding focus first, and the `swipe` dismissal.
    - **Recorded only:** activation, cancellation, scrolling, dismissals, focus, opacities, holds and the delivered movement.

    None of these is a product contract.

  - **CF-29, a trusted velocity commit (Chromium):** activation, then one move a delivered frame later, and an immediate lift, with an offset of 80 px against the 100 px distance. The D2 velocity, recomputed from the trusted timestamps, measured 1.13 to 1.16 px/ms over five runs, and the flick committed with `swipe` each time. An earlier shape, with two moves after activation, measured only 0.86 px/ms, too close to the precondition, and was replaced.
    - **Limitation:** Chromium delivers touch moves once per frame, so a velocity scenario needs moves at least a frame apart; moves sent within one frame coalesce, and the activation and the last position can then share an event, leaving no offset to commit. That is why the trusted velocity commit stays Class 2.
  - **CF-30 and CF-41, diagonals (Chromium trusted):** CDP input of 150 px from a toast's title on the long page at `scrollY` 1000, in 8 moves, at an intended angle from horizontal. The delivered movement is measured from the browser's own events: from the `pointerdown` to the last `pointermove` before any `pointercancel`. It was the same in the three S5.4 runs that recorded it.

    | Intended | Moves delivered | Delivered dx / dy | Observed angle | Swipe activated | Browser `pointercancel` | Page scrolled | Dismissed    |
    | -------- | --------------- | ----------------- | -------------- | --------------- | ----------------------- | ------------- | ------------ |
    | 20°      | 8 of 8          | 141 / 51 px       | 20°            | yes             | no                      | 0             | yes, `swipe` |
    | 30°      | 8 of 8          | 130 / 75 px       | 30°            | yes             | no                      | 0             | yes, `swipe` |
    | 45°      | 8 of 8          | 106 / 106 px      | 45°            | no              | no                      | 0             | no           |
    | 60°      | 1 of 8          | 9 / 15 px         | 59°            | no              | yes, after that move    | 128–135 px    | no           |
    - **At 60°,** the browser delivered one move of 17 px and then took the pointer for scrolling. The rest of the input became page scroll, never pointer moves, so the observed angle rests on that single move.
    - **The angles** are the input's intent and the delivered moves; no universal threshold is drawn from them.

    In every case the toast ended at rest and unheld.
    - **The difference from D1:** at 45° D1 recorded a cancel and a scroll. Here the library dropped the candidate, since 45° fails its 1.5 dominance, and Chromium neither cancelled nor scrolled. At exactly 45° the browser's own arbitration is at its boundary.
    - **Not a contract:** this is the browser's arbitration, not the product contract.

  - **CF-31, protocol pen (Chromium):**
    - **Horizontal:** a 140 px pen drag on a toast is trusted `pen` throughout. The root takes capture, the swipe activates, and it commits with `swipe`.
    - **Vertical:** a pen drag scrolled nothing, neither from a toast nor from the page, and no `pointercancel` came. So in this set-up Chromium does not pan for protocol pen input at all: a pen drag here is never handed to scrolling, whatever `touch-action` says. Real pens and their `touch-action` stay MC-7.
  - **CF-32, capture mechanics (Chromium trusted):**
    - **Before the dismissal:** `pointerdown` on the title; `gotpointercapture` on the title (touch's implicit capture); `lostpointercapture` on the title as the root takes capture; `gotpointercapture` on the root.
    - **After a programmatic dismissal:** `lostpointercapture` on the root. The next `pointermove`s and the `pointerup` go to the position's list, because the exiting toast is inert. One dismissal, `programmatic`.
    - **Status:** an observed order, not a required one beyond the documented contract.
  - **CF-35, the one-frame hold** (exit slowed to 600 ms; Chromium trusted, Firefox and WebKit synthetic; every frame read with its own `performance.now()`):
    - **The control, with no reposition:** there are held frames in the first 4 to 17 ms after the release, where the transform transition starts (in three WebKit runs, none). Those are the start of the transition, not a hold caused by repositioning: the clock artifact the control separates out.
    - **With an insertion during the fly-out:** a further held frame right after the insertion in Chromium (at 109 to 125 ms, the insertion at 106 to 111 ms) and Firefox (at 119 to 141 ms, the insertion at 115 to 125 ms), in all five runs (S5.3 and S5.4). None after the insertion in WebKit in any run.

    This is the accepted cosmetic hold (P-21 S3). It is not required behaviour, and its appearance stays MC-8.

  - **CF-36 and CF-40, opacity (synthetic, all three):**
    - **Method:** a release at opacity 0.878 below the distance (the snap-back), then a programmatic dismissal 0, 16, 50 or 100 ms later; and a commit by distance at 0.696. Sampling starts in the release's task. "At dismissal" is the last frame before the exit.
    - **Chromium:** the exit starts from 1 whatever the snap-back value: a first step of +0.122 at 0 ms, +0.11 at 16 ms, +0.048 at 50 ms and +0.015 at 100 ms, then monotone.
    - **Firefox:** no first step, with one rise of +0.03 over one frame at 16 ms.
    - **WebKit:** first steps of at most +0.035, then monotone.
    - **A commit:** no rise in any engine. The exit fades from the swipe opacity, so no running opacity transition overrides P-18's exit fade (CF-40). Every case completed its exit, and was removed with its own reason.

    These match D1b and D2-7's accepted cosmetic difference. WebKit's +0.035 at 16 ms is a little more than D1b's +0.010; it is a single frame. The optional human observation of Chromium's step stays MC-8.

  - **CF-38, Shadow DOM** (Chromium trusted; Firefox and WebKit synthetic composed events; custom content from the new harness fixture):
    - **A drag from a button inside an open shadow root,** in all three engines: `composedPath()[0]` is the shadow button, while `pointerdown` reaches the toast retargeted to its host. The swipe activates and commits with `swipe`.
    - **The light-DOM button beside it** never activates.

    This is the confirmed D2-2 limitation, for P-26 and §37: `protectedTarget()` sees the host. No `composedPath()` change was made.

  - **CF-39, press focus:**
    - **A trusted mouse press on the toast's body** focuses the root (`tabindex="-1"`) in all three engines, and the toast is held.
    - **In Chromium:**
      - a trusted touch tap leaves `<body>` focused during the contact and focuses the root after the lift (the compatibility mouse events);
      - a held trusted touch drag focuses nothing, during it or after;
      - a protocol pen press focuses the root at once, like a mouse.
    - **Status:** existing pointer-focus behaviour, not a contract. Touch and pen on real devices stay MC-2, MC-3 and MC-7.
  - **CF-33, focus after a swipe dismissal of the focused toast (Class 4):** with the first toast focused by Alt+T and swiped away (Chromium trusted; Firefox and WebKit synthetic), focus goes to the next toast's root (§18), which matches `:focus-visible` after the keyboard's Alt+T and is held by focus-within, in all three engines. A swipe after pointer use, where `:focus-visible` would not match (S4.3's CF-12 result), was not recorded here. The pointer-triggered restoration question (D0-2) goes to P-29 with CF-8.
  - **Harness change:** `shadowFixture()`, custom content with a light-DOM button and a button in an open shadow root (CF-38). Observation only.
  - **Commands:** unchanged. `npm run test:browser:evidence` lists 29 per engine, 87 in all: 67 pass and 20 skip (the earlier 12, and this spec's 4 Chromium-only tests in Firefox and WebKit). `npm run test:browser` is unchanged: 274 passed, 20 named skips.
  - **Validation:**
    - the new spec passes, or skips with its named reason, in all three engines, in two full runs and two further runs of its CF-29 and CF-36 tests. The outcomes agree, and timings that varied are given as ranges;
    - the full `@evidence` run under `CI=1`: 67 passed, 20 skipped;
    - the full blocking suite under `CI=1`: 274 passed, 20 named skips;
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Remaining manual checkpoints (S6):**
    - MC-2, MC-3 and MC-4 for real touch, scrolling, diagonals and `pointercancel` (AC-SW-1's layer C), and pinch-zoom (CF-34, CF-42);
    - MC-7 for real pens (CF-31, CF-37) and pen press focus (CF-39);
    - MC-8 for the one-frame hold's appearance (CF-35) and, optionally, Chromium's opacity step (CF-36).
  - **Carried forward to S5.4:**
    - reconcile AC-SW-1's layers: A (C F W, S5.1), B (C, S5.2), and C (MC-2, MC-3, MC-4, pending);
    - the S5 coverage matrix;
    - carry-forwards: CF-38 to P-26 and §37; CF-33 to P-29; CF-31 and CF-37 to MC-7; CF-34 and CF-42 to MC-2, MC-3 and MC-4.
- **S5.4 record: S5 reconciliation (done; S5 awaits the maintainer's acceptance).** A reconciliation of S5 (S5.1, S5.2, S5.3) against the D2 matrix and §19. It is not an acceptance: S5 is ready for the maintainer to accept, and is not accepted by this record. No CF item was reclassified. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged since S4-H2's approved fix.
  - **Evidence-integrity stop and correction.** The reconciliation found that the S5.3 record claimed more than its evidence tests enforced. It stopped before committing and reported. The maintainer approved corrections 1 to 5, done in `c3f4a78`, which the S5.3 record now describes:
    - **CF-30 and CF-41:** the moves are checked as trusted `touch`, and the movement the browser actually delivered is recorded (moves, dx and dy, the observed angle) beside the intended angle;
    - **CF-31:** trusted `pen` for every event of all three cases;
    - **CF-32:** `isTrusted` is kept with each recorded event, and every capture event is checked as the browser's own;
    - **CF-33, CF-35 and CF-38:** the input's provenance is checked from the events (trusted `touch` in Chromium, `isTrusted` false in Firefox and WebKit), never inferred from the engine;
    - **the wording:** it now separates preconditions, asserted provenance and recorded observations.

    Each check covers only the scenario's own pointer, by the `pointerId` of its `pointerdown`; another pointer's events are recorded, never asserted.

    - **A failure during the correction:** in its first run, the CF-29 test, unchanged from S5.3, failed once. Its S5.3 assertion required **every** recorded pointer event to be trusted `touch`, and one event was not. The event could not be identified (the next runs cleared the run's artifacts), and it did not recur in 12 further runs, whose scenario events were all trusted `touch`.
    - **The fix:** the cause was the over-broad assertion, not the scenario. CF-29 now takes the scoped check above.
    - **No production behaviour, contract or classification is involved.** The observations recorded at S5.3 reproduced in every S5.4 run.

  - **Totals:**
    - **Blocking:** 294 tests listed, 98 per engine. Chromium runs all 98; Firefox and WebKit run 88 and skip `swipe-touch.spec.ts`'s 10, with the reason naming MC-4, MC-2 and MC-3. A full run: 274 passed and 20 skipped.
    - **S5's share:** `swipe.spec.ts` 18 per engine, `swipe-motion.spec.ts` 4 per engine, `swipe-touch.spec.ts` 10 (Chromium).
    - **Evidence:** 87 tests listed, 29 per engine; a full run gives 67 passed and 20 skipped. S5's share is `swipe.evidence.spec.ts`, 9 per engine, of which 4 are Chromium-only.
  - **Blocking gate integrity:**
    - CI's `browser` job runs `npm run test:browser`, which is `playwright test --grep-invert @evidence`. Its listing holds the 13 blocking spec files and no `*.evidence.spec.ts`.
    - `retries: 0`, with `forbidOnly` under `CI`. No `.only`, `.fixme` or `.fail`. The one skip is `swipe-touch.spec.ts`'s file-level engine gate (S5 decision 2).
    - **Layer B** asserts that every input event is trusted `touch`. **Layer A** and the Firefox and WebKit part of CF-35 are labelled synthetic in their specs and records.
  - **S5.2's synchronisation, reviewed.** Each wait is either on genuine browser delivery or is the scenario's own property:
    - waits for the browser's delivery of a move (its `pointermove` at the sent `clientX`, or a `pointercancel`), since Chromium delivers touch moves with the next frame;
    - waits for the browser's `lostpointercapture`, which comes with the pointer's next event;
    - the 150 ms rests before a lift, an asserted precondition (no move within the 100 ms velocity window, from trusted timestamps);
    - the 300 ms holds that are the property under test (Y frozen through a reposition);
    - the one-task insertion measurement through the harness's `mount()` under `flushSync`, which is recorded.

    None loosened an assertion.

  - **AC-SW-1, by D2-3's layers.** AC-SW-1 is met only when all three have passed.

    | Layer                        | Input                                                       | Engines                                         | Status                                                                                                                     |
    | ---------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
    | A, swipe logic               | synthetic `PointerEvent`s; logic only, never real touch     | Chromium, Firefox, WebKit                       | **blocking, passing** (`swipe.spec.ts`), with the trusted mouse case                                                       |
    | B, trusted touch integration | Chromium CDP touch: real capture, `touch-action`, scrolling | Chromium                                        | **blocking, passing** (`swipe-touch.spec.ts`; CF-35 also in `swipe-motion.spec.ts`)                                        |
    | C, real devices and browsers | real touch on real devices                                  | iOS Safari, Android Chrome, Firefox for Android | **pending: S6**, MC-2, MC-3 and MC-4. Not complete; Playwright WebKit is never Safari, and layer A is never touch coverage |

  - **Coverage matrix.** "Pass" is blocking in the named engines (C, F, W); "recorded" is Class 2 or 4 evidence, never a contract. Input: T trusted (Chromium CDP touch), P protocol (Chromium CDP pen), S synthetic, M trusted mouse.

    | Item                | Class (D2)                          | Spec and scenario                                                                                                                                                                                                                                        | Input   | Result                           | Limitation                                                                 | Destination                         |
    | ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
    | CF-29               | 1 (A C F W; B C; mouse C F W); 2; 3 | `swipe.spec.ts`: distance at left, right and centre (both ways), below it, the flick, the forbidden clamp, activation slop and dominance, interactive descendants, the mouse drag. `swipe-touch.spec.ts`: layer B. Evidence: the trusted velocity commit | S; M; T | pass C F W; pass C; recorded (C) | trusted velocity is Class 2 (Chromium's frame-aligned moves); real devices | MC-2, MC-3, MC-4                    |
    | CF-30               | 1 (C); 2; 3                         | `swipe-touch.spec.ts`: a vertical drag from a toast scrolls, with the browser's `pointercancel` and no dismissal, after a scrolling control. Evidence: diagonals                                                                                         | T       | pass C; recorded (C)             | Firefox and WebKit scrolling not automatable                               | MC-2, MC-3, MC-4                    |
    | CF-31               | 2; 3                                | evidence: protocol pen, horizontal (commits), vertical from a toast and the page (no scroll)                                                                                                                                                             | P       | recorded (C)                     | protocol pen is not a stylus                                               | MC-7                                |
    | CF-32               | 1 (C); 2; 3                         | `swipe-touch.spec.ts`: a programmatic dismissal mid-drag wins once; a genuine capture loss restores. Evidence: capture mechanics                                                                                                                         | T       | pass C; recorded (C)             | real touch devices                                                         | MC-2, MC-4                          |
    | CF-33               | 4                                   | evidence: focus after a swipe of the focused toast                                                                                                                                                                                                       | T; S    | recorded C F W                   | a swipe after pointer use not recorded                                     | P-29 (with CF-8)                    |
    | CF-34               | 3                                   | none: pinch-zoom is not automatable (D1)                                                                                                                                                                                                                 | —       | pending                          | —                                                                          | MC-2, MC-3, MC-4                    |
    | CF-35               | 1 (C T; F W S); 2; 3                | `swipe-motion.spec.ts`: activation mid-reposition, Freeze Y under insertion and removal, X kept through repositions during the snap-back and the fly-out. Evidence: the one-frame hold against a control                                                 | T; S    | pass C F W; recorded C F W       | appearance                                                                 | MC-8                                |
    | CF-36               | 1 (C F W S); 2; optional 3          | `swipe.spec.ts`: a dismissal during the snap-back completes once with its reason. Evidence: opacity                                                                                                                                                      | S       | pass C F W; recorded C F W       | Chromium's first-frame step (accepted, D2-7)                               | MC-8 (optional)                     |
    | CF-37               | 3                                   | none: real pen hardware                                                                                                                                                                                                                                  | —       | pending                          | the re-base decision follows MC-7 (D0-4)                                   | MC-7                                |
    | CF-38               | 2                                   | evidence: a drag from a shadow-root button starts and commits; the light-DOM one never does                                                                                                                                                              | T; S    | recorded C F W                   | the confirmed D2-2 limitation; no `composedPath()` change                  | P-26, §37                           |
    | CF-39               | 2; 3                                | evidence: mouse press (C F W), touch tap and held drag (C), protocol pen press (C)                                                                                                                                                                       | M; T; P | recorded                         | real touch and pen                                                         | MC-2, MC-3, MC-7                    |
    | CF-40               | 2                                   | evidence, with CF-36: on a commit, no rise in any engine                                                                                                                                                                                                 | S       | recorded C F W                   | —                                                                          | —                                   |
    | CF-41               | as CF-30                            | as CF-30                                                                                                                                                                                                                                                 | T       | pass C; recorded (C)             | as CF-30                                                                   | MC-2, MC-3, MC-4                    |
    | CF-42               | 4                                   | assembled at S6 from CF-30, CF-34 and CF-41                                                                                                                                                                                                              | —       | pending (needs CF-34)            | `pan-y` kept (D0-14)                                                       | P-26, after MC-2, MC-3, MC-4        |
    | CF-43               | a rule                              | P-21's device approvals satisfy no CF item                                                                                                                                                                                                               | —       | applied: none was counted        | —                                                                          | S6                                  |
    | §19 (S5 decision 1) | 1 (C F W S)                         | `swipe.spec.ts`: the `swipe` pause's start and end; a selection prevents a swipe; custom toasts swipe; RTL keeps the physical directions; reduced motion dismisses without travel                                                                        | S       | pass C F W                       | logic only                                                                 | real devices under MC-2, MC-3, MC-4 |

  - **Carry-forwards:**
    - **S6, manual checkpoints, all pending and none passed:**
      - MC-2 (iOS Safari), MC-3 (Android Chrome) and MC-4 (Firefox for Android): real touch swipes, scroll arbitration, diagonals, `pointercancel`, pinch-zoom (CF-34) and the `touch-action` evidence (CF-42), with S3's safe areas and S4's backgrounding and tap-without-focus;
      - MC-7: real pens (CF-31, CF-37, CF-39's pen press);
      - MC-8: CF-35's hold and, optionally, CF-36's Chromium step, with the earlier visual items;
      - MC-1, MC-5 and MC-6, as S3 and S4 recorded them.
    - **P-26:** the Shadow DOM boundary (CF-38, with its post-v2 `composedPath()` candidate, §37); `touch-action: pan-y` and pinch-zoom (CF-42); with S3's forced-colours distinction.
    - **P-29:**
      - CF-33 with CF-8 and CF-7: the pointer-triggered restoration contract;
      - S4's CF-12 finding: no visible ring after Alt+T following pointer use;
      - CF-11 C: discoverability through assistive technology.
  - **Validation (at `c3f4a78`; this record is documentation only):**
    - **Browser suites:** the blocking suite under `CI=1`, 274 passed and 20 named skips; the `@evidence` suite under `CI=1`, 67 passed and 20 skipped, with no other pointer's events in any record;
    - **The corrected evidence spec:** its own runs agreed on every outcome;
    - **Repository gates:** `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass;
    - **Soak:** no full-suite soak, since no instability appeared. S5's targeted repeats stand: S5.1 270 of 270; S5.2 176 of 176 at three local workers and 110 of 110 under `CI=1`.
  - **Next:** the maintainer's acceptance of S5; then S6, not started.
- **S6 preflight record: the CF-35 WebKit activation allowance (done; awaits the maintainer's acceptance).** The maintainer accepted S5 (`c3f4a78`, `c838e02`). The S6 orientation's preflight did not reproduce S5's baseline, so it stopped before any orientation work. A test-design defect was found and corrected, with the maintainer's approval at each step. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, and no CF item was reclassified. No D0-16 report was raised.
  - **The failed baseline.** At `c838e02`, the blocking suite under `CI=1` gave **273 passed, 1 failed, 20 skipped**. The failure was `swipe-motion.spec.ts`, "CF-35 … activation during a reposition starts from the current position, then freezes Y", in WebKit (synthetic input). The `@evidence` suite matched S5.4 (67 passed, 20 skipped). The failure's own artifacts were overwritten by the evidence run that followed, so it is known by name only.
  - **Targeted diagnosis** (approved: this test only, WebKit, `CI=1`, one worker, zero retries, `--repeat-each=20`, on an idle host): **16 passed, 4 failed**, all at the S5.2 assertion "no jump at activation". The change measured 1.27 to 1.29 px against allowances of 0.92 to 1.27 px.
    - **The reposition was genuinely in progress:** `b`'s transform Y was −47.6 or −51.5 px at activation.
    - **Freeze Y held:** in every failure, all 25 drag frames sat exactly at the activation's `after` top.
    - **The mechanism:** the allowance (half a pixel plus the fastest frame-to-frame speed times the `before` to `after` interval) took its speed only from frames sampled before activation. Activation lands about 10 ms into the 200 ms reposition, so those frames held only its first interval, the slow start of `cubic-bezier(0.2, 0, 0, 1)`: 0.29 to 0.42 px/ms. Between that frame and `before`, `b` was moving at 1.07 to 1.18 px/ms. WebKit advances motion within a task (S2) and its `performance.now()` read in whole milliseconds here, so the 1 to 2 ms between `before` and `after` carried about 1.27 px of real reposition motion, more than the stale speed allowed. S5.2's 13 WebKit repeats of this test (8 and 5) all passed; at the rate seen here that has about a 5% chance.
    - **Classification:** a test-design defect in the allowance's speed estimate, not a production defect.
  - **The correction** (`swipe-motion.spec.ts`, this test only). The speed estimate now includes the activating move's own `before` read as its last sample, so it measures the motion leading into activation. The principle is unchanged: the permitted change is only the motion the measured speed explains over the interval, plus half a pixel. No sleep, fixed tolerance, clock-resolution term, production or timing change was added, and the Freeze Y assertion and the other CF-35 tests are unchanged.
  - **Mutation.** S5.2's mutation, activation from the layout Y instead of the visual Y (`useSwipe.ts` writing Y 0 at activation), still fails the corrected test at "no jump at activation" in every engine: 37.97 px against 2.14 (Chromium), 58.15 against 1.19 (Firefox) and 46.37 against 1.71 (WebKit). It was reverted at once, and `src/` is identical to `c838e02`.
  - **Targeted repeats of the corrected test,** under `CI=1`, one worker, zero retries:
    - **WebKit, 100 repetitions with traces on: 100 passed.** Decoded from every trace: the measured interval was 1 ms in 22 runs, 2 ms in 70, and 3 to 5 ms in 8; 54 runs showed a non-zero change, up to 1.29 px; the old allowance would have failed 10 of them, the corrected one none; Y never moved while held (24 or more drag frames each); activation fell at transform Y −64.0 to −19.5 px.
    - **Chromium and Firefox, 20 repetitions each: 40 passed.**
  - **Full validation** (one fresh run each, no retries): the blocking suite under `CI=1`, **274 passed, 20 named skips**; the `@evidence` suite under `CI=1`, 67 passed, 20 skipped; `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Remaining uncertainty:**
    - The smallest margin in the 100 runs was 0.14 px (a 1.26 px change against 1.41 px, with a measured interval of 1 ms). WebKit's whole-millisecond clock can understate the interval, so the margin is thinnest when it reads 1 ms. No clock-resolution term was added; the S6 soak is the next evidence on it.
    - 100 clean runs do not show that future flakiness is impossible.
    - The original failure's own trace was lost, so that it shared this mechanism is inferred from the reproduction.
  - **Diagnostics,** kept outside the repository and session storage at `~/p22-diagnostics/2026-10-09-cf35-webkit/`: the commands, environment, logs, results, the four failure traces and screenshots, the 100 WebKit traces, and the allowance calculations.
  - **Next:** the maintainer's acceptance of this correction; then the S6 orientation, not started.
- **S6.1 record: the manual QA page (done; awaits the maintainer's acceptance).** The page S6's manual checkpoints run on, from the S6 orientation's proposal as the maintainer approved it. Test infrastructure only: `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, no CF item was reclassified, and no checkpoint was run.
  - **The maintainer's device inventory:**
    - **Available:** a Windows desktop, an Android phone with a display cutout, and an iPhone with a notch or Dynamic Island. MC-2, MC-3, MC-4, MC-5, MC-6 and MC-8 (except its Safari part on macOS) can be scheduled.
    - **Unavailable, so unverified gaps for now:** macOS Safari (MC-1, and MC-8's desktop Safari part) and physical pen hardware (MC-7). iOS Safari does not stand in for macOS Safari, nor Chromium's protocol pen for a pen. P-22's closure is not decided here.
  - **Files:**
    - `browser/harness/manual.html` and `manual.tsx`: the page, served at `/manual.html`;
    - `browser/vite.config.ts`: a second HTML entry. With two entries, the build moves the shared library and React code into one chunk that `index.html` now preloads; the automated harness's source, API, selectors and behaviour are unchanged;
    - `browser/tests/manual.spec.ts`: the smoke test;
    - `browser/MANUAL_QA.md`: how to serve and use the page, and the LAN procedure.
  - **The page:**
    - the real public entry (`src/index.ts`) and the production stylesheet, linked byte for byte by the existing build plugin; its own styles use an `mq-` prefix, are added from script, and never select `.ret-*` or set `touch-action`, stacking or transforms;
    - `width=device-width, initial-scale=1, viewport-fit=cover`, with zoom enabled; a tall page with scroll markers; focusable buttons before and after the region; the `dir` attribute on `<html>`, as the specs set it;
    - the Toaster in its own React root, so the panel's status updates never re-render it;
    - **controls:** the six positions, LTR and RTL, the three themes, `maxVisible`, slow motion (the public enter and exit tokens at 1800 and 1200 ms, as consumer CSS; the 200 ms reposition is not a token and stays at production speed); the next toast's type (default, success, error, warning, info, loading, custom), duration (persistent, 8 s, or the Toaster's 5 s), description, action and progress; add one, add three, dismiss all, and dismiss the newest in 2 s (for CF-32); presets for a persistent swipe target, an 8 s toast with progress, a persistent toast with an action, and a 280 × 96 px custom toast with a button inside;
    - **status**, four times a second: each toast's ID, type, position, phase, `data-paused`, `data-swiping`, `inert` and progress fraction; `visibilityState`, `hasFocus()`, the active element and `:focus-visible`; `scrollY`, `visualViewport.scale`, the viewport, the measured `env(safe-area-inset-*)` values and `dir`; the user agent;
    - **event log** (up to 2000 entries, the newest 150 shown, each with `performance.now()` and wall-clock time): pointer events with `pointerType`, `pointerId`, `button`, `buttons`, pressure and `isTrusted` (moves when `buttons` changes or at most every 100 ms per pointer, with a count of those left out), `pointercancel`, `got`/`lostpointercapture`; clicks with the active element; navigation keys and Alt+T, never typed text; `focusin`/`focusout` with `:focus-visible`; window focus and blur; `visibilitychange`; `pagehide`/`pageshow`; scrolls, resizes and visual-viewport changes, at most every 250 ms; toast roots added and removed, their lifecycle attributes, and `onDismiss` with its reason;
    - **observational only:** every listener is passive, in the capture phase, and never calls `preventDefault`, `stopPropagation` or pointer capture; there are no touch listeners;
    - **export:** a session label; **Download JSON** (a Blob download, which works over plain HTTP and on iOS, Android Chrome and Firefox) with the label, the environment (user agent, touch points, pixel ratio, screen, orientation, React version, reduced-motion, colour-scheme and forced-colours media), the status and the log; **Show JSON** as a fallback; **Clear log**. No Clipboard API, devtools, telemetry or upload.
  - **Smoke test (Class 1, Chromium, Firefox, WebKit; one per engine):** the page loads; `/styles.css` is byte-identical to `src/styles.css` and the only linked stylesheet; the region is present; a success toast created from the page's controls renders, styled and visible, in a `position: fixed` list; the status shows it; its close button removes it; and the log holds its creation, its dismissal with reason `close-button`, and the mouse's pointer events.
  - **Validation:**
    - the smoke test: 3 passed;
    - the blocking suite under `CI=1`: **277 passed, 20 named skips** (274 plus the three smoke tests; no other test or skip changed);
    - the `@evidence` suite under `CI=1`: 67 passed, 20 skipped;
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass;
    - a scratch check in Chromium at the Pixel 7 size (not committed): no horizontal overflow at 412 px, the presets, the scheduled dismissal, RTL at `bottom-left`, the JSON export and download, and no page errors.
  - **Serving:** `npm run browser:serve`, then `http://localhost:4180/manual.html`. From WSL, Windows' own `curl.exe` fetched the page through `localhost` and `127.0.0.1` (HTTP 200). A look in a Windows browser is the first step of the first manual session.
  - **LAN access: pending.** WSL2 uses NAT here, so phones need a temporary Windows port forward and firewall rule. `browser/MANUAL_QA.md` describes them and their cleanup; nothing was run, and they wait for the maintainer's approval.
  - **Limitations:** toasts sit above the page, so at a top or bottom position they can cover controls at that edge; the status reads the progress fraction from the fill's computed transform; the safe-area values are those the browser resolves for the page.
  - **Pending:** every manual checkpoint (none run or passed; AC-SW-1 layer C stays pending); the LAN setup; S6.2 (the soak, with the CF-35 watch); S6.3 (the reconciliation and carry-forwards).
- **S6.1a record: a 10-minute progress preset (done; awaits the maintainer's acceptance).** The maintainer accepted S6.1 (`a73bff8`) after opening the page in Windows Chrome. That confirms the page works; it is not an MC-5 result. `src/`, the production stylesheet, the public API and the 30 tokens are unchanged, and no checkpoint was run.
  - **Why:** MC-5's and MC-1's background cases (CF-1, CF-5, CF-25, CF-26; AC-PR-1's manual layer) include hiding for more than about 5 minutes. The longest progress preset was 8 s, so the toast would have closed long before the case ended.
  - **The preset:** **10-minute progress — background/visibility test**, first under Presets. It calls the public `toast.info` with `duration: 600_000` and `progress: true`, labelled "10-minute progress" and its ID. Pause and resume are the library's own; the page adds no timer or polling that touches the toast. Its creation is logged with `"duration":"ten-minutes"`. The instrumentation and the other controls are unchanged: the status and log already show the phase, `data-paused`, the progress fraction, visibility, `hasFocus()`, the active element and `:focus-visible`, and the focus, blur and visibility events. `browser/MANUAL_QA.md` describes its use. The page gives no verdict.
  - **Smoke test:** the existing test case gains the preset, so the count is unchanged. The toast is visible with its label; the fill's computed `animation-duration` is `600s` and it is running; its fraction falls below 1 while staying above 0.99; and the status and log show it. Chromium, Firefox and WebKit: 3 passed.
  - **Validation:** the blocking suite under `CI=1`, **277 passed, 20 named skips**; the `@evidence` suite under `CI=1`, 67 passed, 20 skipped; `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Limitation:** the status shows the fraction to three decimals, which is 0.6 s of a 10-minute toast; run-ahead after minutes hidden is far larger.
  - **Pending:** every manual checkpoint (none run or passed); the LAN setup; S6.2; S6.3.
- **MC-5 record: desktop Chrome and Firefox on Windows (partly recorded; not complete).** The maintainer accepted S6.1a (`51290fb`), then ran six cases on the manual QA page in real Windows Chrome and Firefox with the 10-minute progress preset, and reported them on 2026-10-09. These are the maintainer's **visual observations**, not machine evidence: the `visibilitychange` transitions were not checked, the progress fractions before and after were not written down, and no JSON log was reviewed. Nothing here is inferred beyond what was reported. `src/`, the harness and the tests are unchanged.
  - **Not yet recorded:** the Windows build, the Chrome and Firefox versions and the date of each session, which every checkpoint records.
  - **Reported, in each of Chrome and Firefox:**

    | Case                                          | Reported observation                                                                                                                      |
    | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
    | Focus inside the toast, Alt+Tab away and back | focus inside confirmed by eye; the toast stayed paused while focused; no visible run-ahead on return; progress resumed once focus left it |
    | Tab hidden for more than 5 minutes            | the toast stayed; no visible run-ahead on return; progress resumed normally                                                               |
    | Window minimised for more than 5 minutes      | the toast stayed; no visible run-ahead on return; progress resumed normally                                                               |

  - **Against MC-5's requirements:**
    - **CF-26, hidden tab and minimised window for more than about 5 minutes (intensive throttling): supported visually, in both browsers.** The bar showed no visible run-ahead and resumed. On a 10-minute bar, the run-ahead T1 prevents would be about half its length after 5 minutes, so a visual check can see it; a smaller drift could not be seen, and no fraction was recorded.
    - **CF-1, genuine app switching while a toast holds focus: supported visually, in both browsers.** The focus-within pause held through Alt+Tab and cleared once focus left. Whether `window-blur` set and cleared `data-paused` was not checked: with focus inside, the focus-within pause hides the blur reason's own effect.
    - **CF-25 and CF-1, genuine blur on its own: not covered.** No case blurred the window with focus and the pointer outside the toast, so the reported cases do not show that blur alone freezes the bar and resumes it from the held fraction. That is the Class 3 layer CF-25 assigns to Firefox (Chromium's is CDP evidence only).
    - **CF-5, real blur and `visibilitychange`: outcome only.** The outcomes are consistent with the document being hidden, but the events themselves were not observed.
    - **Window switching** (another browser window) was not reported apart from Alt+Tab.
    - **Occlusion-only hiding** (the browser window fully covered by another window, without minimising it or switching tabs) was not attempted. MC-5 asks for it where the platform produces it.
  - **Assessment: MC-5 is partly verified, not passed.** No new production defect was reported, and nothing calls for a D0-16 report.
  - **To complete MC-5:**
    - record the Windows build, the browser versions and the session dates;
    - in each browser, blur alone: the 10-minute preset with focus and the pointer away from the toast, Alt+Tab away for about a minute and back, then window switching, with the status values before and after and a JSON export;
    - one hidden-tab and one minimised case per browser with a JSON export, so the `window-blur`/`window-focus`, `visibilitychange` and `data-paused` transitions and the fractions are recorded. The long, more-than-5-minute cases stand as reported visually;
    - occlusion-only hiding: attempt it, and record whether Windows produced a hidden document.
- **MC-5 final record: desktop Chrome and Firefox on Windows (accepted / PASSED).** It completes the partial record above, which stands as written. The maintainer ran the remaining cases and supplied the environment. Every result below is the maintainer's **visual observation**: no JSON log was exported, no progress fraction was written down, and no event trace was reviewed. Nothing here is inferred beyond what was reported. `src/`, the harness and the tests are unchanged.
  - **Environment:** Windows 11, version 26H2, build 26300.955; Chrome 154.0.8037.95; Firefox 157.0.1; the manual QA page with the 10-minute progress preset (`51290fb`), served locally; all cases on 2026-10-09.
  - **Results: 6 cases in each browser, 12 in all, every one reported positive.**

    | Case                                                                 | Chrome   | Firefox  |
    | -------------------------------------------------------------------- | -------- | -------- |
    | 1. Focus inside the toast, Alt+Tab away and back                     | positive | positive |
    | 2. Tab hidden for more than 5 minutes                                | positive | positive |
    | 3. Window minimised for more than 5 minutes                          | positive | positive |
    | 4. Window blur alone, with focus and the pointer outside the toast   | positive | positive |
    | 5. Switching between two windows of the same browser                 | positive | positive |
    | 6. Occlusion only: the browser fully covered by another app's window | positive | positive |

    "Positive" means, as reported: the toast stayed where applicable; no visible run-ahead of the progress bar on return; progress resumed normally. In case 4, the bar paused while the window was blurred. In case 1, it stayed paused while focus was inside the toast and resumed once focus left.

  - **Occlusion and visibility:** Firefox reported `visibilitychange` to `hidden` during occlusion. Whether Chrome's document became hidden during occlusion was **not determined**.
  - **Against MC-5's requirements (and its CF items, in Chrome and Firefox):**
    - **CF-1, genuine window and app switching while a toast holds focus:** case 1 (app switching) and case 5 (window switching). With focus inside, the focus-within pause hides the blur reason's own effect, so case 1 alone does not show it; case 4 does.
    - **CF-25, genuine blur freezes and resumes the bar:** case 4, blur with no focus or pointer in the toast, so only the blur reason (`window-blur`) applied. This is the Firefox Class 3 layer, and real-Chrome evidence beside Chromium's CDP layer.
    - **CF-5, real blur and visibility:** real blur in cases 1, 4 and 5; real hidden documents in cases 2 and 3, and in Firefox's case 6, where the hidden state was seen. The events themselves were not traced.
    - **CF-26, the bar on return after genuine hiding, without run-ahead (T1):** cases 2 and 3, each hidden for more than 5 minutes (intensive throttling), and case 6, occlusion-only hiding, which MC-5 asks for where the platform produces it. Firefox produced it. Chrome's case 6 passed on its outcome, but whether it hid the document is unknown, so for Chrome it is evidence of the outcome, not of the hidden-document path. Chrome's hidden-document path is covered by cases 2 and 3.
  - **Limitations, recorded with the evidence:**
    - **Visual, not measured:** without fractions, a run-ahead or drift smaller than the eye can see on the bar would go unnoticed. The failure T1 prevents is large: after 5 minutes hidden, about half of a 10-minute bar.
    - **No event trace:** the `window-blur`, `visibilitychange` and `data-paused` transitions were not recorded. The library pauses on both window blur and a hidden document (`useEnvironmentPause`), and switching tabs, minimising or covering the window normally also takes focus from it (browser behaviour, not observed here), so cases 2, 3 and 6 need not have exercised the hidden-document reason on its own. MC-5 asks for the behaviour, not for the reasons separated.
    - **Chrome's occlusion visibility** is undetermined, as above.
  - **Assessment:**
    - MC-5's requirement is behaviour in real browsers, recorded as a manual checkpoint (Class 3): the machine, the operating-system and browser versions, the date, and a case-by-case result with observations. No MC-5 item, and none of CF-1, CF-5, CF-25 and CF-26, requires an exported log or measured fractions. Every required case now has a reported result in both browsers, and the environment is complete.
    - **Decision: accepted / PASSED.** The maintainer accepted MC-5 as passed on the maintainer's visual evidence, with the limitations above. The hidden-document pause reason was not isolated or verified on its own.
    - No production defect was reported, and none is inferred from the missing traces.
    - **Optional, not required:** a Chrome occlusion case with a JSON export would settle whether Chrome hides an occluded document. The outcome is already recorded, so it would add only that detail.
  - **Scope:** MC-5 covers desktop Chrome and Firefox only. The same CF items stay open elsewhere: MC-1 (macOS Safari, an unverified gap), and MC-2 and MC-3 for mobile backgrounding (CF-5, CF-26). AC-PR-1's manual layer is therefore not complete.
- **MC-6 record: real Windows High Contrast in Chrome and Firefox (accepted / PASSED).** The maintainer ran the manual QA page under a Windows contrast theme on 2026-10-09: first broad checks, then a follow-up covering each rendering requirement. Every result below is the maintainer's **visual and interaction observation** in real browsers, not automated evidence. Emulated forced colours remain the separate Class 1 layer (CF-14, S3). Nothing is inferred beyond what was reported. `src/`, the harness and the tests are unchanged.
  - **Environment:** Windows 11, version 26H2, build 26300.955; Chrome 154.0.8037.95; Firefox 157.0.1; the **Aquatic** contrast theme, the same in both; 2026-10-09.
  - **Results, positive in both browsers:**

    | MC-6 requirement (forced-colours rule)                                                                        | Reported in Chrome and Firefox                                                                    |
    | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
    | CF-14: the card keeps a visible edge (`CanvasText` border)                                                    | visible on all six types: default, success, error, warning, info and loading                      |
    | CF-14: each type recognisable by its icon                                                                     | success, error, warning and info by their icons; loading by its spinner; default has no type icon |
    | CF-14: the action button has a border (`ButtonText`)                                                          | visible on **Persistent with action**                                                             |
    | CF-14 and CF-12: the focus rings in `Highlight`                                                               | the action and close buttons, in Aquatic's highlight colour; the toast root after Alt+T           |
    | CF-14 and CF-13: the region ring (`Highlight`, with a `Canvas` halo), shown while the region itself has focus | visible after the single-toast close sequence (Alt+T, Tab to the close button, Enter)             |
    | CF-28: the progress fill in `CanvasText`, with no track                                                       | the fill visible, with no track behind it                                                         |

    The earlier broad checks were also positive in both: text readable, controls visible, keyboard focus visible; no defect was reported. Keyboard activation worked in Firefox and was not reported separately in Chrome; it is not an MC-6 requirement.

  - **Limitations:**
    - **Visual only.** The rings' colour is the maintainer's judgement against the theme's highlight colour, not a measured value. No screenshots are recorded.
    - **`focusVisible` not recorded.** The Status value was not written down in either browser, for the toast root after Alt+T or for the region after the close sequence. The rings were seen; the `:focus-visible` state behind them was not independently checked. MC-6 asks for the rings' appearance, so this is recorded, not required.
    - **The Alt+T ring is engine behaviour.** Whether an engine matches `:focus-visible` after Alt+T depends on its heuristics and on the input used before (D2-6). This session's earlier input was not recorded, so the ring seen here does not contradict S4's observation that no ring shows after Alt+T following pointer use, and it is no contract.
  - **Assessment: accepted / PASSED.** All six rendering requirements of MC-6 (D0-8; CF-14, CF-28, CF-12 and CF-13 at Class 3) were observed in both browsers, and the environment, including the theme, is complete. No production defect was reported or inferred. P-26 can now distinguish emulated forced colours (Class 1, Chromium, Firefox and WebKit) from this real Windows High Contrast evidence (Chrome and Firefox, Aquatic).
- **S6.1b record: the manual QA page's MC-8 additions (done; awaits the maintainer's review).** The maintainer approved the MC-8 checklist and this slice. It adds the two controls the checklist found missing. Test infrastructure only: `src/`, the production stylesheet, the public API, the package exports and the 30 tokens are unchanged, no CF item was reclassified, and MC-8 has not been run.
  - **MC-8's coverage (the maintainer's decisions):** Chromium and Gecko on the Windows desktop now; real iOS Safari for the WebKit engine and Safari, once phone access is approved; CF-35 and CF-36, which need touch, with MC-2, MC-3 and MC-4. **macOS Safari stays an unverified gap.** Phone network access is not yet approved.
  - **Close button on custom toasts** (CF-12's custom close ring): a checkbox under Next toast, off by default. When it is on, custom toasts, the Custom 280 × 96 preset included, are created through the public `toast.custom` with `closeButton: true`, and their `create` entry carries `"closeButton":true`. When it is off, custom toasts are unchanged.
  - **Add one in 2 s** (CF-35, an insertion during a swipe fly-out): one ordinary toast, about 2 s after the click, through the same path as Add one, with the Next toast settings captured at the click. The log records `add-scheduled` at the click; when the timer fires, the toast's `create` entry and then `add-scheduled-fired` with its ID. The button is disabled, reading "(pending)", until then, so only one insertion is ever pending, and settings changed meanwhile do not affect it.
  - **`browser/MANUAL_QA.md`:** how to inspect the custom close ring, keyboard only, in both themes; and how to reproduce CF-35 with touch: Slow motion lengthens the fly-out to 1.2 s but not the fixed 200 ms reposition; the expected cosmetic result; how the log shows the order; and that a visual check records what was seen, never a measured frame.
  - **Smoke test:** a second manual-page test case in Chromium, Firefox and WebKit. Custom toasts have no close button by default, and get one with the option, which dismisses with reason `close-button`. The scheduled insertion adds nothing at once, keeps the button disabled while pending, then adds exactly one toast, with at least 1,900 ms between `add-scheduled` and `add-scheduled-fired` (a lower bound only). The swipe-target, action and progress presets still create their toasts.
  - **Validation:**
    - the manual-page smoke tests: 6 passed (2 per engine);
    - the blocking suite under `CI=1`: **280 passed, 20 named skips** (277 plus the new case in three engines; no other test or skip changed);
    - the `@evidence` suite under `CI=1`: 67 passed, 20 skipped;
    - `format:check`, `lint` with the stylesheet contract, `typecheck` (four projects), `typecheck:demo`, the full Vitest suite (40 files, 1,695 tests), `validate:package`, `build:demo` and `git diff --check` all pass.
  - **Limitations:** the 200 ms reposition cannot be slowed (it is not a token); swiping needs a touch device, so CF-35 waits for the phones; the insertion's timing relative to the swipe is the tester's, so a case may need repeating until the log shows it landed during the fly-out.
- Carried over from P-15. jsdom cannot show these, so P-22 verifies them in real browsers. They are checks, not requirements added to P-15:
  - switching the browser or window away and back while a toast holds focus
  - a focused control becoming disabled, hidden or `inert` and losing focus without a useful focus event
  - what each browser does with focus when the focused node is removed
  - pointer-boundary behaviour when a stack appears under a stationary pointer
  - real `blur` and `visibilitychange` behaviour in every supported browser
- Carried over from P-16. jsdom enforces neither `inert` nor real browser focus behaviour, so P-22 verifies these in real browsers. They are checks, not requirements added to P-16. During P-16 the hotkey, Escape and removal restoration were smoke-checked by hand in Chromium only; P-22 is the systematic real-browser verification.
  - **`inert`:**
    - what each browser does with focus when a focused toast becomes `inert`
    - that removal restoration (§18) moves focus before `inert` takes effect
    - that the browser's own focus fix-up does not then contradict the library's restoration
    - pointer, click and focus behaviour on an inert exiting toast
  - **Click without focus (WebKit and Safari).** Safari may not focus a button when it is clicked. Check what happens when a close button is activated without first having focus. Removal restoration starts only from focus inside the toast, so this path is not assumed to restore focus. Report it separately from the keyboard path, where the focused close button is the starting point.
    - **Open design question from P-18 S5: pointer-triggered close.** Where a click focuses the close button, as in Chromium, a mouse close restores focus into a neighbouring toast (§18), which is then paused by `focus-within` (§10) until focus leaves. The restored focus may not show `:focus-visible` after a pointer interaction, so the toast can look stuck. This is correct under the current contract and unchanged by P-18. Should a pointer-triggered close restore focus the same way as a keyboard-triggered one? Options to evaluate, none chosen: the current behaviour, always restoring within the region; restoring into another toast only when the dismissal came from keyboard focus or navigation; treating script-restored focus after a pointer interaction differently from keyboard-visible focus; or another accessible strategy that browser and assistive-technology testing supports. Any change must keep these: keyboard users never lose focus to `<body>`; keyboard dismissal keeps deterministic restoration; genuine keyboard focus still pauses the toast; pointer behaviour is tested in every browser, since click-to-focus differs; and assistive-technology evidence (P-29) supports it. The contract (§10, §18) changes only by a decision recorded in this plan before implementation.
  - **Revival.** A toast revived in the same commit in which it was exiting: whether the browser's `inert` state can briefly refuse focus although the toast is already eligible again.
  - **Ordering.** The order, in each browser, of removal restoration, focus events, applying and removing `inert`, and the focus-within pause moving from one toast to another.
  - **`aria-keyshortcuts`:**
    - how Chromium, WebKit and Firefox expose the attribute in the DOM and the accessibility tree, where that can be checked
    - exposure through assistive technology is checked separately, under P-29
    - axe does not show that the value is exposed or understood
- Carried over from P-17. jsdom has no layout, focus-visible heuristics or forced colours, and P-17's manual reviews were in Chromium only, so P-22 verifies these in real browsers. They are checks, not requirements added to P-17:
  - **Focus-visible.** The rings on the toast root (inside the card edge, outside a custom toast), the action and close, and the custom close in `currentColor`. When each browser shows them after the hotkey and after removal restoration, which focus from script.
  - **The region ring.** The fixed, viewport-inset `::after` shown while the region itself has focus (decision 3): its appearance, that it never takes pointer input, and its stacking above the lists.
  - **Forced colours.** Chromium's `forced-colors: active` in the browser suite (§26), and Windows High Contrast for real: the card edge, the action's border, the `Highlight` focus rings, the region ring, and that each type stays recognisable by its icon shape.
  - **Layout.** The six positions, safe-area gutters and narrow-viewport width without horizontal overflow, and the RTL mirroring that AC-RTL-1 requires.
- Carried over from P-18. jsdom runs no CSS animation and evaluates no media query, and P-18's manual checkpoints were in Chromium only, so P-22 verifies these in real browsers. They are checks, not requirements added to P-18:
  - **Enter and exit (AC-MO-1).** Real `ret-enter-*` and `ret-exit-*` playback at every position in Chromium, WebKit and Firefox; completion on the toast root's own `animationend`; the exit holding its last frame until removal; and left positions settling with no offset (D-14).
  - **Fallbacks (AC-LC-2).** Completion when no `animationend` arrives, for example under `display: none`, and the computed fallback following an overridden motion token.
  - **Reduced motion (AC-MO-3).** Under emulated `prefers-reduced-motion: reduce`, no translation, scale or fade, a static spinner, and a lifecycle that still completes.
  - **Spinner.** Rotation about its own centre, and its events never completing the toast.
  - **Individual transform properties.** `translate`, `scale` and `rotate` in every engine the suite runs (P-18 D0, decision 6).

- Carried over from P-19. P-19's checkpoints were machine-observed in headless Chromium only, so P-22 verifies these in real browsers. They are checks, not requirements added to P-19:
  - **Reflow (AC-MO-2).** Automated stack repositioning in Chromium, WebKit and Firefox:
    - insertion, removal after the exit, and removal plus promotion at all six positions with mixed and custom heights;
    - interruption that continues from the toast's current position;
    - `transform: none` at rest;
    - the root's computed `offsetParent` being its list.
  - **Reduced motion (AC-MO-3).** Under emulated `prefers-reduced-motion: reduce`, repositioning is instant, with no reposition transition, fade or scale, and the lifecycle still completes.
  - **Scale overlap.** A visual evaluation of the accepted P-18 `scale` × P-19 `transform` composition during an overlapping enter or exit and move: up to about 1.79px, machine-observed in Chromium. P-19 deliberately does not compensate. Only browser evidence of a material, human-visible problem reopens the ownership boundary.

- Carried over from P-20. P-20's browser evidence is Chromium only: headless Chrome 154, plus headful Chrome for genuine hiding, with emulated colour schemes, forced colours and reduced motion. P-22 verifies these in real browsers (§26: "progress direction and pause sync"). They are checks, not requirements added to P-20:
  - **Direction (AC-RTL-1, D-11).** In Chromium, WebKit and Firefox, the remaining fill is anchored at the inline start: the physical left in LTR and the right in RTL. It depletes toward that edge, and the vacated space opens at the inline end.
  - **Pause synchronisation (AC-PR-1, D-10).** In WebKit and Firefox:
    - the bar runs only while the toast is `visible` and not `data-paused`, and holds otherwise;
    - hover, focus and window blur freeze it, and resume continues from the held fraction without a reset.
  - **Hidden-document resynchronisation (P-20 decision 3, T1).** As far as the matrix allows, a genuinely hidden tab or minimised window shows the bar at the store's held value on return, without the literal model's run-ahead. Intensive throttling (hidden for more than about 5 minutes), occlusion-only hiding and mobile backgrounding were never tested.
  - **Safe corners.** The strip's `clip-path` corner follows the card's inner curve at every fraction, and the moving edge is straight.
  - **Forced colours.** Windows High Contrast for the `CanvasText` fill, with no track.

- Carried over from P-21 (D0). P-21's real-browser evidence is its D1 prototype and manual checkpoints, so P-22 verifies these in real browsers. They are checks, not requirements added to P-21:
  - **Touch swipe (AC-SW-1, §26).** Automated in Chromium, WebKit and Firefox: commit past the distance or velocity threshold, spring-back below it, both directions at centre positions, the forbidden direction clamped, and no movement or dismissal from a mouse drag.
  - **Scroll arbitration.** Vertical page scrolling that starts on a toast still works under `touch-action: pan-y`; diagonal gestures; and `pointercancel` when the browser takes the pointer, restoring the toast with no dismissal.
  - **Pen.** Whether each engine applies `touch-action` to pen input, and pen swipe behaviour.
  - **`inert` with capture.** What each browser does with a captured pointer when the toast becomes exiting and `inert` mid-gesture (P-21 D0, decision 11).
  - **Pointer-triggered restoration.** The open question on pointer-triggered close above now includes a swipe of a toast that holds focus, which restores focus by the same §18 machinery (P-21 D0, decision 17).
  - **Pinch-zoom.** `touch-action: pan-y` means a pinch-zoom that starts on a toast is not handled by the browser. Record each engine's behaviour as evidence for P-26.
  - **Composition motion (P-21 S3 and S4).** In each engine: activation mid-reposition, Freeze Y, and repositions during a snap-back and a fly-out keep X with no jump; the accepted one-frame hold when a reposition restarts a fly-out stays cosmetic.
  - **A dismissal during the snap-back (P-21 S4).** The settle rule still transitions opacity; in Chromium P-18's exit fade runs unaffected. Confirm WebKit and Firefox do not let the running opacity transition override the exit fade.
  - **Pen contact loss (P-21 pre-publication correction).** On real pen hardware in each engine: implicit capture, `buttons` on hover (0, or 2 with the barrel button pressed), and whether a pen reuses its pointer ID across contacts. A stale pending candidate is cleared only by that pointer's own hover (`buttons` 0); a new contact with the same pointer ID and no hover between is ignored at `pointerdown`, so its moves are measured from the stale origin and may activate without the slop and dominance (bounded by its own `pointerup`, with no dismissal unless it travels). Decide whether a same-ID `pointerdown` should re-base the candidate.
  - **Shadow DOM controls (P-21 review, MINOR-1).** A swipe can start from an interactive element inside a shadow root in custom content, since `event.target` is retargeted to the host. Decide whether to walk `composedPath()` to the root, and document the boundary for P-26.
- **Carry-forward index (D0).** Stable IDs for every check above and for the P-22 items recorded elsewhere in this plan. The lists above stay authoritative for each item's wording; the index only makes them traceable. The last column gives only the constraint a D0 decision already sets. Every other class is set at D2 (D0-1), and "D2" means no D0 constraint beyond D0-1, D0-11 and D0-16.

  | ID    | From | Check                                                                                                        | D0 constraint                                                    |
  | ----- | ---- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
  | CF-1  | P-15 | Switching the browser or window away and back while a toast holds focus                                      | D0-6                                                             |
  | CF-2  | P-15 | A focused control becoming disabled, hidden or `inert` without a useful focus event                          | D2                                                               |
  | CF-3  | P-15 | Focus when the focused node is removed                                                                       | D2                                                               |
  | CF-4  | P-15 | Pointer boundary when a stack appears under a stationary pointer                                             | D2                                                               |
  | CF-5  | P-15 | Real `blur` and `visibilitychange`                                                                           | D0-6                                                             |
  | CF-6  | P-16 | `inert`: focus, restoration before `inert`, the browser's fix-up, pointer and click on an inert toast        | D2                                                               |
  | CF-7  | P-16 | Click without focus                                                                                          | D0-7: real Safari is a separate manual checkpoint                |
  | CF-8  | P-16 | The open question on pointer-triggered close                                                                 | D0-2: evidence only, no contract change before P-29              |
  | CF-9  | P-16 | Revival and `inert` refusing focus                                                                           | D2                                                               |
  | CF-10 | P-16 | Ordering of restoration, focus events, `inert` and the focus-within handover                                 | D2                                                               |
  | CF-11 | P-16 | `aria-keyshortcuts` in the DOM and the accessibility tree (assistive technology: P-29)                       | D2                                                               |
  | CF-12 | P-17 | Focus-visible rings, and when each browser shows them after script focus                                     | D2                                                               |
  | CF-13 | P-17 | The region ring: appearance, no pointer input, stacking                                                      | D0-13 for its appearance                                         |
  | CF-14 | P-17 | Forced colours: Chromium emulation, and real Windows High Contrast                                           | D0-8: Chromium emulation automated; Windows High Contrast manual |
  | CF-15 | P-17 | Layout: six positions, safe areas, narrow viewport, RTL mirroring (AC-RTL-1)                                 | D2                                                               |
  | CF-16 | P-18 | Enter and exit playback, `animationend` completion, held last frame, left positions settling (AC-MO-1, D-14) | D2                                                               |
  | CF-17 | P-18 | Fallbacks without `animationend`, and with an overridden token (AC-LC-2)                                     | D2                                                               |
  | CF-18 | P-18 | Reduced-motion emulation (AC-MO-3)                                                                           | D2                                                               |
  | CF-19 | P-18 | Spinner rotation, and its events never completing the toast                                                  | D2                                                               |
  | CF-20 | P-18 | Individual `translate`, `scale` and `rotate` in every engine                                                 | D2                                                               |
  | CF-21 | P-19 | Reflow in three engines (AC-MO-2)                                                                            | D2                                                               |
  | CF-22 | P-19 | Reduced-motion reflow (AC-MO-3)                                                                              | D2                                                               |
  | CF-23 | P-19 | Visual evaluation of the P-18 `scale` × P-19 `transform` overlap                                             | D0-13: human judgement                                           |
  | CF-24 | P-20 | Progress direction (AC-RTL-1, D-11)                                                                          | D2                                                               |
  | CF-25 | P-20 | Pause synchronisation in WebKit and Firefox (AC-PR-1, D-10)                                                  | D0-6 for the blur part                                           |
  | CF-26 | P-20 | Hidden-document resynchronisation (T1)                                                                       | D0-6                                                             |
  | CF-27 | P-20 | Safe corners of the strip                                                                                    | D0-13 for its appearance                                         |
  | CF-28 | P-20 | Windows High Contrast for the fill                                                                           | D0-8: manual                                                     |
  | CF-29 | P-21 | Touch swipe in three engines (AC-SW-1)                                                                       | D0-5                                                             |
  | CF-30 | P-21 | Scroll arbitration, diagonals and `pointercancel`                                                            | D0-5                                                             |
  | CF-31 | P-21 | Pen and `touch-action`, pen swipe                                                                            | D0-5; D0-4 for real pen hardware                                 |
  | CF-32 | P-21 | `inert` with capture mid-gesture                                                                             | D0-5                                                             |
  | CF-33 | P-21 | Pointer-triggered restoration after a swipe of a focused toast                                               | D0-2: evidence only, no contract change before P-29              |
  | CF-34 | P-21 | Pinch-zoom per engine                                                                                        | D0-14: evidence; `pan-y` kept                                    |
  | CF-35 | P-21 | Composition motion (activation mid-reposition, Freeze Y, X kept, the one-frame fly-out hold)                 | D0-13 for the cosmetic hold                                      |
  | CF-36 | P-21 | A dismissal during the snap-back keeps P-18's exit fade in WebKit and Firefox                                | D2                                                               |
  | CF-37 | P-21 | Pen contact loss, pointer-ID reuse and the stale pending candidate                                           | D0-4: real pen hardware, manual; no production change            |
  | CF-38 | P-21 | Shadow DOM controls (MINOR-1)                                                                                | D0-3: characterise first; any fix only by a separate decision    |
  | CF-39 | P-21 | A touch or pen press focusing the toast root (P-21 pre-publication correction, Chromium)                     | D2                                                               |
  | CF-40 | P-21 | D2-20 item 10 in WebKit and Firefox: no opacity transition overrides P-18's exit (S4 accounting)             | D2; shares evidence with CF-36                                   |
  | CF-41 | P-21 | D2 decision 15: scroll arbitration in every browser                                                          | D0-5; shares evidence with CF-30                                 |
  | CF-42 | P-21 | Evidence on retaining `touch-action: pan-y`, for P-26                                                        | D0-14                                                            |
  | CF-43 | P-21 | The iPhone Safari and Android Chrome approvals are feel sign-offs and satisfy no CF item                     | D0-1: device approval never stands in for a classified result    |

**P-23 Compatibility and SSR verification**

- Scope:
  - the full React 18/19 matrix. This requires upgrading `@testing-library/react` from 14 (React 18 only) to 16, and adding `@testing-library/dom` (kept at 14 in P-04).
  - declarations type-checked under both `@types` versions and under TypeScript 5.0 and the latest TypeScript
  - the compatibility matrix of the packed Vite fixture (`fixtures/consumer-vite`): React 18 and 19, `@types/react` 18 and 19, and TypeScript 5.0 (the minimum) plus the latest supported TypeScript. P-07 added the fixture with React 18 and TypeScript 5.0.4 only.
  - the Node ESM `renderToString` smoke test on the packed package
  - the **Next.js App Router fixture** with its Playwright check
- Carried over from P-16, for React 19:
  - Run P-16's lifecycle and effect behaviour under React 19, in particular:
    - removal restoration before `inert`, in the toast's layout effect
    - the layout effect that hands the current hotkey to the keydown listener
  - Test `<Activity>`, or whichever React 19 lifecycle hides content while keeping its state, effects or DOM.
  - The record of where focus was before the hotkey must be cleared when ownership or the lifecycle changes, also when effects or DOM are kept. A kept effect must never leave a stale record for Escape to return to.
  - Hiding a toast and showing it again must not run removal restoration, which runs only when a toast starts to exit.

**P-24 Bundle-size baseline and budget**

- Scope: size-limit setup, an optional CSS minifier, the baseline measurement, the budget file and the blocking `size` job.

### Track F: Documentation and release

**P-25 Demo rebuild** (§31). It deploys only at 2.0.0. After P-04 the demo still builds with Vite 4 and `@vitejs/plugin-react` 4, which were kept on purpose (see P-04). P-25 evaluates upgrading them, together with whether Vitest can then move past 3.x.

- Carried over from P-19 (S2): the demo needs a substantial visual and UX redesign before v2 is released. The goal is a modern v2 showcase and playground that presents the product, separate from internal edge-case and checkpoint harnesses, which do not belong in it. This is a pre-release requirement, and no phase before P-25 implements it.

**P-26 README and reference docs** (§31), including the accessibility boundary and the ESM-only guidance. Defects: D-22, D-35.

- Notes from P-16 for the accessibility documentation:
  - **Hotkey and focus.** A press from inside the region moves focus to the first toast and keeps the earlier record. There is no focus trap. Escape works from the region too. Removal restoration goes from the next toast's equivalent control (or the next toast) to the previous toast, then the region. `aria-keyshortcuts` names physical keys by their US-QWERTY labels, so on other layouts the advertised letter may differ from the printed one. Whether a configured hotkey meets WCAG (for example 2.1.4 for a single-character hotkey) is the consumer's responsibility; document the mechanism, not blanket conformance.
  - **Labels.** Give a localisation example. The warning and error prefixes are read in announcements only and do not appear in the visible toast.
  - **Custom content.** The library owns the region, the live-region mechanism, the hotkey, Escape focus return and removal focus restoration. The consumer owns roles, accessible names, keyboard operability, focusability and the behaviour of the controls inside custom content. Custom controls get no equivalent-control matching: removal restoration from custom content goes to the previous toast, then the region.
  - **Announcement boundary.** A custom toast's announcement is the DOM `textContent` of its committed revision, which is not the accessibility tree: it includes `aria-hidden`, visually hidden and nested-control text, and later DOM changes without a new revision are not announced. It leaves out the library close button by its `.ret-toast__close` class, which custom markup can imitate. P-26 documents this boundary and decides whether that last case needs its own fix.
  - **Testing toasts.** Each announcement is a copy of the toast's text in a hidden live-region node, kept for about 7000 ms (§17.1). For that time a generic DOM query such as Testing Library's `getByText("Saved")` finds both the visible toast and the hidden copy. This is the live region working as designed, not a toast rendered twice. Document how to query the visible toast without matching the copy; this repository's own tests, for example, pass `ignore: "script, style, [aria-live] *"`. Do not make the copy `aria-hidden`, shorten its retention or change the live region to make such queries unique.

- Notes from P-17 for the theming and accessibility documentation:
  - **CSS contract (OQ-25).** The 24 `--ret-*` tokens, scoped to `.ret-toaster`, with their override model: `.ret-toaster { … }` for a Toaster, `.ret-toaster[data-theme="dark"]` for a theme, and the same rule inside `@media (prefers-color-scheme: dark)` for `system`. The documented `ret-*` classes and the `data-theme`, `data-position` and `data-phase` attributes. Defaults have zero specificity and no `!important`. `--ret-font-family` sets the family only; sizes, padding and radii other than `--ret-radius` are not tokens. Motion and progress tokens arrive with P-18 and P-20.
  - **Custom toasts.** Chrome-less: the library gives the root no surface, border, shadow, padding, typography or semantic colour. The library close takes the toast root's colour (`color: inherit`), so the toast's `className` is the one hook for the close's colour; its focus ring is drawn in that same colour (`currentColor`), so it contrasts as well as the glyph does. The root's own focus ring sits outside it in `--ret-focus`, which the library cannot match to an arbitrary page; a consumer can set `--ret-focus` on the toast through `className`. Focus styles inside custom content are the consumer's (§17.3).
  - **CSP.** The live regions are hidden by inline styles and by the stylesheet. Under a restrictive `style-src` the server-rendered `style` attribute is blocked, so the stylesheet must be loaded for them to stay hidden (§34). Their class, `ret-toaster__live-region`, stays an undocumented implementation detail: describe the behaviour, not the class.
  - **Forced colours.** The toaster follows the user's colours; type stays recognisable by icon shape and, for warnings and errors, by the announced prefix. Do not claim Windows High Contrast support beyond what P-22 verifies.

- Notes from P-18 for the theming and accessibility documentation:
  - **Motion tokens.** P-18 adds four public tokens, so the set is 28: `--ret-enter-duration` (180ms), `--ret-exit-duration` (120ms), `--ret-enter-easing` (`cubic-bezier(0.2, 0, 0, 1)`) and `--ret-exit-easing` (`cubic-bezier(0.4, 0, 1, 1)`), with the same override model as the P-17 tokens, on a Toaster or a toast's `className`. The lifecycle follows the resolved values, so a longer exit holds the toast, and its slot, that much longer, and `0ms` removes the motion.
  - **Reduced motion.** Under `prefers-reduced-motion: reduce` toasts appear and disappear without any motion, not even a fade, and the loading spinner is static. It is CSS only.
  - **Not contract.** The keyframe names (`ret-enter-*`, `ret-exit-*`, `ret-spin`) and the spinner's `ret-toast__spinner` class are implementation details: describe the behaviour and the tokens, not them. Replacing the keyframes is not a supported customisation.
  - **Browser support.** Motion uses the individual `translate`, `scale` and `rotate` properties. The browser-support statement must not claim a floor below the one recorded in P-18 D0, decision 6.

- Notes from P-19 (D2 and S5) for the theming and customisation documentation:
  - **Toast root `transform`.** The library owns the toast root's `transform` for stack repositioning. A consumer `transform` on the root, for example through a toast's `className`, is not supported. Apply transforms inside custom content instead. Every other class and style on the root keeps applying, apart from the transition caveats below. Describe the behaviour, not the mechanism.
  - **Repositioning.** When a stack's toasts change, the remaining toasts move smoothly to their new places. A toast that changes size, or a viewport change, does not animate. Under reduced motion the move is instant. The timing is not customisable in 2.0: there are no reposition tokens, and the public set stays at 28.
  - **Transitions on the root.** The toast root's transitions belong to the library. Overriding them can interfere with repositioning and with its reduced-motion behaviour. Recommend animating an inner element of custom content instead. Document three interactions:
    - **Seed interruption.** When a stack's toasts change, each moved toast's root briefly has its transitions switched off. A consumer transition running on that same root at that moment, on any property, is cancelled and jumps to its end value.
    - **Replacing `transition-property`.** A consumer rule that replaces `transition-property` on the root turns the reposition transition off for that toast. The toast still ends in the right place, only without the smooth move. To transition another property as well, list `transform` alongside it.
    - **Duration and reduced motion.** A consumer `transition-duration` or `transition-timing-function` on the root that wins the cascade changes the move's timing. The library's rules have zero specificity, so such a rule also overrides the reduced-motion zero duration, and the move animates even under `prefers-reduced-motion: reduce`.
  - **Browser support.** Repositioning uses `transform`, CSS transitions and ResizeObserver, all within the floor recorded in P-18 D0, decision 6. P-19 does not raise it.

- Notes from P-20 (S1 to S5) for the theming, customisation and accessibility documentation:
  - **Progress.**
    - `progress` on a toast and on `<Toaster />` is off by default; the toast's own option wins.
    - It shows only on a normal toast with a finite duration: never on a custom, loading or persistent toast.
    - It depletes with the auto-close countdown, holds whenever that countdown is paused, and continues from where it held.
  - **Public surface (P-20 adds exactly these):**
    - the documented class `.ret-toast__progress`: the strip at the card's bottom edge;
    - the attribute `data-paused`: "the finite auto-close countdown for this toast is currently held". It is on finite normal and custom toasts, never on persistent, loading or exiting ones, and does not say why;
    - the tokens `--ret-progress-height` (3px) and `--ret-progress` (`#52525b` light, `#a1a1aa` dark), which bring the set to 30.

    Do not document `.ret-toast__progress-fill` or the `ret-progress` keyframe: both are implementation details. Describe the behaviour and the tokens.

  - **Direction.** The remaining bar is anchored at the inline start: the left in LTR and the right in RTL. It shrinks toward that edge.
  - **Reduced motion.** Progress keeps depleting under `prefers-reduced-motion: reduce`, because it shows the remaining time rather than decorating. Enter, exit, the spinner and repositioning stay without motion.
  - **Accessibility.** The bar is `aria-hidden`, not focusable and not announced. Timing stays adjustable through the pauses (§10).
  - **Customisation caveat.** A normal toast's card is now `position: relative`, to anchor the strip. Absolutely positioned elements inside its content (`description` or a custom icon) now position against the card.

- Notes from P-21 (D0) for the behaviour, customisation and accessibility documentation:
  - **Availability.** A toast can be swiped away with touch or a pen, never with a mouse or trackpad. Mouse dismissal by dragging is not part of 2.0 (§37).
  - **Direction.** Physical: toasts at left positions swipe left, at right positions right, and at centre positions either way, also in RTL.
  - **Custom toasts.** They can be swiped too. A swipe never starts on a button, link, form field or other interactive or focusable element inside the content, or while text in the toast is selected.
  - **Shadow DOM (P-21 review, MINOR-1).** Unless P-22 changes it, controls inside a web component's shadow root are not recognised as interactive, so a swipe can start on them: state the boundary.
  - **Close button.** Custom toasts have no close button by default, so for a pointer user a swipe may be the only way to dismiss a persistent custom toast. Point consumers to `closeButton: true` or their own dismiss control (§17.3).
  - **`touch-action`.** Toasts set `touch-action: pan-y`: vertical scrolling works from a toast, but horizontal panning and a pinch-zoom that starts on a toast are not handled by the browser, and this also applies to content inside a custom toast. Document it, with P-22's evidence, if it is retained.
  - **Root ownership.** The library owns the toast root's `transform`, its transitions and, during a swipe, its opacity. The P-19 caveats on consumer transforms and transitions on the root apply to swipe motion too.
  - **Not contract.** `data-swiping` and the internal swipe custom properties are implementation details, not customisation hooks: do not document them.
  - **Exit tokens (P-21 D2).** `--ret-exit-duration` and `--ret-exit-easing` also time a swiped toast's fly-out, which fits inside the exit. Overriding them changes both together. Under reduced motion there is no fly-out.

**P-27 Migration guide** (§30), 0.x → 2.0.

- Note from P-16: in 0.x a toast's text was in the DOM once. In 2.0 its announcement copy is there too, for about 7000 ms, so a test that finds a toast by its text can match twice after upgrading. The guide mentions this and points to the testing note in the P-26 docs rather than repeating it.

**P-28 Release tooling**

- Scope:
  - Changesets and `CHANGELOG.md`
  - `release.yml` with full validation before publishing
  - Trusted Publishing with provenance
  - the `next` pre-release channel
  - the `NPM_TOKEN` path removed
- Defects: D-33.

**P-29 Release candidate and 2.0.0**

- Scope:
  - `next` pre-releases
  - the manual screen-reader and cross-browser audit
  - sign-off of every §36 criterion
  - publish 2.0.0
  - deploy the demo
  - deprecate 0.x on npm
- Carried over from P-16: check with the screen-reader matrix (§17.6) that an announcement node is kept long enough to be announced reliably. The retention is 7000 ms (`ANNOUNCEMENT_RETENTION_MS` in `src/react/announcer.ts`). If it is not long enough, change it based on real browser and assistive-technology evidence, not jsdom timing.
- Carried over from P-18. In the manual cross-browser audit, check reduced motion with the operating system's own setting, not only emulation: toasts appear and disappear without motion and the spinner is static. P-18's evidence is Chromium DevTools emulation (S4).
- Carried over from P-19. In the same audit, check that stack repositioning is instant under the operating system's reduced-motion setting: remaining toasts take their new places at once. P-19's evidence is Chromium emulation (S4, S5).
- Carried over from P-20:
  - With the screen-reader matrix (§17.6), check that the progress strip is never announced or reached by a virtual cursor, and that announcements are unchanged with progress on.
  - In the same audit, check that progress keeps depleting under the operating system's own reduced-motion setting. P-20's evidence is Chromium emulation (S3, S4).
- Carried over from P-18. Provide the assistive-technology evidence for the pointer-triggered close question recorded under P-22 (click without focus): how focus restored after a mouse close is experienced with screen readers, before the §10 and §18 contract is changed or confirmed.
- Carried over from P-17. With the screen-reader matrix (§17.6), check that polite and assertive announcements still work now that the live regions are hidden by the `ret-toaster__live-region` class as well as inline styles (S5), including with the stylesheet loaded and an inline `style` blocked by CSP. Also check touch exploration with screen readers around the region's focus ring (decision 3).
- Carried over from P-21 (D0):
  - With the screen-reader matrix (§17.6), check touch exploration of toasts while swipe is available: VoiceOver on iOS and, where possible, TalkBack. The close button stays the accessible way to dismiss.
  - In the same audit, check under the operating system's own reduced-motion setting that a swipe still dismisses with no fly-out and that a cancelled swipe returns with no snap-back travel. P-21's reduced-motion evidence is expected to be emulation only.
  - Include a swipe of a toast that holds focus in the assistive-technology evidence for the pointer-triggered close question (P-22): how the restored focus is experienced (P-21 D0, decision 17).

## 36. Acceptance criteria for v2.0

2.0.0 ships only when every criterion passes. † means the criterion is verified by automated tests. Defect references show which regression each criterion prevents.

**API**

- AC-API-1 † The package exports exactly `Toaster` and `toast` as values, has no default export, and its type exports match §6.7. (D-05)
- AC-API-2 † Creation calls are typed `ToastId | undefined`. Every accepted creation, including a successful replacement, returns the toast's real `string` ID, and the library never returns an empty or placeholder ID. Custom IDs are honoured. Generated IDs do not collide over 100,000 creations. (D-03)
- AC-API-3 † `toast()` called outside React, before a Toaster mounts, renders once a Toaster becomes active. (D-01)
- AC-API-4 † Content and descriptions accept any `ReactNode`. (D-04)
- AC-API-5 † No public call can change a toast's ID, lifecycle, timer, pause state or promise token. This is checked by both type tests and runtime tests. (D-02)
- AC-API-6 † Reusing an existing ID follows the replacement rules in §14 for every phase, both with the same position and with a changed position. Replacement never merges.
- AC-API-7 † `toast.promise` handles loading, success and error, message functions, throwing message functions and function input. `success` and `error` are required at the type level. It creates no extra unhandled rejection.
- AC-API-8 † Promise settlement never revives a dismissed toast, and never changes a toast it did not create, including a later toast that reuses the same ID or one that was replaced externally.
- AC-API-9 † On the server, creation is rejected: it returns `undefined`, even with an explicit `id`, and stores nothing. No state leaks between two simulated requests. In development, one warning is logged.
- AC-API-10 † `toast.custom` renders chrome-less. Its `closeButton` defaults to `false` whatever the Toaster `closeButton` is. When `closeButton: true` is set explicitly, the close button renders in the documented inline-end top corner. It does not accept `description`, `icon`, `action` or `progress`.

**No-Toaster policy and Toaster arbitration**

- AC-NT-1 † With no active Toaster, up to 100 accepted toasts are kept. The 101st new creation is rejected: nothing is stored, no `onDismiss` fires, and the call returns `undefined`, even with an explicit `id`. A cap warning is logged in development.
- AC-NT-2 † At the cap, replacing an already accepted toast still succeeds and returns that toast's real ID.
- AC-NT-3 † No timer runs without an active Toaster. When the Toaster unmounts, rendered toasts go back to `queued` with their remaining time kept, and exiting toasts finish with `onDismiss`. When it remounts, toasts continue with the time they had left.
- AC-NT-4 † Development warnings are deduplicated. StrictMode's mount, unmount and remount cycle produces no warnings, does not queue toasts and keeps timer state intact. Creating a toast just before the Toaster mounts at start-up logs no no-Toaster warning. Production logs nothing.
- AC-NT-5 † A second `<Toaster />` renders nothing and logs one development warning. When the active Toaster unmounts, a waiting one takes over. StrictMode re-mounting does not count as a second Toaster.

**Lifecycle, timers and queue**

- AC-LC-1 † Dismissing a rendered toast moves it to `exiting`, and it is removed only after the exit or the fallback completes. (D-13)
- AC-LC-2 † The lifecycle completes without animation events (in jsdom, with reduced motion, and with `display: none`).
- AC-LC-3 † Reusing the ID of an exiting toast cancels removal and makes it re-enter with the new definition, without firing `onDismiss` and without going over `maxVisible`.
- AC-TM-1 † A 5000 ms toast paused at 2000 ms resumes with about 3000 ms left. Resuming never restarts the full duration. (D-08)
- AC-TM-2 † All four pause reasons combine, and clearing one while another is active does not resume the toast. Every pair of hover, focus-within, blur and hidden is tested. Hover pauses the whole stack, and focus-within pauses only its own toast. (D-07, D-09)
- AC-TM-3 † Loading toasts and toasts with `duration: Infinity` never close automatically.
- AC-TM-4 † Replacement resets the timer to the new duration. A toast that was paused stays paused.
- AC-TM-5 † The default duration for finite toasts is 5000 ms.
- AC-Q-1 † `maxVisible` defaults to 4 per position. The fifth toast at a position is queued, never dropped, and appears in FIFO `seq` order. A queue at one position does not affect another position. (D-12)
- AC-Q-2 † A slot is freed only when its toast reaches `removed`, or when a relocating toast leaves. A position never renders more than `maxVisible` toasts across `entering`, `visible` and `exiting`.
- AC-Q-3 † No accepted toast leaves the store without `onDismiss`.

**Callbacks**

- AC-CB-1 † `onAutoClose` fires once, and only for timeouts. (D-06)
- AC-CB-2 † `onDismiss(snapshot, reason)` fires exactly once per accepted toast for every cause, with the correct reason. It does not fire on replacement, revival, relocation or a rejected creation. (D-06)
- AC-CB-3 † For a timeout, `onAutoClose` fires before `onDismiss`.
- AC-CB-4 † A callback that throws does not corrupt the store or stop other callbacks.

**Positioning, motion, progress, RTL and swipe**

- AC-POS-1 † All six positions work, and the default is `top-right`. The newest toast is nearest the anchored edge, and DOM order matches visual order. Viewport width never changes the position. (D-15)
- AC-MO-1 † Real enter and exit animations run in all three browsers, and toasts at left positions settle without leftover offset. (D-13, D-14)
- AC-MO-2 † Existing toasts move smoothly when the stack changes.
- AC-MO-3 † With `prefers-reduced-motion: reduce` there is no translation or scale motion, and the lifecycle still completes. (D-21)
- AC-PR-1 † Progress is off by default. When on, it pauses and resumes with the timer, never resets on resume, and causes no React render per frame. (D-10)
- AC-RTL-1 † In RTL the layout mirrors, progress depletes toward inline-start, and positions stay physical. (D-11)
- AC-SW-1 † A touch swipe past the threshold dismisses with reason `swipe`, and one below it springs back. Centre positions accept either horizontal direction. A mouse drag never dismisses. Vertical scrolling still works. A swipe never starts on interactive elements.

**Accessibility**

- AC-A11Y-1 † Live regions exist before the first toast. Toast items never have `role="alert"`. (D-18)
- AC-A11Y-2 † Politeness matches §17.1: error is assertive, and every other type, including loading and custom, is polite. Warnings and errors carry their prefixes.
- AC-A11Y-3 † Icons have `aria-hidden="true"`. (D-19)
- AC-A11Y-4 † Controls are native buttons with accessible names. The close button is on by default for normal toasts. Clicking the body never dismisses. (D-17)
- AC-A11Y-5 † axe finds no violations across the §17.6 matrix. These are structural checks in jsdom (§17.6), not a substitute for AC-A11Y-6, P-22 or AC-A11Y-8.
- AC-A11Y-6 † The documented token palette meets 4.5:1 for text and 3:1 for non-text in both themes. (D-20)
- AC-A11Y-7 † A persistent normal toast with no close button and no action logs a development warning. Custom toasts do not trigger it.
- AC-A11Y-8 The manual screen-reader checklist (§17.6) is completed and recorded.
- AC-KB-1 † Alt+T is the default hotkey. It can be configured, it can be disabled, and it moves focus to the first toast shown, in visual order. Escape returns focus without dismissing anything. Focus is restored when a focused toast is removed.
- AC-KB-2 † Focus inside a toast pauses it. When focus leaves, it resumes with the time it had left.

**Styling**

- AC-CSS-1 † Every selector and keyframe in `styles.css` uses the `ret-` prefix, which a lint script checks. (D-23)
- AC-CSS-2 † `theme` accepts `light`, `dark` and `system`, defaults to `system`, and server and client markup match. (D-24)
- AC-CSS-3 † Containers have no inline `z-index` or padding. Both come from custom properties. (D-24)

**Package**

- AC-PKG-1 † There are no runtime dependencies, and the peers are React and ReactDOM `^18 || ^19`. (D-25)
- AC-PKG-2 † `import "react-elegant-toasts/styles.css"` works, and the CSS reaches the output in both the Vite and Next.js fixtures. (D-26, D-27)
- AC-PKG-3 † publint and attw (ESM-only profile) pass. The tarball is ESM-only: `"type": "module"`, no `require` condition and no CJS files.
- AC-PKG-4 † `dist/index.js` starts with `"use client"`, and the Next.js App Router fixture builds and renders a toast. (D-28)
- AC-PKG-5 † The Vite fixture passes with React 18 and React 19: typecheck, build, a rendered Toaster and a shown toast.
- AC-PKG-6 † Deep imports from `dist/` are blocked, and no documentation tells anyone to use them. (D-26, D-35)
- AC-PKG-7 † The bundle-size budget job passes.
- AC-PKG-8 † The Node ESM `renderToString` smoke test passes against the packed package with both React 18 and React 19.
- AC-PKG-9 † The shipped declarations type-check with TypeScript 5.0 and the latest TypeScript, and with both `@types/react` 18 and 19.

**Process**

- AC-CI-1 † Every gate in §28 blocks, and the format check is able to fail. (D-31, D-32)
- AC-REL-1 Releases validate fully before publishing, and publish through Trusted Publishing with provenance. Pre-releases use `next`. The demo deploys only at 2.0.0. (D-33)
- AC-REL-2 `LICENSE`, `CHANGELOG.md` and `docs/MIGRATION.md` (0.x → 2.0) all exist. The README has no placeholders or unverified claims. (D-22, D-35)
- AC-REL-3 The stale workflow and the `prepare` script are both removed. (D-30, D-34)

## 37. Deferred / post-v2 ideas

These are deliberately left out of 2.0:

- A headless API.
- Multiple actions, or confirm/cancel patterns.
- Animation presets.
- A collapsed "stacked deck" mode.
- A function form of `toast.custom`.
- A per-toast `politeness` override, a per-toast `style`, and a `classNames` slot map (the last two kept out of 2.0 by OQ-25).
- Multiple or scoped Toasters.
- A `dir` prop on the Toaster.
- Public toggles for pause behaviour.
- An `onOpen` callback.
- Queue priority.
- Deduplication or grouping of toasts.
- Dismissal by mouse drag.
- Built-in i18n bundles.
- A Tailwind plugin or preset (optional, never a dependency).
- Hosting in Shadow DOM or iframes.
- A visual-regression suite.
- CommonJS output.

## 38. Open questions

No open questions remain. The last two, OQ-24 and OQ-25, were the P-17 entry gate. OQ-25 was resolved before P-17, and OQ-24 at P-17 D2 after the maintainer's review of the Chromium prototype. Both are recorded in §21 and Appendix B.

---

## Appendix A: Defect traceability

| Defect                                                | 2.0 response (section) | Phase      | Acceptance               |
| ----------------------------------------------------- | ---------------------- | ---------- | ------------------------ |
| D-01 provider-only creation                           | §5, §8                 | P-09, P-12 | AC-API-3                 |
| D-02 ID and internal state can be changed             | §7, §14                | P-09       | AC-API-5                 |
| D-03 weak IDs, no custom IDs                          | §7                     | P-09       | AC-API-2                 |
| D-04 string-only content                              | §6                     | P-12       | AC-API-4                 |
| D-05 internals exported, default export               | §6.7, §6.8             | P-08       | AC-API-1                 |
| D-06 `onClose` never fires                            | §16                    | P-09, P-11 | AC-CB-1, AC-CB-2         |
| D-07 pause reasons overwrite each other               | §10                    | P-11, P-15 | AC-TM-2                  |
| D-08 resume restarts the duration                     | §10                    | P-11       | AC-TM-1                  |
| D-09 hover not combined with other pauses             | §10                    | P-11, P-15 | AC-TM-2                  |
| D-10 rAF-driven progress that resets                  | §22                    | P-20       | AC-PR-1                  |
| D-11 progress wrong in RTL                            | §20                    | P-17, P-20 | AC-RTL-1                 |
| D-12 silent drop                                      | §11                    | P-10       | AC-Q-1, AC-Q-3           |
| D-13 no exit lifecycle                                | §9, §22                | P-09, P-18 | AC-LC-1, AC-MO-1         |
| D-14 left slide left offset                           | §22                    | P-18       | AC-MO-1                  |
| D-15 stack order                                      | §12                    | P-14       | AC-POS-1                 |
| D-16 everything re-renders                            | §32                    | P-14       | Render-count tests (§32) |
| D-17 body click dismisses, no close button            | §16, §17               | P-14       | AC-A11Y-4                |
| D-18 `role="alert"` everywhere                        | §17                    | P-16       | AC-A11Y-1, AC-A11Y-2     |
| D-19 icons announced                                  | §17                    | P-14       | AC-A11Y-3                |
| D-20 contrast failures                                | §17, §21               | P-17       | AC-A11Y-6                |
| D-21 no reduced motion                                | §22                    | P-18       | AC-MO-3                  |
| D-22 README overstates accessibility                  | §31                    | P-16, P-26 | AC-REL-2                 |
| D-23 unprefixed CSS                                   | §21                    | P-17       | AC-CSS-1                 |
| D-24 no theme control, inline styles                  | §21                    | P-17       | AC-CSS-2, AC-CSS-3       |
| D-25 React as a runtime dependency                    | §24, §25               | P-01, P-03 | AC-PKG-1                 |
| D-26 no exports map                                   | §24                    | P-03       | AC-PKG-2, AC-PKG-6       |
| D-27 CSS tree-shaken                                  | §24                    | P-03       | AC-PKG-2                 |
| D-28 no `"use client"`                                | §23, §24               | P-03       | AC-PKG-4                 |
| D-29 tooling configuration                            | §24, §26               | P-02, P-03 | AC-PKG-3, AC-PKG-9       |
| D-30 `prepare` script                                 | §24                    | P-01       | AC-REL-3                 |
| D-31 non-blocking CI                                  | §28                    | P-06       | AC-CI-1                  |
| D-32 format gate can never fail                       | §28                    | P-01, P-06 | AC-CI-1                  |
| D-33 unvalidated, token-based release                 | §29                    | P-28       | AC-REL-1                 |
| D-34 stale workflow                                   | §28                    | P-01       | AC-REL-3                 |
| D-35 missing LICENSE, README placeholders             | §29, §31               | P-01, P-26 | AC-REL-2                 |
| D-36 tests encode removed behaviour, test `src/` only | §26, §27               | P-04, P-08 | AC-PKG-5, AC-PKG-8       |

## Appendix B: Open-question decision log (revision 1 → revision 2)

IDs are kept for history. A resolved ID is never reused.

| ID    | Outcome                                                                                                                                                                                             | Where it now lives         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| OQ-01 | Resolved: ESM-only, a plain module singleton, no `globalThis` store                                                                                                                                 | §8.2, §24, C-01            |
| OQ-02 | Resolved: one active Toaster, the first to attach wins, extra Toasters warn and render nothing, handover on unmount                                                                                 | §8.5                       |
| OQ-03 | Resolved: pending retention, a hard cap of 100 with rejection and no `evicted` reason, deduplicated warnings, timers suspended, unmount returns toasts to queued                                    | §8.4                       |
| OQ-04 | Resolved: `maxVisible` is 4 per position                                                                                                                                                            | §11                        |
| OQ-05 | Accepted: a slot frees only at removal                                                                                                                                                              | §11                        |
| OQ-06 | Accepted: 5000 ms default                                                                                                                                                                           | §10                        |
| OQ-07 | Resolved and accepted: replacement (not merge), revival from exiting, relocation on a position change                                                                                               | §14                        |
| OQ-08 | Accepted: the timer resets on replacement and pause reasons are kept                                                                                                                                | §10, §14                   |
| OQ-09 | Accepted: hover pauses the stack, focus-within pauses the toast                                                                                                                                     | §10                        |
| OQ-10 | Resolved: focus-within is a pause reason                                                                                                                                                            | §10                        |
| OQ-11 | Accepted: no pause toggles in 2.0                                                                                                                                                                   | §10, §37                   |
| OQ-12 | Accepted: persistent hidden polite and assertive regions, text taken from the rendered DOM, warning and error prefixes, no per-toast override                                                       | §17.1                      |
| OQ-13 | Resolved and accepted: only error is assertive, and loading and custom are polite                                                                                                                   | §17.1                      |
| OQ-14 | Accepted: Alt+T (configurable and disableable), Escape returns focus                                                                                                                                | §18                        |
| OQ-15 | Accepted: `labels` on the Toaster                                                                                                                                                                   | §6.5                       |
| OQ-16 | Accepted: an action dismisses unless `preventDefault()` is called, and its label is a `ReactNode`                                                                                                   | §15                        |
| OQ-17 | Resolved: `toast.custom` accepts only a `ReactNode`, is chrome-less, and has `closeButton` off by default                                                                                           | §6.4, §17.3                |
| OQ-18 | Accepted: messages are required, a promise never revives a dismissed toast (ownership token), and one set of options applies to every state                                                         | §13                        |
| OQ-19 | Accepted: `onDismiss` receives the dismiss reason                                                                                                                                                   | §16                        |
| OQ-20 | Accepted: centre positions swipe in either horizontal direction, thresholds come from a prototype, no mouse drag                                                                                    | §19, P-21                  |
| OQ-21 | Accepted: positions are physical, and there is no `dir` prop                                                                                                                                        | §12, §20                   |
| OQ-22 | Accepted: progress is off by default and still depletes under reduced motion                                                                                                                        | §22                        |
| OQ-23 | Converted into a phase task: a prototype gate in P-19                                                                                                                                               | §22, P-19                  |
| OQ-24 | Resolved at P-17 D2, after the maintainer's Chromium review of the D1 prototype: a neutral elevated card with a semantic accent, shown by an accent-coloured icon on a subtle tinted icon container | §21, P-17                  |
| OQ-25 | Resolved before P-17: documented `--ret-*` tokens, `ret-*` BEM classes and `data-theme`, `data-position` and `data-phase` are stable for 2.x; no public `@layer`, slot map or per-toast `style`     | §21, P-17                  |
| OQ-26 | Accepted: rendered inline with `position: fixed`                                                                                                                                                    | §12, §23                   |
| OQ-27 | Accepted: on the server, creation is rejected, with one warning in development                                                                                                                      | §8.3                       |
| OQ-28 | Accepted: the ESM package shape, no `engines` field, TypeScript 5.0 or later                                                                                                                        | §24                        |
| OQ-29 | Converted into a phase task: size-limit in P-24                                                                                                                                                     | §33, P-24                  |
| OQ-30 | Converted into a phase task: tsup 8 with directive preservation in P-03                                                                                                                             | §24, P-03, P-07            |
| OQ-31 | Accepted: the `next` dist-tag, the demo deployed at 2.0.0, 0.x deprecated, "0.x → 2.0" wording                                                                                                      | §29, §30                   |
| OQ-32 | Converted into phase tasks: jsdom, vitest-axe, Playwright on three browsers, a Next.js fixture, no visual regression                                                                                | §26, §27, P-04, P-22, P-23 |
| OQ-33 | Removed (it was an unused placeholder)                                                                                                                                                              | n/a                        |
| OQ-34 | Accepted: `ToastId` is `string`                                                                                                                                                                     | §6.6                       |
| OQ-35 | Accepted: development warning for normal toasts only                                                                                                                                                | §17.2                      |
| OQ-36 | Resolved: the default position is `top-right`                                                                                                                                                       | §6.5, §12                  |
| OQ-37 | Resolved: creation returns `ToastId \| undefined`, with `undefined` for any rejected creation (server or cap) even if an explicit `id` was supplied, and never an empty or placeholder ID           | §6.2, §8.3, §8.4, §13      |
