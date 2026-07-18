import { e2bSandboxProvider } from '../../src/lib/sandbox/e2bAdapter.js';

/** POST /api/sandbox/update — push updated files to an already-running sandbox (edits, self-heal iterations). */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const { sandboxId, files } = req.body || {};
  if (!sandboxId || !Array.isArray(files)) {
    res.status(400).json({ error: 'Body must include { sandboxId, files }' });
    return;
  }
  try {
    await e2bSandboxProvider.update(sandboxId, files);
    const status = await e2bSandboxProvider.readBuildStatus(sandboxId);
    res.status(200).json(status);
  } catch (e) {
    res.status(502).json({ error: `Sandbox update failed: ${e.message}` });
  }
}
