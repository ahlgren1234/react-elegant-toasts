import type { DismissReason, ToastSnapshot, toast } from 'react-elegant-toasts';
import { quote, templateText } from './snippet';

// The lifecycle recipes (P-25 S5a). Each recipe's values are defined once, below. From them come
// both the functions the demo runs (`createRecipes`, given the real `toast`) and the code each
// recipe shows (`*Snippet`). The tests run every snippet against a recording `toast` and check
// that it makes exactly the calls the demo's functions make.

/** The public `toast` API, so the recipes can be run against a recording one in tests. */
export type ToastApi = typeof toast;

/** How long the stand-in work of the promise and update recipes takes. */
export const WORK_MS = 2000;

export const PROMISE_RECIPE = {
  project: 'Website redesign',
  loading: 'Saving project…',
  successPrefix: 'Saved ',
  failure: 'The server did not respond',
  fallback: 'Could not save the project',
} as const;

export const UPDATE_RECIPE = {
  loading: 'Uploading report…',
  done: 'Report uploaded',
  descriptionPrefix: 'Same toast, same ID: ',
} as const;

export const DISMISS_RECIPE = { message: 'Stand-up in 10 minutes' } as const;

export const CALLBACK_RECIPE = {
  message: 'Draft saved',
  duration: 6000,
  actionLabel: 'Undo',
  actionResult: 'Draft restored',
} as const;

/** One callback the callbacks recipe received. */
export type CallbackEvent =
  | { callback: 'onAutoClose'; id: string; title: string }
  | { callback: 'onDismiss'; id: string; title: string; reason: DismissReason };

const titleOf = (snapshot: ToastSnapshot): string =>
  typeof snapshot.content === 'string' ? snapshot.content : '';

/**
 * The functions the demo runs, one recipe each, against `api`. The snippets' module-level `let`
 * variables are this closure's state. `report` receives what the callbacks snippet logs.
 */
export function createRecipes(api: ToastApi, report: (event: CallbackEvent) => void) {
  const saveProject = (succeed: boolean): Promise<{ name: string }> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (succeed) resolve({ name: PROMISE_RECIPE.project });
        else reject(new Error(PROMISE_RECIPE.failure));
      }, WORK_MS);
    });

  let reminder: string | undefined;
  let draft: string | undefined;

  return {
    save(succeed: boolean): void {
      api.promise(saveProject(succeed), {
        loading: PROMISE_RECIPE.loading,
        success: project => `${PROMISE_RECIPE.successPrefix}${project.name}`,
        error: error => (error instanceof Error ? error.message : PROMISE_RECIPE.fallback),
      });
    },

    uploadReport(): void {
      const id = api.loading(UPDATE_RECIPE.loading);
      if (!id) return;
      setTimeout(() => {
        api.success(UPDATE_RECIPE.done, {
          id,
          description: `${UPDATE_RECIPE.descriptionPrefix}${id}`,
        });
      }, WORK_MS);
    },

    showReminder(): void {
      if (reminder) return;
      reminder = api.info(DISMISS_RECIPE.message, {
        duration: Infinity,
        onDismiss: () => {
          reminder = undefined;
        },
      });
    },

    dismissReminder(): void {
      if (reminder) api.dismiss(reminder);
    },

    saveDraft(): void {
      draft = api(CALLBACK_RECIPE.message, {
        duration: CALLBACK_RECIPE.duration,
        action: {
          label: CALLBACK_RECIPE.actionLabel,
          onClick: () => api(CALLBACK_RECIPE.actionResult),
        },
        onAutoClose: snapshot =>
          report({ callback: 'onAutoClose', id: snapshot.id, title: titleOf(snapshot) }),
        onDismiss: (snapshot, reason) =>
          report({ callback: 'onDismiss', id: snapshot.id, title: titleOf(snapshot), reason }),
      });
    },

    dismissDraft(): void {
      if (draft) api.dismiss(draft);
    },
  };
}

export type Recipes = ReturnType<typeof createRecipes>;

// ---------------------------------------------------------------------------------------------
// The code each recipe shows. Values are written with `quote` and `templateText`, so any text is
// a valid literal.

const IMPORT = `import { toast } from ${quote('react-elegant-toasts')};\n`;

