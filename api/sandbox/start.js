import { createClient } from '@supabase/supabase-js';
import { checkSandboxBudget, recordSandboxUsage } from '../../src/lib/sandbox/killSwitch.js';
import { e2bSandboxProvider } from '../../src/lib/sandbox/e2bAdapter.js';
import { resolveSupabaseUrl } from '../_shared/supabaseDefaults.js';

function serverSupabase() {
  return createClient(resolveSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * POST /api/sandbox/start — the ONLY entry point that creates an E2B
 * sandbox. Every path (initial generation, self-heal, ensemble) must go
 * through this endpoint rather than calling e2bAdapter directly, so the
 * kill-switch check below is never bypassable.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  if (!process.env.E2B_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(501).json({ error: 'Sandbox preview is not configured on this deployment yet (missing E2B_API_KEY / SUPABASE_SERVICE_ROLE_KEY).' });
    return;
  }

  const supabase = serverSupabase();
  const budget = await checkSandboxBudget(supabase);
  if (!budget.allowed) {
    res.status(429).json({
      error: `Sandbox monthly free-tier cap reached (${budget.hoursUsedThisMonth?.toFixed(1)}/${budget.capHours} hours). Sandbox previews are paused until next month's window opens, to guarantee this instance never incurs paid E2B usage.`,
      budget,
    });
    return;
  }

  const { files } = req.body || {};
  if (!Array.isArray(files)) {
    res.status(400).json({ error: 'Body must include { files: [{path, content}] }' });
    return;
  }

  const startedAt = new Date().toISOString();
  try {
    const handle = await e2bSandboxProvider.start(files);
    // Record a conservative estimate immediately; a background job or the
    // stop handler should reconcile this with actual duration. Recording
    // eagerly (rather than only on stop) means a crashed/abandoned sandbox
    // still counts against the cap instead of undercounting usage.
    await recordSandboxUsage(supabase, { sandboxId: handle.id, startedAt, durationSeconds: 300 });
    res.status(200).json(handle);
  } catch (e) {
    res.status(502).json({ error: `Sandbox start failed: ${e.message}` });
  }
}
