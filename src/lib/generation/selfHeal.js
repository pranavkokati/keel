import { callRelay } from './engine.js';
import { SELF_HEAL_SYSTEM_PROMPT } from './prompts.js';

const MAX_ATTEMPTS = 3;

/**
 * Closed-loop self-healing generation.
 *
 * The naive version of "AI fixes its own errors" is a single post-hoc pass:
 * generate once, ask the model "does this have any errors?", apply whatever
 * it guesses. That's blind — the model is diagnosing from the same code it
 * just wrote, with no ground truth. This loop instead pushes the real files
 * into the live sandbox, runs an actual build, and only feeds the model
 * genuine compiler/bundler error output — the model is correcting a
 * verified failure, not guessing at one.
 *
 * @param {{
 *   files: Array<{path:string, content:string}>,
 *   sandboxId: string,
 *   providerId: string,
 *   model?: string,
 *   onAttempt?: (attempt: number, status: {ok: boolean, errors: string[]}) => void,
 * }} args
 * @returns {Promise<{files: Array<{path:string,content:string}>, healed: boolean, attempts: number}>}
 */
export async function selfHeal({ files, sandboxId, providerId, model, onAttempt }) {
  let currentFiles = files;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const status = await pushAndCheck(sandboxId, currentFiles);
    onAttempt?.(attempt, status);

    if (status.ok) {
      return { files: currentFiles, healed: attempt > 1, attempts: attempt };
    }

    if (attempt === MAX_ATTEMPTS) {
      // Out of attempts — return the last version we tried along with the
      // errors so the UI can show the user what's still broken rather than
      // silently pretending success.
      return { files: currentFiles, healed: false, attempts: attempt, lastErrors: status.errors };
    }

    const projectSnapshot = currentFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
    const messages = [
      { role: 'system', content: SELF_HEAL_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Project:\n\n${projectSnapshot}\n\nBuild errors from the live sandbox (real output, not a guess):\n\n${status.errors.join('\n')}`,
      },
    ];

    const result = await callRelay({ providerId, model, messages });
    if (result.files?.length) currentFiles = result.files;
  }

  return { files: currentFiles, healed: false, attempts: MAX_ATTEMPTS };
}

async function pushAndCheck(sandboxId, files) {
  const res = await fetch('/api/sandbox/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sandboxId, files }),
  });
  const json = await res.json().catch(() => ({ ok: false, errors: ['Sandbox update request failed'] }));
  if (!res.ok) return { ok: false, errors: [json.error || 'Sandbox update failed'] };
  return json;
}
