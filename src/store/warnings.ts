// Deduplicated development warnings (§8.3, §8.4, §8.5). Production logs nothing.
import { isDev } from './env';
import type { ToasterToken } from './types';

const PREFIX = '[react-elegant-toasts]';
// Internal detail, not part of the public API: how long a Toaster has to attach before the
// no-Toaster warning is logged, so start-up creation just before the Toaster mounts stays silent.
const NO_TOASTER_DELAY_MS = 1000;

let noToasterTimer: ReturnType<typeof setTimeout> | undefined;
let noToasterWarned = false;
let capWarned = false;
let serverWarned = false;
let extraToastersWarned = new WeakSet<ToasterToken>();

function warn(message: string): void {
  console.warn(`${PREFIX} ${message}`);
}

/** Called after a toast is accepted while no Toaster is active. */
export function armNoToasterWarning(isToasterActive: () => boolean): void {
  if (!isDev() || noToasterWarned || noToasterTimer !== undefined) return;
  noToasterTimer = setTimeout(() => {
    noToasterTimer = undefined;
    if (isToasterActive() || noToasterWarned || !isDev()) return;
    noToasterWarned = true;
    warn(
      'A toast was created but no <Toaster /> is mounted. Toasts are kept until one mounts. ' +
        'If a <Toaster /> is mounted, the package may be installed twice.'
    );
  }, NO_TOASTER_DELAY_MS);
}

/** Called when a Toaster becomes active: ends the current no-Toaster period. */
export function endNoToasterPeriod(): void {
  if (noToasterTimer !== undefined) clearTimeout(noToasterTimer);
  noToasterTimer = undefined;
  noToasterWarned = false;
}

export function warnCap(cap: number): void {
  if (capWarned || !isDev()) return;
  capWarned = true;
  warn(
    `A toast was rejected: ${cap} toasts are already waiting for a <Toaster />. ` +
      'Mount a <Toaster /> to show them.'
  );
}

/** Called when the store is below the cap again, so a later rejection warns again. */
export function rearmCapWarning(): void {
  capWarned = false;
}

export function warnExtraToaster(token: ToasterToken): void {
  if (extraToastersWarned.has(token) || !isDev()) return;
  extraToastersWarned.add(token);
  warn(
    'More than one <Toaster /> is mounted. Only the first one renders toasts; ' +
      'this one renders nothing until the active one unmounts.'
  );
}

export function warnServer(): void {
  if (serverWarned || !isDev()) return;
  serverWarned = true;
  warn(
    'toast() was called on the server. Server calls are ignored; call toast() from client code.'
  );
}

export function resetWarnings(): void {
  if (noToasterTimer !== undefined) clearTimeout(noToasterTimer);
  noToasterTimer = undefined;
  noToasterWarned = false;
  capWarned = false;
  serverWarned = false;
  extraToastersWarned = new WeakSet();
}
