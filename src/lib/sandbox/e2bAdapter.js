/**
 * Sandbox provider interface + E2B implementation.
 *
 * Keel talks to sandboxes through this interface, not through the E2B SDK
 * directly, everywhere else in the codebase — so a self-hoster who'd rather
 * use a different sandbox provider (or Vercel Sandbox, if deployed on
 * Vercel) can swap the implementation without touching the generation
 * engine or UI. E2B is the default because it's portable across any host
 * (Railway, Fly.io, a bare VPS, Vercel — anywhere Node runs), unlike
 * platform-specific sandbox primitives.
 *
 * @typedef {Object} SandboxHandle
 * @property {string} id
 * @property {string} previewUrl
 *
 * @typedef {Object} SandboxProvider
 * @property {(files: Array<{path:string, content:string}>) => Promise<SandboxHandle>} start
 * @property {(id: string, files: Array<{path:string, content:string}>) => Promise<void>} update
 * @property {(id: string) => Promise<{ok: boolean, errors: string[]}>} readBuildStatus
 * @property {(id: string) => Promise<void>} stop
 */

import { Sandbox } from 'e2b';

const TEMPLATE_ID = process.env.E2B_TEMPLATE_ID || 'base';
const PORT = 5173;

/** @type {SandboxProvider} */
export const e2bSandboxProvider = {
  async start(files) {
    const sandbox = await Sandbox.create(TEMPLATE_ID, { apiKey: process.env.E2B_API_KEY });
    await writeFiles(sandbox, files);
    await sandbox.commands.run('npm install', { cwd: '/project', background: false }).catch(() => {});
    await sandbox.commands.run('npm run dev -- --host 0.0.0.0', { cwd: '/project', background: true });
    const host = sandbox.getHost(PORT);
    return { id: sandbox.sandboxId, previewUrl: `https://${host}` };
  },

  async update(id, files) {
    const sandbox = await Sandbox.connect(id, { apiKey: process.env.E2B_API_KEY });
    await writeFiles(sandbox, files);
  },

  /**
   * Runs a real build/typecheck in the sandbox and returns actual error
   * output — this is what feeds src/lib/generation/selfHeal.js. This is the
   * "closed-loop" half of self-healing: without reading real output back
   * out of the sandbox, "self-healing" would just be another blind
   * re-prompt, no better than Jasmine's single post-hoc fix pass.
   */
  async readBuildStatus(id) {
    const sandbox = await Sandbox.connect(id, { apiKey: process.env.E2B_API_KEY });
    const result = await sandbox.commands.run('npx vite build --logLevel warn 2>&1 || true', { cwd: '/project' });
    const output = result.stdout + result.stderr;
    const errors = extractErrorLines(output);
    return { ok: errors.length === 0, errors };
  },

  async stop(id) {
    const sandbox = await Sandbox.connect(id, { apiKey: process.env.E2B_API_KEY });
    await sandbox.kill();
  },
};

async function writeFiles(sandbox, files) {
  for (const file of files) {
    await sandbox.files.write(`/project/${file.path}`, file.content);
  }
}

function extractErrorLines(output) {
  return output
    .split('\n')
    .filter((line) => /error/i.test(line))
    .slice(0, 20); // cap what we feed back to the model — full logs can be huge
}
