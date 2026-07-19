/**
 * DEPRECATED — dead route, kept only because this sandboxed environment
 * cannot delete files in a user-connected folder. See api/sandbox/start.js
 * for why. Safe to delete this whole api/sandbox/ directory.
 */
export default async function handler(req, res) {
  res.status(410).json({
    error: 'This endpoint is gone. Keel no longer uses a cloud sandbox — self-heal now bundles and checks the project entirely in your browser (see src/lib/generation/selfHeal.js).',
  });
}
