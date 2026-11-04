# Contributing to BorrowdaleJS

Contributions can improve code, documentation, examples, accessibility or bug reports. Start with a
focused change and include enough context for someone else to check it. Everyone taking part follows
the [code of conduct](CODE_OF_CONDUCT.md).

## Set up the workspace

Development uses Node.js 24 (see `.nvmrc`). Clone the repository, then run:

```sh
nvm use
npm ci
npx playwright-core install chromium firefox webkit   # once: the parity tests render in all three
npm run build
npm test
npm run typecheck
```

The parity tests draw every golden in headless Chromium, Firefox and WebKit and compare the output
with Node's byte for byte. They fail, rather than skip, when a browser is not installed. Continuous
integration runs the same steps on Node.js 22, 24 and 26.

| Path | What it holds |
|---|---|
| `packages/core`, `packages/fills`, `packages/text`, `packages/charts` | The published packages: `src/`, `test/`, and a `README.md` that is the package's reference |
| `packages/*/test/golden/` | The golden corpora: `corpus.json` lists the inputs, `goldens.json` the expected output |
| `apps/examples` | Runnable examples that load the built packages |
| `scripts/` | Recording the goldens and generating the bundled font modules |
| `.changeset/` | Release notes waiting for the next release |

## Report a bug

[Open an issue](https://github.com/borrowdale/borrowdale/issues/new/choose) with the bug form. Give
the smallest input that shows the problem, the output you expected and the output you got, the
package version or commit, and the runtime or browser and operating system. Include the seed when a
drawing differs. Remove private data and credentials before posting.

Report a security problem privately instead, as [the security policy](SECURITY.md) describes.

## Propose a change

For a new feature, or a change to an API or to drawn output, explain the use case in an issue first.
Small fixes and documentation improvements can go straight to a pull request.

## Making a change

### Keep drawings deterministic

The same input must give the same drawing, byte for byte, on every render, in Node and in every
browser. Drawing code therefore never reads the clock, a random source, the locale or the time zone,
and never calls a `Math` function whose result the engine is free to approximate. Use
`@borrowdale/core/math` for `sin`, `cos` and `log`, and take randomness from the seed. The test
guard in `packages/core/test/support/forbid-unportable-calls.ts` makes such calls throw while a
golden is drawn.

Inputs that would make drawing hang or run out of memory must fail with a named error instead, and
the limit must be documented in the package README.

### Change drawn output on purpose only

Golden output changes only when a drawing is meant to change. Regenerate it with `npm run goldens`,
then read the diff of `goldens.json`: replacing a baseline is not a substitute for finding out why a
test failed. A change to drawn output is visible to every user, so it needs a changeset (below).

### Write tests that read as data and checks

- Every bug fix comes with a test that fails without the fix.
- A test body holds its data and its checks only: no loops, conditionals or inline functions. Shared
  data and helpers are defined beside the tests, at module level, and a table of cases goes through
  `it.each`.
- A comment that describes a test sits directly above it.
- A case that only some runtimes can run says so with `it.runIf`, with a comment naming the runtimes.

### Update the documentation with the code

The package `README.md` files are the reference documentation. Change them in the same pull request
as the behaviour they describe. Keep examples runnable, state limits as numbers, and say what has
been measured rather than what is expected.

### Add a changeset for anything a package user can notice

Run `npx changeset` for a new or changed API, a change to drawn output, a new or changed error, or a
change to supported runtimes, and describe the change for someone reading the changelog. The four
packages share one version and are released together. While the version is 0.x, a breaking change
is a minor release and anything else a patch. Changes to tests, CI or development tooling need no
changeset.

## Commits

Subjects follow `[scope] TYPE: sentence`:

- **scope:** `core`, `fills`, `text`, `charts` or `site`, or `repo` for anything across the
  repository;
- **TYPE:** `FEAT`, `FIX`, `REFACTOR`, `TEST`, `DOCS`, `STYLE` or `CHORE`;
- **sentence:** lower case, in the imperative, with no full stop at the end.

For example: `[charts] FIX: end a free time axis no later than year 9999`. Explain in the body why
the change is needed when that is not obvious from the diff. Keep each commit to one concern.

## Pull requests

- Open pull requests against `main`, and keep each one to a single change.
- Fill in the template: what changed and why, the risks, and how it was tested.
- The Library workflow must pass on Node.js 22, 24 and 26. Each push runs all three jobs again, so
  push when the change is ready rather than commit by commit.
- A maintainer merges the pull request once it is approved.

## What not to commit

Credentials or tokens, `.env` files, machine-specific paths, personal data, build output (`dist/`,
`apps/examples/out/`) and private working notes.

## Licence

Contributions are licensed under the [MIT License](LICENSE). Code or data taken from another project
needs a compatible licence, and its notice goes into the package's `THIRD_PARTY_NOTICES.md` (create
one, and list it in the package's `files`, if the package has none yet). The
bundled Excalifont files keep their own [SIL Open Font License 1.1](packages/text/OFL.txt).
