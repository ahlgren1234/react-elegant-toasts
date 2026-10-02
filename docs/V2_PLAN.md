# react-elegant-toasts v2: engineering and product plan

| | |
| --- | --- |
| Status | Draft, revision 2. The open-question review decisions are incorporated. |
| Baseline | v0.1.2 (`v2` branch at `7a662f7`) |
| Target | 2.0.0 |
| Scope | Planning only. This document makes no changes to source, tests, config, workflows or the demo. |

## How to read this document

- Sections 1–38 follow the agreed plan structure. Appendix A maps every known v0.1.2 defect to the v2 section, phase and acceptance criterion that addresses it. Appendix B records how each earlier open question was decided.
- Statements written with **must**, **is** or **are** in sections 5–34 are normative. They come from the authoritative v2 decisions or from the open-question review the maintainer accepted.
- **OPEN QUESTION (OQ-n)** marks the few items that are still undecided. All of them are listed in §38. Question IDs from revision 1 are kept so the history stays readable. Resolved IDs are logged in Appendix B and are never reused.
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

| Area | v0.1.2 state |
| --- | --- |
| Source | `src/ToastContext.tsx` (provider and state), `src/ToastContainer.tsx` (one fixed `div` per position), `src/Toast.tsx` (timer, progress, click), `src/types.ts`, `src/utils.ts`, `src/styles.css` |
| Public exports | `Toast`, `ToastContainer`, `ToastProvider`, `useToast`, a default export (`useToast`). Types: `ToastProps`, `ToastPosition`, `ToastType`, `ToastAnimation`, `ToastProviderProps`, `ToastContextValue` |
| API | `useToast()` returns `{ addToast, updateToast, removeToast, removeAll }`. `addToast({ type, title, message, … })` returns an ID. |
| State | A `useState` array in `ToastProvider`. One provider-wide `isPaused` boolean is copied onto every toast. |
| Types | `success`, `error`, `warning`, `info`. No default or loading type. `title` and `message` are both `string`. |
| Timers | A `setTimeout(duration)` per toast. Progress uses a `requestAnimationFrame` loop that calls `setProgress` every frame. |
| Animation | Enter classes for `slide`, `fade`, `zoom` and `bounce`. Exit keyframes are defined but never used. |
| Styling | Global, unprefixed classes (`.toast`, `.success`, `.rtl`, `.top-right`, …) and keyframes (`slideIn`, `fadeIn`, …). Inline container styles (`z-index: 9999`, `padding: 12px`). Dark mode only through a media query. |
| Package | `main`, `module`, `types` and `style` fields. No `exports` map. `sideEffects: false`. `react` and `react-dom` appear in **both** `dependencies` (`^18.2.0`) and `peerDependencies` (`>=16.8.0`). `engines.node >= 14`. `prepare` runs the build. |
| Build | tsup 7.2 (`tsup.config.ts` plus CLI flags in `build:js`) and `cp` for the CSS. Output is `dist/index.{js,mjs,d.ts,d.mts}` plus `dist/styles.css`. |
| TS config | A single `tsconfig.json` covering `src` and the tests. `jsx: "react"` (classic runtime), `moduleResolution: "node"`, `target: es2018`. |
| Tests | Jest 29 with ts-jest, jsdom and Testing Library 14. Two suites. `requestAnimationFrame` is mocked through `setTimeout`. No accessibility tests and no tests against the built package. |
| Lint/format | ESLint 8 (legacy config) and Prettier 3. The `format` script runs `prettier --write` and then `git add -A src/`. |
| CI | `ci.yml`, Node 18, `npm install`. Typecheck, lint and tests are all `continue-on-error: true`. |
| Release | `release.yml` runs on GitHub release creation: `npm ci`, build, then publish with `NPM_TOKEN`. No tests, no package validation, no provenance. |
| Demo | A Vite app in `demo/` that imports from `../src`. Deployed to GitHub Pages from `main` by `deploy-demo.yml`. |
| Repo | No `LICENSE` file, although `package.json` says MIT. No `CHANGELOG.md`. A stale `.github/workflows/deploy-demo` file with no extension. |

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

