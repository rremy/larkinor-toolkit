// The userscript's `@version`, as CalVer from the build clock.
//
// ViolentMonkey installs an update only when the remote `@version` is strictly
// **greater** than the installed one. This was a hardcoded `0.1.0`, so every
// deployed build looked identical to an already-installed copy and a direct
// install could never self-update — invisible during development, because the
// dev loader re-fetches the script on every page load and ignores versions
// entirely. Deriving the version from the clock makes any later build strictly
// newer without anyone having to remember a bump.
//
// Deliberately unrelated to `package.json`'s version, which describes the source
// tree rather than an installed artifact.

/**
 * `YYYY.M.D.HHMM` in **UTC**, e.g. `2026.8.28.1315`.
 *
 * UTC rather than local time so builds from machines in different zones cannot
 * appear to go backwards relative to one another.
 *
 * The time part is `hours * 100 + minutes` rather than a zero-padded string:
 * userscript managers compare version parts numerically, and a leading zero
 * (`0030`) invites a string comparison where `0030 > 1315` could hold. As a bare
 * number, 30 < 1315 always.
 *
 * Month and day are likewise unpadded — comparison is per part, so `2026.8.31`
 * precedes `2026.9.1` correctly without any padding.
 */
export function calverVersion(now = new Date()) {
  return [
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours() * 100 + now.getUTCMinutes(),
  ].join('.');
}

/**
 * Compare two CalVer strings the way a userscript manager does: part by part,
 * numerically. Exported for the tests that pin monotonicity — nothing in the
 * build uses it.
 */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}
