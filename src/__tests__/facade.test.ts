import { createElement, Fragment, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { toast } from '../index';
import {
  attach,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  setToastPause,
  subscribe,
} from '../store/store';
import type { ToastOptions } from '../types';

const record = (id: string | undefined) => inspectRecords().find(candidate => candidate.id === id);
const optionsOf = (id: string | undefined) => record(id)?.options ?? {};
const keysOf = (id: string | undefined) => Object.keys(optionsOf(id)).sort();
const renderedAt = (position: keyof ReturnType<typeof getSnapshot>['byPosition']) =>
  getSnapshot().byPosition[position].map(view => view.id);
/** Plain-JS style values that the public types would reject. */
const smuggle = (value: unknown): never => value as never;

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('toast facade wiring', () => {
  it('creates a toast of the matching type for every creation call and returns its ID', () => {
    const created = {
      default: toast('Default'),
      success: toast.success('Success'),
      error: toast.error('Error'),
      warning: toast.warning('Warning'),
      info: toast.info('Info'),
      loading: toast.loading('Loading'),
      custom: toast.custom('Custom'),
    };
    for (const [type, id] of Object.entries(created)) {
      expect(id).toEqual(expect.any(String));
      expect(record(id)).toMatchObject({
        type,
        custom: type === 'custom',
        content: type.replace(/^\w/, c => c.toUpperCase()),
      });
    }
  });

  it('passes the options through, including an explicit id', () => {
    expect(toast.info('Hello', { id: 'greeting', description: 'World' })).toBe('greeting');
    expect(record('greeting')).toMatchObject({ description: 'World' });
  });

  it('dismisses one toast or all of them', () => {
    const onDismiss = vi.fn();
    const first = toast('First', { onDismiss });
    toast('Second', { onDismiss });
    expect(toast.dismiss(first)).toBeUndefined();
    expect(record(first)).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: first }), 'programmatic');
    toast.dismiss();
    expect(inspectRecords()).toEqual([]);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe('D-01: creation outside React (AC-API-3)', () => {
  it('D-01: toast() before any Toaster returns an ID, queues, and enters once a Toaster attaches', () => {
    const id = toast('Early');
    expect(id).toEqual(expect.any(String));
    expect(record(id)?.phase).toBe('queued');
    expect(renderedAt('top-right')).toEqual([]);
    attach({});
    expect(record(id)?.phase).toBe('entering');
    expect(renderedAt('top-right')).toEqual([id]);
  });
});

describe('D-04: content is any ReactNode (AC-API-4)', () => {
  const element = createElement('strong', null, 'Bold');
  const fragment = createElement(Fragment, null, 'One', 'Two');
  const array = ['Text', element];
  it.each<[string, ReactNode]>([
    ['a string', 'Text'],
    ['a number', 42],
    ['an element', element],
    ['a fragment', fragment],
    ['an array', array],
    ['null', null],
    ['false', false],
  ])('D-04: keeps %s as content and description, by identity', (_, node) => {
    const id = toast.success(node, { description: node });
    expect(record(id)?.content).toBe(node);
    expect(record(id)?.description).toBe(node);
    const custom = toast.custom(node);
    expect(custom).toEqual(expect.any(String));
    expect(record(custom)?.content).toBe(node);
  });
});

describe('custom toasts (§6.4, AC-API-10)', () => {
  it.each([
    ['omitted', undefined, false],
    ['true', true, true],
    ['false', false, false],
    ['invalid', 'yes', false],
  ])('resolves closeButton %s to %s', (_, closeButton, expected) => {
    const id = toast.custom(
      'Custom',
      closeButton === undefined ? {} : { closeButton: smuggle(closeButton) }
    );
    expect(optionsOf(id)).toEqual({ closeButton: expected });
    expect(optionsOf(id).closeButton).toBe(expected);
  });

  const chrome = {
    description: 'Details',
    icon: null,
    action: { label: 'Undo', onClick: () => undefined },
    progress: true,
  };
  it.each(Object.keys(chrome) as (keyof typeof chrome)[])('ignores %s at runtime', field => {
    const id = toast.custom('Custom', smuggle({ [field]: chrome[field] }));
    expect(record(id)?.description).toBeUndefined();
    expect(keysOf(id)).toEqual(['closeButton']);
  });

  it('keeps the options custom toasts do take', () => {
    const onDismiss = vi.fn();
    const onAutoClose = vi.fn();
    const id = toast.custom('Custom', {
      id: 'banner',
      duration: 3000,
      position: 'bottom-center',
      className: 'banner',
      onDismiss,
      onAutoClose,
    });
    expect(id).toBe('banner');
    expect(record(id)).toMatchObject({ type: 'custom', custom: true, position: 'bottom-center' });
    expect(optionsOf(id)).toEqual({
      duration: 3000,
      className: 'banner',
      onDismiss,
      onAutoClose,
      closeButton: false,
    });
  });

  it('passes no description to callbacks', () => {
    const onDismiss = vi.fn();
    const id = toast.custom('Custom', smuggle({ description: 'Hidden', onDismiss }));
    toast.dismiss(id);
    const [snapshot] = onDismiss.mock.calls[0] as [object];
    expect(snapshot).toEqual({ id, type: 'custom', content: 'Custom' });
    expect('description' in snapshot).toBe(false);
  });
});

describe('normal toast options (§6.3)', () => {
  it('stores no default that depends on the Toaster', () => {
    const id = toast('Plain');
    expect(keysOf(id)).toEqual([]);
    for (const key of ['closeButton', 'progress', 'duration', 'icon']) {
      expect(key in optionsOf(id)).toBe(false);
    }
    // P-11's internal timer fallback still applies until P-14 wires <Toaster duration>.
    expect(record(id)?.timer.duration).toBe(5000);
    expect(record(id)?.position).toBe('top-right');
  });

  it('keeps icon: null, and leaves an undefined icon out', () => {
    const hidden = toast('Hidden icon', { icon: null });
    expect('icon' in optionsOf(hidden)).toBe(true);
    expect(optionsOf(hidden).icon).toBeNull();
    const unset = toast('Default icon', { icon: undefined });
    expect('icon' in optionsOf(unset)).toBe(false);
  });

  it('stores every valid option', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    const onAutoClose = vi.fn();
    const icon = createElement('svg');
    const id = toast.info('Full', {
      id: 'full',
      description: 'Details',
      duration: 2500,
      position: 'bottom-left',
      icon,
      action: { label: 'Undo', onClick },
      closeButton: false,
      progress: true,
      className: 'extra',
      onDismiss,
      onAutoClose,
    });
    expect(record(id)).toMatchObject({
      id: 'full',
      description: 'Details',
      position: 'bottom-left',
    });
    expect(optionsOf(id)).toEqual({
      duration: 2500,
      icon,
      action: { label: 'Undo', onClick },
      closeButton: false,
      progress: true,
      className: 'extra',
      onDismiss,
      onAutoClose,
    });
  });
});

describe('runtime option validation', () => {
  it.each([
    ['a non-string', 42],
    ['an object', { id: 'nested' }],
    ['null', null],
    ['true', true],
    ['an empty string', ''],
  ])('treats %s id as omitted and generates a string ID', (_, value) => {
    const first = toast('First', smuggle({ id: value }));
    const second = toast('Second', smuggle({ id: value }));
    expect(typeof first).toBe('string');
    expect(first).not.toBe('');
    expect(second).not.toBe(first);
    expect(record(first)?.content).toBe('First');
  });

  it.each([
    ['an unknown string', 'middle'],
    ['a number', 3],
    ['null', null],
  ])('treats %s position as omitted, so the toast still renders', (_, position) => {
    attach({});
    const id = toast('Somewhere', smuggle({ position }));
    expect(record(id)?.position).toBe('top-right');
    expect(renderedAt('top-right')).toEqual([id]);
    entered(id!);
    expect(record(id)?.phase).toBe('visible');
  });

  it.each([
    [3000, 3000],
    [0.5, 0.5],
    [0, 0],
    [-5, 0],
    [Infinity, Infinity],
  ])('stores duration %s as %s', (duration, expected) => {
    expect(optionsOf(toast('Timed', { duration })).duration).toBe(expected);
  });

  it.each([
    ['NaN', NaN],
    ['-Infinity', -Infinity],
    ['a string', '3000'],
    ['null', null],
  ])('leaves an invalid duration (%s) out of the stored options', (_, duration) => {
    const id = toast('Timed', smuggle({ duration }));
    expect('duration' in optionsOf(id)).toBe(false);
    expect(record(id)?.timer.duration).toBe(5000);
  });

  it.each([
    ['null', null],
    ['a string', 'Undo'],
    ['an object without onClick', { label: 'Undo' }],
    ['an object with a non-function onClick', { label: 'Undo', onClick: 'undo()' }],
  ])('ignores an action that is %s', (_, action) => {
    expect('action' in optionsOf(toast('Act', smuggle({ action })))).toBe(false);
  });

  it('ignores non-boolean closeButton and progress, and a non-string className', () => {
    const id = toast('Odd', smuggle({ closeButton: 'yes', progress: 1, className: 42 }));
    expect(keysOf(id)).toEqual([]);
  });

  it('ignores callbacks that are not functions, so dismissal and timeout report nothing', () => {
    vi.useFakeTimers();
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    attach({});
    const id = toast('Callbacks', smuggle({ duration: 100, onDismiss: 'nope', onAutoClose: 42 }));
    expect(keysOf(id)).toEqual(['duration']);
    entered(id!);
    vi.advanceTimersByTime(100);
    expect(record(id)?.exit).toEqual({ reason: 'timeout' });
    exited(id!);
    vi.runAllTimers();
    expect(record(id)).toBeUndefined();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('never throws and never warns for malformed options', () => {
    const malformed: unknown[] = [null, 'options', 42, true, () => undefined, [], {}];
    for (const options of malformed) {
      for (const create of [toast, toast.success, toast.loading, toast.custom]) {
        const id = create('Odd', smuggle(options));
        expect(typeof id).toBe('string');
        expect(keysOf(id)).toEqual(create === toast.custom ? ['closeButton'] : []);
      }
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores internal fields passed as options (AC-API-5)', () => {
    const id = toast(
      'Real',
      smuggle({
        phase: 'exiting',
        seq: 99,
        revision: 7,
        timer: { duration: 1, remaining: 1, runningSince: 0 },
        pausedBy: ['swipe'],
        type: 'error',
        custom: true,
      })
    );
    expect(record(id)).toMatchObject({
      phase: 'queued',
      seq: 1,
      revision: 0,
      type: 'default',
      custom: false,
      pausedBy: [],
      timer: { duration: 5000, remaining: 5000, runningSince: null },
    });
    expect(keysOf(id)).toEqual([]);
  });
});

describe('accessor options', () => {
  /** An object whose fields are getters that count their reads. */
  function counted(values: Record<string, unknown>) {
    const reads: Record<string, number> = {};
    const object = {};
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(object, key, {
        enumerable: true,
        get: () => {
          reads[key] = (reads[key] ?? 0) + 1;
          return value;
        },
      });
    }
    return { object, reads };
  }

  it('reads id once, so a getter cannot pass the string check and then return a number', () => {
    let reads = 0;
    const options = Object.defineProperty({}, 'id', {
      get: () => (++reads === 1 ? 'checked' : 42),
    });
    const id = toast('Accessor', smuggle(options));
    expect(reads).toBe(1);
    expect(id).toBe('checked');
    expect(record('checked')?.id).toBe('checked');
  });

  it('reads every field of a normal toast at most once, the action fields included', () => {
    const onClick = vi.fn();
    const action = counted({ label: 'Undo', onClick });
    const options = counted({
      id: 'normal',
      position: 'bottom-left',
      duration: 2000,
      description: 'Details',
      icon: null,
      action: action.object,
      closeButton: true,
      progress: true,
      className: 'extra',
      onDismiss: () => undefined,
      onAutoClose: () => undefined,
    });
    expect(toast('Counted', smuggle(options.object))).toBe('normal');
    expect(options.reads).toEqual({
      id: 1,
      position: 1,
      duration: 1,
      description: 1,
      icon: 1,
      action: 1,
      closeButton: 1,
      progress: 1,
      className: 1,
      onDismiss: 1,
      onAutoClose: 1,
    });
    expect(action.reads).toEqual({ label: 1, onClick: 1 });
    expect(optionsOf('normal').action).toEqual({ label: 'Undo', onClick });
  });

  it('does not read the fields a custom toast drops', () => {
    const action = counted({ label: 'Undo', onClick: () => undefined });
    const options = counted({
      id: 'custom',
      position: 'bottom-left',
      duration: 2000,
      description: 'Details',
      icon: null,
      action: action.object,
      closeButton: true,
      progress: true,
      className: 'extra',
      onDismiss: () => undefined,
      onAutoClose: () => undefined,
    });
    expect(toast.custom('Counted', smuggle(options.object))).toBe('custom');
    expect(options.reads).toEqual({
      id: 1,
      position: 1,
      duration: 1,
      closeButton: 1,
      className: 1,
      onDismiss: 1,
      onAutoClose: 1,
    });
    expect(action.reads).toEqual({});
  });

  it('does not read the label of an action without a function onClick', () => {
    const action = counted({ label: 'Undo', onClick: 'undo()' });
    toast('Counted', smuggle({ action: action.object }));
    expect(action.reads).toEqual({ onClick: 1 });
  });
});

describe('options isolation', () => {
  it('copies the options, so changing the caller objects later changes nothing', () => {
    const onClick = vi.fn();
    const action = { label: 'Undo', onClick };
    const options: ToastOptions = { description: 'Before', className: 'before', action };
    const id = toast('Saved', options);
    options.description = 'After';
    options.className = 'after';
    action.label = 'Changed';
    action.onClick = vi.fn();
    expect(record(id)?.description).toBe('Before');
    expect(optionsOf(id)).toEqual({ className: 'before', action: { label: 'Undo', onClick } });
    expect(optionsOf(id).action).not.toBe(action);
    expect(Object.isFrozen(optionsOf(id).action)).toBe(true);
  });

  it('gives every definition its own frozen options object', () => {
    attach({});
    toast('One', { id: 'one' });
    toast('Two', { id: 'two' });
    const [one, two] = getSnapshot().byPosition['top-right'];
    expect(one?.options).not.toBe(two?.options);
    expect(Object.isFrozen(one?.options)).toBe(true);
    toast('One again', { id: 'one' });
    expect(getSnapshot().byPosition['top-right'][0]?.options).not.toBe(one?.options);
  });
});

describe('replacement (§14)', () => {
  it('replaces a normal toast with a custom one: chrome options go, closeButton is false', () => {
    attach({});
    const onDismiss = vi.fn();
    const onAutoClose = vi.fn();
    toast.success('Normal', {
      id: 'job',
      description: 'Details',
      icon: null,
      action: { label: 'Undo', onClick: () => undefined },
      progress: true,
      closeButton: true,
      onDismiss,
      onAutoClose,
    });
    entered('job');
    const before = record('job');
    expect(toast.custom('Custom', { id: 'job' })).toBe('job');
    expect(record('job')).toMatchObject({
      type: 'custom',
      custom: true,
      content: 'Custom',
      revision: 1,
      seq: before?.seq,
      phase: 'visible',
    });
    expect(record('job')?.description).toBeUndefined();
    expect(optionsOf('job')).toEqual({ closeButton: false });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onAutoClose).not.toHaveBeenCalled();
  });

  it('replaces a custom toast with a normal one: an omitted closeButton is absent again', () => {
    toast.custom('Custom', { id: 'job' });
    expect(toast.info('Normal', { id: 'job' })).toBe('job');
    expect(record('job')).toMatchObject({ type: 'info', custom: false, revision: 1 });
    expect('closeButton' in optionsOf('job')).toBe(false);
  });

  it('replaces a loading toast with a success toast, which gets a fresh finite timer', () => {
    vi.useFakeTimers();
    attach({});
    toast.loading('Saving', { id: 'job', duration: 1000 });
    entered('job');
    expect(record('job')?.timer.duration).toBe(Infinity);
    vi.advanceTimersByTime(60_000);
    expect(record('job')?.phase).toBe('visible');
    toast.success('Saved', { id: 'job' });
    expect(record('job')?.timer).toEqual({
      duration: 5000,
      remaining: 5000,
      runningSince: performance.now(),
    });
    vi.advanceTimersByTime(5000);
    expect(record('job')).toMatchObject({ phase: 'exiting', exit: { reason: 'timeout' } });
  });

  it('does not keep the old position: an omitted position is the default one', () => {
    toast('Bottom', { id: 'job', position: 'bottom-left' });
    toast('Moved', { id: 'job' });
    expect(record('job')?.position).toBe('top-right');
  });

  it('relocates a rendered toast whose replacement omits its position', () => {
    attach({});
    toast('Bottom', { id: 'job', position: 'bottom-left' });
    entered('job');
    toast('Moved', { id: 'job' });
    expect(record('job')).toMatchObject({
      phase: 'exiting',
      exit: { reason: 'relocate', relocateTo: 'top-right' },
    });
    exited('job');
    expect(record('job')?.position).toBe('top-right');
  });

  it('treats an invalid replacement position as omitted', () => {
    toast('Bottom', { id: 'job', position: 'bottom-left' });
    toast('Moved', smuggle({ id: 'job', position: 'nowhere' }));
    expect(record('job')?.position).toBe('top-right');
  });

  it('keeps pause reasons across normal and custom replacements', () => {
    attach({});
    toast('Normal', { id: 'job' });
    entered('job');
    setToastPause('job', 'focus-within', true);
    toast.custom('Custom', { id: 'job' });
    expect(record('job')?.pausedBy).toEqual(['focus-within']);
    toast.warning('Normal again', { id: 'job' });
    expect(record('job')?.pausedBy).toEqual(['focus-within']);
  });
});

describe('the no-Toaster cap through the facade (§8.4)', () => {
  it('rejects new toasts at the cap, even with an explicit id, but still replaces', () => {
    for (let index = 0; index < 100; index++) toast(`Toast ${index}`, { id: `t${index}` });
    expect(toast('New')).toBeUndefined();
    expect(toast.success('New', { id: 'explicit' })).toBeUndefined();
    expect(toast.custom('New', smuggle({ id: 42 }))).toBeUndefined();
    expect(record('explicit')).toBeUndefined();
    expect(toast.custom('Replaced', { id: 't0' })).toBe('t0');
    expect(record('t0')).toMatchObject({ type: 'custom', content: 'Replaced' });
    expect(inspectRecords()).toHaveLength(100);
  });
});

describe('toast.dismiss', () => {
  it('dismisses everything with no argument or undefined, queued toasts included', () => {
    attach({});
    const onDismiss = vi.fn();
    for (const id of ['a', 'b', 'c', 'd', 'e']) toast(id, { id, onDismiss });
    expect(record('e')?.phase).toBe('queued');
    const rejected: string | undefined = undefined;
    toast.dismiss(rejected);
    expect(record('e')).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 'e' }), 'programmatic');
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(record(id)).toMatchObject({ phase: 'exiting', exit: { reason: 'programmatic' } });
    }
  });

  it('ignores an unknown or empty ID', () => {
    const onDismiss = vi.fn();
    const id = toast('Stay', { onDismiss });
    toast.dismiss('unknown');
    toast.dismiss('');
    expect(record(id)?.phase).toBe('queued');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores an exiting toast, which still fires onDismiss once when it leaves', () => {
    attach({});
    const onDismiss = vi.fn();
    const id = toast('Leaving', { onDismiss })!;
    entered(id);
    toast.dismiss(id);
    toast.dismiss(id);
    expect(record(id)?.exit).toEqual({ reason: 'programmatic' });
    exited(id);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id }), 'programmatic');
  });
});

describe('facade members', () => {
  it('work unbound', () => {
    const { success, custom, dismiss: dismissToast } = toast;
    const id = success('Saved');
    expect(record(id)?.type).toBe('success');
    expect(record(custom('Custom'))?.custom).toBe(true);
    dismissToast(id);
    expect(record(id)).toBeUndefined();
  });

  it('can create a toast from inside a callback', () => {
    let nested: string | undefined;
    const first = toast('First', {
      onDismiss: () => {
        nested = toast('Nested', { id: 'nested' });
      },
    });
    toast.dismiss(first);
    expect(nested).toBe('nested');
    expect(record('nested')?.phase).toBe('queued');
  });

  it('notifies once per command, and not at all for a queued-only change', () => {
    const listener = vi.fn();
    subscribe(listener);
    toast('Queued', smuggle({ id: 'queued', position: 'nowhere', duration: NaN, action: 'bad' }));
    expect(listener).not.toHaveBeenCalled();
    attach({});
    listener.mockClear();
    toast('Shown', smuggle({ id: 'shown', position: 'nowhere', duration: NaN, action: 'bad' }));
    expect(listener).toHaveBeenCalledTimes(1);
    toast.custom('Replaced', smuggle({ id: 'shown', description: 'Ignored' }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
