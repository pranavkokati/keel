/**
 * DEPRECATED — dead route, kept only because this sandboxed environment
 * cannot delete files in a user-connected folder. The frontend no longer
 * calls /api/sandbox/start; the E2B cloud sandbox has been fully replaced
 * by the in-browser esbuild-wasm bundler (src/lib/bundler/clientBundle.js).
 * Responds 410 Gone rather than silently doing nothing, in case anything
 * external still points at this URL.
 *
 * Safe to delete this whole api/sandbox/ directory — please do, next time
 * you have shell access to this repo.
 */
export default async function handler(req, res) {
  res.status(410).json({
    error: 'This endpoint is gone. Keel no longer uses a cloud sandbox — Vite+React previews and self-heal now run entirely in your browser (see src/lib/bundler/clientBundle.js).',
  });
}
