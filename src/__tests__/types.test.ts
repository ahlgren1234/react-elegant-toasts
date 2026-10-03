// Public type tests (§26). The assertions are checked by `npm run typecheck`; at runtime they do
// nothing. Calls that must not compile live in `compileOnly`, which is never invoked, so running
// this file creates no toasts.
import { createElement, type MouseEventHandler, type ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import {
  toast,
  type CustomToastOptions,
  type ToastId,
  type ToastOptions,
  type ToastPromiseMessages,
  type ToastSnapshot,
} from '../index';

describe('toast types', () => {
  it('ToastId is string', () => {
    expectTypeOf<ToastId>().toEqualTypeOf<string>();
  });

  it('every creation member returns ToastId | undefined', () => {
    expectTypeOf(toast).returns.toEqualTypeOf<ToastId | undefined>();
    expectTypeOf(toast.success).returns.toEqualTypeOf<ToastId | undefined>();
    expectTypeOf(toast.error).returns.toEqualTypeOf<ToastId | undefined>();
    expectTypeOf(toast.warning).returns.toEqualTypeOf<ToastId | undefined>();
    expectTypeOf(toast.info).returns.toEqualTypeOf<ToastId | undefined>();
    expectTypeOf(toast.loading).returns.toEqualTypeOf<ToastId | undefined>();
    expectTypeOf(toast.custom).returns.toEqualTypeOf<ToastId | undefined>();
    expectTypeOf(toast.promise).returns.toEqualTypeOf<ToastId | undefined>();
  });

  it('toast.promise takes ToastOptions, and its messages require all three keys', () => {
    expectTypeOf(toast.promise).parameter(2).toEqualTypeOf<ToastOptions | undefined>();
    expectTypeOf<ToastPromiseMessages<number>>().toEqualTypeOf<{
      loading: ReactNode;
      success: ReactNode | ((data: number) => ReactNode);
      error: ReactNode | ((error: unknown) => ReactNode);
    }>();
  });

  it('toast.dismiss takes an optional ID and returns void', () => {
    expectTypeOf(toast.dismiss).parameter(0).toEqualTypeOf<ToastId | undefined>();
    expectTypeOf(toast.dismiss).returns.toEqualTypeOf<void>();
  });

  it('content is any ReactNode', () => {
    expectTypeOf(toast).parameter(0).toEqualTypeOf<ReactNode>();
    expectTypeOf(toast.success).parameter(0).toEqualTypeOf<ReactNode>();
    expectTypeOf(toast.custom).parameter(0).toEqualTypeOf<ReactNode>();
    expectTypeOf(toast.custom).parameter(1).toEqualTypeOf<CustomToastOptions | undefined>();
    expectTypeOf(toast.info).parameter(1).toEqualTypeOf<ToastOptions | undefined>();
  });

  it('ToastSnapshot fields are readonly', () => {
    expectTypeOf<ToastSnapshot>().toEqualTypeOf<{
      readonly id: ToastId;
      readonly type: ToastSnapshot['type'];
      readonly content: ReactNode;
      readonly description?: ReactNode;
    }>();
  });

  it('the compile-time checks below type-check', () => {
    expectTypeOf(compileOnly).toBeFunction();
  });
});

// Never invoked. Every `@ts-expect-error` must match a real error, or typecheck fails.
function compileOnly(): void {
  // Every optional field accepts an explicit undefined under exactOptionalPropertyTypes.
  toast('Explicit undefined', {
    id: undefined,
    description: undefined,
    duration: undefined,
    position: undefined,
    icon: undefined,
    action: undefined,
    closeButton: undefined,
    progress: undefined,
    className: undefined,
    onDismiss: undefined,
    onAutoClose: undefined,
  });
  toast.custom('Explicit undefined', {
    id: undefined,
    duration: undefined,
    position: undefined,
    closeButton: undefined,
    className: undefined,
    onDismiss: undefined,
    onAutoClose: undefined,
  });
  toast('No icon', { icon: null });
  toast.dismiss();
  toast.dismiss(undefined);

  // There is no function form of toast.custom in 2.0 (§6.4).
  // @ts-expect-error -- content is a ReactNode, not a function
  toast.custom((id: ToastId) => id);

  // Custom toasts reject the normal content model (§6.4), in object literals...
  // @ts-expect-error -- description
  toast.custom('Custom', { description: 'Details' });
  // @ts-expect-error -- icon
  toast.custom('Custom', { icon: null });
  // @ts-expect-error -- action
  toast.custom('Custom', { action: { label: 'Undo', onClick: () => undefined } });
  // @ts-expect-error -- progress
  toast.custom('Custom', { progress: true });
  // @ts-expect-error -- an explicit undefined is still not accepted
  toast.custom('Custom', { description: undefined });

  // ...and in values that skip excess-property checks. The shared `id` keeps TypeScript's
  // weak-type check from reporting a different error, so only `?: never` rejects these.
  const withDescription: Pick<ToastOptions, 'id' | 'description'> = { id: 'x', description: 'D' };
  const withIcon: Pick<ToastOptions, 'id' | 'icon'> = { id: 'x', icon: null };
  const withAction: Pick<ToastOptions, 'id' | 'action'> = {
    id: 'x',
    action: { label: 'Undo', onClick: () => undefined },
  };
  const withProgress: Pick<ToastOptions, 'id' | 'progress'> = { id: 'x', progress: true };
  const normal: ToastOptions = {};
  // @ts-expect-error -- description
  toast.custom('Custom', withDescription);
  // @ts-expect-error -- icon
  toast.custom('Custom', withIcon);
  // @ts-expect-error -- action
  toast.custom('Custom', withAction);
  // @ts-expect-error -- progress
  toast.custom('Custom', withProgress);
  // @ts-expect-error -- ToastOptions as a whole is not CustomToastOptions
  toast.custom('Custom', normal);

  // Options cannot set store-owned state (AC-API-5).
  // @ts-expect-error -- phase
  toast('Smuggled', { phase: 'exiting' });
  // @ts-expect-error -- seq
  toast('Smuggled', { seq: 1 });
  // @ts-expect-error -- revision
  toast('Smuggled', { revision: 1 });
  // @ts-expect-error -- timer
  toast('Smuggled', { timer: { duration: 1, remaining: 1, runningSince: null } });
  // @ts-expect-error -- pausedBy
  toast('Smuggled', { pausedBy: ['swipe'] });
  // @ts-expect-error -- type
  toast('Smuggled', { type: 'error' });
  // @ts-expect-error -- custom
  toast('Smuggled', { custom: true });

  toast('Readonly', {
    onDismiss: snapshot => {
      // @ts-expect-error -- the ID is immutable (D-02)
      snapshot.id = 'other';
    },
  });

  // toast.dismiss takes an ID, not an event: wrap it.
  // @ts-expect-error -- not assignable as an event handler
  const direct: MouseEventHandler<HTMLButtonElement> = toast.dismiss;
  const wrapped: MouseEventHandler<HTMLButtonElement> = () => toast.dismiss();
  expectTypeOf([direct, wrapped]).toBeArray();

  promiseTypes();
}

interface Project {
  name: string;
}

// toast.promise (§13). Never invoked, like compileOnly.
function promiseTypes(): void {
  const save = (): Promise<Project> => Promise.resolve({ name: 'P' });
  const failing = 'Failed';

  // T is inferred from a direct promise, a function and an async arrow.
  toast.promise(save(), {
    loading: 'Saving',
    success: project => {
      expectTypeOf(project).toEqualTypeOf<Project>();
      return project.name;
    },
    error: err => {
      expectTypeOf(err).toEqualTypeOf<unknown>();
      return failing;
    },
  });
  toast.promise(save, {
    loading: 'Saving',
    success: project => {
      expectTypeOf(project).toEqualTypeOf<Project>();
      return project.name;
    },
    error: failing,
  });
  toast.promise(async () => Promise.resolve(42), {
    loading: 'Counting',
    success: count => {
      expectTypeOf(count).toEqualTypeOf<number>();
      return count.toFixed();
    },
    error: failing,
  });
  // Literal types are kept, a rejected promise gives never, and any stays any.
  toast.promise(Promise.resolve('ready' as const), {
    loading: 'L',
    success: value => {
      expectTypeOf(value).toEqualTypeOf<'ready'>();
      return value;
    },
    error: failing,
  });
  toast.promise(Promise.reject(new Error('x')), {
    loading: 'L',
    success: value => {
      expectTypeOf(value).toEqualTypeOf<never>();
      return 'S';
    },
    error: failing,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any must pass through as any
  const anyPromise = Promise.resolve(1) as Promise<any>;
  toast.promise(anyPromise, {
    loading: 'L',
    success: value => {
      expectTypeOf(value).toBeAny();
      return 'S';
    },
    error: failing,
  });

  // Content is any ReactNode, static or from a function.
  const element = createElement('strong', null, 'Done');
  toast.promise(save(), { loading: null, success: false, error: 0 });
  toast.promise(save(), { loading: element, success: element, error: () => element });
  // Required means present: ReactNode includes undefined, so an explicit undefined is accepted.
  toast.promise(save(), { loading: undefined, success: undefined, error: undefined });

  // Explicit type arguments.
  toast.promise<number>(Promise.resolve(1), {
    loading: 'L',
    success: n => n.toFixed(),
    error: 'E',
  });
  // @ts-expect-error -- the explicit type argument does not match the promise
  toast.promise<string>(save(), { loading: 'L', success: 'S', error: 'E' });

  // A typed messages value.
  const messages: ToastPromiseMessages<Project> = {
    loading: 'L',
    success: project => project.name,
    error: 'E',
  };
  toast.promise(save(), messages);

  // Every message is required.
  // @ts-expect-error -- loading is missing
  toast.promise(save(), { success: 'S', error: 'E' });
  // @ts-expect-error -- success is missing
  toast.promise(save(), { loading: 'L', error: 'E' });
  // @ts-expect-error -- error is missing
  toast.promise(save(), { loading: 'L', success: 'S' });
  // @ts-expect-error -- no other keys
  toast.promise(save(), { loading: 'L', success: 'S', error: 'E', finally: 'F' });

  // Message functions take what the promise gives them.
  // @ts-expect-error -- success receives a Project, not a number
  toast.promise(save(), { loading: 'L', success: (count: number) => count.toFixed(), error: 'E' });
  // @ts-expect-error -- error receives unknown, not an Error
  toast.promise(save(), { loading: 'L', success: 'S', error: (err: Error) => err.message });
  // @ts-expect-error -- loading is a node, not a function
  toast.promise(save(), { loading: () => 'L', success: 'S', error: 'E' });
  // @ts-expect-error -- success must return a node
  toast.promise(save(), { loading: 'L', success: project => project, error: 'E' });

  // The input is a Promise, or a function that returns one.
  // @ts-expect-error -- not a promise
  toast.promise(42, { loading: 'L', success: 'S', error: 'E' });
  // @ts-expect-error -- the function does not return a promise
  toast.promise(() => 42, { loading: 'L', success: 'S', error: 'E' });
  const thenable: PromiseLike<number> = Promise.resolve(1);
  // @ts-expect-error -- a PromiseLike is not a Promise
  toast.promise(thenable, { loading: 'L', success: 'S', error: 'E' });

  // Options are ToastOptions, with explicit undefined, and no store-owned fields (AC-API-5).
  toast.promise(
    save(),
    { loading: 'L', success: 'S', error: 'E' },
    { id: undefined, description: 'D', duration: undefined, position: undefined }
  );
  // @ts-expect-error -- promiseToken
  toast.promise(save(), { loading: 'L', success: 'S', error: 'E' }, { promiseToken: Symbol() });
  // @ts-expect-error -- phase
  toast.promise(save(), { loading: 'L', success: 'S', error: 'E' }, { phase: 'exiting' });
  // @ts-expect-error -- promiseToken is not a creation option either
  toast('Smuggled', { promiseToken: Symbol() });
}
