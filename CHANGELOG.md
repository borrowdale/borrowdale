# Changelog

Each package's release notes are generated from its changesets into its own changelog:
[`@borrowdale/core`](packages/core/CHANGELOG.md), [`@borrowdale/fills`](packages/fills/CHANGELOG.md),
[`@borrowdale/text`](packages/text/CHANGELOG.md) and
[`@borrowdale/charts`](packages/charts/CHANGELOG.md).
The four packages share one version and are released together. Each release also has its notes on
[GitHub](https://github.com/borrowdale/borrowdale/releases), and the
[commit history](https://github.com/borrowdale/borrowdale/commits/main/) records every source change.

## 0.2.0

Published on 10 November 2026:

- **`@borrowdale/charts`:** histograms, and statistical and financial series on linear axes. These
  are distributions of a sample, relationships between paired observations, and prices with their
  indicators.
- **`@borrowdale/core/math`:** the portable exponential `exp`, with its argument limit `MAX_EXPONENT`.
- **`@borrowdale/fills` and `@borrowdale/text`:** only the version changes.

Everything 0.1.0 offered works as before. The website's playground has 40 statistical and financial
examples.

## 0.1.0

The first public release, published on 9 November 2026. Used in Node.js, the packages need version 22
or later.

The website, [borrowdalejs.com](https://borrowdalejs.com/), has an editable playground, three
open-data examples, the shared documentation and project information pages.
