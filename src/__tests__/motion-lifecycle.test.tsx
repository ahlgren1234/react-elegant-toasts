// Enter and exit completion in the renderer (§9 rule 3, P-18 S1): the toast root's own
// `animationend` for the library animation of its phase and edge, or the fallback derived from its
// computed animation, whichever comes first. jsdom computes no CSS animation, so the computed
// styles of a running library animation are stubbed, from the stylesheet's own token defaults
// (P-18 S2). Everything runs on the fake clock; nothing waits for a real animation.
import fs from 'node:fs';
import path from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Toaster, toast } from '../index';
import { LIFECYCLE_FALLBACK_MARGIN_MS, libraryAnimationName, parseTime } from '../react/motion';
import { dismiss, getSnapshot, inspectRecords, subscribe } from '../store/store';
import type { CustomToastOptions, ToastOptions, ToastPosition } from '../types';

const STYLESHEET = fs.readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8');

const recordOf = (id: string) => inspectRecords().find(record => record.id === id);
const phaseOf = (id: string) => recordOf(id)?.phase;
const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (text: string) => screen.getByText(text, inToasts).closest('li') as HTMLLIElement;

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const flush = () => advance(0);

async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

function show(content: ReactNode, options: ToastOptions & { id: string }): void {
  act(() => {
    toast(content, options);
  });
}

function showCustom(content: ReactNode, options: CustomToastOptions & { id: string }): void {
  act(() => {
    toast.custom(content, options);
  });
}

/** A native `animationend`, as a browser would dispatch it; jsdom has no `AnimationEvent`. */
function animationEnd(target: Element, animationName: string): void {
  const event = new Event('animationend', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: animationName });
  act(() => {
    target.dispatchEvent(event);
  });
}

type Animation = Partial<
  Record<'animation-name' | 'animation-duration' | 'animation-delay', string>
>;

/**
 * Gives every toast root the computed animation `byPhase` returns for its committed `data-phase`,
 * as S2's stylesheet will. Other elements, and the other properties, keep jsdom's real values.
 */
function stubAnimation(byPhase: (phase: string | null, item: Element) => Animation | undefined) {
  const real = window.getComputedStyle.bind(window);
  return vi
    .spyOn(window, 'getComputedStyle')
    .mockImplementation((element: Element, pseudo?: string | null) => {
      const computed = real(element, pseudo);
      const animation = element.matches('li.ret-toast')
        ? byPhase(element.getAttribute('data-phase'), element)
        : undefined;
      if (!animation) return computed;
      return new Proxy(computed, {
        get(target, key) {
          if (key === 'getPropertyValue') {
            return (property: string) =>
              animation[property as keyof Animation] ?? target.getPropertyValue(property);
          }
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
        },
      });
    });
}

/** A motion token's default in the shipped stylesheet (P-18 S2), in ms. */
function tokenDefault(token: string): number {
  const value = new RegExp(`${token}:\\s*([^;]+);`).exec(STYLESHEET)?.[1];
  const ms = value === undefined ? undefined : parseTime(value);
  if (ms === undefined) throw new Error(`no default for ${token}`);
  return ms;
}

const ENTER_MS = tokenDefault('--ret-enter-duration');
const EXIT_MS = tokenDefault('--ret-exit-duration');

/**
 * The library motion the stylesheet runs, as a browser computes it: the S2 token defaults,
 * serialised in seconds, with no delay. jsdom does not compute animations, so this stands in.
 */
function libraryMotion() {
  return stubAnimation((phase, item) => {
    if (phase !== 'entering' && phase !== 'exiting') return undefined;
    return {
      'animation-name': libraryAnimationName(
        phase,
        item.getAttribute('data-position') as ToastPosition
      ),
      'animation-duration': `${(phase === 'entering' ? ENTER_MS : EXIT_MS) / 1000}s`,
      'animation-delay': '0s',
    };
  });
}

