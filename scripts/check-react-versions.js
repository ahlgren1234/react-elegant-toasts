// Fails unless the installed React packages are the ones a CI test leg expects (§25, P-23 D0-1).
// Usage: `node scripts/check-react-versions.js react@19.3.0 react-dom@19.3.0 ...`. A full version
// (`19.3.0`) must match exactly; a bare major (`18`) must match the installed major. Each package must
// also be installed exactly once, so no nested copy of another version can satisfy an import.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = path.join(root, 'node_modules');

/** Splits `name@spec`, keeping the scope of `@types/react@18`. */
function parse(arg) {
  const at = arg.lastIndexOf('@');
  if (at <= 0) throw new Error(`expected name@version, got "${arg}"`);
  const name = arg.slice(0, at);
  const spec = arg.slice(at + 1);
  if (!/^\d+(\.\d+\.\d+)?$/.test(spec)) throw new Error(`expected a major or x.y.z, got "${arg}"`);
  return { name, spec };
}

/** Every installed copy of `name` under node_modules, at any depth. */
function copiesOf(name, dir = nodeModules, found = []) {
  if (!fs.existsSync(dir)) return found;
  const candidate = path.join(dir, name, 'package.json');
  if (fs.existsSync(candidate)) found.push(candidate);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const children = entry.name.startsWith('@')
      ? fs
          .readdirSync(path.join(dir, entry.name), { withFileTypes: true })
          .filter(child => child.isDirectory())
          .map(child => path.join(dir, entry.name, child.name))
      : [path.join(dir, entry.name)];
    for (const child of children) copiesOf(name, path.join(child, 'node_modules'), found);
  }
  return found;
}

const expected = process.argv.slice(2).map(parse);
if (expected.length === 0) throw new Error('no packages to check');

const problems = [];
for (const { name, spec } of expected) {
  const copies = copiesOf(name);
  if (copies.length !== 1) {
    problems.push(
      `${name}: expected one installed copy, found ${copies.length}` +
        (copies.length ? ` (${copies.map(file => path.relative(root, file)).join(', ')})` : '')
    );
    continue;
  }
  const { version } = JSON.parse(fs.readFileSync(copies[0], 'utf8'));
  const matches = spec.includes('.') ? version === spec : version.split('.')[0] === spec;
  console.log(`${matches ? '✓' : '✗'} ${name} ${version} (expected ${spec})`);
  if (!matches) problems.push(`${name}: installed ${version}, expected ${spec}`);
}

if (problems.length > 0) {
  console.error(`\n✗ React version check failed:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
