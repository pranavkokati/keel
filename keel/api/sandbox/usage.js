/**
 * DEPRECATED — dead route, kept only because this sandboxed environment
 * cannot delete files in a user-connected folder. See api/sandbox/start.js
 * for why. Safe to delete this whole api/sandbox/ directory.
 */
export default async function handler(req, res) {
  res.status(410).json({
    error: 'This endpoint is gone. There is no cloud sandbox left to meter — nothing in Keel bills the operator for preview/build compute anymore.',
  });
}
