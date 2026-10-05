// Announcements (§17.1, P-16): the two persistent live regions, politeness by type, prefixes, the
// text taken from the rendered toast, and one announcement per rendered revision, whatever the
// re-renders, StrictMode replay, relocations and Toaster takeovers. Each announcement is its own
// transient node, removed after the retention period. Every write to a live region is recorded
// from a MutationObserver, so "no write" means no DOM change at all.
import { act, render } from '@testing-library/react';
import { StrictMode, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '../index';
import { ANNOUNCEMENT_RETENTION_MS } from '../react/announcer';
import { inspectRecords } from '../store/store';
import type { CustomToastOptions, ToastOptions, ToastType } from '../types';

/** One live-region write: the region's politeness and the text added. */
type Write = `${'polite' | 'assertive'}: ${string}`;

let observer: MutationObserver;
let writes: Write[] = [];
let removals = 0;

function collect(records: MutationRecord[]): void {
  for (const record of records) {
    const region = record.target as Element;
    if (record.type !== 'childList' || !region.matches('[aria-live]')) continue;
    for (const node of record.addedNodes) {
      writes.push(`${region.getAttribute('aria-live') as 'polite'}: ${node.textContent ?? ''}`);
    }
    removals += record.removedNodes.length;
  }
}

/** The live-region writes since the last call, oldest first. */
function written(): Write[] {
  collect(observer.takeRecords());
  const result = writes;
  writes = [];
  return result;
}

const liveRegions = () => [...document.querySelectorAll('section > [aria-live]')];
const regionText = (politeness: 'polite' | 'assertive') =>
  [...(document.querySelector(`section > [aria-live="${politeness}"]`)?.childNodes ?? [])].map(
    node => node.textContent
  );

/** Renders under StrictMode, so every effect is replayed once on mount. */
function mount(ui: ReactElement = <Toaster />) {
  return render(<StrictMode>{ui}</StrictMode>);
}

function show(content: ReactNode, options: ToastOptions & { id: string }, type?: ToastType): void {
  act(() => {
    if (type === 'custom') toast.custom(content, options as CustomToastOptions);
    else if (type && type !== 'default') toast[type](content, options);
    else toast(content, options);
  });
}

/** Runs the lifecycle fallbacks that are due (§9 rule 3). */
const flush = () =>
  act(() => {
    vi.advanceTimersByTime(0);
  });

/** Advances the clock, inside act. */
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** The message nodes now in a region. */
const nodesIn = (politeness: 'polite' | 'assertive') => [
  ...(document.querySelector(`section > [aria-live="${politeness}"]`)?.childNodes ?? []),
];

/** Asserts the region holds exactly these nodes, by identity: equal-looking nodes do not count. */
function expectNodes(politeness: 'polite' | 'assertive', expected: readonly ChildNode[]): void {
  const actual = nodesIn(politeness);
  expect(actual).toHaveLength(expected.length);
  actual.forEach((node, index) => expect(node).toBe(expected[index]));
}

/** Lets the deferred (microtask) Toaster detach run, inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  writes = [];
  removals = 0;
  observer = new MutationObserver(collect);
  observer.observe(document.body, { childList: true, subtree: true });
});

afterEach(() => {
  observer.disconnect();
});

describe('the live regions (§17.1, D-18)', () => {
  it('D-18: exist, empty and persistent, before any toast, and are the only live regions', () => {
    mount();
    const regions = liveRegions();
    expect(regions.map(region => region.getAttribute('aria-live'))).toEqual([
      'polite',
      'assertive',
    ]);
    const [polite, assertive] = regions;
    expect(polite).toHaveAttribute('role', 'status');
    expect(assertive).not.toHaveAttribute('role');
    for (const region of regions) {
      expect(region).toHaveAttribute('aria-atomic', 'false');
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveStyle({ position: 'absolute', width: '1px', height: '1px' });
      expect(region.getAttribute('style')).toContain('clip-path: inset(50%)');
    }
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);

    show('Saved', { id: 's' });
    flush();
    // The same nodes, never recreated per toast.
    expect(liveRegions()).toEqual(regions);
    expect(document.querySelectorAll('li [aria-live], li[aria-live], ol[aria-live]')).toHaveLength(
      0
    );
  });

  it('render nothing for a waiting Toaster, which never announces', () => {
    const { container } = mount(
      <>
        <div data-testid="first">
          <Toaster />
        </div>
        <div data-testid="second">
          <Toaster />
        </div>
      </>
    );
    show('Saved', { id: 's' });
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(liveRegions()).toHaveLength(2);
    expect(written()).toEqual(['polite: Saved']);
  });
});

describe('politeness and prefixes (§17.1)', () => {
  it.each<[ToastType, Write]>([
    ['default', 'polite: Message'],
    ['success', 'polite: Message'],
    ['info', 'polite: Message'],
    ['loading', 'polite: Message'],
    ['custom', 'polite: Message'],
    ['warning', 'polite: Warning: Message'],
    ['error', 'assertive: Error: Message'],
  ])('%s toasts: %s', (type, expected) => {
    mount();
    show('Message', { id: 't' }, type);
    expect(written()).toEqual([expected]);
  });

  it('uses the prefixes from labels, exactly as given', () => {
    mount(<Toaster labels={{ warningPrefix: 'Attention :', errorPrefix: 'Erreur :' }} />);
    show('Disk almost full', { id: 'w' }, 'warning');
    show('Upload failed', { id: 'e' }, 'error');
    show('Saved', { id: 's' }, 'success');
    expect(written()).toEqual([
      'polite: Attention : Disk almost full',
      'assertive: Erreur : Upload failed',
      'polite: Saved',
    ]);
  });

  it('keeps the default prefixes for invalid labels', () => {
    mount(<Toaster labels={{ warningPrefix: '', errorPrefix: 7 as never }} />);
    show('w', { id: 'w' }, 'warning');
    show('e', { id: 'e' }, 'error');
    expect(written()).toEqual(['polite: Warning: w', 'assertive: Error: e']);
  });
});

describe('the announcement text (§17.1)', () => {
  it('is the rendered content and description, without icon, action or close button', () => {
    mount();
    show(
      <span>
        Saved <strong>3</strong> files
      </span>,
      {
        id: 's',
        description: <em>All changes are stored.</em>,
        action: { label: 'Undo', onClick: () => undefined },
        icon: <span>ICON</span>,
      },
      'success'
    );
    expect(written()).toEqual(['polite: Saved 3 files All changes are stored.']);
  });

  it('is read from the DOM, so it is what the toast actually renders', () => {
    function Count({ n }: { n: number }) {
      return <>{`${n * 2} items`}</>;
    }
    mount();
    show(<Count n={21} />, { id: 'c' });
    expect(written()).toEqual(['polite: 42 items']);
  });

  it('for a custom toast, is its rendered text without the library close button', () => {
    mount(<Toaster labels={{ close: 'Fermer' }} />);
    show(
      <div>
        <p>Sync finished</p>
      </div>,
      { id: 'c', closeButton: true },
      'custom'
    );
    expect(written()).toEqual(['polite: Sync finished']);
  });

  it("for a custom toast, includes the consumer's own controls, whose text is theirs (§17.3)", () => {
    mount();
    show(
      <div>
        Message deleted. <button type="button">Restore</button>
      </div>,
      { id: 'c' },
      'custom'
    );
    expect(written()).toEqual(['polite: Message deleted. Restore']);
  });

  it('announces nothing for a revision with no text, without retrying, and announces the next', () => {
    const { rerender } = mount();
    show(<svg aria-hidden="true" />, { id: 'c' }, 'custom');
    show(<span />, { id: 'w' }, 'warning');
    expect(written()).toEqual([]);
    // Claimed, so later renders do not try again.
    expect(inspectRecords().map(record => record.announcedRevision)).toEqual([0, 0]);
    flush();
    rerender(
      <StrictMode>
        <Toaster className="later" />
      </StrictMode>
    );
    expect(written()).toEqual([]);
    expect(removals).toBe(0);
    show('Now with text', { id: 'w' }, 'warning');
    expect(written()).toEqual(['polite: Warning: Now with text']);
  });
});

describe('one announcement per rendered revision (§17.1)', () => {
  it('announces a toast once when it is rendered, under StrictMode', () => {
    mount();
    show('Saved', { id: 's' });
    expect(written()).toEqual(['polite: Saved']);
    flush();
    expect(written()).toEqual([]);
  });

  it('does not announce a toast made before the Toaster until it renders it', () => {
    act(() => {
      toast('Early', { id: 'early' });
    });
    expect(written()).toEqual([]);
    mount();
    expect(written()).toEqual(['polite: Early']);
  });

  it('does not announce a queued toast, and announces only its latest revision when rendered', () => {
    mount(<Toaster maxVisible={1} />);
    show('A', { id: 'a' });
    show('B 1', { id: 'b' });
    show('B 2', { id: 'b' });
    show('B 3', { id: 'b' }, 'error');
    expect(written()).toEqual(['polite: A']);
    act(() => toast.dismiss('a'));
    flush();
    expect(written()).toEqual(['assertive: Error: B 3']);
  });

  it('announces each replacement of a rendered toast once', () => {
    mount();
    show('Uploading', { id: 'u' }, 'loading');
    flush();
    show('Uploaded', { id: 'u' }, 'success');
    show('Upload failed', { id: 'u' }, 'error');
    flush();
    expect(written()).toEqual([
      'polite: Uploading',
      'polite: Uploaded',
      'assertive: Error: Upload failed',
    ]);
  });

  it('announces a promise settlement as a replacement, an error assertively', async () => {
    mount();
    let resolve!: (value: string) => void;
    let reject!: (reason: unknown) => void;
    act(() => {
      toast.promise(
        new Promise<string>(done => (resolve = done)),
        {
          loading: 'Saving',
          success: name => `Saved ${name}`,
          error: 'Not saved',
        },
        { id: 'ok' }
      );
      toast.promise(
        new Promise<string>((_, fail) => (reject = fail)),
        {
          loading: 'Sending',
          success: 'Sent',
          error: 'Not sent',
        },
        { id: 'fail' }
      );
    });
    // Rendered in one commit: announced in DOM order, newest first at a top position (§12).
    expect(written()).toEqual(['polite: Sending', 'polite: Saving']);
    await act(async () => {
      resolve('report');
      reject(new Error('offline'));
      await Promise.resolve();
    });
    expect(written()).toEqual(['assertive: Error: Not sent', 'polite: Saved report']);
  });

  it('announces a revival, which is a replacement (§14)', () => {
    mount();
    show('Saved', { id: 's' });
    flush();
    act(() => toast.dismiss('s'));
    show('Saved again', { id: 's' });
    expect(written()).toEqual(['polite: Saved', 'polite: Saved again']);
  });

  it('announces a relocation once, as a replacement, and not again when it arrives', () => {
    mount();
    show('Here', { id: 'r' });
    flush();
    show('Over there', { id: 'r', position: 'bottom-left' });
    expect(written()).toEqual(['polite: Here', 'polite: Over there']);
    flush();
    expect(document.querySelector('ol[data-position="bottom-left"] li')).toHaveTextContent(
      'Over there'
    );
    flush();
    expect(written()).toEqual([]);
  });

  it('announces a relocation from the queue once, when it is first rendered', () => {
    mount(<Toaster maxVisible={1} />);
    show('A', { id: 'a' });
    show('B', { id: 'b' });
    show('B moved', { id: 'b', position: 'bottom-left' });
    expect(written()).toEqual(['polite: A', 'polite: B moved']);
    flush();
    expect(written()).toEqual([]);
  });

  it('announces the same text again for a new revision, in a second node', () => {
    mount();
    show('Saved', { id: 's' });
    const [first] = nodesIn('polite');
    show('Saved', { id: 's' });
    expect(written()).toEqual(['polite: Saved', 'polite: Saved']);
    const nodes = nodesIn('polite');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toBe(first);
    expect(nodes[1]).not.toBe(first);
  });

  it('announces nothing, and writes nothing, on re-renders that change no content', () => {
    const { rerender } = mount();
    show('Saved', { id: 's' }, 'warning');
    show('Failed', { id: 'f' }, 'error');
    written();
    removals = 0;
    flush();
    const timers = vi.getTimerCount();
    rerender(
      <StrictMode>
        <Toaster className="other" theme="dark" closeButton={false} />
      </StrictMode>
    );
    // A changed prefix re-runs the announcement effect, whose claim fails: no write at all.
    rerender(
      <StrictMode>
        <Toaster labels={{ warningPrefix: 'Note:', errorPrefix: 'Oops:' }} />
      </StrictMode>
    );
    expect(written()).toEqual([]);
    expect(removals).toBe(0);
    expect(vi.getTimerCount()).toBe(timers);
    expect(regionText('polite')).toEqual(['Warning: Saved']);
    expect(regionText('assertive')).toEqual(['Error: Failed']);
  });
});

describe('Toaster takeover (§8.5)', () => {
  it('does not announce again the toasts a new owner takes over', async () => {
    function App({ first }: { first: boolean }) {
      return (
        <>
          {first && <Toaster />}
          <Toaster />
        </>
      );
    }
    const { rerender } = mount(<App first />);
    show('Saved', { id: 's', duration: Infinity });
    show('Failed', { id: 'f', duration: Infinity }, 'error');
    flush();
    expect(written()).toEqual(['polite: Saved', 'assertive: Error: Failed']);
    expect(vi.getTimerCount()).toBe(2);

    rerender(
      <StrictMode>
        <App first={false} />
      </StrictMode>
    );
    await settle();
    flush();
    expect(document.querySelectorAll('li')).toHaveLength(2);
    expect(written()).toEqual([]);
    expect(regionText('polite')).toEqual([]);
    expect(regionText('assertive')).toEqual([]);
    // The former owner's pending announcements went with it; the new owner has none.
    expect(vi.getTimerCount()).toBe(0);

    // The new owner announces what it is the first to render.
    show('Next', { id: 'n' });
    expect(written()).toEqual(['polite: Next']);
  });
});

describe('transient announcement nodes (§17.1)', () => {
  it('keeps a node for exactly the retention period, then leaves the regions empty and in place', () => {
    mount();
    const regions = liveRegions();
    show('Saved', { id: 's', duration: Infinity });
    flush();
    expect(regionText('polite')).toEqual(['Saved']);
    expect(vi.getTimerCount()).toBe(1);
    advance(ANNOUNCEMENT_RETENTION_MS - 1);
    expect(regionText('polite')).toEqual(['Saved']);
    advance(1);
    expect(regionText('polite')).toEqual([]);
    // Removal is not an announcement.
    expect(written()).toEqual(['polite: Saved']);
    expect(removals).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(liveRegions()).toEqual(regions);
    for (const region of regions) {
      expect(region.isConnected).toBe(true);
      expect(region).toBeEmptyDOMElement();
    }
  });

  it('keeps a node after its toast is removed, until its own expiry', () => {
    mount();
    show('Gone soon', { id: 'g' });
    flush();
    act(() => toast.dismiss('g'));
    flush();
    expect(document.querySelector('li')).toBeNull();
    expect(regionText('polite')).toEqual(['Gone soon']);
    advance(ANNOUNCEMENT_RETENTION_MS);
    expect(regionText('polite')).toEqual([]);
  });

  it('keeps an earlier revision through a replacement, each expiring on its own schedule', () => {
    mount();
    show('Uploading', { id: 'u' }, 'loading');
    advance(2000);
    show('Uploaded', { id: 'u', duration: Infinity }, 'success');
    expect(regionText('polite')).toEqual(['Uploading', 'Uploaded']);
    advance(ANNOUNCEMENT_RETENTION_MS - 2000);
    expect(regionText('polite')).toEqual(['Uploaded']);
    advance(2000);
    expect(regionText('polite')).toEqual([]);
  });

  it('expires two nodes with the same text independently', () => {
    mount();
    show('Saved', { id: 's', duration: Infinity });
    const [first] = nodesIn('polite');
    advance(1000);
    show('Saved', { id: 's', duration: Infinity });
    const [, second] = nodesIn('polite');
    expect(second).not.toBe(first);
    advance(ANNOUNCEMENT_RETENTION_MS - 1000);
    expectNodes('polite', [second as ChildNode]);
    advance(1000);
    expectNodes('polite', []);
  });

  it('lets close announcements coexist in both regions and expire one by one', () => {
    mount();
    show('A', { id: 'a', duration: Infinity });
    advance(1000);
    show('B', { id: 'b', duration: Infinity }, 'error');
    advance(1000);
    show('C', { id: 'c', duration: Infinity }, 'warning');
    expect(regionText('polite')).toEqual(['A', 'Warning: C']);
    expect(regionText('assertive')).toEqual(['Error: B']);
    expect(written()).toEqual(['polite: A', 'assertive: Error: B', 'polite: Warning: C']);

    advance(ANNOUNCEMENT_RETENTION_MS - 2000);
    expect(regionText('polite')).toEqual(['Warning: C']);
    expect(regionText('assertive')).toEqual(['Error: B']);
    advance(1000);
    expect(regionText('polite')).toEqual(['Warning: C']);
    expect(regionText('assertive')).toEqual([]);
    advance(1000);
    expect(regionText('polite')).toEqual([]);
    expect(written()).toEqual([]);
    expect(removals).toBe(3);
  });

  it('keeps a polite node when a replacement is announced assertively', () => {
    mount();
    show('Working', { id: 't' }, 'loading');
    show('Broken', { id: 't' }, 'error');
    expect(regionText('polite')).toEqual(['Working']);
    expect(regionText('assertive')).toEqual(['Error: Broken']);
  });

  it('adds one node and one timer per revision under StrictMode, and none on a relocation arriving', () => {
    mount();
    show('Here', { id: 'r', duration: Infinity });
    flush();
    expect(nodesIn('polite')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    show('There', { id: 'r', position: 'bottom-left', duration: Infinity });
    expect(vi.getTimerCount()).toBe(1 + 2);
    flush();
    flush();
    expect(document.querySelector('ol[data-position="bottom-left"] li')).toHaveTextContent('There');
    // The relocation has arrived: still two announcements and two timers, nothing more.
    expect(nodesIn('polite')).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(2);
    expect(written()).toEqual(['polite: Here', 'polite: There']);
  });

  it('removes every pending node and cancels every timer when the Toaster unmounts', () => {
    const { unmount } = mount();
    show('A', { id: 'a', duration: Infinity });
    show('B', { id: 'b', duration: Infinity }, 'error');
    flush();
    const nodes = [...nodesIn('polite'), ...nodesIn('assertive')];
    expect(nodes).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    for (const node of nodes) expect(node.parentNode).toBeNull();
    written();
    advance(ANNOUNCEMENT_RETENTION_MS * 2);
    expect(written()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the realm (P-15 conventions)', () => {
  it('times announcements with the window the Toaster renders in, not the global one', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const view = frame.contentWindow as Window & typeof globalThis;
    const host = view.document.createElement('div');
    view.document.body.append(host);
    const setTimer = vi.spyOn(view, 'setTimeout');
    const clearTimer = vi.spyOn(view, 'clearTimeout');
    const { unmount } = render(<Toaster />, { container: host });
    show('Framed', { id: 'f', duration: Infinity });

    const region = view.document.querySelector('section > [aria-live="polite"]');
    expect(region?.textContent).toBe('Framed');
    expect(region?.firstChild?.ownerDocument).toBe(view.document);
    // The frame's own timer API. (jsdom implements it on the host's timers, so a spy on the global
    // one cannot tell the two apart; the frame's own spies can.)
    const retention = setTimer.mock.calls.filter(([, ms]) => ms === ANNOUNCEMENT_RETENTION_MS);
    expect(retention).toHaveLength(1);

    const handle: unknown =
      setTimer.mock.results[setTimer.mock.calls.indexOf(retention[0]!)]?.value;
    unmount();
    expect(clearTimer).toHaveBeenCalledWith(handle);
    expect(region?.childNodes).toHaveLength(0);
    frame.remove();
  });
});

describe('a reused ID (S2a carry-forward)', () => {
  it.each([
    ['under StrictMode', true],
    ['without StrictMode', false],
  ])('a removed toast’s item cannot announce for a new toast with its ID, %s', (_name, strict) => {
    if (strict) mount();
    else render(<Toaster />);
    show('First', { id: 'x' });
    flush();
    act(() => toast.dismiss('x'));
    flush();
    expect(inspectRecords()).toEqual([]);
    expect(document.querySelector('li')).toBeNull();
    expect(written()).toEqual(['polite: First']);

    // The new record exists, and anything the old item left pending runs, before React renders
    // the new item: a late claim from the old item would take revision 0 from the new toast.
    act(() => {
      toast('Second', { id: 'x' });
      vi.runOnlyPendingTimers();
    });
    expect(inspectRecords()).toMatchObject([{ id: 'x', revision: 0, announcedRevision: 0 }]);
    flush();
    flush();
    expect(written()).toEqual(['polite: Second']);
    expect(regionText('polite')).toEqual(['Second']);
    expect(document.querySelectorAll('li')).toHaveLength(1);
  });

  it('lets the old toast’s timer remove only its own node, and the new one stay until its own', () => {
    mount();
    show('First', { id: 'x', duration: Infinity });
    flush();
    act(() => toast.dismiss('x'));
    flush();
    advance(3000);
    show('Second', { id: 'x', duration: Infinity });
    const [first, second] = nodesIn('polite');
    expect(first).toHaveTextContent('First');
    expect(second).toHaveTextContent('Second');

    advance(ANNOUNCEMENT_RETENTION_MS - 3000);
    expectNodes('polite', [second as ChildNode]);
    advance(3000 - 1);
    expectNodes('polite', [second as ChildNode]);
    advance(1);
    expectNodes('polite', []);
  });
});