| ID | Tension | Status |
| --- | --- | --- |
| C-01 | Dual ESM and CJS output combined with a module-level singleton store risks two stores (the dual-package hazard). | **Resolved:** 2.0 is ESM-only (§24). No `globalThis` store is used. Duplicate installs of the package can still create separate stores, which is the same limitation React has. The no-Toaster warning (§8.4) is the hint that this has happened. |
| C-02 | No 1.x exists, so 2.0.0 follows 0.1.x directly. | **Resolved:** migration language always says "0.x → 2.0" (§30). |
| C-03 | The original pause reasons left out keyboard focus. | **Resolved:** focus within the toast is a pause reason (§10). |
| C-04 | tsup's `treeshake: true` routes output through Rollup, which strips `"use client"`. | **Resolved as a P-03 task:** stay on tsup 8, disable the Rollup tree-shake step, add the directive with `banner`, and verify it in P-07 (§24). |
| C-05 | `sideEffects: false` conflicts with shipping CSS. | **Resolved:** `sideEffects: ["**/*.css"]` (§24). |
| C-06 | The demo deploys from `main`. | **Resolved:** demo deployment waits for the final 2.0.0 release (§29, P-06). |
| C-07 | CI runs only for `main`. | **Resolved in P-06:** add the `v2` branch. |
| C-08 | A module-level store is shared across SSR requests. | **Resolved:** `toast()` on the server stores nothing (§8.3, §23). |
| C-09 | The 0.x tests assert behaviour v2 removes. | **Resolved in P-08:** delete them rather than port them. |
| C-10 | ESM-only affects consumers that run CommonJS, for example CJS-mode Jest. | **Accepted:** documented as compatibility guidance (§24.3, §30). |

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

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | `ToastId` | generated | If the ID exists, the toast is replaced (§14). |
| `description` | `ReactNode` | none | Secondary content. |
| `duration` | `number` (ms) | Toaster `duration` (5000) | `Infinity` makes the toast persistent. Loading toasts are always persistent. |
| `position` | `ToastPosition` | Toaster `position` (`"top-right"`) | Changing it through replacement moves the toast (§14). |
| `icon` | `ReactNode \| null` | type icon | `null` hides the icon. Always `aria-hidden`. |
| `action` | `ToastAction` | none | Exactly one action (§15). |
| `closeButton` | `boolean` | Toaster `closeButton` (`true`) | |
| `progress` | `boolean` | Toaster `progress` (`false`) | |
| `className` | `string` | none | Added to the toast root. |
| `onDismiss` | `(toast: ToastSnapshot, reason: DismissReason) => void` | none | §16 |
| `onAutoClose` | `(toast: ToastSnapshot) => void` | none | §16 |

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

| Option | Default | Notes |
| --- | --- | --- |
| `id`, `duration`, `position`, `className`, `onDismiss`, `onAutoClose` | as in `ToastOptions` | |
| `closeButton` | **`false`** | This is a deliberate exception to the general rule that the close button is on by default. The library close button is never overlaid on custom content unless the caller passes `closeButton: true` explicitly. In that case the library places its standard close button in a predictable, documented spot: the inline-end top corner of the custom wrapper. Adding the button does not change the consumer's ownership of the rest of the custom design: surface, padding and layout. |

`toast.custom` takes custom visual content instead of the normal content model. It does **not** accept `description`, `icon`, `action` or `progress`, which belong to that normal model and to its visual chrome. The type checker enforces this. `closeButton` is the only deliberate exception: it is off by default and can be turned on explicitly. The Toaster-level `closeButton` prop does not affect custom toasts.

### 6.5 `<Toaster />` props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `position` | `ToastPosition` | `"top-right"` | The default position for toasts. It is never changed based on viewport width (§12). |
| `theme` | `"light" \| "dark" \| "system"` | `"system"` | |
| `maxVisible` | `number` | `4` | Applies **per position** (§11). |
| `duration` | `number` | `5000` | The default for finite toasts. |
| `closeButton` | `boolean` | `true` | The default for normal toasts. Custom toasts ignore it (§6.4). |
| `progress` | `boolean` | `false` | |
| `hotkey` | `readonly string[] \| false` | `["altKey", "KeyT"]` | Modifier property names plus a `KeyboardEvent.code` value. `false` disables the hotkey (§18). |
| `labels` | `{ region?: string; close?: string; warningPrefix?: string; errorPrefix?: string }` | `"Notifications"`, `"Close notification"`, `"Warning:"`, `"Error:"` | Localisable strings (§17). |
| `className` | `string` | none | Added to the toaster root. |

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

