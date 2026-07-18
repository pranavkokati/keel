/**
 * Hard usage cap for the sandbox provider (E2B free Hobby tier: 100
 * hours/month). This is the thing that makes "zero cost to the operator"
 * an enforced fact rather than a hope. Without something like this, E2B's
 * free tier fails OPEN: once you exceed it, usage silently rolls into
 * metered billing. This module makes Keel fail CLOSED instead: once the
 * configured monthly cap is hit, new sandbox creation is refused until the
 * usage window rolls over.
 *
 * Usage is tracked in Supabase (see supabase/migrations/0001_init.sql,
 * table `sandbox_usage`) so the cap holds across serverless invocations and
 * survives restarts — an in-memory counter would reset on every cold start
 * and defeat the purpose.
 */

const DEFAULT_CAP_HOURS = Number(process.env.KEEL_SANDBOX_MONTHLY_HOUR_CAP || 90);

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{allowed: boolean, hoursUsedThisMonth: number, capHours: number}>}
 */
export async function checkSandboxBudget(supabase) {
  const capHours = DEFAULT_CAP_HOURS;
  const monthStart = startOfCurrentMonthIso();

  const { data, error } = await supabase
    .from('sandbox_usage')
    .select('duration_seconds')
    .gte('started_at', monthStart);

  if (error) {
    // Fail closed: if we can't verify usage, we cannot guarantee the cap,
    // so we refuse rather than risk silently exceeding it.
    return { allowed: false, hoursUsedThisMonth: null, capHours, error: error.message };
  }

  const totalSeconds = (data || []).reduce((sum, row) => sum + (row.duration_seconds || 0), 0);
  const hoursUsedThisMonth = totalSeconds / 3600;

  return { allowed: hoursUsedThisMonth < capHours, hoursUsedThisMonth, capHours };
}

/**
 * Records a completed (or in-progress-but-checkpointed) sandbox session so
 * the running total stays accurate.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{sandboxId: string, startedAt: string, durationSeconds: number}} usage
 */
export async function recordSandboxUsage(supabase, { sandboxId, startedAt, durationSeconds }) {
  await supabase.from('sandbox_usage').insert({
    sandbox_id: sandboxId,
    started_at: startedAt,
    duration_seconds: durationSeconds,
  });
}

function startOfCurrentMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
