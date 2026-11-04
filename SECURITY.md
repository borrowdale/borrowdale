# Security policy

## Supported versions

Security fixes go into the latest release of the `@borrowdale/*` packages. The four packages share
one version, so a fix is released for all four together.

## Reporting a vulnerability

Please do not open a public issue. Report it privately, either:

- through GitHub: the repository's **Security** tab, then **Report a vulnerability**; or
- by email to security@borrowdalejs.com.

Include the package and version, the smallest input that shows the problem, what an attacker
controls, and what happens. We aim to acknowledge a report within a week, agree a fix and a
disclosure date with you, and credit you in the advisory unless you prefer otherwise.

## What counts

The packages build SVG and canvas drawings from data that can come from untrusted sources, such as
labels, ids, colours, font files, image references and numbers. Reports we want to hear about
include:

- markup or script that reaches the page through a string the packages produce, such as the output
  of `toSvgText`, a chart's SVG or the CSS from `fontFaceCss`;
- input within the documented limits that makes drawing hang or use memory without bound, or input
  past a limit that is not stopped by the named error the README documents;
- input that changes the behaviour of later calls, for example through an object's prototype.

Differences in how browsers draw the same output, and problems in an application's own handling of
the output, are not vulnerabilities in these packages; please open an ordinary issue for them.
