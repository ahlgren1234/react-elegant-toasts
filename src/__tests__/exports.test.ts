import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as entry from '../index';

const VALUE_EXPORTS = ['Toaster', 'toast'];
// §6.7: the package exports these types and no others.
const TYPE_EXPORTS = [
  'CustomToastOptions',
  'DismissReason',
  'ToastAction',
  'ToastId',
  'ToastOptions',
  'ToastPosition',
  'ToastPromiseMessages',
  'ToastSnapshot',
  'ToastTheme',
  'ToastType',
  'ToasterProps',
];

describe('AC-API-1: package entry', () => {
  it('exports exactly Toaster and toast as values, with no default export', () => {
    expect(Object.keys(entry).sort()).toEqual(VALUE_EXPORTS);
    expect('default' in entry).toBe(false);
  });

  it('exports exactly the two values and the eleven §6.7 types', () => {
    const indexFile = path.resolve(__dirname, '../index.ts');
    const program = ts.createProgram([indexFile], { noEmit: true, skipLibCheck: true });
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(indexFile);
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
    expect(moduleSymbol).toBeDefined();
    const names = checker
      .getExportsOfModule(moduleSymbol!)
      .map(symbol => symbol.getName())
      .sort();
    expect(names).toEqual([...VALUE_EXPORTS, ...TYPE_EXPORTS].sort());
  });
});