// The fallbacks the stylesheet implies: end time plus the 100 ms margin.
const ENTER_FALLBACK = ENTER_MS + LIFECYCLE_FALLBACK_MARGIN_MS;
const EXIT_FALLBACK = EXIT_MS + LIFECYCLE_FALLBACK_MARGIN_MS;

/** Shows a toast and completes its enter through its event. */
function showVisible(id: string, options: Omit<ToastOptions, 'id'> = {}): HTMLLIElement {
  show(id, { id, ...options });
  const item = itemOf(id);
  animationEnd(item, 'ret-enter-top');
  expect(phaseOf(id)).toBe('visible');
  return item;
}

let computedStyle: MockInstance<typeof window.getComputedStyle> | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  computedStyle?.mockRestore();
  computedStyle = undefined;
});

describe('completion by animationend (P-18 D0, decision 1)', () => {
  beforeEach(() => {
    computedStyle = libraryMotion();
  });

  it("completes an enter on the toast root's own ret-enter event, before the fallback", () => {
    render(<Toaster />);
    show('t', { id: 't' });
    flush();
    advance(ENTER_FALLBACK - 1);
    expect(phaseOf('t')).toBe('entering');
    animationEnd(itemOf('t'), 'ret-enter-top');
    expect(phaseOf('t')).toBe('visible');
    expect(itemOf('t')).toHaveAttribute('data-phase', 'visible');
  });

  it("completes an exit on the toast root's own ret-exit event: removed, onDismiss once", () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    const item = showVisible('t', { onDismiss });
    act(() => dismiss('t'));
    expect(item).toHaveAttribute('data-phase', 'exiting');
    animationEnd(item, 'ret-exit-top');
    expect(recordOf('t')).toBeUndefined();
    expect(item.isConnected).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), 'programmatic');
  });

  it('reports once: the fallback after the event completes nothing more', () => {
    const phases: string[] = [];
    const onDismiss = vi.fn();
    render(<Toaster />);
    subscribe(() => phases.push(getSnapshot().byPosition['top-right'][0]?.phase ?? 'none'));
    show('t', { id: 't', onDismiss, duration: 10_000 });
    const item = itemOf('t');
    animationEnd(item, 'ret-enter-top');
    const timer = recordOf('t')?.timer;
    advance(ENTER_FALLBACK * 2);
    animationEnd(item, 'ret-enter-top');
    // The same running timer: no second entered() restarted or touched it.
    expect(recordOf('t')?.timer).toBe(timer);

    act(() => dismiss('t'));
    animationEnd(item, 'ret-exit-top');
    advance(EXIT_FALLBACK * 2);
    expect(phases).toEqual(['entering', 'visible', 'exiting', 'none']);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses the bottom-edge animations at bottom positions, whatever the horizontal placement', () => {
    render(<Toaster />);
    for (const position of ['bottom-left', 'bottom-center', 'bottom-right'] as ToastPosition[]) {
      show(position, { id: position, position });
      const item = itemOf(position);
      animationEnd(item, 'ret-enter-top');
      expect(phaseOf(position)).toBe('entering');
      animationEnd(item, 'ret-enter-bottom');
      expect(phaseOf(position)).toBe('visible');
      act(() => dismiss(position));
      animationEnd(item, 'ret-exit-top');
      expect(phaseOf(position)).toBe('exiting');
      animationEnd(item, 'ret-exit-bottom');
      expect(recordOf(position)).toBeUndefined();
    }
  });

  it('completes a custom toast the same way: the library owns its motion (§6.4)', () => {
    render(<Toaster />);
    showCustom(<p>custom</p>, { id: 'c' });
    const item = itemOf('custom');
    animationEnd(item, 'ret-enter-top');
    expect(phaseOf('c')).toBe('visible');
    act(() => dismiss('c'));
    animationEnd(item, 'ret-exit-top');
    expect(recordOf('c')).toBeUndefined();
  });
});

