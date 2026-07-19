/**
 * DEPRECATED — dead code, kept only because this sandboxed environment
 * cannot delete files in a user-connected folder. Nothing in Keel imports
 * this module anymore: it enforced an hours cap on the E2B cloud sandbox,
 * which no longer exists (see src/lib/bundler/clientBundle.js and the
 * README's "In-browser bundling" section). The live-deploy kill switch at
 * src/lib/sandbox/deployKillSwitch.js is unrelated and still in active use.
 *
 * Safe to delete this file entirely — please do, next time you have shell
 * access to this repo (`rm src/lib/sandbox/killSwitch.js`). It is not
 * referenced by any import in the codebase as of this commit.
 */
export {};