| Reason | Source | Scope |
| --- | --- | --- |
| `hover` | `pointerenter` / `pointerleave` on the position's list | **The whole position stack** |
| `focus-within` | `focusin` / `focusout` on the toast, using `relatedTarget` to ignore moves between controls inside the same toast | **Per toast** |
| `window-blur` | `window` `blur` / `focus`, and `document.hasFocus()` at attach | Global |
| `document-hidden` | `visibilitychange`, and `document.hidden` at attach | Global |
| `swipe` (internal) | an active swipe gesture | Per toast |

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
- If `maxVisible` changes at runtime, the new value applies from then on. Lowering it does not dismiss any visible toast. The count simply falls to the new limit as toasts are removed.

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

| Current phase | Same position | Different position (relocation) |
| --- | --- | --- |
| `queued` | Content and options are replaced. Queue position is kept. | Moves to the new position's queue with a new `seq` (at the back). No callbacks fire. |
| `entering` / `visible` | Replaced in place, with no remount and no new enter animation. The timer is reset. | Exits from the old stack with internal reason `relocate`, so no callbacks fire. When the exit completes it frees the old slot, gets a new `seq` and joins the new position as if newly created. |
| `exiting` (dismissed or timing out) | **Revival.** Pending removal is cancelled and the exit reason cleared. The toast goes back to `entering` with the new definition and keeps its slot, so capacity cannot overflow. `onDismiss` does not fire. If `onAutoClose` already fired, it is not undone. | Pending removal is cancelled. The exit continues as a `relocate` exit, then the toast joins the new position as above. `onDismiss` does not fire. |
| removed / unknown ID | A new toast is created. Below the cap, or with an active Toaster, it is accepted. At the cap with no Toaster, it is rejected (§8.4). | Same as the same-position case. |

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

| Cause | `DismissReason` | Notes |
| --- | --- | --- |
| Timer expiry | `timeout` | The only cause that fires `onAutoClose`. |
| Close button | `close-button` | Native button. On by default for normal toasts and off by default for custom toasts. |
| Swipe | `swipe` | §19 |
| `toast.dismiss(id?)` | `programmatic` | Also used when a throwing `error(err)` message function dismisses the toast (§13). |
| Action | `action` | Unless `preventDefault()` (§15). |
| **Click on the toast body** | none | **Never dismisses** (D-17). |

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

| Type | Politeness |
| --- | --- |
| default (neutral) | polite |
| success | polite |
| info | polite |
| warning | polite |
| loading | polite |
| custom | polite |
| error | **assertive** |

  A promise that settles as an error is announced assertively, because the settlement replaces the toast with an error toast.
- **Announcement text** is taken from the rendered toast's text content (content plus description). Warning and error announcements are prefixed with `labels.warningPrefix` and `labels.errorPrefix` ("Warning:" and "Error:" by default). No other type gets a prefix.
- **There is no per-toast politeness override in 2.0.** Interrupting assistive technology is limited to errors.
- **Each toast is announced once when it becomes rendered and once on each replacement.** Re-renders that do not change content, and StrictMode double renders, are not announced. Queued toasts are announced when they become rendered, not when they are created.

### 17.2 Semantics of normal toasts (library-owned shell)

- The toaster root is `<section aria-label={labels.region}>`, with `aria-keyshortcuts` set to the active hotkey when one is configured. Each position is an `<ol>` and each toast is an `<li>`.
- Icons, including the loading spinner, are inline SVG with `aria-hidden="true"` and `focusable="false"` (D-19).
- The close and action controls are native `<button type="button">` elements. The close button is named by `labels.close`, and its target is at least 24×24 CSS px (WCAG 2.5.8).
- Type is never conveyed by colour alone. Each type has a distinct icon shape, and warnings and errors get a text prefix for screen readers.
- **Inaccessible persistent toasts.** A persistent normal toast with `closeButton: false` and no action cannot be dismissed with a keyboard. Creating one logs a development warning. Custom toasts are excluded, because they may contain their own controls (§17.3).

### 17.3 Custom content: where responsibility lies

| The library provides, for custom toasts | The consumer is responsible for |
| --- | --- |
| Persistent live-region announcement of the rendered text (polite) | The meaning and quality of that text |
| Region landmark, list structure, hotkey and focus restoration | Accessible names, roles and states of every control inside the custom content |
| Pausing on hover, focus-within and window/document state | Keyboard operability of the custom content |
| Lifecycle, motion (including reduced motion) and swipe | Contrast, focus-visible styles and target sizes inside the custom content |
| No library close button by default (`closeButton: false`) | A keyboard-accessible way to dismiss a **persistent** custom toast (for example a button that calls `toast.dismiss(id)`), or setting `closeButton: true` |
| | Marking decorative content `aria-hidden` |

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

