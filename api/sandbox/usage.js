import { createClient } from '@supabase/supabase-js';
import { checkSandboxBudget } from '../../src/lib/sandbox/killSwitch.js';
import { resolveSupabaseUrl } from '../_shared/supabaseDefaults.js';

function serverSupabase() {
  return createClient(resolveSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** GET /api/sandbox/usage — lets the UI show "X of Y free hours used this month" and disable the Generate button before hitting the cap server-side too. */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ allowed: true, hoursUsedThisMonth: 0, capHours: null, note: 'Sandbox usage tracking not configured on this deployment (missing SUPABASE_SERVICE_ROLE_KEY).' });
    return;
  }
  const budget = await checkSandboxBudget(serverSupabase());
  res.status(200).json(budget);
}
