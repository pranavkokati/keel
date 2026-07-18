/**
 * Same fail-closed pattern as killSwitch.js, applied to live deploys of
 * generated apps. Vercel's Hobby tier is generous but not unlimited and its
 * ToS restricts commercial use — this cap exists so an open-source instance
 * that gets popular can't silently run an operator into Vercel's abuse
 * detection or a plan upgrade they never agreed to.
 */

const DEFAULT_CAP_DEPLOYS = Number(process.env.KEEL_DEPLOY_MONTHLY_CAP || 200);

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{allowed: boolean, deploysThisMonth: number, capDeploys: number}>}
 */
export async function checkDeployBudget(supabase) {
  const capDeploys = DEFAULT_CAP_DEPLOYS;
  const monthStart = startOfCurrentMonthIso();

  const { count, error } = await supabase
    .from('deploy_usage')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart);

  if (error) {
    return { allowed: false, deploysThisMonth: null, capDeploys, error: error.message };
  }

  const deploysThisMonth = count || 0;
  return { allowed: deploysThisMonth < capDeploys, deploysThisMonth, capDeploys };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{projectName: string, deploymentUrl: string}} usage
 */
export async function recordDeployUsage(supabase, { projectName, deploymentUrl }) {
  await supabase.from('deploy_usage').insert({ project_name: projectName, deployment_url: deploymentUrl });
}

function startOfCurrentMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
