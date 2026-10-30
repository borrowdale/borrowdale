# Contributing to BorrowdaleJS

Contributions can improve code, documentation, examples, accessibility or reproducible bug reports. Start with a focused change and include enough context for someone else to verify it.

## Set up the workspace

Node.js 24 is required. Clone the repository, then run:

```sh
nvm use
npm ci
npx playwright-core install chromium-headless-shell
npm run build
npm test
npm run typecheck
```

The browser download is needed for parity tests. For website work, run `npm run site`, `npm run site:build` and `npm test --workspace @borrowdale/site`.

## Report a bug

[Open a GitHub issue](https://github.com/borrowdale/borrowdale/issues) with a minimal chart or shape spec, expected and actual output, package revision, browser and operating system. Include the seed when reporting a drawing difference. Remove private data and credentials before posting.

## Propose a change

For a substantial API or behavior change, explain the use case in an issue first. Keep pull requests focused. Add a regression test for a bug fix, and update the public documentation alongside changed behavior.

Only regenerate golden output after checking that the visual change is intentional. Use `npm run goldens` and inspect the resulting diff; replacing a baseline is not a substitute for diagnosing a failure.

## Improve the website and documentation

Shared guides live in `apps/site/content/`. Package references are the existing `packages/*/README.md` files. The website renders these sources directly. The playground examples come from the golden corpora in `packages/*/test/golden/`, so adding, renaming or removing a golden case also changes a public page and its URL. When a package is first published, replace the "Unpublished" note in its README with installation instructions. Keep examples executable and use public data with clear provenance.

Do not commit credentials, machine-specific paths, private review material or tool-specific working notes to this public repository.

## Contributors

See the [public GitHub contributor history](https://github.com/borrowdale/borrowdale/graphs/contributors) for the people behind the project. Credits for incorporated code, fonts and datasets are listed on the [License & credits page](apps/site/content/license.md).
