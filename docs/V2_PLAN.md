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
- **Status: in progress.** D0 and D1 are done, and the D1 visual direction is approved (see the D1 sign-off below). S1 is next. Production implementation has not started.
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

**P-21 Swipe to dismiss**

- Scope: §19 in full, with thresholds set by prototype. Touch and pen only, centre positions in either direction, custom toasts included.
- Carried over from P-18. The swipe exit continues from the dragged offset (§19), which the P-18 exit keyframes (`ret-exit-top` and `ret-exit-bottom`, from the settled state) do not: P-21 decides how a swipe exit composes with them, through `transform` or otherwise, and keeps lifecycle completion on the toast root's library `animationend` or the computed fallback (§9 rule 3).
- Carried over from P-19 (D2 decision 10):
  - Stack repositioning seeds an inverse vertical offset on the toast root through inline `transform` and carries it back with the stylesheet's `transition: transform`. At rest the root computes to `transform: none`.
  - Swipe composes with this without wrappers, without DOM reordering, and without replacing P-18's individual properties.
  - The expected direction is one library-owned root `transform` built from internal components for the horizontal swipe offset and the vertical reposition offset, with the transition turned off while a direct pointer drag is active. P-21 decides the exact contract, including what a drag does to a reposition already running.

### Track E: Verification

**P-22 Browser test suite**

- Scope: Playwright on Chromium, WebKit and Firefox covering §26. Wired into the blocking `browser` job.
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
- Carried over from P-18. Provide the assistive-technology evidence for the pointer-triggered close question recorded under P-22 (click without focus): how focus restored after a mouse close is experienced with screen readers, before the §10 and §18 contract is changed or confirmed.
- Carried over from P-17. With the screen-reader matrix (§17.6), check that polite and assertive announcements still work now that the live regions are hidden by the `ret-toaster__live-region` class as well as inline styles (S5), including with the stylesheet loaded and an inline `style` blocked by CSP. Also check touch exploration with screen readers around the region's focus ring (decision 3).

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
