// Toast chrome, interaction and lifecycle fallbacks (P-14): the normal shell and the chrome-less
// custom wrapper, render-side Toaster defaults, icons, the action and close controls, the
// no-animation lifecycle fallbacks, the inaccessible-persistent-toast warning and inert exiting
// toasts (P-16). The clock is fake: a fallback runs only when a test advances it (`flush`).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, type MouseEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { resolveCloseButton, resolveProgress } from '../react/defaults';
import { Toaster, toast } from '../index';
import { dismiss, getSnapshot, inspectRecords, subscribe } from '../store/store';
import type { StoreSnapshot, ToastView } from '../store/types';
import { resetWarnings } from '../store/warnings';
import type { DismissReason, ToasterProps, ToastOptions } from '../types';

const recordOf = (id: string) => inspectRecords().find(record => record.id === id);
const phaseOf = (id: string) => recordOf(id)?.phase;
const viewOf = (id: string) =>
  Object.values(getSnapshot().byPosition)
    .flat()
    .find(view => view.id === id);
// Text queries for a toast skip the hidden announcement copy in the live regions (§17.1).
const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (text: string) => screen.getByText(text, inToasts).closest('li') as HTMLLIElement;
const classesOf = (element: Element | null) =>
  [...(element?.children ?? [])].map(child => child.className);
const closeButtons = () => screen.queryAllByRole('button', { name: 'Close notification' });

/** Runs whatever is due now: the lifecycle fallbacks scheduled by the last render. */
const flush = () =>
  act(() => {
    vi.advanceTimersByTime(0);
  });

/** Lets the deferred (microtask) Toaster detach run, inside act. */
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

/** Shows a toast and lets its enter complete. */
function showVisible(content: ReactNode, options: ToastOptions & { id: string }): void {
  show(content, options);
  flush();
  expect(phaseOf(options.id)).toBe('visible');
}

let warn: MockInstance<typeof console.warn>;
const persistentWarnings = () =>
  warn.mock.calls.filter(([message]) => String(message).includes('persistent toast'));

beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('normal toasts (§17.2, §21)', () => {
  it('renders icon, content, action and close button in order, with stable ret- classes', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Saved', { id: 's', description: 'All changes' });
      toast.success('Done', {
        id: 'd',
        description: 'Details',
        action: { label: 'Undo', onClick: () => undefined },
      });
    });
    const item = itemOf('Done');
    expect(classesOf(item)).toEqual([
      'ret-toast__icon',
      'ret-toast__content',
      'ret-toast__action',
      'ret-toast__close',
    ]);
    expect(classesOf(item.querySelector('.ret-toast__content'))).toEqual([
      'ret-toast__title',
      'ret-toast__description',
    ]);
    expect(item.querySelector('.ret-toast__title')).toHaveTextContent('Done');
    expect(item.querySelector('.ret-toast__description')).toHaveTextContent('Details');
    expect(classesOf(itemOf('Saved'))).toEqual([
      'ret-toast__icon',
      'ret-toast__content',
      'ret-toast__close',
    ]);
  });

  it('renders React node content and description as given, and omits an absent description', () => {
    render(<Toaster />);
    show(<em>Rich</em>, { id: 'rich', description: <strong>Bold detail</strong> });
    show('Plain', { id: 'plain' });
    const rich = itemOf('Rich');
    expect(rich.querySelector('.ret-toast__title > em')).toHaveTextContent('Rich');
    expect(rich.querySelector('.ret-toast__description > strong')).toHaveTextContent('Bold detail');
    expect(itemOf('Plain').querySelector('.ret-toast__description')).toBeNull();
  });

  it('gives each semantic type a distinct built-in icon, and neutral toasts none', () => {
    render(<Toaster maxVisible={10} />);
    act(() => {
      toast.success('success', { id: 'success' });
      toast.error('error', { id: 'error' });
      toast.warning('warning', { id: 'warning' });
      toast.info('info', { id: 'info' });
      toast.loading('loading', { id: 'loading' });
      toast('neutral', { id: 'neutral' });
    });
    const shapes = ['success', 'error', 'warning', 'info', 'loading'].map(type => {
      const svg = itemOf(type).querySelector('.ret-toast__icon > svg');
      expect(svg).not.toBeNull();
      return svg?.innerHTML;
    });
    expect(new Set(shapes).size).toBe(5);
    expect(itemOf('neutral').querySelector('.ret-toast__icon')).toBeNull();
  });

  it('lets an explicit icon replace the type icon, and null remove it', () => {
    render(<Toaster />);
    act(() => {
      toast.success('mine', { id: 'mine', icon: <b data-testid="own-icon">★</b> });
      toast.success('none', { id: 'none', icon: null });
    });
    const slot = itemOf('mine').querySelector('.ret-toast__icon');
    expect(slot?.children).toHaveLength(1);
    expect(slot?.firstElementChild).toBe(screen.getByTestId('own-icon'));
    expect(slot?.querySelector('svg')).toBeNull();
    expect(itemOf('none').querySelector('.ret-toast__icon')).toBeNull();
  });
});