- axe (`vitest-axe`) runs across every theme, every normal type, a toast with an action, the close button, RTL, and a custom toast with accessible sample content.
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
  - Pressing the hotkey moves focus to the first rendered toast (in visual order) and records the element that had focus before.
  - It does nothing when there are no rendered toasts.
- **Tab** moves through the controls in DOM order, which matches visual order (§12).
- **Escape**, while focus is inside the region, returns focus to the element that had it before the hotkey (or to the document if that element has gone). **Escape never dismisses a toast.**
- **Focus restoration when the focused toast is removed:**
  1. The equivalent control in the next toast.
  2. Otherwise, the previous toast.
  3. Otherwise, the element that had focus before the hotkey.
  4. Otherwise, the region.
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
- **Custom properties** are the main way to customise styling. They cover surface, text, border, shadow, the accent for each type, radius, gap, offset, width, font, z-index (replacing the inline 9999), motion durations and easings, and progress height. Consumers can override them globally and per theme. The exact token list and override mechanism are finalised in P-17.
- **Specificity** is kept low: single-class selectors or `:where()`, and no `!important`.
- **Escape hatches:** `className` on the Toaster and on each toast.
- **Fonts** inherit from the application. No web fonts are loaded.
- **Gated items, decided at the P-17 entry gate (§38):**
  - **OQ-24:** the visual design direction. The current recommendation is a neutral card surface with a semantic colour accent. It is not final.
  - **OQ-25:** the public CSS contract. The current recommendation is that documented custom properties, `ret-*` selectors and data attributes are stable for 2.x, with no `@layer`, no `classNames` slot map and no per-toast `style` in 2.0. It is not final.

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

| Layer | Tooling | Covers |
| --- | --- | --- |
| Store unit | Vitest (node environment), fake timers | IDs; replacement, revival and relocation; lifecycle; per-position queue; slot freed on removal; remaining-time timers; combined pause reasons; callbacks and their order; no-Toaster cap, rejection and warnings; detach and re-attach; one-Toaster arbitration; server rejection; error isolation |
| Facade unit | Vitest | `toast.*` variants; `toast.custom` defaults; `toast.promise` (resolve, reject, throwing message functions, function input, never reviving after dismiss, ownership token); `dismiss` with and without an ID |
| Type tests | Vitest `expectTypeOf` | Export list; immutable `id`; creation functions return `ToastId \| undefined`; promise inference; required `success`/`error`; `CustomToastOptions` excludes chrome options; `ToastId` is `string` |
| Component | Vitest + **jsdom** + Testing Library, run under StrictMode | Positions and order; close button default on for normal and off for custom; action dismissal and `preventDefault`; no dismissal on body click; lifecycle with fallbacks; hover pausing the stack; focus-within pausing the toast; blur and visibility; hotkey, Escape and focus restoration; live regions and announcements; theme attribute; `className` |
| Accessibility | **vitest-axe** | The §17.6 matrix |
| Browser | **Playwright: Chromium, WebKit, Firefox** | Real animation lifecycle; reflow; reduced-motion emulation; touch swipe (thresholds, cancel, scrolling, no mouse drag); RTL; progress direction and pause sync; real blur and visibility; forced colours (Chromium) |
| Package | §27 | Packed ESM tarball in Vite and Next.js fixtures |
| Compatibility | CI matrix | React 18 and 19 for every layer except the browser suite, which runs on the latest React |

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

## 28. CI strategy

Every job is **blocking**. No quality gate uses `continue-on-error` (D-31).

| Job | Steps |
| --- | --- |
| `quality` | `npm ci`, `format:check` (pure check, no `git add`; D-32), `lint`, `typecheck` (library, tests and tooling configs checked separately) |
| `test` (matrix: React 18, 19) | Unit, type, component and axe tests |
| `build-package` | Build, publint, attw (ESM-only), pack, tarball contents, `"use client"` check, Vite fixture (React 18/19, TS latest and 5.0), Node ESM SSR smoke test, Next.js fixture |
| `size` | Bundle-size check with size-limit against the budget (§33) |
| `browser` | Playwright on Chromium, WebKit and Firefox |
| `demo` | Demo typecheck and build only. **It never deploys before 2.0.0** (§29). |

- **Triggers:** `push` and `pull_request` on `main` and `v2`, plus `workflow_dispatch` (C-07).
- **Node:** a single current Active LTS for tooling (Node 24 at the time of writing). It is a CI setting only, not an `engines` field.
- **Hygiene:**
  - least-privilege `permissions:`
  - pinned action versions (SHA pinning recommended)
  - npm cache
  - no debug `ls` or `npm list` steps
  - automated dev-dependency update PRs (Dependabot or Renovate, chosen in P-06)