describe('filtering (P-18 D0, decisions 1 and 9)', () => {
  beforeEach(() => {
    computedStyle = libraryMotion();
  });

  it('ignores an animationend bubbling from a descendant, with the right name', () => {
    render(<Toaster />);
    show(<span data-testid="inner">t</span>, { id: 't' });
    const item = screen.getByTestId('inner').closest('li') as HTMLLIElement;
    animationEnd(screen.getByTestId('inner'), 'ret-enter-top');
    expect(phaseOf('t')).toBe('entering');
    animationEnd(item.querySelector('.ret-toast__content') as Element, 'ret-enter-top');
    expect(phaseOf('t')).toBe('entering');
    animationEnd(item, 'ret-enter-top');
    expect(phaseOf('t')).toBe('visible');
  });

  it("ignores the loading icon's animations, the spinner's included", () => {
    render(<Toaster />);
    act(() => {
      toast.loading('loading', { id: 'l' });
    });
    const icon = itemOf('loading').querySelector('.ret-toast__icon') as Element;
    const spinner = icon.firstElementChild as Element;
    expect(spinner).toHaveClass('ret-toast__spinner');
    animationEnd(icon, 'ret-enter-top');
    animationEnd(spinner, 'ret-spin');
    animationEnd(spinner, 'ret-enter-top');
    animationEnd(itemOf('loading'), 'ret-spin');
    expect(phaseOf('l')).toBe('entering');
    // Nor while it exits: the spinner turns until its toast is removed.
    animationEnd(itemOf('loading'), 'ret-enter-top');
    act(() => dismiss('l'));
    animationEnd(spinner, 'ret-spin');
    animationEnd(spinner, 'ret-exit-top');
    expect(phaseOf('l')).toBe('exiting');
    advance(EXIT_FALLBACK - 1);
    expect(phaseOf('l')).toBe('exiting');
    advance(1);
    expect(recordOf('l')).toBeUndefined();
  });

  it("ignores a consumer's animation on the toast root, at either phase", () => {
    render(<Toaster />);
    show('t', { id: 't', className: 'consumer-pop' });
    const item = itemOf('t');
    animationEnd(item, 'consumer-pop');
    animationEnd(item, 'ret-enter');
    expect(phaseOf('t')).toBe('entering');
    animationEnd(item, 'ret-enter-top');
    act(() => dismiss('t'));
    animationEnd(item, 'consumer-pop');
    animationEnd(item, 'ret-exit');
    expect(phaseOf('t')).toBe('exiting');
  });

  it("ignores the opposite phase's library animation", () => {
    render(<Toaster />);
    show('t', { id: 't' });
    const item = itemOf('t');
    animationEnd(item, 'ret-exit-top');
    expect(phaseOf('t')).toBe('entering');
    animationEnd(item, 'ret-enter-top');
    act(() => dismiss('t'));
    animationEnd(item, 'ret-enter-top');
    expect(phaseOf('t')).toBe('exiting');
  });

  it('ignores an event once the committed phase has moved on, before the effect follows', () => {
    render(<Toaster />);
    show('t', { id: 't' });
    const item = itemOf('t');
    // The commit has written the next phase; this listener still belongs to the entering effect.
    item.setAttribute('data-phase', 'exiting');
    animationEnd(item, 'ret-enter-top');
    expect(phaseOf('t')).toBe('entering');
    item.setAttribute('data-phase', 'entering');
    animationEnd(item, 'ret-enter-top');
    expect(phaseOf('t')).toBe('visible');
  });
});

