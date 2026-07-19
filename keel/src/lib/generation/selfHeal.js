import { callRelay } from './engine.js';
import { SELF_HEAL_SYSTEM_PROMPT } from './prompts.js';
import { buildProjectInBrowser } from '../bundler/clientBundle.js';
import { healLocally } from '../localInference/webllm.js';

const MAX_ATTEMPTS = 3;

/**
 * Self-heals a generated project against real build errors.
 *
 * Historically this pushed files to a live E2B cloud sandbox and ran a
 * real `vite build` there. That cloud round trip is gone: `pushAndCheck`
 * now bundles the project entirely in-browser via esbuild-wasm (see
 * ../bundler/clientBundle.js) and returns the exact same {ok, errors}
 * shape, so the healing loop below is unchanged except for where the
 * check actually runs — locally, for $0, with no network call and no
 * sandbox to provision or tear down.
 */
export async function selfHeal({ files, providerId, model, useLocal = false, localModelId, onAttempt, onLocalProgress }) {
  let currentFiles = files;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const status = await pushAndCheck(currentFiles);
    onAttempt?.(attempt, status);

    if (status.ok) return { files: currentFiles, healed: attempt > 1, attempts: attempt };

    if (attempt === MAX_ATTEMPTS) return { files: currentFiles, healed: false, attempts: attempt, lastErrors: status.errors };

    if (useLocal) {
      currentFiles = await healLocally({ files: currentFiles, errors: status.errors, modelId: localModelId, onProgress: onLocalProgress });
      continue;
    }

    const projectSnapshot = currentFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
    const messages = [
      { role: 'system', content: SELF_HEAL_SYSTEM_PROMPT },
      { role: 'user', content: `Project:\n\n${projectSnapshot}\n\nBuild errors from the in-browser bundler (real output, not a guess):\n\n${status.errors.join('\n')}` },
    ];

    const result = await callRelay({ providerId, model, messages });
    if (result.files?.length) currentFiles = result.files;
  }

  return { files: currentFiles, healed: false, attempts: MAX_ATTEMPTS };
}

/**
 * Bundles the project in-browser and reports whether it built cleanly.
 * Only meaningful for Vite+React mode (esbuild-wasm bundling); Instant
 * HTML mode has no build step at all, so callers should skip this for
 * html-mode projects (there's nothing to "heal" — it either renders or it
 * doesn't, and Verdict's checks run on the rendered DOM either way).
 */
export async function pushAndCheck(files) {
  return buildProjectInBrowser(files);
}