- **Cleanup:** remove the stale `.github/workflows/deploy-demo` (D-34). P-06 guards `deploy-demo.yml` so it cannot deploy the 2.0 demo early.

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

| 0.x | 2.0 |
| --- | --- |
| `<ToastProvider>…</ToastProvider>` | Render `<Toaster />` once, near the root, and remove the provider. Only one Toaster is supported. |
| `useToast().addToast({ type: "success", title, message })` | `toast.success(title, { description: message })`. Without a `title`, use `toast.success(message)`. |
| `addToast({ … })` with no `type` (0.x defaulted to `info`) | `toast.info(…)`. Note that a plain `toast()` in 2.0 is neutral, not info. |
| `updateToast(id, { … })` | Call a creation function with `{ id }`. This **replaces** the toast and does not merge (§14). |
| `addToast()` always returned an ID | Creation returns `ToastId \| undefined`. It is `undefined` only when creation is rejected (§6.2). |
| `removeToast(id)` / `removeAll()` | `toast.dismiss(id)` / `toast.dismiss()` |
| `animation` | Removed. There is a single motion system. |
| `closeOnClick` | Removed. Clicking the body never dismisses. Use the close button, which is on by default. |
| `onClose` | `onDismiss(toast, reason)` for any cause, or `onAutoClose` for timeouts only. In 0.x a user's `onClose` never fired (D-06). |
| `progressBar` (default on) | `progress`, which is **off** by default |
| `rtl` per toast | Inherited from the DOM direction |
| `role` | Removed. Politeness comes from the type (§17). |
| `maxToasts` (default 5, global, drops the oldest) | `maxVisible` (default 4, **per position**, queues instead of dropping) |
| `defaultPosition` / `defaultDuration` | `<Toaster position duration />` (defaults are `top-right` and 5000) |
| `containerClassName` / `containerStyle` | `<Toaster className />` plus CSS custom properties |
| `pauseOnHover` / `pauseOnPageIdle` / `pauseOnFocusLoss` | Always on, and now joined by focus-within. There are no toggles. |
| `import "react-elegant-toasts/dist/styles.css"` | `import "react-elegant-toasts/styles.css"` |
| `.toast`, `.toast.success`, `.toast-title`, … | `.ret-toast`, `.ret-toast--success`, `.ret-toast__title`, … plus custom properties |
| `import useToast from "react-elegant-toasts"` | Named imports only |
| CommonJS `require("react-elegant-toasts")` | Not supported. The package is ESM-only (§24.3), and the guide includes Jest guidance. |
| React ≥ 16.8 | React 18 or 19 |
| Content was a `string` | Content is a `ReactNode` |

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

**P-06 Blocking CI baseline**
- Scope:
  - blocking `quality`, `test` and `build` jobs, on the Active LTS Node, with `npm ci`
  - triggers on `main` and `v2`, least-privilege permissions, debug steps removed
  - guard `deploy-demo.yml` so it cannot deploy before 2.0.0
  - Dependabot or Renovate
- Defects: D-31, D-32, C-06, C-07.

**P-07 Package validation harness**
- Scope:
  - publint and attw `--profile esm-only --exclude-entrypoints ./styles.css` (see §27)
  - `npm pack` and a tarball-content check (no CJS files)
  - a `"use client"` check
  - a Vite fixture (React 18/19 matrix, TypeScript latest and 5.0) using **types and imports only** for now
  - the CSS-present-in-output check and the deep-import-blocked check
  - wiring into the blocking `build-package` job
- Not in scope: rendering (added in P-14), the SSR and Next.js fixtures (added in P-23).

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
- Defects: D-01 (store side), D-02, D-03, D-06.

**P-10 Queue and maxVisible**
- Scope: §11 in full: per-position `maxVisible` of 4, FIFO by `seq`, slot freed only on removal, positions independent, revival without needing a slot, relocation re-queuing.
- Defects: D-12.

**P-11 Timer and pause model**
- Scope: §10 in full:
  - remaining time
  - the four combined reasons plus `swipe`, with stack-scoped hover and toast-scoped focus-within
  - persistent toasts
  - timer reset on replacement
  - `onAutoClose` and the order of callbacks
  - suspending timers on detach
- Defects: D-07, D-08, D-09 (store side).

