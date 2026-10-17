# Accessibility

See the [README](../README.md) for installation, the quick start and the API.

This is the accessibility reference for react-elegant-toasts 2.x. It explains what the library does for the people using your application, what it leaves to you, and what has and has not been verified.

The library gives you mechanisms: announcements, a keyboard route to the toasts, focus handling, pausing, reduced motion and forced-colours styles. Whether your application meets a particular accessibility standard also depends on what your toasts say, when you show them and what you put in custom toasts. This page makes no claim of conformance to WCAG or any other standard. Where it mentions a WCAG success criterion, it names the mechanism that helps you meet it, not a result.

Throughout the page:

- **Built in** is behaviour the library provides with its default settings.
- **Your part** is what the library cannot do for you.
- **Limitation** is a known boundary of the library.

[What was verified](#what-was-verified) lists the evidence behind these statements. **No real screen reader has been tested yet**, so statements about announcements describe what the library writes to the page, not what a particular screen reader says.

## Contents

- [At a glance](#at-a-glance)
- [Choosing a type and its urgency](#choosing-a-type-and-its-urgency)
- [Avoiding excessive notifications](#avoiding-excessive-notifications)
- [Writing accessible content](#writing-accessible-content)
- [Keyboard access](#keyboard-access)
- [Focus behaviour](#focus-behaviour)
- [Time limits and persistent toasts](#time-limits-and-persistent-toasts)
- [Progress indicator](#progress-indicator)
- [Reduced motion](#reduced-motion)
- [Forced colours and contrast](#forced-colours-and-contrast)
- [Touch and swipe](#touch-and-swipe)
- [Custom toasts](#custom-toasts)
- [Server rendering and Content Security Policy](#server-rendering-and-content-security-policy)
- [Testing your integration](#testing-your-integration)
- [What was verified](#what-was-verified)
- [Known limitations](#known-limitations)

## At a glance

| Built in                                                                                                 | Your part                                                                                |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Announcing each toast through live regions that exist before the first toast, politely except for errors | Choosing the type that matches the urgency, and writing text that makes sense when heard |
| A named landmark region, with each position's toasts in a list in visual order                           | Localising the region name, the close button's name and the announcement prefixes        |
| Native, named close and action buttons; a close button on every normal toast unless you turn it off      | Keeping a way to dismiss every toast that does not close by itself                       |
| A keyboard shortcut (Alt+T) to reach the toasts, and Escape to go back                                   | Telling your users about the shortcut, and choosing a safe one if you change it          |
| Never moving focus when a toast appears; moving it within the region when a focused toast closes         | Keyboard operation, names, roles and focus styles of everything inside custom toasts     |
| Pausing the countdown on hover, keyboard focus, window blur and a hidden page                            | Durations long enough to read, and persistent toasts for anything that needs a response  |
| Reduced motion and forced-colours styles, and a default palette checked for contrast                     | Keeping contrast when you override tokens, and in custom toasts                          |

## Choosing a type and its urgency

Every toast is announced through one of two live regions that the Toaster renders as soon as it mounts. Only errors interrupt.

| Type                | Announced                                  |
| ------------------- | ------------------------------------------ |
| `toast()` (default) | politely                                   |
| `toast.success()`   | politely                                   |
| `toast.info()`      | politely                                   |
| `toast.warning()`   | politely, after the prefix "Warning:"      |
| `toast.loading()`   | politely                                   |
| `toast.custom()`    | politely                                   |
| `toast.error()`     | **assertively**, after the prefix "Error:" |

- **Built in.** In ARIA's terms, a polite announcement waits until the screen reader is idle, and an assertive one may interrupt it; how each screen reader handles them has not been verified. A `toast.promise()` toast is announced politely while it is loading, and again when it settles: politely on success, assertively on an error.
- **Built in.** The warning and error prefixes are added to the announcement only. They do not appear in the visible toast, which shows the type by its icon.
- **Limitation.** There is no option to change a toast's politeness: you cannot make an error polite or another type assertive.
- **Your part.** Use `toast.error()` only for errors the user should hear about at once, because it interrupts. Use `toast.warning()` for a problem that can wait.
- **Your part.** A toast is brief and can be missed. For information the user must act on before continuing, or that must not disappear, use a dialog or a message in the page instead, or at least a [persistent toast](#time-limits-and-persistent-toasts).

## Avoiding excessive notifications

- **Built in.** Each toast is announced once, when it is first shown. Re-renders of your application, React's StrictMode and another `<Toaster />` taking over the toasts do not announce it again.
- **Built in.** A toast waiting in a queue, because its position already shows its maximum number of toasts (`maxVisible`, 4 by default), is announced when it appears, not when you create it.
- **Built in.** Calling a toast function with the `id` of an existing toast replaces that toast, and a replacement is announced, even when its text is unchanged. That includes a replacement that moves the toast to another position, which is announced once.
- **Limitation.** The library does not merge or skip toasts with the same text. Ten calls create ten toasts and ten announcements.
- **Your part.** Show a toast for events the user cares about, not for every background step. To update one message, replace it by `id` rather than adding toasts, and replace it only when something meaningful changes: replacing a toast on every percentage of an upload announces every percentage.

## Writing accessible content

**Built in.** A normal toast's announcement is the text of its content followed by its description, as rendered. The icon, the action button and the close button are not part of it.

- **Your part.** Write a message that makes sense heard on its own, without the icon, its colour or its position on the screen. "Saved" works; "Done ✓" depends on the check mark.
- **Your part.** The action's label is not announced. If the action matters, mention it in the message or the description, as in the [persistent action example](#time-limits-and-persistent-toasts).
- **Your part.** Give the action a label that says what it does, such as "Undo" or "View order". The label also names the button for assistive technology.
- **Built in.** Icons, including the loading spinner, are hidden from assistive technology. An `icon` you pass in the options is hidden too, so do not put information only in an icon.

**Localisation.** The Toaster's `labels` prop sets the text the library gives assistive technology: the region's name ("Notifications"), the close button's name ("Close notification"), and the warning and error prefixes ("Warning:" and "Error:").

<!-- example: accessibility-labels -->

```tsx
import { Toaster, toast } from 'react-elegant-toasts';

export function LocalizedToaster() {
  return (
    <Toaster
      labels={{
        region: 'Benachrichtigungen',
        close: 'Benachrichtigung schließen',
        warningPrefix: 'Warnung:',
        errorPrefix: 'Fehler:',
      }}
    />
  );
}
```

A label that is left out, or is not a string with visible text, keeps its default. Set the `lang` attribute of your page, or of an ancestor of the Toaster, to the language of the labels and the messages.

## Keyboard access

**Built in.** Toasts never take focus when they appear. Keyboard users reach them deliberately:

| Key            | What it does                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alt+T          | Moves focus to the first toast shown, in visual order, across all positions. It does nothing while no toast is shown. On a Mac keyboard, Alt is the Option key.                                               |
| Tab, Shift+Tab | Move through the toasts' buttons in visual order. A toast itself is not a Tab stop.                                                                                                                           |
| Enter, Space   | Activate the focused action or close button.                                                                                                                                                                  |
| Escape         | While focus is in the toasts, returns it to where it was before Alt+T. If nothing was recorded, or that element has gone or cannot take focus, focus is released to the page. Escape never dismisses a toast. |

- The toasts render where you place `<Toaster />`, without a portal, so their buttons sit at that point of the page's Tab order. Place the Toaster near the root of your application.
- There is no focus trap: Tab and Shift+Tab move on out of the toasts as through any other part of the page.
- Escape acts only while focus is inside the toasts, and does nothing if another handler has already called `preventDefault()` on the event. If your custom toast uses Escape itself, call `preventDefault()` in its handler.
- The shortcut matches the physical key, `KeyboardEvent.code`, with exactly the listed modifiers, so Alt+T works on any keyboard layout, even where that key prints another letter.

**Changing the shortcut.** The `hotkey` prop takes the names of the modifier properties to hold and one `KeyboardEvent.code` value. `hotkey={false}` turns the shortcut off; Escape keeps working.

<!-- example: accessibility-hotkey -->

```tsx
export function ShortcutToaster() {
  return <Toaster hotkey={['altKey', 'shiftKey', 'KeyN']} />;
}
```

- **Built in.** The region advertises the shortcut to assistive technology with `aria-keyshortcuts`, here `Alt+Shift+N`. Only letters, digits, F1 to F24 and a few named keys such as `Escape` are advertised. A shortcut on another key, such as punctuation or the numeric keypad, still works but is not advertised. The advertised name is the key's label on a US keyboard, which may differ from what a key prints on other layouts.
- **Your part.** Tell your users about the shortcut, for example in your application's help or keyboard reference. Whether screen readers announce `aria-keyshortcuts` has not been verified.
- **Your part.** Choose a shortcut that does not clash with your application, the browser or assistive technology. If you configure one with no modifier, a single character key, WCAG 2.1.4 (Character Key Shortcuts) applies, and meeting it is your responsibility.

## Focus behaviour

- **Built in.** A toast never takes focus when it appears, is replaced or moves.
- **Built in.** When a toast that contains focus starts to close, for any reason, focus moves before the toast stops accepting input, and stays among the toasts:
  1. to the same control in the next toast: its close button from a close button, its action from an action, or the next toast itself from a toast;
  2. otherwise, to the previous toast;
  3. otherwise, to the toasts' region, which can take focus from the library but is not a Tab stop.

  "Next" and "previous" mean the neighbouring toasts in visual order, across all positions, skipping toasts that are already closing. From inside a custom toast's content there is no equivalent control, so focus goes to the previous toast, then the region.

- **Built in.** Focus is never left on a toast that is closing, and moving it does not scroll the page. Escape returns from the region as from a toast.
- **Built in.** A toast that contains focus does not time out. See [pausing](#time-limits-and-persistent-toasts).
- **Built in.** Every library control, each toast and the region draw a visible focus ring while the browser shows focus; [the token reference](THEMING.md#token-reference) describes its colours. Whether the browser shows focus, after Alt+T or after a toast closes, follows its own rules for `:focus-visible`, and can depend on whether the keyboard was used before.

## Time limits and persistent toasts

**Built in.** A toast closes after 5000 ms unless you set `duration`, on the toast or on the Toaster. The countdown is held, and continues later with the time it had left, while any of these is true:

- the pointer is over the stack of toasts at that position (every toast in that stack is held);
- keyboard focus is inside the toast (that toast only);
- the browser window does not have focus (every toast);
- the page is hidden, for example in a background tab (every toast).

In the tested browsers, clicking or tapping a toast's body focuses that toast, so it is held until focus moves away. These pauses cannot be turned off.

- **Limitation.** Pausing follows the pointer and keyboard focus. A screen reader's reading cursor does not necessarily move keyboard focus, so reading a toast that way may not hold it. Its text has already been announced, but the toast itself may close while it is being read.
- **Limitation.** There is no control that extends the time of every toast, and the library does not lengthen a toast with a long message.
- **Your part.** Choose durations long enough to read the message. WCAG 2.2.1 (Timing Adjustable) asks that users can turn off, adjust or extend time limits; the pauses above help, but whether they are enough for your messages is your judgement.
- **Your part.** Make a toast persistent with `duration: Infinity` when it offers an action the user needs, or says something they must not miss. Loading toasts are always persistent until you replace or dismiss them.

<!-- example: accessibility-persistent-action -->

```tsx
export function notifyDraftDeleted(restoreDraft: () => void) {
  toast('Draft deleted', {
    description: 'Use Undo to restore it.',
    duration: Infinity,
    action: { label: 'Undo', onClick: restoreDraft },
  });
}
```

The description is announced, so screen-reader users learn that Undo exists; the button's label is not announced. The toast keeps its close button, so it can be dismissed without undoing.

- **Built in.** A persistent normal toast with no close button and no action cannot be dismissed with a keyboard. Creating one logs a warning in development builds. Custom toasts never trigger it, because they may contain their own controls.
- **Limitation.** A persistent toast keeps its place in its position's stack. When every place at a position holds a persistent toast, newer toasts at that position wait until one is dismissed.
- **Built in.** Clicking a toast's body never dismisses it. The close button is a native button with a target of at least 24 by 24 CSS pixels, the size WCAG 2.5.8 (Target Size, Minimum) asks for.

## Progress indicator

The optional progress bar (`progress: true`, off by default) shows the time a toast has left.

- **Built in.** It is decorative: hidden from assistive technology, never focusable and never announced.
- **Built in.** It holds while the countdown is held, and continues from where it held. It keeps depleting under reduced motion, because it shows information rather than decorating.
- **Your part.** Do not rely on the bar to tell anyone how long a toast stays: people who cannot see it get no equivalent. For anything time-sensitive, prefer a persistent toast.

## Reduced motion

**Built in.** Under the `prefers-reduced-motion: reduce` media feature, in CSS only, toasts appear and disappear without any motion, not even a fade; the loading spinner is still; toasts move to their new places in a stack at once; and a swiped toast leaves from where it was released. The progress bar keeps depleting. [Motion and reduced motion](THEMING.md#motion-and-reduced-motion) in the theming reference has the details.

- **Your part.** Animations inside custom toasts are yours: give them their own reduced-motion rules.
- **Limitation.** A `transition-duration` or `transition-timing-function` of yours on a toast's root that wins the cascade also overrides the reduced-motion rule. See [Limitations and ownership](THEMING.md#limitations-and-ownership).

## Forced colours and contrast

**Built in.** In a forced-colours mode, such as a Windows contrast theme, the stylesheet keeps the structure visible with system colours: an edge around each normal toast, a border on the action button, focus rings in the highlight colour and the progress bar without its track. Each type stays recognisable by its icon's shape, and warnings and errors also by their announced prefix. [Forced colours](THEMING.md#forced-colours) in the theming reference lists the rules and what was verified.

**Built in.** The default light and dark palettes are checked automatically: text against its background at 4.5:1 or more, and icons, meaningful borders and focus rings at 3:1 or more.

- **Your part.** When you [override tokens](THEMING.md#overriding-tokens), keep those ratios: set a text colour and its surface together, and keep `--ret-focus` and `--ret-progress` at 3:1 or more against `--ret-surface`.
- **Your part.** A custom toast gets no library edge in forced colours and no checked palette. Its contrast, borders and focus styles are yours.

## Touch and swipe

**Built in.** A toast can be swiped away with touch or a pen: towards the left edge at left positions, towards the right edge at right positions, and either way at centre positions. A mouse or trackpad drag never dismisses a toast.

- **Built in.** Swiping is never the only way to dismiss a normal toast with its default close button, which is a single-pointer alternative in the sense of WCAG 2.5.1 (Pointer Gestures).
- **Built in.** A swipe never starts on a button, link, form field or other interactive element inside a toast, including in custom toasts, or while text in the toast is selected.
- **Built in.** Toasts set `touch-action: pan-y`: vertical scrolling that starts on a toast works, and a horizontal movement is taken as a swipe. On the real phones tested, pinch-zoom worked when it was started on a toast and when it was started on the page, but where each finger first touched was not recorded, so it is not established for a pinch whose two fingers both start on a toast. Diagonal movements are decided by the browser and differ between browsers.
- **Your part.** A custom toast has no close button by default, so for a touch user a swipe may be the only way to dismiss a persistent one. Give it `closeButton: true` or a dismiss button of your own.

**Limitation: Shadow DOM.** Controls inside a web component's shadow root, in a custom toast, are not recognised as interactive, so a swipe can start on them; when it does, the control does not receive the click. If a custom toast contains such components, give it a close button or your own dismiss control.

**Limitation: hosting.** Rendering `<Toaster />` inside a shadow root or an iframe is not a supported configuration in 2.x.

## Custom toasts

`toast.custom()` renders your markup inside the library's toast. The responsibility is split:

| The library provides                                                       | You are responsible for                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A polite announcement of the text you render                               | What that text says, and that it reads well                                                             |
| The region, the list structure, the shortcut, Escape and focus restoration | Names, roles and states of every control in your content                                                |
| Pausing on hover, focus, window blur and a hidden page                     | Keyboard operation of your content                                                                      |
| Positioning, motion, reduced motion and swiping of the toast               | Contrast, focus styles and target sizes inside your content, and its own animations                     |
| No close button unless you pass `closeButton: true`                        | A keyboard-accessible way to dismiss a persistent custom toast: your own button, or `closeButton: true` |
|                                                                            | Hiding decorative content with `aria-hidden`                                                            |

**What is announced.** The announcement of a custom toast is the text content of what you render, read from the page when the toast is shown or replaced. It is not what the accessibility tree exposes:

- It includes text hidden with `aria-hidden` or visually hidden text, and the labels of your buttons and links.
- It leaves out text alternatives that are not text content, such as an image's `alt`.
- The page layout adds no spaces: text in neighbouring elements runs together unless your markup has a space between them, so separate them explicitly, as `{' '}` does below.
- Later changes your component makes to its own content are not announced. To announce new content, replace the toast: call `toast.custom()` again with the same `id`.
- If the outermost element you render has the class `ret-toast__close`, its text is left out of the announcement. Do not give your elements the library's class names.

<!-- example: accessibility-custom -->

```tsx
import { useId } from 'react';

const UPDATE_ID = 'app-update';

function UpdateToast() {
  const titleId = useId();
  return (
    <div className="update-toast" role="group" aria-labelledby={titleId}>
      <p id={titleId}>A new version is available.</p>{' '}
      <p>Reload the page to switch to it. Your saved work is kept.</p>{' '}
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>{' '}
      <button type="button" onClick={() => toast.dismiss(UPDATE_ID)}>
        Later
      </button>
    </div>
  );
}

export function showUpdateToast() {
  toast.custom(<UpdateToast />, { id: UPDATE_ID, duration: Infinity });
}
```

This toast is announced as "A new version is available. Reload the page to switch to it. Your saved work is kept. Reload Later". The group is named by its title, both controls are native buttons, and Later dismisses the toast by its fixed `id`, so the persistent toast can always be dismissed with a keyboard. If you pass `closeButton: true` instead, the library's close button is added in the toast's top inline-end corner, named by `labels.close`; see [Custom toasts](THEMING.md#custom-toasts) in the theming reference for its placement and colours.

- **Built in.** A custom toast takes part in focus restoration, but a control in your content has no equivalent in the next toast, so focus goes to the previous toast or the region.
- **Your part.** Style focus inside your content; no library rule reaches into it. Set `--ret-focus` on the toast's `className` if the toast's own focus ring does not contrast with your page.

## Server rendering and Content Security Policy

- **Built in.** The server-rendered HTML of `<Toaster />` already contains the region and both live regions, empty. They are in place before any toast, and hydration does not change them.
- **Built in.** Toasts are not created on the server: there, a toast call is ignored, returns `undefined` and logs a warning in development builds. Calling `toast()` from a React Server Component under the Next.js App Router throws at request time, because `toast` is a client function. Call it from client code, such as an event handler or an effect.
- **Your part.** The live regions are visually hidden by inline styles and by the stylesheet. A Content Security Policy whose `style-src` blocks inline `style` attributes also blocks those inline styles in server-rendered HTML, so load the stylesheet, `react-elegant-toasts/styles.css`, to keep them hidden. [Loading the stylesheet](THEMING.md#loading-the-stylesheet) has the details.

## Testing your integration

**Finding toasts in tests.** Each announcement is a copy of the toast's text in a hidden live region, kept for about seven seconds. During that time a query by text, such as Testing Library's `getByText('Saved')`, finds both the visible toast and the hidden copy. This is the live region working, not a toast rendered twice. To match only the visible toast, exclude the live regions' content, for example with `getByText('Saved', { ignore: 'script, style, [aria-live] *' })`.

**Automated checks.** An automated accessibility checker such as axe, run in jsdom, checks structure: names, roles, landmarks and valid ARIA. It cannot check colours, real focus behaviour or what a screen reader says, so it is a start, not evidence that your toasts are accessible.

**Testing with assistive technology.** Before you rely on toasts for important information, try them with the assistive technology your users have. A useful check:

- With a screen reader on, show each toast type you use. Listen for one announcement per toast, an interruption only for errors, and messages that make sense without the screen.
- Show a toast with an action and a persistent custom toast. Reach them with your shortcut, operate every control, dismiss them, and check where focus lands and that Escape returns it.
- Check that a toast stays long enough to read and act on, with your durations.
- Turn on the operating system's reduced-motion setting and, on Windows, a contrast theme, and look at your toasts and your custom content.
- On a touch device, swipe a toast away, scroll from a toast, and dismiss a custom toast without swiping.

## What was verified

This describes the evidence for the library itself, as of this version. It does not verify your content.

**Automated tests**, run on every change:

- **Unit tests** in jsdom with React 18 and 19: the live regions, politeness, prefixes, one announcement per toast and per replacement, the shortcut, Escape, focus restoration, the pauses, the labels and the development warning. Structural axe checks of the region, every normal type, a toast with an action, the close button, right-to-left and a custom toast with accessible content. Stylesheet checks of the default palette's contrast ratios, the close button's target size, the focus rings, and the reduced-motion and forced-colours rules.
- **Browser tests** with Playwright 1.63.0 in Chromium 153, Firefox 155 and WebKit 26.6 on Linux: focus restoration, focus rings, the `aria-keyshortcuts` attribute, the hover and focus pauses and the progress bar, reduced motion and forced colours by emulation, and swiping, with trusted touch events from the browser protocol in Chromium and synthetic events in Firefox and WebKit. Playwright's WebKit is the WebKit engine, not Safari. Emulated reduced motion and forced colours are not the operating systems' own settings.

**Manual checks** in real browsers, by eye:

- Windows 11 with Chrome 154 and Firefox 157: Alt+T, Tab and Enter on a close button, the focus rings, and pausing when switching windows and tabs; and the Aquatic contrast theme.
- iOS 27 Safari on an iPhone 17 Pro, and Android 16 Chrome 153 and Firefox for Android 156 on a Nothing Phone (2): swiping, scrolling from a toast, pinch-zoom and tapping the close button.

**Not verified:**

- **Screen readers.** No real screen reader has been tested: not NVDA, JAWS, Narrator, VoiceOver or TalkBack. The announcements are verified as text written to the live regions, not as speech.
- macOS Safari, including its keyboard focus and Option+T, and Safari's focus rings on iOS.
- Microsoft Edge.
- The operating systems' own reduced-motion settings, which were tested only by emulation.
- Contrast themes other than Windows Aquatic, and other platforms' contrast settings.
- Real pen hardware.
- Whether assistive technology announces the shortcut advertised by `aria-keyshortcuts`, which was checked only in Chromium's accessibility tree.

## Known limitations

- No real screen reader has been tested.
- There is no per-toast politeness setting, and no option to turn the pauses off.
- Toasts with the same text are not merged; every toast and every replacement is announced.
- Reading a toast with a screen reader's reading cursor may not pause it.
- A custom toast's announcement is its text content, not its accessible text, and later changes inside it are not announced.
- An outermost custom element with the class `ret-toast__close` is left out of the announcement.
- `aria-keyshortcuts` names keys by their US keyboard labels, and keys outside letters, digits, F1 to F24 and a few named keys are not advertised.
- Whether a focus ring shows after Alt+T or after a toast closes is the browser's decision.
- Controls inside a shadow root in a custom toast do not stop a swipe from starting.
- Rendering `<Toaster />` inside a shadow root or an iframe is not supported.
- With `touch-action: pan-y`, horizontal movement that starts on a toast is taken as a swipe, not as panning.
