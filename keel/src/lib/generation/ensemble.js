import { generateProject } from './engine.js';
import { configuredProviders } from '../byok/keyStore.js';

/**
 * Ensemble ("race") generation.
 *
 * Most tools in this category commit to a single model's first attempt.
 * Under BYOK, a user configuring more than one provider key isn't
 * spending extra money to try more than one — each key is theirs, at their
 * own free-tier rate limit, run in parallel. Keel uses that to generate the
 * same request against every configured provider simultaneously and keep
 * whichever result actually builds cleanest in the sandbox, rather than the
 * one that merely arrived first or sounds best on paper.
 *
 * If only one provider key is configured, this degrades to a normal single
 * generation — ensemble mode is a bonus available for free the moment a
 * second key is added, not a requirement.
 *
 * @param {{prompt: string, contextFiles?: Array<{name:string,content:string}>, judgeWithSandbox: (files: Array<{path:string,content:string}>) => Promise<{ok:boolean, errors:string[]}>}} args
 * @returns {Promise<{winner: {providerId:string, files:Array, summary:string}, candidates: Array<{providerId:string, ok:boolean, errors?:string[]}>}>}
 */
export async function generateEnsemble({ prompt, contextFiles = [], judgeWithSandbox, mode = 'react' }) {
  const providers = configuredProviders();
  if (providers.length === 0) {
    throw new Error('No provider keys configured — add at least one in Settings.');
  }

  const attempts = await Promise.allSettled(
    providers.map(async (providerId) => {
      const result = await generateProject({ prompt, providerId, contextFiles, mode });
      return { providerId, ...result };
    })
  );

  const successful = attempts
    .filter((r) => r.status === 'fulfilled' && r.value.files?.length > 0)
    .map((r) => r.value);

  if (successful.length === 0) {
    throw new Error('All configured providers failed to generate a project. Check your keys and rate limits.');
  }

  if (successful.length === 1 || !judgeWithSandbox) {
    return { winner: successful[0], candidates: successful.map((c) => ({ providerId: c.providerId, ok: true })) };
  }

  // Judge every candidate against a real sandbox build and keep the first
  // clean one; if none are clean, keep whichever has the fewest errors
  // rather than failing the whole request.
  const judged = await Promise.all(
    successful.map(async (candidate) => {
      const status = await judgeWithSandbox(candidate.files);
      return { candidate, status };
    })
  );

  const clean = judged.find((j) => j.status.ok);
  const chosen = clean || judged.sort((a, b) => a.status.errors.length - b.status.errors.length)[0];

  return {
    winner: chosen.candidate,
    candidates: judged.map((j) => ({ providerId: j.candidate.providerId, ok: j.status.ok, errors: j.status.errors })),
  };
}