**P-12 `toast` facade**
- Scope:
  - `toast()`, `success`, `error`, `warning`, `info`, `loading`, `custom` (chrome-less, `closeButton` false by default, restricted options) and `dismiss`
  - type tests
- Defects: D-01, D-04.

**P-13 `toast.promise`**
- Scope: §13 in full: required messages, the ownership token, never reviving after dismissal, throwing message functions, inference, rejection handling.

### Track C: Rendering and behaviour

**P-14 Toaster rendering**
- Scope:
  - `useSyncExternalStore`, with attachment through the store's arbitration
  - position lists in DOM and visual order
  - the region markup
  - the normal shell: close button on by default, action, SVG icons with `aria-hidden`
  - the custom wrapper: chrome-less, with no close button by default
  - lifecycle reporting through fallbacks (no animation yet)
  - no dismissal on body click
  - the development warning for inaccessible persistent normal toasts
  - SSR safety
  - the Vite fixture now renders a toast
- Not in scope: visual styling, motion, announcements.
- Defects: D-15, D-16, D-17, D-19.

**P-15 Environmental pause wiring**
- Scope:
  - hover on the position stack (pointer events)
  - focus-within per toast
  - window blur and document visibility
  - StrictMode idempotency
- Defects: D-07, D-09.

**P-16 Accessibility layer**
- Scope:
  - persistent polite and assertive regions, the announcer, the politeness table, warning and error prefixes, re-announcement on replacement
  - `labels`
  - the Alt+T hotkey (configurable and disableable), Escape returning focus, focus restoration
  - `aria-keyshortcuts`
  - the axe suite
  - docs notes on the custom-content boundary for P-26
- Defects: D-18, D-22.

### Track D: Visual (starts behind the P-17 gate)

**P-17 Styling foundation**
- **Entry gate:** OQ-24 (visual direction signed off from a mockup or prototype) and OQ-25 (public CSS contract) must both be resolved before implementation starts.
- Scope:
  - `ret-` CSS, the tokens, and the light, dark and system themes
  - variant design and AA contrast checks
  - forced colours, logical properties, safe-area insets
  - responsive width without changing position
  - the chrome-less custom wrapper
  - `className` hooks
- Defects: D-11 (layout), D-20, D-23, D-24.

**P-18 Enter and exit motion**
- Scope: `ret-enter` and `ret-exit`, `animationend` plus the fallbacks, reduced motion, the spinner.
- Defects: D-13, D-14, D-21.

**P-19 Stack repositioning**
- **Prototype gate:** build both the measured-offset approach and the FLIP/WAAPI approach, choose one within the §22 constraints, and record the decision in the PR.
- Scope: the chosen technique, including its reduced-motion behaviour.

**P-20 Progress indicator**
- Scope: progress off by default, CSS-driven, kept in sync with `remaining` and the pause state, RTL origin, still depleting under reduced motion.
- Defects: D-10, D-11.

**P-21 Swipe to dismiss**
- Scope: §19 in full, with thresholds set by prototype. Touch and pen only, centre positions in either direction, custom toasts included.

### Track E: Verification

**P-22 Browser test suite**
- Scope: Playwright on Chromium, WebKit and Firefox covering §26. Wired into the blocking `browser` job.

**P-23 Compatibility and SSR verification**
- Scope:
  - the full React 18/19 matrix. This requires upgrading `@testing-library/react` from 14 (React 18 only) to 16, and adding `@testing-library/dom` (kept at 14 in P-04).
  - declarations type-checked under both `@types` versions and under TypeScript 5.0 and the latest TypeScript
  - the Node ESM `renderToString` smoke test on the packed package
  - the **Next.js App Router fixture** with its Playwright check

**P-24 Bundle-size baseline and budget**
- Scope: size-limit setup, an optional CSS minifier, the baseline measurement, the budget file and the blocking `size` job.

### Track F: Documentation and release

**P-25 Demo rebuild** (§31). It deploys only at 2.0.0. After P-04 the demo still builds with Vite 4 and `@vitejs/plugin-react` 4, which were kept on purpose (see P-04). P-25 evaluates upgrading them, together with whether Vitest can then move past 3.x.

**P-26 README and reference docs** (§31), including the accessibility boundary and the ESM-only guidance. Defects: D-22, D-35.

