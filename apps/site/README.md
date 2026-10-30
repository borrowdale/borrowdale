# BorrowdaleJS website

The product website, documentation and playground, using the unpublished BorrowdaleJS workspace packages directly.

Requires **Node.js 24**. From the repository root:

```sh
nvm use
npm ci
npm run site
```

Open http://127.0.0.1:5173/. The server binds to loopback only. `npm run site:build` type-checks and builds the static site. The root `npm test` and `npm run typecheck` include the website.

## Collection and playgrounds

The collection includes every case of the packages' golden corpora, plus composed UI recipes. These cover the supported families and reference edge cases, rather than every possible combination of options. UI recipes combine native HTML with BorrowdaleJS primitives; they are not a separate component package.

Click anywhere on an example card to open its own URL. Edit JavaScript on the left and see the SVG or HTML preview on the right. Run, automatic execution, Reset, Copy, and Command/Control+Enter are supported. Drafts remain in memory while navigating and are lost on reload. The collection can also preview charts using Canvas; the interactive editor uses SVG/HTML output.

The playground accepts named imports from the four local packages and `@borrowdale/text/excalifont-files`. Call `render(markup)` synchronously to display output. Execution runs in a fresh worker with a three-second timeout; markup appears in a sandboxed iframe that cannot run scripts or fetch subresources. The worker is not a security boundary for untrusted code: only run code you trust. The preview supplies Excalifont and the site stylesheet, including the UI recipe styles.

## Open-data dashboards

Each chart includes a table of its data and its copyable chart spec. Controls use stored snapshots; no live data service is needed. Download buttons export the corresponding saved JSON.

- **World atlas:** World Bank World Development Indicators, CC BY 4.0. Twelve selected countries, 2010–2024; GDP per capita in current US dollars, life expectancy, and population. Missing observations remain missing; country comparisons do not represent the entire world. Source query is stored in `src/data/world.json`.
- **Climate notebook:** NASA GISS GISTEMP v4 global land–ocean anomalies, relative to 1951–1980. Annual and monthly values from the official CSV are stored in `src/data/climate.json`; incomplete annual values are excluded from annual charts. The monthly envelope is a range, not an uncertainty estimate. Cite GISTEMP Team (2026), and Lenssen et al. (2024), https://doi.org/10.1029/2023JD040179.
- **Earthquake watch:** USGS M4.5+ 30-day GeoJSON feed, U.S. public-domain data, stored in `src/data/quakes.json`. The feed generation time and original event identifiers and links are preserved. End days can be partial. This is an archived example, not live monitoring.

Snapshots were retrieved on 2026-10-29. Each JSON file preserves its original source URL. To refresh, retrieve those sources and preserve the existing schema: World Bank missing values as null; NASA years with twelve monthly values and nullable annual mean; USGS magnitude, location, time, coordinates, depth, event ID and URL. Review changed dataset dates and visible attribution alongside any refresh.

## Public documentation and URLs

The website and GitHub share the same Markdown sources: `apps/site/content/*.md`, the four package READMEs, `CONTRIBUTING.md` and `CHANGELOG.md`. The license page also renders the original MIT, font-license and third-party-notice files. Only these explicitly listed public files are included in the site.

`npm run site:build` produces a static HTML file for every page, including `/docs/`, `/playground/`, `/examples/`, their detail pages and the footer pages. Documentation is readable without JavaScript. Interactive examples and editing require JavaScript. Old hash links are translated to the corresponding paths in the browser.

The default build uses `/`, suitable for a custom domain. To prepare a GitHub project-site build instead:

```sh
SITE_BASE=/borrowdale/ npm run site:build
```

To generate canonical URLs and a sitemap, set `SITE_ORIGIN` to the HTTPS origin the site is served from. `SITE_BASE` must start and end with `/`. Search engines read `robots.txt` only at the root of a host, so the build writes it only when `SITE_BASE` is `/`; under a project path, submit `sitemap.xml` to the search engines directly.

The [Website workflow](../../.github/workflows/site.yml) runs the workspace tests and static builds for both root and project paths on pull requests. It has no push-triggered deployment. A manual run validates by default; publishing requires selecting `main` and enabling the `deploy` input. Other branches cannot deploy.

Before publishing, enable GitHub Pages with **GitHub Actions** as its source and allow `main` to deploy through the `github-pages` environment. The repository must be eligible for Pages: public on GitHub Free, or on a plan supporting private-repository Pages. The workflow does not enable Pages automatically.

For publishing, `actions/configure-pages` reads the actual Pages URL. Its `origin` becomes `SITE_ORIGIN`; its `base_path` plus a trailing slash becomes `SITE_BASE`. A project site normally uses `/borrowdale/`; a custom domain configured directly on this repository uses `/`. An inherited organization domain can retain the project path. No separate domain variable is required. The workflow builds and uploads only `apps/site/dist`, using the provided workflow token rather than a personal deployment token.

To add a custom domain later, verify the domain, configure it in the repository's Pages settings, then configure DNS at your domain provider and enable HTTPS. Run the publishing workflow again to regenerate asset paths, canonical URLs and the sitemap. With Actions publishing, a `CNAME` file is not required and does not configure the domain. See [GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). Domain registration and renewal are separate from Pages hosting.

The output includes `404.html`, and `.nojekyll` for publishing from a branch; the Website workflow publishes through Actions, which runs no Jekyll build and leaves dotfiles out of the upload. Each route has its own `index.html`, so direct visits and refreshes do not depend on a single-page-app rewrite. Use a normal static server against `apps/site/dist` to inspect the output locally. Nothing is published by the build command.

## Site checks

The build checks every local link, asset and heading fragment in the generated HTML. Playground URLs use lowercase hyphenated slugs so spaces and slashes in fixture names cannot break static hosting. The full playground directory is available as ordinary links as well as the interactive filters.

With `SITE_ORIGIN` configured, the build emits canonical URLs, a sitemap, a robots sitemap declaration at a host root, and basic Schema.org page metadata. Titles, descriptions and social metadata update during client navigation as well as direct loads. Without a chosen origin, domain-specific metadata is omitted. The 404 page is marked `noindex`; site hosting still needs to return the proper HTTP status. No analytics, indexing submission or deployment is performed by these commands.

On narrow screens, dashboard charts scroll within their panels to preserve legible labels. Tab leaves the code editor; Command/Control+] inserts indentation, and Command/Control+Enter runs code.