describe('the computed fallback (P-18 D0, decisions 2 and 3)', () => {
  it('completes an enter at its end time plus 100 ms, and not before', () => {
    computedStyle = libraryMotion();
    render(<Toaster />);
    show('t', { id: 't' });
    advance(ENTER_FALLBACK - 1);
    expect(phaseOf('t')).toBe('entering');
    advance(1);
    expect(phaseOf('t')).toBe('visible');
  });

  it('completes an exit at its end time plus 100 ms, and not before', () => {
    computedStyle = libraryMotion();
    const onDismiss = vi.fn();
    render(<Toaster />);
    showVisible('t', { onDismiss });
    act(() => dismiss('t'));
    advance(EXIT_FALLBACK - 1);
    expect(phaseOf('t')).toBe('exiting');
    expect(onDismiss).not.toHaveBeenCalled();
    advance(1);
    expect(recordOf('t')).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('completes without any animation event, as with display: none (AC-LC-2)', () => {
    computedStyle = libraryMotion();
    render(<Toaster />);
    show('t', { id: 't' });
    advance(ENTER_FALLBACK);
    act(() => dismiss('t'));
    advance(EXIT_FALLBACK);
    expect(recordOf('t')).toBeUndefined();
  });

  it("keeps jsdom's 0 ms path when no stylesheet runs an animation", () => {
    render(<Toaster />);
    show('t', { id: 't' });
    expect(getComputedStyle(itemOf('t')).getPropertyValue('animation-name')).toBe('none');
    flush();
    expect(phaseOf('t')).toBe('visible');
    act(() => dismiss('t'));
    flush();
    expect(recordOf('t')).toBeUndefined();
  });

  it('takes the 0 ms path, without the margin, when the library animation lasts 0s', () => {
    computedStyle = stubAnimation(() => ({
      'animation-name': 'ret-enter-top',
      'animation-duration': '0s',
    }));
    render(<Toaster />);
    show('t', { id: 't' });
    flush();
    expect(phaseOf('t')).toBe('visible');
  });

  it("takes the 0 ms path when only a consumer's animation runs on the toast root", () => {
    computedStyle = stubAnimation(() => ({
      'animation-name': 'consumer-pop',
      'animation-duration': '5s',
      'animation-delay': '1s',
    }));
    render(<Toaster />);
    show('t', { id: 't' });
    flush();
    expect(phaseOf('t')).toBe('visible');
  });

  it('reads the computed style only for a phase that needs completing', () => {
    computedStyle = libraryMotion();
    render(<Toaster />);
    show('t', { id: 't' });
    const reads = () => computedStyle?.mock.calls.filter(([element]) => element === itemOf('t'));
    expect(reads()).toHaveLength(1);
    animationEnd(itemOf('t'), 'ret-enter-top');
    advance(1000);
    expect(reads()).toHaveLength(1);
    act(() => dismiss('t'));
    expect(reads()).toHaveLength(2);
  });

  it('keeps one fallback timer per transitioning toast, and clears it on completion', () => {
    computedStyle = libraryMotion();
    render(<Toaster />);
    show('t', { id: 't', duration: Infinity });
    // The enter fallback plus the announcement's retention timer (§17.1).
    expect(vi.getTimerCount()).toBe(1 + 1);
    animationEnd(itemOf('t'), 'ret-enter-top');
    expect(vi.getTimerCount()).toBe(0 + 1);
    act(() => dismiss('t'));
    expect(vi.getTimerCount()).toBe(1 + 1);
  });

  it('uses no frame callback, media query or layout read', () => {
    computedStyle = libraryMotion();
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const media = vi.fn();
    vi.stubGlobal('matchMedia', media);
    render(<Toaster />);
    show('t', { id: 't' });
    advance(ENTER_FALLBACK);
    act(() => dismiss('t'));
    advance(EXIT_FALLBACK);
    expect(recordOf('t')).toBeUndefined();
    expect(raf).not.toHaveBeenCalled();
    expect(rect).not.toHaveBeenCalled();
    expect(media).not.toHaveBeenCalled();
    raf.mockRestore();
    rect.mockRestore();
  });
});

describe('lifecycle edge cases', () => {
  beforeEach(() => {
    computedStyle = libraryMotion();
  });

  it('never removes a toast revived during its exit: neither the old event nor the old timer', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    const item = showVisible('t', { onDismiss });
    act(() => dismiss('t'));
    show('revived', { id: 't', onDismiss });
    expect(phaseOf('t')).toBe('entering');
    expect(itemOf('revived')).toBe(item);
    animationEnd(item, 'ret-exit-top');
    advance(EXIT_FALLBACK);
    expect(recordOf('t')).toMatchObject({ phase: 'entering', revision: 1 });
    animationEnd(item, 'ret-enter-top');
    advance(10_000);
    expect(recordOf('t')).toBeDefined();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('reports each transition once under StrictMode', () => {
    const onDismiss = vi.fn();
    const phases: string[] = [];
    subscribe(() => phases.push(getSnapshot().byPosition['top-right'][0]?.phase ?? 'none'));
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    show('t', { id: 't', onDismiss, duration: Infinity });
    // One fallback and one announcement retention timer, however often effects replay.
    expect(vi.getTimerCount()).toBe(2);
    const item = itemOf('t');
    animationEnd(item, 'ret-enter-top');
    animationEnd(item, 'ret-enter-top');
    act(() => dismiss('t'));
    expect(vi.getTimerCount()).toBe(2);
    animationEnd(item, 'ret-exit-top');
    animationEnd(item, 'ret-exit-top');
    advance(EXIT_FALLBACK);
    expect(phases).toEqual(['none', 'entering', 'visible', 'exiting', 'none']);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('leaves detach as it was: entering toasts re-queue, exits finish at once', async () => {
    const onDismiss = vi.fn();
    const first = render(<Toaster />);
    show('a', { id: 'a' });
    const entering = itemOf('a');
    showVisible('b', { onDismiss });
    act(() => dismiss('b'));
    first.unmount();
    await settle();
    expect(phaseOf('a')).toBe('queued');
    expect(recordOf('b')).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // The detached node's listener and timer are gone.
    animationEnd(entering, 'ret-enter-top');
    advance(ENTER_FALLBACK);
    expect(phaseOf('a')).toBe('queued');

    render(<Toaster />);
    expect(phaseOf('a')).toBe('entering');
    animationEnd(itemOf('a'), 'ret-enter-top');
    expect(phaseOf('a')).toBe('visible');
  });
});

describe('focus during a positive exit (§18, P-16, P-18 S2)', () => {
  beforeEach(() => {
    computedStyle = libraryMotion();
  });

  it('times the stub from the stylesheet: 180 ms in, 120 ms out', () => {
    expect([ENTER_MS, EXIT_MS]).toEqual([180, 120]);
  });

  it('restores focus and sets inert as the exit starts, then removes only after the exit', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    // Top stacks are newest first, so `older` follows `newer` in DOM order.
    const older = showVisible('older', { onDismiss });
    const newer = showVisible('newer');
    const close = older.querySelector('.ret-toast__close') as HTMLButtonElement;
    act(() => close.focus());
    expect(document.activeElement).toBe(close);

    act(() => dismiss('older'));
    // At once, while the exit animation still runs: focus has left for the previous toast, which
    // has no next toast after it, and the exiting toast is inert.
    expect(phaseOf('older')).toBe('exiting');
    expect(older).toHaveAttribute('inert');
    expect(older.contains(document.activeElement)).toBe(false);
    expect(document.activeElement).toBe(newer);
    expect(newer).not.toHaveAttribute('inert');

    // It stays rendered and exiting for the whole exit window.
    advance(EXIT_FALLBACK - 1);
    expect(older.isConnected).toBe(true);
    expect(phaseOf('older')).toBe('exiting');
    expect(onDismiss).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(newer);

    // Then the exit's completion removes it.
    animationEnd(older, 'ret-exit-top');
    expect(recordOf('older')).toBeUndefined();
    expect(older.isConnected).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(newer);
  });

  it('removes a focused toast through the fallback when no animationend arrives', () => {
    render(<Toaster />);
    const item = showVisible('t');
    act(() => item.focus());
    act(() => dismiss('t'));
    expect(item).toHaveAttribute('inert');
    expect(item.contains(document.activeElement)).toBe(false);
    advance(EXIT_FALLBACK - 1);
    expect(item.isConnected).toBe(true);
    advance(1);
    expect(item.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
  });
});

/**
 * The computed style a browser resolves under `prefers-reduced-motion: reduce` (P-18 S4): the
 * stylesheet removes the animation name, while the duration tokens still resolve as usual.
 */
function reducedMotion() {
  return stubAnimation(phase => {
    if (phase !== 'entering' && phase !== 'exiting') return undefined;
    return {
      'animation-name': 'none',
      'animation-duration': `${(phase === 'entering' ? ENTER_MS : EXIT_MS) / 1000}s`,
      'animation-delay': '0s',
    };
  });
}

describe('reduced motion (§22, AC-MO-3, AC-LC-2, P-18 S4)', () => {
  beforeEach(() => {
    computedStyle = reducedMotion();
  });

  it('enters on the 0 ms path, with no animationend', () => {
    render(<Toaster />);
    show('t', { id: 't', duration: Infinity });
    expect(phaseOf('t')).toBe('entering');
    flush();
    expect(phaseOf('t')).toBe('visible');
    expect(itemOf('t')).toHaveAttribute('data-phase', 'visible');
  });

  it('exits on the 0 ms path, with no animationend: removed, onDismiss once', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    show('t', { id: 't', onDismiss, duration: Infinity });
    flush();
    const item = itemOf('t');
    act(() => dismiss('t'));
    expect(item).toHaveAttribute('data-phase', 'exiting');
    expect(item).toHaveAttribute('inert');
    flush();
    expect(recordOf('t')).toBeUndefined();
    expect(item.isConnected).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), 'programmatic');
  });

  it('keeps the default 5000 ms of visible time, then times out and leaves at once', () => {
    const onAutoClose = vi.fn();
    const onDismiss = vi.fn();
    render(<Toaster />);
    show('t', { id: 't', onAutoClose, onDismiss });
    expect(recordOf('t')?.timer.runningSince).toBeNull();
    flush();
    expect(recordOf('t')).toMatchObject({ phase: 'visible', timer: { duration: 5000 } });
    expect(recordOf('t')?.timer.runningSince).not.toBeNull();

    advance(4999);
    expect(phaseOf('t')).toBe('visible');
    expect(onAutoClose).not.toHaveBeenCalled();
    advance(1);
    expect(recordOf('t')).toMatchObject({ phase: 'exiting', exit: { reason: 'timeout' } });
    expect(onAutoClose).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    flush();
    expect(recordOf('t')).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), 'timeout');
    expect(onAutoClose.mock.invocationCallOrder[0]).toBeLessThan(
      onDismiss.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('restores focus and sets inert as the exit starts, then removes on the 0 ms path', () => {
    render(<Toaster />);
    show('older', { id: 'older', duration: Infinity });
    show('newer', { id: 'newer', duration: Infinity });
    flush();
    const older = itemOf('older');
    const newer = itemOf('newer');
    const close = older.querySelector('.ret-toast__close') as HTMLButtonElement;
    act(() => close.focus());

    act(() => dismiss('older'));
    expect(phaseOf('older')).toBe('exiting');
    expect(older).toHaveAttribute('inert');
    expect(document.activeElement).toBe(newer);

    flush();
    expect(older.isConnected).toBe(false);
    expect(document.activeElement).toBe(newer);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('is not held up or completed by the spinner', () => {
    render(<Toaster />);
    act(() => {
      toast.loading('loading', { id: 'l' });
    });
    const spinner = itemOf('loading').querySelector('.ret-toast__spinner') as Element;
    animationEnd(spinner, 'ret-spin');
    expect(phaseOf('l')).toBe('entering');
    flush();
    expect(phaseOf('l')).toBe('visible');
    act(() => dismiss('l'));
    flush();
    expect(recordOf('l')).toBeUndefined();
  });

  it('keeps one fallback timer per transition, at 0 ms', () => {
    render(<Toaster />);
    show('t', { id: 't', duration: Infinity });
    // The enter fallback plus the announcement's retention timer (§17.1).
    expect(vi.getTimerCount()).toBe(1 + 1);
    flush();
    expect(vi.getTimerCount()).toBe(0 + 1);
  });
});