**P-27 Migration guide** (§30), 0.x → 2.0.

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
- AC-A11Y-5 † axe finds no violations across the §17.6 matrix.
- AC-A11Y-6 † The documented token palette meets 4.5:1 for text and 3:1 for non-text in both themes. (D-20)
- AC-A11Y-7 † A persistent normal toast with no close button and no action logs a development warning. Custom toasts do not trigger it.
- AC-A11Y-8 The manual screen-reader checklist (§17.6) is completed and recorded.
- AC-KB-1 † Alt+T is the default hotkey. It can be configured, it can be disabled, and it moves focus to the region. Escape returns focus without dismissing anything. Focus is restored when a focused toast is removed.
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
- A per-toast `politeness` override, a per-toast `style`, and a `classNames` slot map (the last two subject to OQ-25).
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

Only two questions remain. Both are deferred to the P-17 entry gate, and neither blocks P-01 to P-16.

| ID | Question | Current recommendation (not a decision) | Gate |
| --- | --- | --- | --- |
| OQ-24 | **Visual design direction.** The final look of the normal shell and its variants, signed off from an actual mockup or prototype. | A neutral card surface with a semantic colour accent | **P-17 entry gate** |
| OQ-25 | **The public CSS contract.** Which styling surface is semver-stable for 2.x. | Documented custom properties are public and stable for 2.x. Documented `ret-*` selectors and data attributes meant for customisation are public and stable for 2.x. No `@layer`, no `classNames` slot map and no per-toast `style` in 2.0. | **P-17 entry gate** (design-system decision) |

---

## Appendix A: Defect traceability

| Defect | 2.0 response (section) | Phase | Acceptance |
| --- | --- | --- | --- |
| D-01 provider-only creation | §5, §8 | P-09, P-12 | AC-API-3 |
| D-02 ID and internal state can be changed | §7, §14 | P-09 | AC-API-5 |
| D-03 weak IDs, no custom IDs | §7 | P-09 | AC-API-2 |
| D-04 string-only content | §6 | P-12 | AC-API-4 |
| D-05 internals exported, default export | §6.7, §6.8 | P-08 | AC-API-1 |
| D-06 `onClose` never fires | §16 | P-09, P-11 | AC-CB-1, AC-CB-2 |
| D-07 pause reasons overwrite each other | §10 | P-11, P-15 | AC-TM-2 |
| D-08 resume restarts the duration | §10 | P-11 | AC-TM-1 |
| D-09 hover not combined with other pauses | §10 | P-11, P-15 | AC-TM-2 |
| D-10 rAF-driven progress that resets | §22 | P-20 | AC-PR-1 |
| D-11 progress wrong in RTL | §20 | P-17, P-20 | AC-RTL-1 |
| D-12 silent drop | §11 | P-10 | AC-Q-1, AC-Q-3 |
| D-13 no exit lifecycle | §9, §22 | P-09, P-18 | AC-LC-1, AC-MO-1 |
| D-14 left slide left offset | §22 | P-18 | AC-MO-1 |
| D-15 stack order | §12 | P-14 | AC-POS-1 |
| D-16 everything re-renders | §32 | P-14 | Render-count tests (§32) |
| D-17 body click dismisses, no close button | §16, §17 | P-14 | AC-A11Y-4 |
| D-18 `role="alert"` everywhere | §17 | P-16 | AC-A11Y-1, AC-A11Y-2 |
| D-19 icons announced | §17 | P-14 | AC-A11Y-3 |
| D-20 contrast failures | §17, §21 | P-17 | AC-A11Y-6 |
| D-21 no reduced motion | §22 | P-18 | AC-MO-3 |
| D-22 README overstates accessibility | §31 | P-16, P-26 | AC-REL-2 |
| D-23 unprefixed CSS | §21 | P-17 | AC-CSS-1 |
| D-24 no theme control, inline styles | §21 | P-17 | AC-CSS-2, AC-CSS-3 |
| D-25 React as a runtime dependency | §24, §25 | P-01, P-03 | AC-PKG-1 |
| D-26 no exports map | §24 | P-03 | AC-PKG-2, AC-PKG-6 |
| D-27 CSS tree-shaken | §24 | P-03 | AC-PKG-2 |
| D-28 no `"use client"` | §23, §24 | P-03 | AC-PKG-4 |
| D-29 tooling configuration | §24, §26 | P-02, P-03 | AC-PKG-3, AC-PKG-9 |
| D-30 `prepare` script | §24 | P-01 | AC-REL-3 |
| D-31 non-blocking CI | §28 | P-06 | AC-CI-1 |
| D-32 format gate can never fail | §28 | P-01, P-06 | AC-CI-1 |
| D-33 unvalidated, token-based release | §29 | P-28 | AC-REL-1 |
| D-34 stale workflow | §28 | P-01 | AC-REL-3 |
| D-35 missing LICENSE, README placeholders | §29, §31 | P-01, P-26 | AC-REL-2 |
| D-36 tests encode removed behaviour, test `src/` only | §26, §27 | P-04, P-08 | AC-PKG-5, AC-PKG-8 |

