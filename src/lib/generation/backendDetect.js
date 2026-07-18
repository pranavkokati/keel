/**
 * Heuristic pre-check for whether a prompt likely needs a real backend
 * (Supabase schema + auth + edge functions) rather than a static frontend.
 *
 * This is a genuinely hard NLU problem — treat this as a fast, cheap first
 * pass, not a source of truth. The model's own `needsBackend` field in its
 * structured response (see schema.js) is the authoritative signal; this
 * heuristic exists to (a) pre-populate the UI's "this looks like it needs a
 * backend" prompt before the first generation call even completes, and (b)
 * catch cases cheaply without spending a model call. Expect false
 * positives/negatives; this is flagged as a known-imperfect v1 in the spec
 * risk register, not a solved problem.
 */

const BACKEND_SIGNALS = [
  /\blog ?in\b/i,
  /\bsign ?up\b/i,
  /\bauth(entication)?\b/i,
  /\baccounts?\b/i,
  /\bdatabase\b/i,
  /\bpersist(s|ent|ence)?\b/i,
  /\bsave[sd]?\b.*\b(data|progress|state)\b/i,
  /\bSaaS\b/i,
  /\bdashboard\b.*\b(user|data|real)\b/i,
  /\bmulti-?tenant\b/i,
  /\bcheckout|payment|stripe|subscription\b/i,
  /\bCRUD\b/i,
  /\bAPI\b.*\bendpoint/i,
];

/**
 * @param {string} prompt
 * @returns {boolean}
 */
export function likelyNeedsBackend(prompt) {
  if (!prompt) return false;
  return BACKEND_SIGNALS.some((re) => re.test(prompt));
}
