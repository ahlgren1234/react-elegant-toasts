import { useState, type ReactNode } from 'react';
import { toast } from 'react-elegant-toasts';
import { highlight } from '../utils/highlight';
import {
  appendEntry,
  callbacksSnippet,
  createRecipes,
  dismissSnippet,
  promiseSnippet,
  updateSnippet,
  type LogEntry,
} from '../utils/lifecycle';
import { CallbackLog } from './CallbackLog';
import { CodePanel } from './CodePanel';

// The snippets never change, so they are highlighted once.
const CODE = {
  promise: highlight(promiseSnippet()),
  update: highlight(updateSnippet()),
  dismiss: highlight(dismissSnippet()),
  callbacks: highlight(callbacksSnippet()),
};

interface RecipeProps {
  id: string;
  title: string;
  children: ReactNode;
  code: typeof CODE.promise;
  fileName: string;
}

// One recipe: what it shows and its buttons, beside the code those buttons run.
const Recipe = ({ id, title, children, code, fileName }: RecipeProps) => (
  <article className="d-recipe" aria-labelledby={`${id}-heading`}>
    <div className="d-recipe__text">
      <h3 id={`${id}-heading`} className="d-recipe__title">
        {title}
      </h3>
      {children}
    </div>
    <CodePanel tokens={code} fileName={fileName} />
  </article>
);

export function Lifecycle() {
  const [log, setLog] = useState<LogEntry[]>([]);
  // Created once: the recipes keep their IDs between clicks, as the snippets' variables do.
  const [recipes] = useState(() =>
    createRecipes(toast, event => setLog(entries => appendEntry(entries, event, new Date())))
  );

  return (
    <section id="lifecycle" className="d-section" aria-labelledby="lifecycle-heading">
      <div className="d-container">
        <header className="d-section__header">
          <p className="d-eyebrow">Lifecycle</p>
          <h2 id="lifecycle-heading" className="d-section__title">
            Follow a toast from start to finish
          </h2>
          <p className="d-section__lede">
            Each button runs the code beside it. The toasts use the playground&apos;s Toaster
            settings.
          </p>
        </header>

        <div className="d-recipes">
          <Recipe id="promise" title="Promise" code={CODE.promise} fileName="save.ts">
            <p className="d-recipe__body">
              <code>toast.promise</code> shows a loading toast at once, then turns that same toast
              into a success or an error when the promise settles. The work here takes 2 seconds.
            </p>
            <div className="d-recipe__actions">
              <button
                type="button"
                className="d-button d-button--primary"
                onClick={() => recipes.save(true)}
              >
                Save: succeeds
              </button>
              <button
                type="button"
                className="d-button d-button--secondary"
                onClick={() => recipes.save(false)}
              >
                Save: fails
              </button>
            </div>
          </Recipe>

          <Recipe id="update" title="Update by ID" code={CODE.update} fileName="upload.ts">
            <p className="d-recipe__body">
              Every call returns the toast&apos;s ID. Pass it back as <code>id</code> and the same
              toast changes in place: no second toast appears. The new call defines the whole toast,
              so options it leaves out are not kept.
            </p>
            <div className="d-recipe__actions">
              <button
                type="button"
                className="d-button d-button--primary"
                onClick={() => recipes.uploadReport()}
              >
                Upload a report
              </button>
            </div>
          </Recipe>

          <Recipe id="dismiss" title="Dismiss by ID" code={CODE.dismiss} fileName="reminder.ts">
            <p className="d-recipe__body">
              <code>toast.dismiss(id)</code> closes that toast and leaves the others alone. Keep the
              ID the call returned, and check it first: with no ID, <code>toast.dismiss()</code>{' '}
              closes every toast.
            </p>
            <div className="d-recipe__actions">
              <button
                type="button"
                className="d-button d-button--primary"
                onClick={() => recipes.showReminder()}
              >
                Show the reminder
              </button>
              <button
                type="button"
                className="d-button d-button--secondary"
                onClick={() => recipes.dismissReminder()}
              >
                Dismiss the reminder
              </button>
            </div>
          </Recipe>

          <Recipe id="callbacks" title="Callbacks" code={CODE.callbacks} fileName="draft.ts">
            <p className="d-recipe__body">
              <code>onAutoClose</code> runs when the duration runs out, as the toast starts to
              leave. <code>onDismiss</code> runs once the toast has gone, with the reason: close it,
              use its action, let it time out, swipe it on a touch screen, or dismiss it from code.
              Hovering a toast pauses its timer.
            </p>
            <div className="d-recipe__actions">
              <button
                type="button"
                className="d-button d-button--primary"
                onClick={() => recipes.saveDraft()}
              >
                Show a tracked toast
              </button>
              <button
                type="button"
                className="d-button d-button--secondary"
                onClick={() => recipes.dismissDraft()}
              >
                Dismiss it from code
              </button>
            </div>

            <CallbackLog entries={log} onClear={() => setLog([])} />
          </Recipe>
        </div>
      </div>
    </section>
  );
}