## Appendix B: Open-question decision log (revision 1 → revision 2)

IDs are kept for history. A resolved ID is never reused.

| ID | Outcome | Where it now lives |
| --- | --- | --- |
| OQ-01 | Resolved: ESM-only, a plain module singleton, no `globalThis` store | §8.2, §24, C-01 |
| OQ-02 | Resolved: one active Toaster, the first to attach wins, extra Toasters warn and render nothing, handover on unmount | §8.5 |
| OQ-03 | Resolved: pending retention, a hard cap of 100 with rejection and no `evicted` reason, deduplicated warnings, timers suspended, unmount returns toasts to queued | §8.4 |
| OQ-04 | Resolved: `maxVisible` is 4 per position | §11 |
| OQ-05 | Accepted: a slot frees only at removal | §11 |
| OQ-06 | Accepted: 5000 ms default | §10 |
| OQ-07 | Resolved and accepted: replacement (not merge), revival from exiting, relocation on a position change | §14 |
| OQ-08 | Accepted: the timer resets on replacement and pause reasons are kept | §10, §14 |
| OQ-09 | Accepted: hover pauses the stack, focus-within pauses the toast | §10 |
| OQ-10 | Resolved: focus-within is a pause reason | §10 |
| OQ-11 | Accepted: no pause toggles in 2.0 | §10, §37 |
| OQ-12 | Accepted: persistent hidden polite and assertive regions, text taken from the rendered DOM, warning and error prefixes, no per-toast override | §17.1 |
| OQ-13 | Resolved and accepted: only error is assertive, and loading and custom are polite | §17.1 |
| OQ-14 | Accepted: Alt+T (configurable and disableable), Escape returns focus | §18 |
| OQ-15 | Accepted: `labels` on the Toaster | §6.5 |
| OQ-16 | Accepted: an action dismisses unless `preventDefault()` is called, and its label is a `ReactNode` | §15 |
| OQ-17 | Resolved: `toast.custom` accepts only a `ReactNode`, is chrome-less, and has `closeButton` off by default | §6.4, §17.3 |
| OQ-18 | Accepted: messages are required, a promise never revives a dismissed toast (ownership token), and one set of options applies to every state | §13 |
| OQ-19 | Accepted: `onDismiss` receives the dismiss reason | §16 |
| OQ-20 | Accepted: centre positions swipe in either horizontal direction, thresholds come from a prototype, no mouse drag | §19, P-21 |
| OQ-21 | Accepted: positions are physical, and there is no `dir` prop | §12, §20 |
| OQ-22 | Accepted: progress is off by default and still depletes under reduced motion | §22 |
| OQ-23 | Converted into a phase task: a prototype gate in P-19 | §22, P-19 |
| OQ-24 | **Still open:** the P-17 entry gate | §38 |
| OQ-25 | **Still open:** the P-17 entry gate | §38 |
| OQ-26 | Accepted: rendered inline with `position: fixed` | §12, §23 |
| OQ-27 | Accepted: on the server, creation is rejected, with one warning in development | §8.3 |
| OQ-28 | Accepted: the ESM package shape, no `engines` field, TypeScript 5.0 or later | §24 |
| OQ-29 | Converted into a phase task: size-limit in P-24 | §33, P-24 |
| OQ-30 | Converted into a phase task: tsup 8 with directive preservation in P-03 | §24, P-03, P-07 |
| OQ-31 | Accepted: the `next` dist-tag, the demo deployed at 2.0.0, 0.x deprecated, "0.x → 2.0" wording | §29, §30 |
| OQ-32 | Converted into phase tasks: jsdom, vitest-axe, Playwright on three browsers, a Next.js fixture, no visual regression | §26, §27, P-04, P-22, P-23 |
| OQ-33 | Removed (it was an unused placeholder) | n/a |
| OQ-34 | Accepted: `ToastId` is `string` | §6.6 |
| OQ-35 | Accepted: development warning for normal toasts only | §17.2 |
| OQ-36 | Resolved: the default position is `top-right` | §6.5, §12 |
| OQ-37 | Resolved: creation returns `ToastId \| undefined`, with `undefined` for any rejected creation (server or cap) even if an explicit `id` was supplied, and never an empty or placeholder ID | §6.2, §8.3, §8.4, §13 |
