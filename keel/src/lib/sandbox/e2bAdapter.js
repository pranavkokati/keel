/**
 * DEPRECATED — dead code, kept only because this sandboxed environment
 * cannot delete files in a user-connected folder (Write/Edit can overwrite
 * content but not remove a file). Nothing in Keel imports this module
 * anymore: the E2B cloud sandbox it wrapped has been fully replaced by the
 * in-browser esbuild-wasm bundler at src/lib/bundler/clientBundle.js (see
 * that file and the README's "In-browser bundling" section for why).
 *
 * Safe to delete this file entirely — please do, next time you have shell
 * access to this repo (`rm src/lib/sandbox/e2bAdapter.js`). It is not
 * referenced by any import in the codebase as of this commit.
 */
export {};
