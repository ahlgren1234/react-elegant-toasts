// The Jest consumer, J1 (§27 step 9, P-27 S2): Jest 30 loads the packed package through its public
// entry points as native ESM, under Node's --experimental-vm-modules, with no transform. The CSS
// import resolves through the exports map and is then mapped to style-stub.js.
// validate-package.js installs the tarball and runs `npm test`, expecting exactly these two tests.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import 'react-elegant-toasts/styles.css';
import { Toaster, toast } from 'react-elegant-toasts';

const PACKAGE_NAME = 'react-elegant-toasts';
const TOAST_TEXT = 'Saved by the Jest consumer';

/**
 * Runs pending zero-delay timers inside act. Without the stylesheet no library animation runs, so
 * the toast's enter and exit each complete on a zero-delay fallback (§9 rule 3), scheduled when
 * its phase changes: one turn reaches the next phase.
 */
const nextTurn = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

let previousActEnvironment;
let container;
let root;

beforeEach(() => {
  previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.body.appendChild(document.createElement('div'));
});

afterEach(() => {
  if (root) act(() => root.unmount());
  root = undefined;
  container.remove();
  globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test('resolves the package to the copy installed in this consumer', () => {
  const entry = fileURLToPath(import.meta.resolve(PACKAGE_NAME));
  expect(entry.startsWith(path.join(process.cwd(), 'node_modules', PACKAGE_NAME) + path.sep)).toBe(
    true
  );
});

test('shows a success toast and removes it from its close button', async () => {
  root = createRoot(container);
  act(() => root.render(createElement(Toaster)));
  expect(document.querySelector('section[aria-label="Notifications"]')).not.toBeNull();

  let id;
  act(() => {
    id = toast.success(TOAST_TEXT);
  });
  expect(typeof id).toBe('string');
  const items = document.querySelectorAll('li.ret-toast');
  expect(items).toHaveLength(1);
  const [item] = items;
  expect(item.textContent).toContain(TOAST_TEXT);
  expect(item.classList.contains('ret-toast--success')).toBe(true);
  expect(item.getAttribute('data-phase')).toBe('entering');
  await nextTurn();
  expect(item.getAttribute('data-phase')).toBe('visible');

  const close = item.querySelector('button[aria-label="Close notification"]');
  expect(close).not.toBeNull();
  act(() => close.click());
  expect(item.getAttribute('data-phase')).toBe('exiting');
  await nextTurn();
  expect(document.contains(item)).toBe(false);
  expect(document.querySelectorAll('li.ret-toast')).toHaveLength(0);
});
