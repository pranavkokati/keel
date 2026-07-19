import { createClient } from '@supabase/supabase-js';
import { checkDeployBudget, recordDeployUsage } from '../../src/lib/sandbox/deployKillSwitch.js';
import { resolveSupabaseUrl, resolveSupabaseAnonKey } from '../_shared/supabaseDefaults.js';

export const config = { runtime: 'nodejs' };

const VERCEL_API = 'https://api.vercel.com';

function serverSupabase() {
  return createClient(resolveSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * POST /api/deploy/publish — gives a generated app a real, permanent URL,
 * instead of Keel's only output being a ZIP or an ephemeral E2B preview.
 * Uses the operator's own Vercel account (VERCEL_API_TOKEN) so every
 * generated app becomes its own Vercel project under that account, still on
 * Vercel's free Hobby tier — deployKillSwitch.js caps monthly deploy count
 * so a busy instance can't run the operator into paid usage or Vercel's
 * abuse detection.
 *
 * If the project needed a backend (needsBackend / backendSql were present),
 * the caller also passes hasBackend: true, and this sets
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY as project-level environment
 * variables BEFORE triggering the build, so the generated app's own
 * src/lib/supabaseClient.js (emitted per prompts.js) can actually reach the
 * shared Supabase instance at build time (Vite inlines import.meta.env.VITE_*
 * values during the build, so these have to exist on the project before the
 * deployment's build step runs — passing them only on the deployment
 * request itself would be too late).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  if (!process.env.VERCEL_API_TOKEN || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(501).json({
      error: 'Live deploy is not configured on this deployment yet (missing VERCEL_API_TOKEN / SUPABASE_SERVICE_ROLE_KEY). You can still use Download ZIP and deploy it yourself.',
    });
    return;
  }

  const { files, projectName, hasBackend } = req.body || {};
  if (!Array.isArray(files) || !projectName) {
    res.status(400).json({ error: 'Body must include { files: [{path, content}], projectName: string }' });
    return;
  }

  const sanitizedName = sanitizeProjectName(projectName);
  const supabase = serverSupabase();

  const budget = await checkDeployBudget(supabase);
  if (!budget.allowed) {
    res.status(429).json({
      error: `Monthly live-deploy cap reached (${budget.deploysThisMonth}/${budget.capDeploys}). This exists so a busy Keel instance can't run its operator into Vercel's paid usage or abuse detection. Download ZIP still works, or wait for next month's window.`,
      budget,
    });
    return;
  }

  const teamQuery = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  const headers = { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' };

  try {
    if (hasBackend) {
      await ensureProjectExists(sanitizedName, headers, teamQuery);
      await setProjectEnvVars(sanitizedName, headers, teamQuery, {
        VITE_SUPABASE_URL: resolveSupabaseUrl(),
        VITE_SUPABASE_ANON_KEY: resolveSupabaseAnonKey(),
      });
    }

    const deployRes = await fetch(`${VERCEL_API}/v13/deployments${teamQuery}${teamQuery ? '&' : '?'}forceNew=1`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: sanitizedName,
        target: 'production',
        projectSettings: { framework: 'vite' },
        files: files.map((f) => ({ file: f.path, data: f.content })),
      }),
    });

    const deployJson = await deployRes.json();
    if (!deployRes.ok) {
      res.status(502).json({ error: `Vercel deployment failed: ${deployJson?.error?.message || JSON.stringify(deployJson)}` });
      return;
    }

    const deploymentUrl = `https://${deployJson.url}`;
    await recordDeployUsage(supabase, { projectName: sanitizedName, deploymentUrl });
    res.status(200).json({ url: deploymentUrl, readyState: deployJson.readyState, note: 'Deployment triggered — it may take up to a minute to finish building before the URL is live.' });
  } catch (e) {
    res.status(502).json({ error: `Publish failed: ${e.message}` });
  }
}

async function ensureProjectExists(name, headers, teamQuery) {
  const createRes = await fetch(`${VERCEL_API}/v10/projects${teamQuery}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, framework: 'vite' }),
  });
  // 409 = project already exists, which is fine (e.g. re-publishing after an edit).
  if (!createRes.ok && createRes.status !== 409) {
    const json = await createRes.json().catch(() => ({}));
    throw new Error(`Could not create Vercel project: ${json?.error?.message || createRes.status}`);
  }
}

async function setProjectEnvVars(name, headers, teamQuery, vars) {
  for (const [key, value] of Object.entries(vars)) {
    await fetch(`${VERCEL_API}/v10/projects/${encodeURIComponent(name)}/env${teamQuery}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key, value, type: 'plain', target: ['production', 'preview'] }),
    }).catch(() => {
      // Best-effort: if this fails, the deploy still proceeds; the generated
      // app just won't reach Supabase until the operator sets it manually.
    });
  }
}

function sanitizeProjectName(name) {
  return `keel-${name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app'}`;
}