describe('icon and control accessibility (§17.2, D-19)', () => {
  it('hides every icon from assistive technology, built-in or explicit', () => {
    render(<Toaster />);
    act(() => {
      toast.success('built-in', { id: 'b' });
      toast.info('explicit', {
        id: 'e',
        icon: (
          <span role="img" aria-label="Rocket">
            🚀
          </span>
        ),
      });
    });
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(3);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    }
    for (const slot of document.querySelectorAll('.ret-toast__icon')) {
      expect(slot).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('uses native buttons named by their label and "Close notification", and no later P-16 semantics', () => {
    render(<Toaster />);
    show('Saved', { id: 's', action: { label: <span>Undo</span>, onClick: () => undefined } });
    const action = screen.getByRole('button', { name: 'Undo' });
    const [close] = closeButtons();
    for (const button of [action, close]) {
      expect(button?.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('type', 'button');
    }
    expect(action).toHaveClass('ret-toast__action', { exact: true });
    expect(close).toHaveClass('ret-toast__close', { exact: true });
    expect(
      document.querySelectorAll('[role="alert"], [aria-keyshortcuts], [inert], [tabindex]')
    ).toHaveLength(0);
    // The toast is not a live region; only the Toaster's two persistent regions are (§17.1).
    expect(itemOf('Saved').closest('[aria-live]')).toBeNull();
    expect(itemOf('Saved').querySelector('[aria-live]')).toBeNull();
  });
});

describe('close button default (§6.3, §6.5)', () => {
  it.each<[string, ToastOptions['closeButton'], ToasterProps['closeButton'], boolean]>([
    ['on by default', undefined, undefined, true],
    ['off by the Toaster', undefined, false, false],
    ['on by the toast over the Toaster', true, false, true],
    ['off by the toast over the Toaster', false, true, false],
  ])('normal toast: %s', (_name, own, toasterDefault, shown) => {
    render(<Toaster closeButton={toasterDefault} />);
    show('t', { id: 't', ...(own !== undefined && { closeButton: own }) });
    expect(closeButtons()).toHaveLength(shown ? 1 : 0);
  });

  it('follows a runtime Toaster change for toasts that left it out, without a new definition', () => {
    const { rerender } = render(<Toaster />);
    act(() => {
      toast('implicit', { id: 'implicit' });
      toast('own on', { id: 'on', closeButton: true });
      toast('own off', { id: 'off', closeButton: false });
      toast.custom(<div>custom on</div>, { id: 'custom', closeButton: true });
    });
    const views = ['implicit', 'on', 'off', 'custom'].map(viewOf);
    const hasClose = (text: string) => itemOf(text).querySelector('.ret-toast__close') !== null;
    const state = () => ['implicit', 'own on', 'own off', 'custom on'].map(hasClose);

    expect(state()).toEqual([true, true, false, true]);
    rerender(<Toaster closeButton={false} />);
    expect(state()).toEqual([false, true, false, true]);
    rerender(<Toaster closeButton />);
    expect(state()).toEqual([true, true, false, true]);
    expect(['implicit', 'on', 'off', 'custom'].map(viewOf)).toEqual(views);
    expect(recordOf('implicit')?.revision).toBe(0);
  });

  it('treats a non-boolean Toaster value as omitted', () => {
    render(<Toaster closeButton={'no' as never} />);
    show('t', { id: 't' });
    expect(closeButtons()).toHaveLength(1);
  });
});

describe('custom toasts (§6.4)', () => {
  it('render only their content: no icon, description, action, progress or close button', () => {
    render(<Toaster closeButton progress />);
    act(() => {
      toast.custom(<div className="banner">Custom</div>, { id: 'c' });
    });
    expect(itemOf('Custom').innerHTML).toBe('<div class="banner">Custom</div>');
  });

  it('ignore chrome options smuggled past the types', () => {
    render(<Toaster />);
    act(() => {
      toast.custom(<div>Custom</div>, {
        id: 'c',
        description: 'd',
        icon: <b>i</b>,
        action: { label: 'Act', onClick: () => undefined },
        progress: true,
      } as never);
    });
    expect(itemOf('Custom').innerHTML).toBe('<div>Custom</div>');
  });

  it.each<[string, boolean | undefined, boolean | undefined, boolean]>([
    ['no close button by default, even with the Toaster on', undefined, true, false],
    ['no close button when off, even with the Toaster on', false, true, false],
    ['the close button when asked for, even with the Toaster off', true, false, true],
  ])('%s', (_name, own, toasterDefault, shown) => {
    render(<Toaster closeButton={toasterDefault} />);
    act(() => {
      toast.custom(<div>Custom</div>, { id: 'c', ...(own !== undefined && { closeButton: own }) });
    });
    const item = itemOf('Custom');
    expect(closeButtons()).toHaveLength(shown ? 1 : 0);
    expect(classesOf(item)).toEqual(shown ? ['', 'ret-toast__close'] : ['']);
  });

  it('re-key their content by revision, keeping the toast element', () => {
    render(<Toaster />);
    act(() => {
      toast.custom(<div>first</div>, { id: 'c', closeButton: true });
    });
    const item = itemOf('first');
    const content = item.firstElementChild;
    const close = item.querySelector('.ret-toast__close');
    act(() => {
      toast.custom(<div>first</div>, { id: 'c', closeButton: true });
    });
    expect(itemOf('first')).toBe(item);
    expect(item.firstElementChild).not.toBe(content);
    expect(item.querySelector('.ret-toast__close')).toBe(close);
  });
});

describe('progress (§6.3, P-20 boundary)', () => {
  it('renders no progress indicator yet, whether progress is on by the toast or the Toaster', () => {
    const { rerender } = render(<Toaster progress />);
    show('by Toaster', { id: 'a' });
    show('by toast', { id: 'b', progress: true });
    rerender(<Toaster progress={false} />);
    rerender(<Toaster progress />);
    for (const text of ['by Toaster', 'by toast']) {
      const item = itemOf(text);
      expect(classesOf(item)).toEqual(['ret-toast__content', 'ret-toast__close']);
      expect(item.querySelector('[class*="progress"], [role="progressbar"], progress')).toBeNull();
    }
  });
});

describe('render-side defaults (§6.3, §6.4)', () => {
  const normal = (options: ToastView['options'] = {}) => ({ custom: false, options });
  const custom = (options: ToastView['options'] = { closeButton: false }) => ({
    custom: true,
    options,
  });

  it('resolve the close button: toast, then Toaster, then on; custom only when asked', () => {
    expect(resolveCloseButton(normal(), undefined)).toBe(true);
    expect(resolveCloseButton(normal(), false)).toBe(false);
    expect(resolveCloseButton(normal(), 'no')).toBe(true);
    expect(resolveCloseButton(normal({ closeButton: true }), false)).toBe(true);
    expect(resolveCloseButton(normal({ closeButton: false }), true)).toBe(false);
    expect(resolveCloseButton(custom(), true)).toBe(false);
    expect(resolveCloseButton(custom({}), true)).toBe(false);
    expect(resolveCloseButton(custom({ closeButton: true }), false)).toBe(true);
  });

  it('resolve progress: toast, then Toaster, then off; never for custom', () => {
    expect(resolveProgress(normal(), undefined)).toBe(false);
    expect(resolveProgress(normal(), true)).toBe(true);
    expect(resolveProgress(normal(), 'yes')).toBe(false);
    expect(resolveProgress(normal({ progress: false }), true)).toBe(false);
    expect(resolveProgress(normal({ progress: true }), false)).toBe(true);
    expect(resolveProgress(custom({ closeButton: false, progress: true }), true)).toBe(false);
  });
});

describe('the action (§15)', () => {
  it('calls onClick with the click, then dismisses with reason action', () => {
    const onDismiss = vi.fn();
    let seen: { target: EventTarget; phase: string | undefined } | undefined;
    const onClick = vi.fn((event: MouseEvent<HTMLButtonElement>) => {
      seen = { target: event.currentTarget, phase: phaseOf('t') };
    });
    render(<Toaster />);
    showVisible('t', { id: 't', onDismiss, action: { label: 'Undo', onClick } });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toMatchObject({ type: 'click' });
    // The handler saw its button, and ran before the dismissal.
    expect(seen).toEqual({
      target: screen.getByRole('button', { name: 'Undo' }),
      phase: 'visible',
    });
    expect(recordOf('t')).toMatchObject({ phase: 'exiting', exit: { reason: 'action' } });
    flush();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), 'action');
  });

  it('keeps the toast when onClick calls preventDefault', () => {
    const onDismiss = vi.fn();
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<Toaster />);
    showVisible('t', { id: 't', onDismiss, action: { label: 'Undo', onClick } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    flush();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(phaseOf('t')).toBe('visible');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not catch an exception from onClick, and does not dismiss', () => {
    const onDismiss = vi.fn();
    const boom = new Error('boom');
    render(<Toaster />);
    showVisible('t', {
      id: 't',
      onDismiss,
      action: {
        label: 'Undo',
        onClick: () => {
          throw boom;
        },
      },
    });
    // Uncaught, the error reaches the window as an error event, as any handler error would.
    // Only this test's report is silenced, and only for this click.
    const reported: unknown[] = [];
    const capture = (event: ErrorEvent) => {
      reported.push(event.error);
      event.preventDefault();
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.addEventListener('error', capture);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    } finally {
      window.removeEventListener('error', capture);
      error.mockRestore();
    }
    expect(reported).toContain(boom);
    expect(phaseOf('t')).toBe('visible');
    flush();
    expect(phaseOf('t')).toBe('visible');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses by ID: a replacement made by onClick is dismissed too, unless prevented', () => {
    const reasons: [string, DismissReason][] = [];
    const replaceSelf = (id: string, prevent: boolean) => ({
      label: `Retry ${id}`,
      onClick: (event: { preventDefault: () => void }) => {
        toast(`${id} replaced`, {
          id,
          onDismiss: (snapshot, reason) => reasons.push([snapshot.content as string, reason]),
        });
        if (prevent) event.preventDefault();
      },
    });
    render(<Toaster />);
    showVisible('a', { id: 'a', action: replaceSelf('a', false) });
    showVisible('b', { id: 'b', action: replaceSelf('b', true) });

    fireEvent.click(screen.getByRole('button', { name: 'Retry a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry b' }));
    expect(recordOf('a')).toMatchObject({
      revision: 1,
      phase: 'exiting',
      exit: { reason: 'action' },
    });
    expect(recordOf('b')).toMatchObject({ revision: 1, phase: 'visible' });
    flush();
    expect(recordOf('a')).toBeUndefined();
    expect(reasons).toEqual([['a replaced', 'action']]);
    expect(screen.getByText('b replaced', inToasts)).toBeInTheDocument();
  });

  it('does nothing while the toast is exiting', () => {
    const onClick = vi.fn();
    render(<Toaster />);
    showVisible('t', { id: 't', action: { label: 'Undo', onClick } });
    act(() => dismiss('t'));
    expect(itemOf('t')).toHaveAttribute('data-phase', 'exiting');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('the close button (§16)', () => {
  it('dismisses with reason close-button; onDismiss fires once', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    showVisible('t', { id: 't', onDismiss });
    fireEvent.click(closeButtons()[0] as HTMLElement);
    expect(recordOf('t')).toMatchObject({ phase: 'exiting', exit: { reason: 'close-button' } });
    fireEvent.click(closeButtons()[0] as HTMLElement);
    flush();
    expect(recordOf('t')).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), 'close-button');
  });

  it('D-17: clicking anywhere else on the toast does nothing', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.success('Body', { id: 'b', description: 'More', onDismiss });
    });
    flush();
    const item = itemOf('Body');
    for (const target of [
      item,
      item.querySelector('.ret-toast__icon'),
      item.querySelector('.ret-toast__title'),
      item.querySelector('.ret-toast__description'),
    ]) {
      fireEvent.click(target as Element);
    }
    flush();
    expect(phaseOf('b')).toBe('visible');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('cannot dismiss an exiting toast, so a relocation is not turned into a removal', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    showVisible('t', { id: 't', position: 'top-right' });
    show('t', { id: 't', position: 'bottom-left', onDismiss });
    expect(recordOf('t')).toMatchObject({ phase: 'exiting', exit: { reason: 'relocate' } });
    fireEvent.click(closeButtons()[0] as HTMLElement);
    expect(recordOf('t')?.exit).toMatchObject({ reason: 'relocate' });
    flush();
    expect(recordOf('t')).toMatchObject({ position: 'bottom-left' });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('lifecycle fallbacks (§9 rule 3)', () => {
  it('completes an enter, then an exit, after a 0 ms timeout each', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    show('t', { id: 't', onDismiss });
    expect(itemOf('t')).toHaveAttribute('data-phase', 'entering');
    // The enter fallback, and the retention timer of the toast's announcement (§17.1).
    expect(vi.getTimerCount()).toBe(2);
    flush();
    expect(phaseOf('t')).toBe('visible');
    expect(itemOf('t')).toHaveAttribute('data-phase', 'visible');

    act(() => dismiss('t'));
    expect(itemOf('t')).toHaveAttribute('data-phase', 'exiting');
    flush();
    expect(recordOf('t')).toBeUndefined();
    // The toast is gone; its announcement stays for its own retention period.
    expect(screen.queryByText('t', inToasts)).toBeNull();
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), 'programmatic');
  });

  it('starts the timer only once the fallback makes the toast visible', () => {
    const onAutoClose = vi.fn();
    const onDismiss = vi.fn();
    render(<Toaster />);
    show('t', { id: 't', duration: 1000, onAutoClose, onDismiss });
    expect(recordOf('t')?.timer.runningSince).toBeNull();
    flush();
    expect(recordOf('t')).toMatchObject({ phase: 'visible', timer: { remaining: 1000 } });
    expect(recordOf('t')?.timer.runningSince).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(phaseOf('t')).toBe('visible');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(recordOf('t')).toMatchObject({ phase: 'exiting', exit: { reason: 'timeout' } });
    expect(onAutoClose).toHaveBeenCalledTimes(1);
    flush();
    expect(recordOf('t')).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), 'timeout');
  });

  it('frees a slot on exit and lets the next toast enter, all through fallbacks', () => {
    render(<Toaster maxVisible={1} />);
    show('A', { id: 'A' });
    show('B', { id: 'B' });
    expect(phaseOf('B')).toBe('queued');
    expect(screen.queryByText('B')).toBeNull();
    flush();
    expect(phaseOf('A')).toBe('visible');
    expect(phaseOf('B')).toBe('queued');

    act(() => dismiss('A'));
    expect(itemOf('A')).toHaveAttribute('data-phase', 'exiting');
    expect(phaseOf('B')).toBe('queued');
    flush();
    expect(recordOf('A')).toBeUndefined();
    expect(screen.queryByText('A', inToasts)).toBeNull();
    expect(itemOf('B')).toHaveAttribute('data-phase', 'entering');
    flush();
    expect(phaseOf('B')).toBe('visible');
    expect(itemOf('B')).toHaveAttribute('data-phase', 'visible');
  });

  it('keeps one pending fallback per toast, cancelling it when the phase changes or on unmount', async () => {
    const { unmount } = render(<Toaster />);
    // Each count is one lifecycle fallback plus the retention timer of each announcement (§17.1).
    show('t', { id: 't' });
    expect(vi.getTimerCount()).toBe(1 + 1);
    act(() => dismiss('t'));
    expect(vi.getTimerCount()).toBe(1 + 1);
    show('t', { id: 't' });
    expect(phaseOf('t')).toBe('entering');
    expect(vi.getTimerCount()).toBe(1 + 2);
    // Unmounting cancels the fallback and the pending announcements alike.
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await settle();
    expect(phaseOf('t')).toBe('queued');
  });

  it('completes the current state when an entering toast is replaced in place', () => {
    render(<Toaster />);
    show('first', { id: 't' });
    show('second', { id: 't' });
    flush();
    expect(recordOf('t')).toMatchObject({ phase: 'visible', revision: 1 });
    expect(itemOf('second')).toHaveAttribute('data-phase', 'visible');
  });

  it('does not remove a toast revived before its exit fallback ran', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    showVisible('t', { id: 't', onDismiss });
    act(() => dismiss('t'));
    show('revived', { id: 't', onDismiss });
    expect(phaseOf('t')).toBe('entering');
    flush();
    expect(recordOf('t')).toMatchObject({ phase: 'visible', revision: 1 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('leaves toasts queued when the Toaster detaches before a fallback, and resumes on remount', async () => {
    const first = render(<Toaster />);
    show('t', { id: 't' });
    first.unmount();
    await settle();
    flush();
    expect(phaseOf('t')).toBe('queued');

    render(<Toaster />);
    expect(phaseOf('t')).toBe('entering');
    flush();
    expect(phaseOf('t')).toBe('visible');
  });

  it('reports each transition once under StrictMode', () => {
    const onDismiss = vi.fn();
    const phases: string[] = [];
    subscribe(() => phases.push(snapshotPhase(getSnapshot())));
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    show('t', { id: 't', onDismiss });
    // One fallback and one announcement retention timer, however often effects replay.
    expect(vi.getTimerCount()).toBe(2);
    flush();
    act(() => dismiss('t'));
    expect(vi.getTimerCount()).toBe(2);
    flush();
    // The first notification is the Toaster attaching, before the toast exists.
    expect(phases).toEqual(['none', 'entering', 'visible', 'exiting', 'none']);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

function snapshotPhase(snapshot: StoreSnapshot): string {
  return snapshot.byPosition['top-right'][0]?.phase ?? 'none';
}

describe('inaccessible persistent toasts (§17.2)', () => {
  it('warns once for a persistent normal toast with no close button and no action', () => {
    render(<Toaster />);
    show('stuck', { id: 'stuck', duration: Infinity, closeButton: false });
    expect(persistentWarnings()).toHaveLength(1);
    expect(String(persistentWarnings()[0]?.[0])).toMatch(/close button.*action/);
  });

  it('counts loading toasts and a Toaster duration of Infinity as persistent', () => {
    render(<Toaster duration={Infinity} closeButton={false} />);
    act(() => {
      toast.loading('loading', { id: 'loading' });
    });
    expect(persistentWarnings()).toHaveLength(1);
    show('by default', { id: 'default' });
    expect(persistentWarnings()).toHaveLength(2);
  });

  it.each<[string, () => void]>([
    ['a finite toast', () => show('t', { id: 't', closeButton: false })],
    ['a toast with a close button', () => show('t', { id: 't', duration: Infinity })],
    [
      'a toast with an action',
      () =>
        show('t', {
          id: 't',
          duration: Infinity,
          closeButton: false,
          action: { label: 'Undo', onClick: () => undefined },
        }),
    ],
    [
      'a custom toast',
      () =>
        act(() => {
          toast.custom(<div>c</div>, { id: 'c', duration: Infinity });
        }),
    ],
  ])('does not warn for %s', (_name, create) => {
    render(<Toaster />);
    create();
    flush();
    expect(persistentWarnings()).toHaveLength(0);
  });

  it('decides by what is rendered: not at creation, and again when a Toaster default changes', () => {
    toast('stuck', { id: 'stuck', duration: Infinity });
    expect(persistentWarnings()).toHaveLength(0);
    const { rerender } = render(<Toaster />);
    expect(persistentWarnings()).toHaveLength(0);
    rerender(<Toaster closeButton={false} />);
    expect(persistentWarnings()).toHaveLength(1);
    rerender(<Toaster />);
    rerender(<Toaster closeButton={false} />);
    expect(persistentWarnings()).toHaveLength(1);

    resetWarnings();
    rerender(<Toaster />);
    rerender(<Toaster closeButton={false} />);
    expect(persistentWarnings()).toHaveLength(2);
  });

  it('warns once per definition under StrictMode, and once more for a replacement', () => {
    render(
      <StrictMode>
        <Toaster closeButton={false} />
      </StrictMode>
    );
    show('stuck', { id: 'stuck', duration: Infinity });
    flush();
    expect(persistentWarnings()).toHaveLength(1);
    show('still stuck', { id: 'stuck', duration: Infinity });
    flush();
    expect(persistentWarnings()).toHaveLength(2);
  });

  it('logs nothing in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<Toaster closeButton={false} />);
    show('stuck', { id: 'stuck', duration: Infinity });
    expect(persistentWarnings()).toHaveLength(0);
  });
});

// `inert` is owned by the item, not rendered by React, so these tests also check that no render
// removes it and that revival does. jsdom stores the attribute but enforces nothing: it neither
// blocks focus or clicks nor moves focus out. Real browsers are checked in P-22.
describe('inert exiting toasts (§9 rule 4)', () => {
  it('is inert exactly while exiting: not entering or visible, from the dismissal until removal', () => {
    render(<Toaster />);
    show('t', { id: 't' });
    const item = itemOf('t');
    expect(item).toHaveAttribute('data-phase', 'entering');
    expect(item).not.toHaveAttribute('inert');
    flush();
    expect(item).toHaveAttribute('data-phase', 'visible');
    expect(item).not.toHaveAttribute('inert');

    // Within the dismissal's own commit, with no fallback run.
    act(() => dismiss('t'));
    expect(item).toHaveAttribute('data-phase', 'exiting');
    expect(item).toHaveAttribute('inert');
    flush();
    expect(recordOf('t')).toBeUndefined();
    expect(item.isConnected).toBe(false);
  });

  it('is inert when the timer expires', () => {
    render(<Toaster />);
    showVisible('t', { id: 't', duration: 1000 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(recordOf('t')).toMatchObject({ phase: 'exiting', exit: { reason: 'timeout' } });
    expect(itemOf('t')).toHaveAttribute('inert');
  });

  it('is inert from the first commit when dismissed before it was ever rendered', () => {
    render(<Toaster />);
    act(() => {
      toast('t', { id: 't' });
      dismiss('t');
    });
    expect(itemOf('t')).toHaveAttribute('data-phase', 'exiting');
    expect(itemOf('t')).toHaveAttribute('inert');
  });

  it('is not removed by an unrelated render while the toast stays exiting', () => {
    const { rerender } = render(<Toaster />);
    showVisible('t', { id: 't' });
    act(() => dismiss('t'));
    const item = itemOf('t');
    // A new close label re-renders the item, and React rewrites the attributes it owns.
    rerender(<Toaster labels={{ close: 'Dismiss' }} />);
    expect(screen.getByRole('button', { name: 'Dismiss', hidden: true }).closest('li')).toBe(item);
    expect(item).toHaveAttribute('data-phase', 'exiting');
    expect(item).toHaveAttribute('inert');
  });

  it('makes the old node inert on a relocation, and mounts the destination without it', () => {
    render(<Toaster />);
    showVisible('t', { id: 't', position: 'top-right' });
    const old = itemOf('t');
    show('t', { id: 't', position: 'bottom-left' });
    expect(itemOf('t')).toBe(old);
    expect(old).toHaveAttribute('data-phase', 'exiting');
    expect(old).toHaveAttribute('inert');

    flush();
    const moved = itemOf('t');
    expect(old.isConnected).toBe(false);
    expect(moved).not.toBe(old);
    expect(moved).toHaveAttribute('data-position', 'bottom-left');
    expect(moved).toHaveAttribute('data-phase', 'entering');
    expect(moved).not.toHaveAttribute('inert');
  });

  it('keeps an exiting toast inert when it is replaced at another position', () => {
    render(<Toaster />);
    showVisible('t', { id: 't', position: 'top-right' });
    act(() => dismiss('t'));
    const item = itemOf('t');
    show('again', { id: 't', position: 'bottom-left' });
    expect(recordOf('t')).toMatchObject({ phase: 'exiting', exit: { reason: 'relocate' } });
    expect(itemOf('again')).toBe(item);
    expect(item).toHaveAttribute('inert');
  });

  it('removes inert from the same node on revival', () => {
    render(<Toaster />);
    showVisible('t', { id: 't' });
    act(() => dismiss('t'));
    const item = itemOf('t');
    expect(item).toHaveAttribute('inert');

    show('revived', { id: 't' });
    expect(itemOf('revived')).toBe(item);
    expect(item).toHaveAttribute('data-phase', 'entering');
    expect(item).not.toHaveAttribute('inert');
    flush();
    expect(item).toHaveAttribute('data-phase', 'visible');
    expect(item).not.toHaveAttribute('inert');
  });

  it('never makes a toast inert for an in-place replacement, normal or custom, on the same node', () => {
    render(<Toaster />);
    show('first', { id: 't' });
    const item = itemOf('first');
    // While entering.
    show('second', { id: 't' });
    expect(itemOf('second')).toBe(item);
    expect(item).toHaveAttribute('data-phase', 'entering');
    expect(item).not.toHaveAttribute('inert');
    flush();
    // While visible: normal → custom → normal.
    act(() => {
      toast.custom(<span>custom</span>, { id: 't' });
    });
    expect(itemOf('custom')).toBe(item);
    expect(item).toHaveClass('ret-toast--custom');
    expect(item).not.toHaveAttribute('inert');
    show('normal', { id: 't' });
    expect(itemOf('normal')).toBe(item);
    expect(item).not.toHaveAttribute('inert');
    expect(phaseOf('t')).toBe('visible');
  });

  it('applies and removes inert under StrictMode', () => {
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    showVisible('t', { id: 't' });
    const item = itemOf('t');
    expect(item).not.toHaveAttribute('inert');
    act(() => dismiss('t'));
    expect(item).toHaveAttribute('inert');
    show('revived', { id: 't' });
    expect(itemOf('revived')).toBe(item);
    expect(item).not.toHaveAttribute('inert');
    act(() => dismiss('t'));
    expect(item).toHaveAttribute('inert');
    flush();
    expect(recordOf('t')).toBeUndefined();
  });

  it('applies inert when the Toaster is mounted in a shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<Toaster />));
      showVisible('t', { id: 't' });
      const item = shadow.querySelector('li') as HTMLLIElement;
      expect(item).not.toHaveAttribute('inert');
      act(() => dismiss('t'));
      expect(item).toHaveAttribute('inert');
      show('revived', { id: 't' });
      expect(item).not.toHaveAttribute('inert');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it('moves no focus itself (focus restoration is a later P-16 slice)', () => {
    // This pins only that making a toast inert does not move focus on its own. jsdom keeps focus
    // inside an inert subtree, which real browsers do not; that is not the behaviour wanted. Focus
    // restoration (§18) will replace this with focus moving before the toast becomes inert.
    render(<Toaster />);
    showVisible('t', { id: 't' });
    const close = closeButtons()[0] as HTMLButtonElement;
    act(() => close.focus());
    expect(document.activeElement).toBe(close);
    act(() => dismiss('t'));
    expect(itemOf('t')).toHaveAttribute('inert');
    expect(document.activeElement).toBe(close);
  });
});