/** Milliseconds as seconds, for the promise snippet's comment. */
const seconds = (ms: number): string => `${ms / 1000} seconds`;

export const promiseSnippet = (): string => `${IMPORT}
// Stands in for real work: it settles after ${seconds(WORK_MS)}.
function saveProject(succeed: boolean): Promise<{ name: string }> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (succeed) resolve({ name: ${quote(PROMISE_RECIPE.project)} });
      else reject(new Error(${quote(PROMISE_RECIPE.failure)}));
    }, ${WORK_MS});
  });
}

export function save(succeed: boolean) {
  toast.promise(saveProject(succeed), {
    loading: ${quote(PROMISE_RECIPE.loading)},
    success: project => \`${templateText(PROMISE_RECIPE.successPrefix)}\${project.name}\`,
    error: error => (error instanceof Error ? error.message : ${quote(PROMISE_RECIPE.fallback)}),
  });
}
`;

export const updateSnippet = (): string => `${IMPORT}
export function uploadReport() {
  const id = toast.loading(${quote(UPDATE_RECIPE.loading)});
  if (!id) return;

  // When the work is done, pass the ID back: the same toast changes, and no second one appears.
  setTimeout(() => {
    toast.success(${quote(UPDATE_RECIPE.done)}, {
      id,
      description: \`${templateText(UPDATE_RECIPE.descriptionPrefix)}\${id}\`,
    });
  }, ${WORK_MS});
}
`;

export const dismissSnippet = (): string => `${IMPORT}
let reminder: string | undefined;

export function showReminder() {
  if (reminder) return;
  reminder = toast.info(${quote(DISMISS_RECIPE.message)}, {
    duration: Infinity,
    onDismiss: () => {
      reminder = undefined;
    },
  });
}

export function dismissReminder() {
  // Check the ID first: toast.dismiss() with no ID closes every toast.
  if (reminder) toast.dismiss(reminder);
}
`;

export const callbacksSnippet = (): string => `${IMPORT}
let draft: string | undefined;

export function saveDraft() {
  draft = toast(${quote(CALLBACK_RECIPE.message)}, {
    duration: ${CALLBACK_RECIPE.duration},
    action: {
      label: ${quote(CALLBACK_RECIPE.actionLabel)},
      onClick: () => toast(${quote(CALLBACK_RECIPE.actionResult)}),
    },
    onAutoClose: snapshot => console.log('onAutoClose', snapshot.id),
    onDismiss: (snapshot, reason) => console.log('onDismiss', snapshot.id, reason),
  });
}

export function dismissDraft() {
  if (draft) toast.dismiss(draft);
}
`;

/** What the callbacks snippet's `console.log` prints for an event the demo's log receives. */
export const consoleArgs = (event: CallbackEvent): unknown[] =>
  event.callback === 'onDismiss'
    ? ['onDismiss', event.id, event.reason]
    : ['onAutoClose', event.id];

// ---------------------------------------------------------------------------------------------
// The callback log.

/** How many entries the log keeps; older ones drop off. */
export const LOG_LIMIT = 6;

export type LogEntry = CallbackEvent & { readonly seq: number; readonly time: string };

/** What each dismissal reason means, in the words the log uses. */
export const REASON_TEXT: Record<DismissReason, string> = {
  timeout: 'its duration ran out',
  'close-button': 'its close button',
  swipe: 'a swipe',
  programmatic: 'toast.dismiss()',
  action: 'its action',
};

/** The time of day as HH:MM:SS, so entries close together can be told apart. */
export const formatTime = (date: Date): string =>
  [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(part => String(part).padStart(2, '0'))
    .join(':');

/** A UUID's first 8 characters, which are enough to tell toasts apart in the log. */
export const shortId = (id: string): string => (id.length > 8 ? `${id.slice(0, 8)}…` : id);

/** The log with `event` added first (newest first), keeping at most LOG_LIMIT entries. */
export function appendEntry(log: readonly LogEntry[], event: CallbackEvent, at: Date): LogEntry[] {
  const seq = (log[0]?.seq ?? 0) + 1;
  return [{ ...event, seq, time: formatTime(at) }, ...log].slice(0, LOG_LIMIT);
}
