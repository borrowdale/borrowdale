## Summary
<!-- What changes, and why. Link the issue it closes, if there is one: "Closes #123". -->

## Changes
<!-- The files or areas changed, a line each. -->

## Risk areas
<!-- Changes to a public API, to drawn output, to supported runtimes, or new dependencies. "None" if there are none. -->

## Test plan
<!-- How the change was checked, and anything a maintainer should check by hand. -->

## Checklist
- [ ] Tests cover the change, and a bug fix has a test that fails without it.
- [ ] `npm run build`, `npm run typecheck` and `npm test` pass locally.
- [ ] Golden output changed only where a drawing is meant to change, and the `goldens.json` diff was read.
- [ ] A changeset describes anything a package user can notice, or there is nothing they can notice.
- [ ] The package README describes any changed behaviour.
- [ ] No credentials, machine-specific paths or personal data.
