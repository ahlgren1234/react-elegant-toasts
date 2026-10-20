# Contributing to React Elegant Toasts

Thank you for helping improve React Elegant Toasts. Bug reports, documentation fixes, tests and
code are all welcome.

## Where to go

- **Questions and help:** [Discussions, Q&A](https://github.com/ahlgren1234/react-elegant-toasts/discussions/categories/q-a).
- **Early ideas:** [Discussions, Ideas](https://github.com/ahlgren1234/react-elegant-toasts/discussions/categories/ideas), before they become a concrete feature request.
- **Bugs and feature requests:** [open an issue](https://github.com/ahlgren1234/react-elegant-toasts/issues/new/choose) with one of the forms. Please search the existing issues first.
- **Security vulnerabilities:** never in a public issue. Report them privately, as described in [SECURITY.md](SECURITY.md).

For larger changes, such as new options or behaviour, please open an issue or a discussion first,
so the approach can be agreed before you invest time in a pull request.

## Development setup

You need Node.js 24 (the version CI uses) and npm.

```sh
git clone https://github.com/ahlgren1234/react-elegant-toasts.git
cd react-elegant-toasts
npm ci
npx playwright install --with-deps   # only for the browser tests and package validation
```

## Scripts

| Command                    | What it does                                                                 |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm test`                 | Unit, type, component and axe tests (Vitest)                                 |
| `npm run test:watch`       | The same tests in watch mode                                                 |
| `npm run test:browser`     | Playwright tests in Chromium, Firefox and WebKit                             |
| `npm run typecheck`        | Type-checks the library, tests, tooling and browser harness                  |
| `npm run lint`             | Builds, then runs ESLint and the stylesheet and documentation checks         |
| `npm run format:check`     | Checks formatting with Prettier (`npm run format` fixes it)                  |
| `npm run validate:package` | Builds and packs the package, then tests it in the consumer fixtures         |
| `npm run size`             | Checks the bundle-size budget (run `npm run build` first)                    |
| `npm run demo`             | Starts the demo locally (`npm run typecheck:demo` and `build:demo` check it) |

## Repository layout

- `src/store/`: the toast store: lifecycle, queues and timers, with no React.
- `src/toast.ts`: the `toast()` API.
- `src/react/`: the `<Toaster />` component and its rendering.
- `src/styles.css`: the stylesheet shipped as `react-elegant-toasts/styles.css`.
- `src/__tests__/`: unit, component and accessibility tests.
- `browser/`: the Playwright harness and tests.
- `fixtures/`: consumer projects (Vite, Next.js, Jest) that test the packed package.
- `demo/`: the live demo.
- `docs/`: the theming, accessibility and migration guides.
- `scripts/`: validation and release tooling.

## Conventions

- **Tests:** a change in behaviour comes with a test that fails without it. Behaviour that depends
  on a real browser, such as animation, gestures or focus, is tested with Playwright in `browser/`.
- **Accessibility:** toasts must stay accessible: live-region announcements, keyboard access, focus
  handling, reduced motion and sufficient contrast. See the
  [accessibility reference](docs/ACCESSIBILITY.md) before changing any of them.
- **Styles:** every class, custom property and keyframe in `src/styles.css` uses the `ret-` prefix.
- **Dependencies:** the package has no runtime dependencies, and new ones are not accepted.
- **Documentation:** `npm run lint` checks the README and the guides in `docs/`. TypeScript examples
  in them must match the example files in `fixtures/consumer-vite/src/docs/`, which are type-checked
  against the packed package.
- **Commits:** short, conventional-style messages, such as `fix: …`, `docs: …` or `test: …`.

## Pull requests

1. Branch from `main` and keep the pull request focused on one change.
2. Run the checks that apply to your change locally: at least `npm run format:check`,
   `npm run lint`, `npm run typecheck` and `npm test`.
3. Add a changeset if the change affects users of the package (below).
4. Open the pull request against `main` and fill in the template.

CI must pass before a pull request can be merged. The required checks are `quality` (formatting,
lint and typecheck), `test` (React 18 and 19), `build-package`, `size`, `browser` and `demo`. CI for
a first-time contributor may wait for a maintainer to approve the run. The maintainer merges
approved pull requests.

## Changesets

Versions and the changelog are managed with [Changesets](https://github.com/changesets/changesets).
If your change affects users of the package (a fix, a new feature, or a change to behaviour,
types or styles), add a changeset:

```sh
npx changeset
```

Choose `patch` for a fix, `minor` for a new feature, or `major` for a breaking change, and describe
the change for users. Commit the generated file in `.changeset/` with your change. Changes to
documentation, tests or CI alone need no changeset.

## Releases

Releases are made by the maintainer only. Contributors never change the version in `package.json`,
run `changeset version` or edit `CHANGELOG.md`. The maintainer creates a version pull request and
then publishes to npm from a protected GitHub Actions workflow.

## License

By contributing, you agree that your contributions are licensed under the project's
[MIT License](LICENSE).
