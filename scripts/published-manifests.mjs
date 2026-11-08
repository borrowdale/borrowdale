// Leaves the `@borrowdale/source` export condition out of every published package's manifest.
// Usage: node scripts/published-manifests.mjs   (the release workflow runs it just before building)
//
// The condition points the tests and the website at each package's TypeScript source. It means
// nothing to anyone who installs a package, so the published manifests do without it. The script
// rewrites the manifests in the working tree; the rewritten manifests are never committed. It fails
// when an export it leaves would still point into a package's source, or has a shape it does not
// know, so a new condition or entry cannot slip past it.
import { globSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = '@borrowdale/source';
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

for (const manifest of globSync(read('package.json').workspaces.map((w) => `${w}/package.json`))) {
  const pkg = read(manifest);
  if (pkg.private) continue;
  if (typeof pkg.exports !== 'object' || pkg.exports === null) {
    throw new Error(`${manifest}: exports must map each subpath to its conditions`);
  }
  let removed = 0;
  for (const [subpath, entry] of Object.entries(pkg.exports)) {
    const conditions = typeof entry === 'string' ? { default: entry } : entry;
    if (typeof conditions !== 'object' || conditions === null) {
      throw new Error(`${manifest}: exports["${subpath}"] is neither a path nor a map of conditions`);
    }
    if (SOURCE in conditions) {
      delete conditions[SOURCE];
      removed += 1;
    }
    for (const [condition, target] of Object.entries(conditions)) {
      if (typeof target !== 'string') {
        throw new Error(`${manifest}: exports["${subpath}"]["${condition}"] is nested, which this script does not read`);
      }
      if (target.startsWith('./src/')) {
        throw new Error(`${manifest}: exports["${subpath}"]["${condition}"] still points into the source: ${target}`);
      }
    }
  }
  writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`);
  if (removed > 0) console.log(`${pkg.name}: ${SOURCE} left out of ${removed} exports`);
}
