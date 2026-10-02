// Environment checks, evaluated at call time so importing the package touches no globals (§5).

// Declared locally rather than through @types/node: bundlers replace `process.env.NODE_ENV`, and the
// `typeof` guard keeps unbundled browser ESM from throwing a ReferenceError.
declare const process: { readonly env: { readonly NODE_ENV?: string } } | undefined;

export function isDev(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

export function isServer(): boolean {
  return typeof window === 'undefined';
}
